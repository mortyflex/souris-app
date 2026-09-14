-- Souris — Cloud Sync V1A: remote operational schema & sync contract
--
-- Mirrors the canonical SQLite model (schema v6) for the future sync engine:
--
--   clients, services + service_phases, appointments + appointment_items +
--   appointment_phases, products, sales + sale_items
--
-- Nothing reads or writes these tables yet: the mobile UI stays SQLite-first
-- (docs/architecture/CLOUD_SYNC.md). Design rules applied here:
--
--   * every row belongs to ONE Business (public.businesses); RLS is the
--     security boundary — an authenticated owner sees only their Business,
--     anon sees nothing;
--   * stable app ids are TEXT (e.g. `client-1726300000000-1`), unique per
--     Business only, so every key is composite: (business_id, id);
--   * cross-entity references are composite foreign keys on
--     (business_id, <ref>) → parent (business_id, id): a Business A row can
--     never point at a Business B row, whatever the application does;
--   * Appointment items/phases and Sale items are historical snapshots:
--     `service_id` / `product_id` are plain metadata, NO foreign key to the
--     catalog, exactly like SQLite;
--   * money is integer cents everywhere (no floating-point column);
--   * derived values (expected totals, cash-register totals, client spend)
--     are never stored;
--   * top-level aggregates carry server-owned revision metadata
--     (created_at / updated_at / sync_version) and a `deleted_at` tombstone;
--     nested children are the parent's complete child set and carry none;
--   * no DELETE is granted on top-level tables — the API can only tombstone.

