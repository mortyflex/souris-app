-- Souris — Calendar Blocks (personal unavailability): a NEW aggregate, synced
-- through the existing aggregate RPCs
--
-- docs/domain/CALENDAR_BLOCKS.md: the professional blocks a period of her
-- calendar for something that is not a client Appointment (a break, travel,
-- admin work, training…). A block is calendar availability and nothing else —
-- a staff member, an interval, a reason. It is deliberately NOT an Appointment
-- row: no client, no service item, no price, no discount, no payment, no
-- status. Nothing financial can read it because nothing financial is in it.
--
-- This migration is additive and non-destructive:
--
--   * ONE new table, `public.calendar_blocks`, with the conventions of every
--     top-level aggregate of 20260914120000: `(business_id, id)` primary key,
--     Business ownership (FK RESTRICT), server-owned `created_at` /
--     `updated_at` / `sync_version` through the generic
--     `sync_aggregate_before_write` trigger, `deleted_at` tombstone, the
--     owner-only RLS policy set, least-privilege grants (select / insert /
--     update — NO delete: a block is tombstoned, never hard-deleted);
--   * NO existing table, row, column, id, tombstone, trigger, policy or grant
--     is touched: no `updated_at` / `sync_version` moves, so no device
--     re-pulls anything because of this migration.
--
-- The three sync RPCs are replaced IN PLACE (`create or replace`, identical
-- signatures: the existing EXECUTE grants, revokes and comments are preserved).
-- Their bodies are the ones of 20260922120000 (20260917120000 for the count)
-- with exactly these differences:
--
--   sync_count_business_aggregates  also counts calendar_blocks (a Business
--                                   holding only blocks is not empty);
--   sync_push_aggregate             accepts the CALENDAR_BLOCK aggregate type;
--   sync_pull_business_aggregates   returns a sixth family, `calendar_blocks`.
--
-- Compatibility with an app build that predates Calendar Blocks:
--
--   * sync is PER AGGREGATE: such a build pushes the five families it knows,
--     one aggregate at a time. There is no dataset-level payload in which a
--     missing section could be read as "zero blocks". It never names a
--     CALENDAR_BLOCK, so it can neither overwrite nor tombstone one; deleting
--     a block takes an explicit CALENDAR_BLOCK DELETE from a build that knows
--     them;
--   * its pull parser reads the five keys it knows and ignores the extra
--     `calendar_blocks` key; its local schema has no such table.
--
-- Apply this migration BEFORE shipping the build that writes Calendar Blocks.
-- Against the previous functions a CALENDAR_BLOCK push is refused (22023,
-- "unknown aggregate type"): nothing is lost — the entry stays pending on the
-- device with a bounded backoff and is pushed once this migration is applied —
-- but until then no block reaches the cloud or another device.
--
-- Safe to re-run: `if not exists` / `drop … if exists` on the new table's own
-- objects only, `create or replace` for the functions.