-- ---------------------------------------------------------------------------
-- 1. Ownership helper used by every operational policy
-- ---------------------------------------------------------------------------
-- SECURITY INVOKER on purpose: it runs under the caller's own rights, so the
-- businesses RLS still applies on top of the explicit owner predicate. STABLE
-- lets the planner cache it inside a statement.
create function public.is_business_owner(target_business_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select exists (
    select 1
    from public.businesses b
    where b.id = target_business_id
      and b.owner_user_id = (select auth.uid())
  );
$$;

comment on function public.is_business_owner(uuid) is
  'True when the signed-in user owns the given Business. RLS predicate of every operational table.';

revoke all on function public.is_business_owner(uuid) from public, anon;
grant execute on function public.is_business_owner(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Server-side revision metadata for top-level aggregates
-- ---------------------------------------------------------------------------
-- INSERT : created_at / updated_at = now(), sync_version = 1 (whatever the
--          client sent).
-- UPDATE : business_id, id and created_at are immutable; updated_at and
--          sync_version are server-owned. They advance only on a MEANINGFUL
--          change (any other column differs, tombstone included), or when a
--          child-table trigger touches the parent (pg_trigger_depth() > 1)
--          because the child set changed while the parent columns did not.
-- Device clocks never enter this function.
create function public.sync_aggregate_before_write()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.created_at := now();
    new.updated_at := now();
    new.sync_version := 1;
    return new;
  end if;

  new.business_id := old.business_id;
  new.id := old.id;
  new.created_at := old.created_at;
  new.updated_at := old.updated_at;
  new.sync_version := old.sync_version;

  if pg_trigger_depth() > 1 or new is distinct from old then
    new.updated_at := now();
    new.sync_version := old.sync_version + 1;
  end if;

  return new;
end;
$$;

comment on function public.sync_aggregate_before_write() is
  'BEFORE INSERT/UPDATE: pins identity, maintains updated_at and sync_version server-side.';

-- Any insert/update/delete of a nested child row publishes a new revision of
-- its top-level aggregate. Arguments: (parent table, child column holding the
-- parent id). The no-op assignment is turned into a real bump by the parent's
-- sync_aggregate_before_write trigger (nested depth). A parent that no longer
-- exists (admin cascade) simply matches no row.
create function public.sync_child_touch_parent()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  parent_table text := tg_argv[0];
  parent_id_column text := tg_argv[1];
  touched jsonb;
begin
  -- An UPDATE that changes nothing is not a revision of the parent.
  if tg_op = 'UPDATE' and new is not distinct from old then
    return null;
  end if;

  if tg_op = 'DELETE' then
    touched := to_jsonb(old);
  else
    touched := to_jsonb(new);
  end if;

  execute format(
    'update public.%I set sync_version = sync_version where business_id = $1 and id = $2',
    parent_table
  )
  using (touched ->> 'business_id')::uuid, touched ->> parent_id_column;

  -- A child moved to another parent (never done by Souris, but possible in
  -- SQL): the previous parent lost a child and must publish a revision too.
  if tg_op = 'UPDATE'
     and (to_jsonb(old) ->> parent_id_column) is distinct from (touched ->> parent_id_column) then
    execute format(
      'update public.%I set sync_version = sync_version where business_id = $1 and id = $2',
      parent_table
    )
    using (to_jsonb(old) ->> 'business_id')::uuid, to_jsonb(old) ->> parent_id_column;
  end if;

  return null;
end;
$$;

comment on function public.sync_child_touch_parent() is
  'AFTER row trigger on nested child tables: bumps the parent aggregate revision.';

revoke all on function public.sync_aggregate_before_write() from public, anon;
revoke all on function public.sync_child_touch_parent() from public, anon;

-- ---------------------------------------------------------------------------
-- 3. Clients  (aggregate CLIENT)
-- ---------------------------------------------------------------------------
-- SQLite `clients` has no business_id column; the sync layer stamps the bound
-- Business id. `archived_at` is the Client lifecycle (docs/domain/CLIENTS.md);
-- `deleted_at` is the sync tombstone of a permanent deletion. Both may be set.
create table public.clients (
  business_id uuid not null references public.businesses (id) on delete restrict,
  id text not null check (char_length(id) between 1 and 200),
  first_name text not null check (char_length(first_name) > 0),
  last_name text,
  phone text,
  email text,
  -- Civil day + month, `MM-DD`; never a year (docs/domain/CLIENTS.md §2).
  birthday text check (birthday is null or birthday ~ '^[0-9]{2}-[0-9]{2}$'),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  sync_version bigint not null default 1 check (sync_version >= 1),
  deleted_at timestamptz,
  primary key (business_id, id)
);

comment on table public.clients is
  'Souris Client identity (aggregate CLIENT). archived_at = lifecycle; deleted_at = sync tombstone.';

create index clients_business_updated_at_idx on public.clients (business_id, updated_at);

create trigger clients_sync_before_write
  before insert or update on public.clients
  for each row execute function public.sync_aggregate_before_write();

-- ---------------------------------------------------------------------------
-- 4. Services + phases  (aggregate SERVICE)
-- ---------------------------------------------------------------------------
create table public.services (
  business_id uuid not null references public.businesses (id) on delete restrict,
  id text not null check (char_length(id) between 1 and 200),
  name text not null check (char_length(name) > 0),
  type text not null check (type in ('SERVICE', 'TECHNIQUE')),
  -- SQLite stores a euro REAL; the sync layer converts with the domain
  -- eurosToCents rule. Never a floating-point column remotely.
  price_cents integer not null check (price_cents >= 0),
  active boolean not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  sync_version bigint not null default 1 check (sync_version >= 1),
  deleted_at timestamptz,
  primary key (business_id, id)
);

comment on table public.services is
  'Catalog Service (aggregate SERVICE, with service_phases as its complete child set).';

create index services_business_updated_at_idx on public.services (business_id, updated_at);

create trigger services_sync_before_write
  before insert or update on public.services
  for each row execute function public.sync_aggregate_before_write();

-- Ordered catalog phases. Stable phase id + explicit position, both unique
-- inside the Service. The position uniqueness is DEFERRABLE so a future
-- in-place reorder inside one transaction is possible; V1 replaces the set.
-- Catalog phases are validated positive by the application; the column
-- mirrors SQLite (no positivity check) so existing rows always upload.
create table public.service_phases (
  business_id uuid not null,
  service_id text not null,
  id text not null check (char_length(id) between 1 and 200),
  position integer not null check (position >= 0),
  name text not null,
  duration_minutes integer not null check (duration_minutes >= 0),
  requires_staff boolean not null,
  primary key (business_id, service_id, id),
  unique (business_id, service_id, position) deferrable initially immediate,
  foreign key (business_id, service_id)
    references public.services (business_id, id) on delete cascade
);

comment on table public.service_phases is
  'Ordered phases of a Service. Nested child: synchronized as the Service''s complete set.';

create trigger service_phases_touch_parent
  after insert or update or delete on public.service_phases
  for each row execute function public.sync_child_touch_parent('services', 'service_id');

-- ---------------------------------------------------------------------------
-- 5. Appointments + item snapshots + phase snapshots  (aggregate APPOINTMENT)
-- ---------------------------------------------------------------------------
create table public.appointments (
  business_id uuid not null references public.businesses (id) on delete restrict,
  id text not null check (char_length(id) between 1 and 200),
  client_id text not null,
  -- No staff table yet; the identifier stays explicit (CLAUDE.md §18).
  staff_member_id text not null check (char_length(staff_member_id) > 0),
  start_at timestamptz not null,
  status text not null check (
    status in ('SCHEDULED', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'NO_SHOW')
  ),
  notes text,
  cancelled_at timestamptz,
  cancelled_by text check (cancelled_by is null or cancelled_by in ('CLIENT', 'BUSINESS')),
  cancellation_reason text,
  no_show_recorded_at timestamptz,
  -- Explicit checkout (« Encaisser »): all three NULL = never checked out.
  paid_at timestamptz,
  card_amount_cents integer,
  cash_amount_cents integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  sync_version bigint not null default 1 check (sync_version >= 1),
  deleted_at timestamptz,
  primary key (business_id, id),
  -- Same Business only. RESTRICT: a Client row is never hard-deleted while
  -- history references it (the local guard); remotely it is tombstoned.
  foreign key (business_id, client_id)
    references public.clients (business_id, id) on delete restrict,
  constraint appointments_cancellation_check check (
    (cancelled_at is null) = (cancelled_by is null)
    and (cancellation_reason is null or cancelled_at is not null)
  ),
  constraint appointments_payment_check check (
    (paid_at is null and card_amount_cents is null and cash_amount_cents is null)
    or (
      paid_at is not null
      and card_amount_cents is not null and card_amount_cents >= 0
      and cash_amount_cents is not null and cash_amount_cents >= 0
    )
  )
);

comment on table public.appointments is
  'Appointment (aggregate APPOINTMENT). Expected total is derived from items, never stored.';

create index appointments_business_start_at_idx on public.appointments (business_id, start_at);
create index appointments_business_client_idx on public.appointments (business_id, client_id);
create index appointments_business_updated_at_idx on public.appointments (business_id, updated_at);

create trigger appointments_sync_before_write
  before insert or update on public.appointments
  for each row execute function public.sync_aggregate_before_write();

-- Booked service snapshot. `service_id` / `service_option_id` are historical
-- metadata: NO foreign key to services, so catalog deletion never touches
-- history. `item_order` is the authoritative sequence (SQLite column name).
create table public.appointment_items (
  business_id uuid not null,
  appointment_id text not null,
  id text not null check (char_length(id) between 1 and 200),
  item_order integer not null check (item_order >= 0),
  service_id text not null,
  service_option_id text,
  service_name text not null,
  service_type text not null check (service_type in ('SERVICE', 'TECHNIQUE')),
  price_cents integer not null check (price_cents >= 0),
  primary key (business_id, appointment_id, id),
  unique (business_id, appointment_id, item_order) deferrable initially immediate,
  foreign key (business_id, appointment_id)
    references public.appointments (business_id, id) on delete cascade
);

comment on table public.appointment_items is
  'Historical service snapshot of an Appointment. Nested child; no FK to the catalog.';

create trigger appointment_items_touch_parent
  after insert or update or delete on public.appointment_items
  for each row execute function public.sync_child_touch_parent('appointments', 'appointment_id');

-- Phase snapshot. A duration of 0 is valid (docs/domain/APPOINTMENTS.md §14.2).
create table public.appointment_phases (
  business_id uuid not null,
  appointment_id text not null,
  appointment_item_id text not null,
  id text not null check (char_length(id) between 1 and 200),
  position integer not null check (position >= 0),
  name text not null,
  duration_minutes integer not null check (duration_minutes >= 0),
  requires_staff boolean not null,
  primary key (business_id, appointment_id, appointment_item_id, id),
  unique (business_id, appointment_id, appointment_item_id, position) deferrable initially immediate,
  foreign key (business_id, appointment_id, appointment_item_id)
    references public.appointment_items (business_id, appointment_id, id) on delete cascade
);

comment on table public.appointment_phases is
  'Ordered phase snapshot of an appointment item. Nested child of the APPOINTMENT aggregate.';

create trigger appointment_phases_touch_parent
  after insert or update or delete on public.appointment_phases
  for each row execute function public.sync_child_touch_parent('appointments', 'appointment_id');

-- ---------------------------------------------------------------------------
-- 6. Products  (aggregate PRODUCT)
-- ---------------------------------------------------------------------------
-- No image column on purpose: SQLite `image_uri` is a device-local file path
-- and is never canonical cloud data. Product image sync is V1F (Storage).
create table public.products (
  business_id uuid not null references public.businesses (id) on delete restrict,
  id text not null check (char_length(id) between 1 and 200),
  name text not null check (char_length(name) > 0),
  brand text,
  category text,
  -- Text: leading zeroes preserved, never numeric.
  barcode text,
  price_cents integer not null check (price_cents >= 0),
  -- Direct current stock, canonical state (not derived); never negative.
  stock_quantity integer not null check (stock_quantity >= 0),
  active boolean not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  sync_version bigint not null default 1 check (sync_version >= 1),
  deleted_at timestamptz,
  primary key (business_id, id)
);

comment on table public.products is
  'Catalog Product (aggregate PRODUCT). Images are not synchronized in V1A.';

create index products_business_updated_at_idx on public.products (business_id, updated_at);

create trigger products_sync_before_write
  before insert or update on public.products
  for each row execute function public.sync_aggregate_before_write();

-- ---------------------------------------------------------------------------
-- 7. Sales + item snapshots  (aggregate SALE)
-- ---------------------------------------------------------------------------
create table public.sales (
  business_id uuid not null references public.businesses (id) on delete restrict,
  id text not null check (char_length(id) between 1 and 200),
  -- Walk-in sale: NULL. Composite FK is skipped when NULL (MATCH SIMPLE).
  client_id text,
  -- « Revente » sold during an Appointment: NULL for a standalone Sale.
  appointment_id text,
  completed_at timestamptz not null,
  -- Standalone Sale payment only (docs/domain/SALES.md §4b).
  paid_at timestamptz,
  card_amount_cents integer,
  cash_amount_cents integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  sync_version bigint not null default 1 check (sync_version >= 1),
  deleted_at timestamptz,
  primary key (business_id, id),
  foreign key (business_id, client_id)
    references public.clients (business_id, id) on delete restrict,
  -- RESTRICT mirrors the local guard: an Appointment with a linked Sale is
  -- never deleted; a Sale is never rewritten because its Appointment went.
  foreign key (business_id, appointment_id)
    references public.appointments (business_id, id) on delete restrict,
  constraint sales_payment_check check (
    (paid_at is null and card_amount_cents is null and cash_amount_cents is null)
    or (
      paid_at is not null
      and card_amount_cents is not null and card_amount_cents >= 0
      and cash_amount_cents is not null and cash_amount_cents >= 0
    )
  ),
  -- An Appointment-linked Sale never carries its own payment: the Appointment
  -- checkout already records the money received.
  constraint sales_standalone_payment_check check (appointment_id is null or paid_at is null)
);

comment on table public.sales is
  'Completed Product Sale (aggregate SALE). Total is derived from sale_items, never stored.';

create index sales_business_client_idx on public.sales (business_id, client_id);
create index sales_business_appointment_idx on public.sales (business_id, appointment_id);
create index sales_business_updated_at_idx on public.sales (business_id, updated_at);

create trigger sales_sync_before_write
  before insert or update on public.sales
  for each row execute function public.sync_aggregate_before_write();

-- Sold line snapshot. `product_id` is historical metadata: NO foreign key to
-- products, so Product deletion never rewrites a Sale.
create table public.sale_items (
  business_id uuid not null,
  sale_id text not null,
  id text not null check (char_length(id) between 1 and 200),
  position integer not null check (position >= 0),
  product_id text not null,
  product_name text not null,
  unit_price_cents integer not null check (unit_price_cents >= 0),
  quantity integer not null check (quantity >= 1),
  primary key (business_id, sale_id, id),
  unique (business_id, sale_id, position) deferrable initially immediate,
  foreign key (business_id, sale_id)
    references public.sales (business_id, id) on delete cascade
);

comment on table public.sale_items is
  'Historical line snapshot of a Sale. Nested child; no FK to the catalog.';

create trigger sale_items_touch_parent
  after insert or update or delete on public.sale_items
  for each row execute function public.sync_child_touch_parent('sales', 'sale_id');

-- ---------------------------------------------------------------------------
-- 8. Row Level Security — owner only, tombstones included, no anon access
-- ---------------------------------------------------------------------------
-- SELECT deliberately does NOT filter deleted_at: a future sync engine must
-- download tombstones. INSERT / UPDATE check the resulting row's business_id,
-- and the before-write trigger pins business_id on top-level rows, so a row
-- can never be moved to another Business. Top-level tables have no DELETE
-- policy and no DELETE grant: the API can only tombstone. Nested children
-- get DELETE because they are replaced as complete sets with their parent.

-- clients
alter table public.clients enable row level security;
create policy "clients: owner can select" on public.clients
  for select to authenticated
  using ((select public.is_business_owner(business_id)));
create policy "clients: owner can insert" on public.clients
  for insert to authenticated
  with check ((select public.is_business_owner(business_id)));
create policy "clients: owner can update" on public.clients
  for update to authenticated
  using ((select public.is_business_owner(business_id)))
  with check ((select public.is_business_owner(business_id)));

-- services
alter table public.services enable row level security;
create policy "services: owner can select" on public.services
  for select to authenticated
  using ((select public.is_business_owner(business_id)));
create policy "services: owner can insert" on public.services
  for insert to authenticated
  with check ((select public.is_business_owner(business_id)));
create policy "services: owner can update" on public.services
  for update to authenticated
  using ((select public.is_business_owner(business_id)))
  with check ((select public.is_business_owner(business_id)));

-- service_phases (nested child)
alter table public.service_phases enable row level security;
create policy "service_phases: owner can select" on public.service_phases
  for select to authenticated
  using ((select public.is_business_owner(business_id)));
create policy "service_phases: owner can insert" on public.service_phases
  for insert to authenticated
  with check ((select public.is_business_owner(business_id)));
create policy "service_phases: owner can update" on public.service_phases
  for update to authenticated
  using ((select public.is_business_owner(business_id)))
  with check ((select public.is_business_owner(business_id)));
create policy "service_phases: owner can delete" on public.service_phases
  for delete to authenticated
  using ((select public.is_business_owner(business_id)));

-- appointments
alter table public.appointments enable row level security;
create policy "appointments: owner can select" on public.appointments
  for select to authenticated
  using ((select public.is_business_owner(business_id)));
create policy "appointments: owner can insert" on public.appointments
  for insert to authenticated
  with check ((select public.is_business_owner(business_id)));
create policy "appointments: owner can update" on public.appointments
  for update to authenticated
  using ((select public.is_business_owner(business_id)))
  with check ((select public.is_business_owner(business_id)));

-- appointment_items (nested child)
alter table public.appointment_items enable row level security;
create policy "appointment_items: owner can select" on public.appointment_items
  for select to authenticated
  using ((select public.is_business_owner(business_id)));
create policy "appointment_items: owner can insert" on public.appointment_items
  for insert to authenticated
  with check ((select public.is_business_owner(business_id)));
create policy "appointment_items: owner can update" on public.appointment_items
  for update to authenticated
  using ((select public.is_business_owner(business_id)))
  with check ((select public.is_business_owner(business_id)));
create policy "appointment_items: owner can delete" on public.appointment_items
  for delete to authenticated
  using ((select public.is_business_owner(business_id)));

-- appointment_phases (nested child)
alter table public.appointment_phases enable row level security;
create policy "appointment_phases: owner can select" on public.appointment_phases
  for select to authenticated
  using ((select public.is_business_owner(business_id)));
create policy "appointment_phases: owner can insert" on public.appointment_phases
  for insert to authenticated
  with check ((select public.is_business_owner(business_id)));
create policy "appointment_phases: owner can update" on public.appointment_phases
  for update to authenticated
  using ((select public.is_business_owner(business_id)))
  with check ((select public.is_business_owner(business_id)));
create policy "appointment_phases: owner can delete" on public.appointment_phases
  for delete to authenticated
  using ((select public.is_business_owner(business_id)));

-- products
alter table public.products enable row level security;
create policy "products: owner can select" on public.products
  for select to authenticated
  using ((select public.is_business_owner(business_id)));
create policy "products: owner can insert" on public.products
  for insert to authenticated
  with check ((select public.is_business_owner(business_id)));
create policy "products: owner can update" on public.products
  for update to authenticated
  using ((select public.is_business_owner(business_id)))
  with check ((select public.is_business_owner(business_id)));

-- sales
alter table public.sales enable row level security;
create policy "sales: owner can select" on public.sales
  for select to authenticated
  using ((select public.is_business_owner(business_id)));
create policy "sales: owner can insert" on public.sales
  for insert to authenticated
  with check ((select public.is_business_owner(business_id)));
create policy "sales: owner can update" on public.sales
  for update to authenticated
  using ((select public.is_business_owner(business_id)))
  with check ((select public.is_business_owner(business_id)));

-- sale_items (nested child)
alter table public.sale_items enable row level security;
create policy "sale_items: owner can select" on public.sale_items
  for select to authenticated
  using ((select public.is_business_owner(business_id)));
create policy "sale_items: owner can insert" on public.sale_items
  for insert to authenticated
  with check ((select public.is_business_owner(business_id)));
create policy "sale_items: owner can update" on public.sale_items
  for update to authenticated
  using ((select public.is_business_owner(business_id)))
  with check ((select public.is_business_owner(business_id)));
create policy "sale_items: owner can delete" on public.sale_items
  for delete to authenticated
  using ((select public.is_business_owner(business_id)));

-- ---------------------------------------------------------------------------
-- 9. Grants — least privilege. Supabase's default privileges grant ALL
--    (including DELETE and TRUNCATE, which RLS does not govern) on every new
--    public table to anon AND authenticated, so both are revoked before the
--    explicit grants below. service_role keeps its defaults (bypasses RLS).
-- ---------------------------------------------------------------------------
revoke all on table
  public.clients, public.services, public.service_phases,
  public.appointments, public.appointment_items, public.appointment_phases,
  public.products, public.sales, public.sale_items
from public, anon, authenticated;

-- Top-level aggregates: tombstone only, never a hard delete through the API.
grant select, insert, update on table
  public.clients, public.services, public.appointments, public.products, public.sales
to authenticated;

-- Nested children: replaced as complete sets with their parent.
grant select, insert, update, delete on table
  public.service_phases, public.appointment_items, public.appointment_phases, public.sale_items
to authenticated;

-- The applied businesses migration granted select/insert/update but never
-- revoked the Supabase defaults, so authenticated still held DELETE and
-- TRUNCATE (TRUNCATE is not governed by RLS). Same least-privilege rule as
-- above; the application only ever selects, inserts and updates a Business.
revoke delete, truncate, references, trigger on table public.businesses from authenticated;