-- ---------------------------------------------------------------------------
-- 1. The table  (aggregate CALENDAR_BLOCK)
-- ---------------------------------------------------------------------------
create table if not exists public.calendar_blocks (
  business_id uuid not null references public.businesses (id) on delete restrict,
  id text not null check (char_length(id) between 1 and 200),
  -- Plain text identifier, like appointments.staff_member_id (no staff table).
  staff_member_id text not null check (char_length(staff_member_id) > 0),
  start_at timestamptz not null,
  -- Exclusive end, strictly after the start.
  end_at timestamptz not null,
  -- Free text. The app's quick suggestions are a UI shortcut, not a vocabulary.
  reason text not null check (char_length(btrim(reason)) > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  sync_version bigint not null default 1 check (sync_version >= 1),
  deleted_at timestamptz,
  primary key (business_id, id),
  constraint calendar_blocks_interval_check check (end_at > start_at)
);

comment on table public.calendar_blocks is
  'Personal unavailability of a staff member (aggregate CALENDAR_BLOCK). Calendar availability only: no client, price, payment or status.';

create index if not exists calendar_blocks_business_updated_at_idx
  on public.calendar_blocks (business_id, updated_at);
create index if not exists calendar_blocks_business_staff_start_at_idx
  on public.calendar_blocks (business_id, staff_member_id, start_at);

drop trigger if exists calendar_blocks_sync_before_write on public.calendar_blocks;
create trigger calendar_blocks_sync_before_write
  before insert or update on public.calendar_blocks
  for each row execute function public.sync_aggregate_before_write();

-- ---------------------------------------------------------------------------
-- 2. RLS — the owner-only policy set of every aggregate. No DELETE policy:
--    a block is tombstoned through deleted_at.
-- ---------------------------------------------------------------------------
alter table public.calendar_blocks enable row level security;

drop policy if exists "calendar_blocks: owner can select" on public.calendar_blocks;
create policy "calendar_blocks: owner can select" on public.calendar_blocks
  for select to authenticated
  using ((select public.is_business_owner(business_id)));

drop policy if exists "calendar_blocks: owner can insert" on public.calendar_blocks;
create policy "calendar_blocks: owner can insert" on public.calendar_blocks
  for insert to authenticated
  with check ((select public.is_business_owner(business_id)));

drop policy if exists "calendar_blocks: owner can update" on public.calendar_blocks;
create policy "calendar_blocks: owner can update" on public.calendar_blocks
  for update to authenticated
  using ((select public.is_business_owner(business_id)))
  with check ((select public.is_business_owner(business_id)));

-- ---------------------------------------------------------------------------
-- 3. Grants — least privilege. Supabase's default privileges grant ALL
--    (DELETE and TRUNCATE included, which RLS does not govern) on every new
--    public table to anon AND authenticated: revoke first, then grant.
-- ---------------------------------------------------------------------------
revoke all on table public.calendar_blocks from public, anon, authenticated;
grant select, insert, update on table public.calendar_blocks to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Bootstrap count — a Business holding only blocks is not empty
-- ---------------------------------------------------------------------------
create or replace function public.sync_count_business_aggregates(p_business_id uuid)
returns bigint
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  if not public.is_business_owner(p_business_id) then
    raise exception 'sync: not the owner of this Business' using errcode = '42501';
  end if;

  return
      (select count(*) from public.clients where business_id = p_business_id)
    + (select count(*) from public.services where business_id = p_business_id)
    + (select count(*) from public.appointments where business_id = p_business_id)
    + (select count(*) from public.products where business_id = p_business_id)
    + (select count(*) from public.sales where business_id = p_business_id)
    + (select count(*) from public.calendar_blocks where business_id = p_business_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Push — accepts the CALENDAR_BLOCK aggregate
-- ---------------------------------------------------------------------------
create or replace function public.sync_push_aggregate(
  p_business_id uuid,
  p_aggregate_type text,
  p_aggregate_id text,
  p_operation text,
  p_expected_version bigint,
  p_payload jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  parent_table text;
  remote_version bigint;
  remote_deleted_at timestamptz;
  remote_found boolean;
  version_matches boolean;
  new_version bigint;
begin
  if not public.is_business_owner(p_business_id) then
    raise exception 'sync: not the owner of this Business' using errcode = '42501';
  end if;

  parent_table := case p_aggregate_type
    when 'CLIENT' then 'clients'
    when 'SERVICE' then 'services'
    when 'APPOINTMENT' then 'appointments'
    when 'PRODUCT' then 'products'
    when 'SALE' then 'sales'
    when 'CALENDAR_BLOCK' then 'calendar_blocks'
  end;
  if parent_table is null then
    raise exception 'sync: unknown aggregate type' using errcode = '22023';
  end if;
  if p_operation is null or p_operation not in ('UPSERT', 'DELETE') then
    raise exception 'sync: unknown operation' using errcode = '22023';
  end if;
  if p_aggregate_id is null or char_length(p_aggregate_id) = 0 then
    raise exception 'sync: empty aggregate id' using errcode = '22023';
  end if;
  if p_operation = 'UPSERT' and (p_payload is null or jsonb_typeof(p_payload) <> 'object') then
    raise exception 'sync: UPSERT requires an object payload' using errcode = '22023';
  end if;

  -- parent_table comes from the whitelist above, never from the caller.
  execute format(
    'select sync_version, deleted_at from public.%I where business_id = $1 and id = $2 for update',
    parent_table
  )
  into remote_version, remote_deleted_at
  using p_business_id, p_aggregate_id;

  remote_found := remote_version is not null;
  version_matches := p_expected_version is not distinct from remote_version;

  -- ------------------------------------------------------------- DELETE ----
  if p_operation = 'DELETE' then
    if not remote_found then
      return jsonb_build_object('status', 'ABSENT');
    end if;
    if remote_deleted_at is not null then
      return jsonb_build_object('status', 'APPLIED', 'sync_version', remote_version);
    end if;
    if not version_matches then
      return jsonb_build_object('status', 'CONFLICT', 'sync_version', remote_version);
    end if;

    execute format(
      'update public.%I set deleted_at = now() where business_id = $1 and id = $2 returning sync_version',
      parent_table
    )
    into new_version
    using p_business_id, p_aggregate_id;

    return jsonb_build_object('status', 'APPLIED', 'sync_version', new_version);
  end if;

  -- ------------------------------------------------------------- UPSERT ----
  -- The device acknowledged a row the remote no longer holds (administrative
  -- hard delete): never silently recreate it.
  if not remote_found and p_expected_version is not null then
    return jsonb_build_object('status', 'CONFLICT', 'sync_version', null);
  end if;

  begin
    set constraints all deferred;

    if p_aggregate_type = 'CLIENT' then
      insert into public.clients
        (business_id, id, first_name, last_name, phone, email, birthday, notes, archived_at, deleted_at)
      select p_business_id, p_aggregate_id,
             x.first_name, x.last_name, x.phone, x.email, x.birthday, x.notes, x.archived_at, null
      from jsonb_to_record(p_payload) as x(
        first_name text, last_name text, phone text, email text, birthday text, notes text,
        archived_at timestamptz
      )
      on conflict (business_id, id) do update set
        first_name = excluded.first_name,
        last_name = excluded.last_name,
        phone = excluded.phone,
        email = excluded.email,
        birthday = excluded.birthday,
        -- A build that predates Client notes sends no "notes" key: keep the
        -- stored note instead of reading the missing key as "cleared". A build
        -- that knows the field always sends it (text, or null to clear).
        notes = case when p_payload ? 'notes' then excluded.notes else public.clients.notes end,
        archived_at = excluded.archived_at,
        deleted_at = null;

    elsif p_aggregate_type = 'PRODUCT' then
      insert into public.products
        (business_id, id, name, brand, category, barcode, price_cents, stock_quantity, active, deleted_at)
      select p_business_id, p_aggregate_id,
             x.name, x.brand, x.category, x.barcode, x.price_cents, x.stock_quantity, x.active, null
      from jsonb_to_record(p_payload) as x(
        name text, brand text, category text, barcode text,
        price_cents integer, stock_quantity integer, active boolean
      )
      on conflict (business_id, id) do update set
        name = excluded.name,
        brand = excluded.brand,
        category = excluded.category,
        barcode = excluded.barcode,
        price_cents = excluded.price_cents,
        stock_quantity = excluded.stock_quantity,
        active = excluded.active,
        deleted_at = null;

    elsif p_aggregate_type = 'SERVICE' then
      insert into public.services
        (business_id, id, name, type, price_cents, active, deleted_at)
      select p_business_id, p_aggregate_id, x.name, x.type, x.price_cents, x.active, null
      from jsonb_to_record(p_payload) as x(name text, type text, price_cents integer, active boolean)
      on conflict (business_id, id) do update set
        name = excluded.name,
        type = excluded.type,
        price_cents = excluded.price_cents,
        active = excluded.active,
        deleted_at = null;

      delete from public.service_phases c
      where c.business_id = p_business_id
        and c.service_id = p_aggregate_id
        and not exists (
          select 1
          from jsonb_to_recordset(coalesce(p_payload -> 'phases', '[]'::jsonb)) as x(id text)
          where x.id = c.id
        );

      insert into public.service_phases
        (business_id, service_id, id, position, name, duration_minutes, requires_staff)
      select p_business_id, p_aggregate_id, x.id, x.position, x.name, x.duration_minutes, x.requires_staff
      from jsonb_to_recordset(coalesce(p_payload -> 'phases', '[]'::jsonb)) as x(
        id text, position integer, name text, duration_minutes integer, requires_staff boolean
      )
      on conflict (business_id, service_id, id) do update set
        position = excluded.position,
        name = excluded.name,
        duration_minutes = excluded.duration_minutes,
        requires_staff = excluded.requires_staff;

    elsif p_aggregate_type = 'APPOINTMENT' then
      insert into public.appointments
        (business_id, id, client_id, staff_member_id, start_at, status, notes,
         cancelled_at, cancelled_by, cancellation_reason, no_show_recorded_at,
         paid_at, card_amount_cents, cash_amount_cents,
         discount_percent, discount_amount_cents, deleted_at)
      select p_business_id, p_aggregate_id,
             x.client_id, x.staff_member_id, x.start_at, x.status, x.notes,
             x.cancelled_at, x.cancelled_by, x.cancellation_reason, x.no_show_recorded_at,
             x.paid_at, x.card_amount_cents, x.cash_amount_cents,
             x.discount_percent, x.discount_amount_cents, null
      from jsonb_to_record(p_payload) as x(
        client_id text, staff_member_id text, start_at timestamptz, status text, notes text,
        cancelled_at timestamptz, cancelled_by text, cancellation_reason text,
        no_show_recorded_at timestamptz,
        paid_at timestamptz, card_amount_cents integer, cash_amount_cents integer,
        discount_percent integer, discount_amount_cents integer
      )
      on conflict (business_id, id) do update set
        client_id = excluded.client_id,
        staff_member_id = excluded.staff_member_id,
        start_at = excluded.start_at,
        status = excluded.status,
        notes = excluded.notes,
        cancelled_at = excluded.cancelled_at,
        cancelled_by = excluded.cancelled_by,
        cancellation_reason = excluded.cancellation_reason,
        no_show_recorded_at = excluded.no_show_recorded_at,
        paid_at = excluded.paid_at,
        card_amount_cents = excluded.card_amount_cents,
        cash_amount_cents = excluded.cash_amount_cents,
        -- A build that predates the Appointment discount sends neither key:
        -- keep the stored discount instead of reading the missing keys as
        -- "removed". A build that knows the discount always sends BOTH keys
        -- (one value and one null, or two nulls to remove it), so the pair is
        -- replaced together and the one-of CHECK is never tripped by a
        -- half-updated row.
        discount_percent = case
          when p_payload ? 'discount_percent' or p_payload ? 'discount_amount_cents'
            then excluded.discount_percent
          else public.appointments.discount_percent
        end,
        discount_amount_cents = case
          when p_payload ? 'discount_percent' or p_payload ? 'discount_amount_cents'
            then excluded.discount_amount_cents
          else public.appointments.discount_amount_cents
        end,
        deleted_at = null;

      -- Phases first (keyed under their item), then items; a removed item
      -- cascades to whatever phases it still had.
      delete from public.appointment_phases c
      where c.business_id = p_business_id
        and c.appointment_id = p_aggregate_id
        and not exists (
          select 1
          from jsonb_to_recordset(coalesce(p_payload -> 'items', '[]'::jsonb)) as i(id text, phases jsonb),
               jsonb_to_recordset(coalesce(i.phases, '[]'::jsonb)) as x(id text)
          where i.id = c.appointment_item_id and x.id = c.id
        );

      delete from public.appointment_items c
      where c.business_id = p_business_id
        and c.appointment_id = p_aggregate_id
        and not exists (
          select 1
          from jsonb_to_recordset(coalesce(p_payload -> 'items', '[]'::jsonb)) as x(id text)
          where x.id = c.id
        );

      insert into public.appointment_items
        (business_id, appointment_id, id, item_order, service_id, service_option_id,
         service_name, service_type, price_cents)
      select p_business_id, p_aggregate_id, x.id, x.item_order, x.service_id, x.service_option_id,
             x.service_name, x.service_type, x.price_cents
      from jsonb_to_recordset(coalesce(p_payload -> 'items', '[]'::jsonb)) as x(
        id text, item_order integer, service_id text, service_option_id text,
        service_name text, service_type text, price_cents integer
      )
      on conflict (business_id, appointment_id, id) do update set
        item_order = excluded.item_order,
        service_id = excluded.service_id,
        service_option_id = excluded.service_option_id,
        service_name = excluded.service_name,
        service_type = excluded.service_type,
        price_cents = excluded.price_cents;

      insert into public.appointment_phases
        (business_id, appointment_id, appointment_item_id, id, position, name,
         duration_minutes, requires_staff)
      select p_business_id, p_aggregate_id, i.id, x.id, x.position, x.name,
             x.duration_minutes, x.requires_staff
      from jsonb_to_recordset(coalesce(p_payload -> 'items', '[]'::jsonb)) as i(id text, phases jsonb),
           jsonb_to_recordset(coalesce(i.phases, '[]'::jsonb)) as x(
             id text, position integer, name text, duration_minutes integer, requires_staff boolean
           )
      on conflict (business_id, appointment_id, appointment_item_id, id) do update set
        position = excluded.position,
        name = excluded.name,
        duration_minutes = excluded.duration_minutes,
        requires_staff = excluded.requires_staff;

    elsif p_aggregate_type = 'CALENDAR_BLOCK' then
      -- Personal unavailability: a staff member, an interval, a reason. No
      -- client, no price, no payment, no status, no child rows.
      insert into public.calendar_blocks
        (business_id, id, staff_member_id, start_at, end_at, reason, deleted_at)
      select p_business_id, p_aggregate_id, x.staff_member_id, x.start_at, x.end_at, x.reason, null
      from jsonb_to_record(p_payload) as x(
        staff_member_id text, start_at timestamptz, end_at timestamptz, reason text
      )
      on conflict (business_id, id) do update set
        staff_member_id = excluded.staff_member_id,
        start_at = excluded.start_at,
        end_at = excluded.end_at,
        reason = excluded.reason,
        deleted_at = null;

    else -- SALE
      insert into public.sales
        (business_id, id, client_id, appointment_id, completed_at,
         paid_at, card_amount_cents, cash_amount_cents, deleted_at)
      select p_business_id, p_aggregate_id, x.client_id, x.appointment_id, x.completed_at,
             x.paid_at, x.card_amount_cents, x.cash_amount_cents, null
      from jsonb_to_record(p_payload) as x(
        client_id text, appointment_id text, completed_at timestamptz,
        paid_at timestamptz, card_amount_cents integer, cash_amount_cents integer
      )
      on conflict (business_id, id) do update set
        client_id = excluded.client_id,
        appointment_id = excluded.appointment_id,
        completed_at = excluded.completed_at,
        paid_at = excluded.paid_at,
        card_amount_cents = excluded.card_amount_cents,
        cash_amount_cents = excluded.cash_amount_cents,
        deleted_at = null;

      delete from public.sale_items c
      where c.business_id = p_business_id
        and c.sale_id = p_aggregate_id
        and not exists (
          select 1
          from jsonb_to_recordset(coalesce(p_payload -> 'items', '[]'::jsonb)) as x(id text)
          where x.id = c.id
        );

      insert into public.sale_items
        (business_id, sale_id, id, position, product_id, product_name, unit_price_cents, quantity)
      select p_business_id, p_aggregate_id, x.id, x.position, x.product_id, x.product_name,
             x.unit_price_cents, x.quantity
      from jsonb_to_recordset(coalesce(p_payload -> 'items', '[]'::jsonb)) as x(
        id text, position integer, product_id text, product_name text,
        unit_price_cents integer, quantity integer
      )
      on conflict (business_id, sale_id, id) do update set
        position = excluded.position,
        product_id = excluded.product_id,
        product_name = excluded.product_name,
        unit_price_cents = excluded.unit_price_cents,
        quantity = excluded.quantity;
    end if;

    -- Deferred position uniqueness is verified HERE, inside the savepoint.
    set constraints all immediate;

    execute format(
      'select sync_version from public.%I where business_id = $1 and id = $2',
      parent_table
    )
    into new_version
    using p_business_id, p_aggregate_id;

    -- The remote was at a revision the device never acknowledged and the push
    -- would have changed it: undo everything written above.
    if not version_matches and new_version is distinct from remote_version then
      raise exception 'sync: version conflict' using errcode = 'SC409';
    end if;
  exception
    when sqlstate 'SC409' then
      return jsonb_build_object('status', 'CONFLICT', 'sync_version', remote_version);
  end;

  return jsonb_build_object('status', 'APPLIED', 'sync_version', new_version);
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Pull — a sixth family: calendar_blocks[]
-- ---------------------------------------------------------------------------
create or replace function public.sync_pull_business_aggregates(p_business_id uuid, p_since timestamptz)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  if not public.is_business_owner(p_business_id) then
    raise exception 'sync: not the owner of this Business' using errcode = '42501';
  end if;

  return (
    select jsonb_build_object(
      'pulled_at', public.sync_instant_text(now()),

      'clients', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'id', c.id,
            'sync_version', c.sync_version,
            'deleted_at', public.sync_instant_text(c.deleted_at),
            'first_name', c.first_name,
            'last_name', c.last_name,
            'phone', c.phone,
            'email', c.email,
            'birthday', c.birthday,
            'notes', c.notes,
            'archived_at', public.sync_instant_text(c.archived_at)
          )
          order by c.created_at, c.id
        )
        from public.clients c
        where c.business_id = p_business_id
          and (p_since is null or c.updated_at > p_since)
      ), '[]'::jsonb),

      'services', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'id', s.id,
            'sync_version', s.sync_version,
            'deleted_at', public.sync_instant_text(s.deleted_at),
            'name', s.name,
            'type', s.type,
            'price_cents', s.price_cents,
            'active', s.active,
            'phases', case when s.deleted_at is not null then '[]'::jsonb else coalesce((
              select jsonb_agg(
                jsonb_build_object(
                  'id', p.id,
                  'position', p.position,
                  'name', p.name,
                  'duration_minutes', p.duration_minutes,
                  'requires_staff', p.requires_staff
                )
                order by p.position
              )
              from public.service_phases p
              where p.business_id = s.business_id and p.service_id = s.id
            ), '[]'::jsonb) end
          )
          order by s.created_at, s.id
        )
        from public.services s
        where s.business_id = p_business_id
          and (p_since is null or s.updated_at > p_since)
      ), '[]'::jsonb),

      'products', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'id', pr.id,
            'sync_version', pr.sync_version,
            'deleted_at', public.sync_instant_text(pr.deleted_at),
            'name', pr.name,
            'brand', pr.brand,
            'category', pr.category,
            'barcode', pr.barcode,
            'price_cents', pr.price_cents,
            'stock_quantity', pr.stock_quantity,
            'active', pr.active
          )
          order by pr.created_at, pr.id
        )
        from public.products pr
        where pr.business_id = p_business_id
          and (p_since is null or pr.updated_at > p_since)
      ), '[]'::jsonb),

      'appointments', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'id', a.id,
            'sync_version', a.sync_version,
            'deleted_at', public.sync_instant_text(a.deleted_at),
            'client_id', a.client_id,
            'staff_member_id', a.staff_member_id,
            'start_at', public.sync_instant_text(a.start_at),
            'status', a.status,
            'notes', a.notes,
            'cancelled_at', public.sync_instant_text(a.cancelled_at),
            'cancelled_by', a.cancelled_by,
            'cancellation_reason', a.cancellation_reason,
            'no_show_recorded_at', public.sync_instant_text(a.no_show_recorded_at),
            'paid_at', public.sync_instant_text(a.paid_at),
            'card_amount_cents', a.card_amount_cents,
            'cash_amount_cents', a.cash_amount_cents,
            'discount_percent', a.discount_percent,
            'discount_amount_cents', a.discount_amount_cents,
            'items', case when a.deleted_at is not null then '[]'::jsonb else coalesce((
              select jsonb_agg(
                jsonb_build_object(
                  'id', i.id,
                  'item_order', i.item_order,
                  'service_id', i.service_id,
                  'service_option_id', i.service_option_id,
                  'service_name', i.service_name,
                  'service_type', i.service_type,
                  'price_cents', i.price_cents,
                  'phases', coalesce((
                    select jsonb_agg(
                      jsonb_build_object(
                        'id', ph.id,
                        'position', ph.position,
                        'name', ph.name,
                        'duration_minutes', ph.duration_minutes,
                        'requires_staff', ph.requires_staff
                      )
                      order by ph.position
                    )
                    from public.appointment_phases ph
                    where ph.business_id = i.business_id
                      and ph.appointment_id = i.appointment_id
                      and ph.appointment_item_id = i.id
                  ), '[]'::jsonb)
                )
                order by i.item_order
              )
              from public.appointment_items i
              where i.business_id = a.business_id and i.appointment_id = a.id
            ), '[]'::jsonb) end
          )
          order by a.created_at, a.id
        )
        from public.appointments a
        where a.business_id = p_business_id
          and (p_since is null or a.updated_at > p_since)
      ), '[]'::jsonb),

      'sales', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'id', sa.id,
            'sync_version', sa.sync_version,
            'deleted_at', public.sync_instant_text(sa.deleted_at),
            'client_id', sa.client_id,
            'appointment_id', sa.appointment_id,
            'completed_at', public.sync_instant_text(sa.completed_at),
            'paid_at', public.sync_instant_text(sa.paid_at),
            'card_amount_cents', sa.card_amount_cents,
            'cash_amount_cents', sa.cash_amount_cents,
            'items', case when sa.deleted_at is not null then '[]'::jsonb else coalesce((
              select jsonb_agg(
                jsonb_build_object(
                  'id', si.id,
                  'position', si.position,
                  'product_id', si.product_id,
                  'product_name', si.product_name,
                  'unit_price_cents', si.unit_price_cents,
                  'quantity', si.quantity
                )
                order by si.position
              )
              from public.sale_items si
              where si.business_id = sa.business_id and si.sale_id = sa.id
            ), '[]'::jsonb) end
          )
          order by sa.created_at, sa.id
        )
        from public.sales sa
        where sa.business_id = p_business_id
          and (p_since is null or sa.updated_at > p_since)
      ), '[]'::jsonb),

      'calendar_blocks', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'id', cb.id,
            'sync_version', cb.sync_version,
            'deleted_at', public.sync_instant_text(cb.deleted_at),
            'staff_member_id', cb.staff_member_id,
            'start_at', public.sync_instant_text(cb.start_at),
            'end_at', public.sync_instant_text(cb.end_at),
            'reason', cb.reason
          )
          order by cb.created_at, cb.id
        )
        from public.calendar_blocks cb
        where cb.business_id = p_business_id
          and (p_since is null or cb.updated_at > p_since)
      ), '[]'::jsonb)
    )
  );
end;
$$;
