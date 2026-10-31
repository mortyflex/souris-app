-- BeautIzzy — Sale adjustments: corrections and refunds of completed Sales
--
-- docs/domain/SALES.md §15, docs/architecture/CLOUD_SYNC.md §28,
-- docs/product/SALE_ADJUSTMENTS_PLAN.md. Additive and non-destructive:
--
--   * `public.sale_adjustments` — a NEW table (aggregate SALE_ADJUSTMENT),
--     created empty: a correction or a refund of ONE Sale, its own record,
--     never a child of the Sale (whose child set an older build may replace).
--     Composite foreign key to its Sale in the SAME Business (RESTRICT: a Sale
--     that holds an adjustment can never be hard-deleted) and to the refund a
--     REVERSAL neutralises; integer cents; the kind / status / reason
--     vocabularies; `voided_at` exactly when VOIDED; `refunded_at` and
--     `settled_at` together, present once SETTLED and never while PENDING;
--     at most ONE live reversal per refund;
--   * `public.sale_adjustment_items` — its lines, COPIED from the Sale snapshot,
--     written once with the record (select / insert only: never updated,
--     never deleted through the API);
--   * the generic `sync_aggregate_before_write` trigger, `deleted_at`
--     tombstones (never used by BeautIzzy), the owner-only RLS policy set with
--     the business-mutation entitlement on writes (20261007120000 — inert
--     while the server-side switch is disabled) and least-privilege grants;
--   * three helpers: `sync_sale_adjustment_transition_allowed` (the forward
--     status rule), `sync_sale_refundable_base_cents` and
--     `sync_sale_adjustment_breach` (THE refund ceilings, on the state the
--     write would leave);
--   * the three sync RPCs replaced IN PLACE (identical signatures — grants,
--     revokes and comments re-stated). Their bodies are the ones of
--     20261010120000 with exactly these differences:
--
--       sync_count_business_aggregates  counts sale_adjustments too;
--       sync_push_aggregate             accepts SALE_ADJUSTMENT; serialises every
--                                       Sale / adjustment write on the Sale row
--                                       (FOR UPDATE); refuses any change of a
--                                       stored adjustment but its forward status;
--                                       refuses an adjustment tombstone; evaluates
--                                       the refund ceilings inside the write
--                                       savepoint for SALE_ADJUSTMENT — each such
--                                       refusal answers { status:
--                                       ADJUSTMENT_CONFLICT, sale_id, reason } and
--                                       writes NOTHING; and FREEZES a Sale that
--                                       holds adjustments: any change or tombstone
--                                       of it answers CONFLICT (never a status an
--                                       older build would not know) and writes
--                                       NOTHING;
--       sync_pull_business_aggregates   a `sale_adjustments` family is always
--                                       present (with items[]).
--
-- Concurrency. Two devices refunding the same Sale OFFLINE each make a locally
-- valid record. The remote evaluates them one after the other (the Sale row
-- lock) and REFUSES the second if the two together exceed what was received or
-- sold. The refused device keeps its record, pending and shown « Refusé par le
-- serveur »; the professional resolves it explicitly (void the refused record).
-- Nothing is ever merged, clamped or silently dropped.
--
-- Backward compatibility (the Production build in daily use). A build that
-- predates adjustments never names the type and ignores the new pull family
-- (its parser reads known keys only). It cannot delete or rewrite a Sale that
-- holds one: such a SALE write is refused with CONFLICT — a status it has
-- always known — so it keeps that ONE entry pending with its bounded backoff,
-- reports a conflict, pushes every other pending entry and still pulls. It is
-- never told the write was applied, and nothing remote is touched. The build that writes adjustments DEFERS them until a
-- pull answered with the `sale_adjustments` key — the proof that THIS migration
-- is applied — so shipping that build first loses nothing: the records wait
-- on the device.
--
-- No existing table is recreated, no row deleted or rewritten, no id,
-- tombstone, trigger, policy or grant of an existing table changed: no
-- `updated_at` / `sync_version` moves. Safe to re-run: `if not exists` /
-- `drop … if exists` on the new objects only, `create or replace` for the
-- functions. Apply BY HAND, Staging first (supabase/README.md). NEVER on
-- Production before the Staging validation of docs/product/SALE_ADJUSTMENTS_PLAN.md.

-- ---------------------------------------------------------------------------
-- 1. The tables  (aggregate SALE_ADJUSTMENT)
-- ---------------------------------------------------------------------------
create table if not exists public.sale_adjustments (
  business_id uuid not null references public.businesses (id) on delete restrict,
  id text not null check (char_length(id) between 1 and 200),
  sale_id text not null,
  kind text not null check (kind in ('REFUND', 'REVERSAL')),
  reverses_adjustment_id text,
  reason text not null check (
    reason in ('NOT_DELIVERED', 'WRONG_PRODUCT', 'WRONG_QUANTITY', 'RETURN', 'CUSTOMER_REFUND',
               'SALE_CANCELLED', 'RECORDED_IN_ERROR', 'REFUND_RETURNED', 'OTHER')
  ),
  note text check (note is null or char_length(note) <= 2000),
  staff_member_id text not null check (char_length(staff_member_id) between 1 and 200),
  refund_card_cents integer not null check (refund_card_cents >= 0),
  refund_cash_cents integer not null check (refund_cash_cents >= 0),
  initial_status text not null check (initial_status in ('PENDING', 'SETTLED')),
  status text not null check (status in ('PENDING', 'SETTLED', 'VOIDED')),
  refunded_at timestamptz,
  settled_at timestamptz,
  voided_at timestamptz,
  recorded_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  sync_version bigint not null default 1 check (sync_version >= 1),
  deleted_at timestamptz,
  primary key (business_id, id),
  foreign key (business_id, sale_id) references public.sales (business_id, id) on delete restrict,
  foreign key (business_id, reverses_adjustment_id)
    references public.sale_adjustments (business_id, id) on delete restrict,
  constraint sale_adjustments_reversal_check check ((kind = 'REVERSAL') = (reverses_adjustment_id is not null)),
  -- A compensation says what it compensates: a mistaken entry, or money returned.
  constraint sale_adjustments_reversal_reason_check check (
    (kind = 'REVERSAL') = (reason in ('RECORDED_IN_ERROR', 'REFUND_RETURNED'))
  ),
  constraint sale_adjustments_voided_check check ((status = 'VOIDED') = (voided_at is not null)),
  constraint sale_adjustments_settled_check check (
    (refunded_at is null) = (settled_at is null)
    and (status <> 'SETTLED' or refunded_at is not null)
    and (status <> 'PENDING' or refunded_at is null)
  ),
  constraint sale_adjustments_reversal_settled_check check (
    kind <> 'REVERSAL' or (status = 'SETTLED' and initial_status = 'SETTLED')
  )
);

comment on table public.sale_adjustments is
  'Correction or refund of ONE completed Sale (aggregate SALE_ADJUSTMENT). The Sale is never rewritten; a settled record never changes. Money moves on refunded_at, only once SETTLED.';

create index if not exists sale_adjustments_business_updated_at_idx
  on public.sale_adjustments (business_id, updated_at);
create index if not exists sale_adjustments_business_sale_idx
  on public.sale_adjustments (business_id, sale_id);
create unique index if not exists sale_adjustments_one_reversal_idx
  on public.sale_adjustments (business_id, reverses_adjustment_id)
  where reverses_adjustment_id is not null and deleted_at is null;

drop trigger if exists sale_adjustments_sync_before_write on public.sale_adjustments;
create trigger sale_adjustments_sync_before_write
  before insert or update on public.sale_adjustments
  for each row execute function public.sync_aggregate_before_write();

create table if not exists public.sale_adjustment_items (
  business_id uuid not null,
  adjustment_id text not null,
  id text not null check (char_length(id) between 1 and 200),
  position integer not null check (position >= 0),
  sale_item_id text not null,
  product_id text not null,
  product_name text not null,
  unit_price_cents integer not null check (unit_price_cents >= 0),
  quantity integer not null check (quantity >= 1),
  restock boolean not null,
  primary key (business_id, adjustment_id, id),
  unique (business_id, adjustment_id, position),
  foreign key (business_id, adjustment_id)
    references public.sale_adjustments (business_id, id) on delete cascade
);

comment on table public.sale_adjustment_items is
  'Line of a Sale adjustment, copied from the Sale snapshot. Written once with its record; never updated.';

drop trigger if exists sale_adjustment_items_touch_parent on public.sale_adjustment_items;
create trigger sale_adjustment_items_touch_parent
  after insert or update or delete on public.sale_adjustment_items
  for each row execute function public.sync_child_touch_parent('sale_adjustments', 'adjustment_id');

-- ---------------------------------------------------------------------------
-- 2. RLS — owner-only, writes behind the business-mutation entitlement.
--    No DELETE policy anywhere; no UPDATE policy on the lines.
-- ---------------------------------------------------------------------------
alter table public.sale_adjustments enable row level security;

drop policy if exists "sale_adjustments: owner can select" on public.sale_adjustments;
create policy "sale_adjustments: owner can select" on public.sale_adjustments
  for select to authenticated
  using ((select public.is_business_owner(business_id)));

drop policy if exists "sale_adjustments: owner can insert" on public.sale_adjustments;
create policy "sale_adjustments: owner can insert" on public.sale_adjustments
  for insert to authenticated
  with check ((select public.is_business_owner(business_id)) and (select public.business_mutation_is_entitled(business_id)));

drop policy if exists "sale_adjustments: owner can update" on public.sale_adjustments;
create policy "sale_adjustments: owner can update" on public.sale_adjustments
  for update to authenticated
  using ((select public.is_business_owner(business_id)))
  with check ((select public.is_business_owner(business_id)) and (select public.business_mutation_is_entitled(business_id)));

alter table public.sale_adjustment_items enable row level security;

drop policy if exists "sale_adjustment_items: owner can select" on public.sale_adjustment_items;
create policy "sale_adjustment_items: owner can select" on public.sale_adjustment_items
  for select to authenticated
  using ((select public.is_business_owner(business_id)));

drop policy if exists "sale_adjustment_items: owner can insert" on public.sale_adjustment_items;
create policy "sale_adjustment_items: owner can insert" on public.sale_adjustment_items
  for insert to authenticated
  with check ((select public.is_business_owner(business_id)) and (select public.business_mutation_is_entitled(business_id)));

-- ---------------------------------------------------------------------------
-- 3. Grants — least privilege (revoke the Supabase defaults first).
-- ---------------------------------------------------------------------------
revoke all on table public.sale_adjustments, public.sale_adjustment_items
  from public, anon, authenticated, service_role;
grant select, insert, update on table public.sale_adjustments to authenticated;
grant select, insert on table public.sale_adjustment_items to authenticated;

-- ---------------------------------------------------------------------------
-- 4. The refund rules, server-side
-- ---------------------------------------------------------------------------
create or replace function public.sync_sale_adjustment_transition_allowed(p_from text, p_to text)
returns boolean
language sql
immutable
security invoker
set search_path = ''
as $$
  select p_from = p_to or (p_from = 'PENDING' and p_to in ('SETTLED', 'VOIDED'));
$$;

comment on function public.sync_sale_adjustment_transition_allowed(text, text) is
  'Sale adjustments (CLOUD_SYNC.md §28): the only status moves — unchanged, PENDING → SETTLED, PENDING → VOIDED. A SETTLED or VOIDED record is final.';

create or replace function public.sync_sale_refundable_base_cents(p_business_id uuid, p_sale_id text)
returns bigint
language sql
stable
security invoker
set search_path = ''
as $$
  select case
    when s.appointment_id is not null then (
      select coalesce(sum(i.unit_price_cents::bigint * i.quantity), 0)
      from public.sale_items i
      where i.business_id = s.business_id and i.sale_id = s.id
    )
    else coalesce(s.card_amount_cents, 0)::bigint + coalesce(s.cash_amount_cents, 0)
  end
  from public.sales s
  where s.business_id = p_business_id and s.id = p_sale_id and s.deleted_at is null;
$$;

comment on function public.sync_sale_refundable_base_cents(uuid, text) is
  'The money a Sale may give back at most: the payment received for a direct Sale (0 without one), the snapshot total of its lines for a Sale sold during an Appointment. NULL when the Sale is absent or tombstoned.';

create or replace function public.sync_sale_adjustment_breach(p_business_id uuid, p_sale_id text)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_base bigint;
  v_committed bigint;
  v_reason text;
begin
  if p_sale_id is null then
    return null;
  end if;
  if not exists (
    select 1 from public.sale_adjustments a
    where a.business_id = p_business_id and a.sale_id = p_sale_id and a.deleted_at is null
  ) then
    return null;
  end if;

  v_base := public.sync_sale_refundable_base_cents(p_business_id, p_sale_id);
  if v_base is null then
    v_reason := 'SALE_HAS_ADJUSTMENTS';
  elsif exists (
    -- A compensation answers exactly ONE settled refund of the same Sale, for
    -- its whole amount. « Saisie erronée » mirrors it (same methods, same day);
    -- « argent rendu » comes back on or after the refund day, by any method.
    select 1
    from public.sale_adjustments r
    left join public.sale_adjustments t
      on t.business_id = r.business_id and t.id = r.reverses_adjustment_id
    where r.business_id = p_business_id and r.sale_id = p_sale_id
      and r.deleted_at is null and r.kind = 'REVERSAL'
      and (
        t.id is null or t.deleted_at is not null or t.kind <> 'REFUND' or t.status <> 'SETTLED'
        or t.sale_id <> r.sale_id
        or t.refund_card_cents + t.refund_cash_cents <> r.refund_card_cents + r.refund_cash_cents
        or (
          r.reason = 'RECORDED_IN_ERROR'
          and (t.refund_card_cents <> r.refund_card_cents or t.refund_cash_cents <> r.refund_cash_cents
               or r.refunded_at is distinct from t.refunded_at)
        )
        or (r.reason = 'REFUND_RETURNED' and r.refunded_at < t.refunded_at)
      )
  ) then
    v_reason := 'REVERSAL';
  else
    -- The effective refunds: PENDING and SETTLED, not VOIDED, not reversed.
    select coalesce(sum(a.refund_card_cents::bigint + a.refund_cash_cents), 0)
    into v_committed
    from public.sale_adjustments a
    where a.business_id = p_business_id and a.sale_id = p_sale_id
      and a.deleted_at is null and a.kind = 'REFUND' and a.status <> 'VOIDED'
      and not exists (
        select 1 from public.sale_adjustments r
        where r.business_id = a.business_id and r.reverses_adjustment_id = a.id
          and r.deleted_at is null and r.status <> 'VOIDED'
      );
    if v_committed > v_base then
      v_reason := 'CEILING';
    elsif exists (
      select 1
      from (
        select ai.sale_item_id, sum(ai.quantity) as units
        from public.sale_adjustment_items ai
        join public.sale_adjustments a
          on a.business_id = ai.business_id and a.id = ai.adjustment_id
        where a.business_id = p_business_id and a.sale_id = p_sale_id
          and a.deleted_at is null and a.kind = 'REFUND' and a.status <> 'VOIDED'
          and not exists (
            select 1 from public.sale_adjustments r
            where r.business_id = a.business_id and r.reverses_adjustment_id = a.id
              and r.deleted_at is null and r.status <> 'VOIDED'
          )
        group by ai.sale_item_id
      ) u
      left join public.sale_items si
        on si.business_id = p_business_id and si.sale_id = p_sale_id and si.id = u.sale_item_id
      where si.id is null or u.units > si.quantity
    ) then
      v_reason := 'UNITS';
    end if;
  end if;

  if v_reason is null then
    return null;
  end if;
  return jsonb_build_object('status', 'ADJUSTMENT_CONFLICT', 'sale_id', p_sale_id, 'reason', v_reason);
end;
$$;

comment on function public.sync_sale_adjustment_breach(uuid, text) is
  'Cloud Sync: the ADJUSTMENT_CONFLICT answer when the adjustments of a Sale give back more money than it received, more units than it sold, carry an invalid reversal, or outlive the Sale; NULL otherwise.';

revoke all on function public.sync_sale_adjustment_transition_allowed(text, text) from public, anon;
revoke all on function public.sync_sale_refundable_base_cents(uuid, text) from public, anon;
revoke all on function public.sync_sale_adjustment_breach(uuid, text) from public, anon;
grant execute on function public.sync_sale_adjustment_transition_allowed(text, text) to authenticated;
grant execute on function public.sync_sale_refundable_base_cents(uuid, text) to authenticated;
grant execute on function public.sync_sale_adjustment_breach(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Bootstrap count — a Business holding only adjustments is not empty
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
    + (select count(*) from public.calendar_blocks where business_id = p_business_id)
    + (select count(*) from public.appointment_deposits where business_id = p_business_id)
    + (select count(*) from public.service_categories where business_id = p_business_id)
    + (select count(*) from public.sale_adjustments where business_id = p_business_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Push — SALE_ADJUSTMENT, its immutability and the refund ceilings
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
  -- The Appointment whose financial invariant this write may affect, and the
  -- breach it would leave behind (NULL when it leaves none).
  invariant_appointment_id text;
  invariant_breach jsonb;
  -- The answer of the consent-withdrawal exception (6.5C, step 8), when it applies.
  withdrawal jsonb;
  -- Sale adjustments (§28): the Sale whose refund ceilings this write may
  -- affect, and the ADJUSTMENT_CONFLICT answer it would leave behind.
  adjustment_sale_id text;
  adjustment_breach jsonb;
  stored_adjustment public.sale_adjustments%rowtype;
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
    when 'APPOINTMENT_DEPOSIT' then 'appointment_deposits'
    when 'SERVICE_CATEGORY' then 'service_categories'
    when 'SALE_ADJUSTMENT' then 'sale_adjustments'
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

  -- BeautIzzy Plus (6.5C, step 4): after ownership and argument validation,
  -- before any row is read or locked. Under the server-side switch only, a
  -- Business whose owner holds no verified production Plus entitlement has
  -- its write refused with ONE structured answer and nothing else happens:
  -- no lock, no read, no write, no version or tombstone bookkeeping. Never an
  -- error: ownership failures stay 42501 above, and the device keeps the
  -- entry pending (docs/architecture/CLOUD_SYNC.md §26).
  --
  -- ONE exception (6.5C, step 8): a Client write that withdraws the client's
  -- promotional SMS consent and changes NOTHING else is privacy-protective,
  -- not a paid mutation. It is applied through the narrow
  -- `sync_withdraw_client_sms_consent` — the three consent columns only —
  -- which answers NULL for anything that is not exactly such a withdrawal,
  -- in which case the refusal stands.
  if not public.business_mutation_is_entitled(p_business_id) then
    if p_aggregate_type = 'CLIENT' and p_operation = 'UPSERT' then
      withdrawal := public.sync_withdraw_client_sms_consent(p_business_id, p_aggregate_id, p_payload);
      if withdrawal is not null then
        return withdrawal;
      end if;
    end if;
    return jsonb_build_object('status', 'ENTITLEMENT_REQUIRED');
  end if;

  -- Every write of a Sale or of one of its adjustments is serialised on the
  -- Sale row: two devices refunding the same Sale at once are evaluated one
  -- after the other, each against the state the other committed.
  if p_aggregate_type = 'SALE_ADJUSTMENT' then
    adjustment_sale_id := coalesce(
      p_payload ->> 'sale_id',
      (select a.sale_id from public.sale_adjustments a where a.business_id = p_business_id and a.id = p_aggregate_id)
    );
  elsif p_aggregate_type = 'SALE' then
    adjustment_sale_id := p_aggregate_id;
  end if;
  if adjustment_sale_id is not null then
    perform 1 from public.sales s
    where s.business_id = p_business_id and s.id = adjustment_sale_id
    for update;
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

    -- An Appointment that holds deposits is never tombstoned (the local deletion
    -- guard of every build that knows them; an older build does not count them).
    if p_aggregate_type = 'APPOINTMENT'
       and exists (
         select 1 from public.appointment_deposits
         where business_id = p_business_id and appointment_id = p_aggregate_id and deleted_at is null
       ) then
      return jsonb_build_object(
        'status', 'FINANCIAL_CONFLICT',
        'appointment_id', p_aggregate_id,
        'expected_total_cents',
          coalesce(public.sync_appointment_expected_total_cents(p_business_id, p_aggregate_id), 0),
        'active_deposit_cents',
          public.sync_appointment_active_deposit_cents(p_business_id, p_aggregate_id)
      );
    end if;

    -- A Sale adjustment is financial history: BeautIzzy never tombstones one
    -- (a correction is a status or a compensating record), and a Sale that
    -- holds adjustments is never tombstoned either.
    if p_aggregate_type = 'SALE_ADJUSTMENT' then
      return jsonb_build_object(
        'status', 'ADJUSTMENT_CONFLICT',
        'sale_id', adjustment_sale_id,
        'reason', 'IMMUTABLE'
      );
    end if;
    -- Answered with CONFLICT — the one refusal EVERY app build understands
    -- (entry kept pending, the run goes on): a build that predates adjustments
    -- would read an unknown status as a run-level failure.
    if p_aggregate_type = 'SALE'
       and exists (
         select 1 from public.sale_adjustments a
         where a.business_id = p_business_id and a.sale_id = p_aggregate_id and a.deleted_at is null
       ) then
      return jsonb_build_object('status', 'CONFLICT', 'sync_version', remote_version);
    end if;

    -- A tombstoned Sale no longer contributes its Products to the expected total.
    if p_aggregate_type = 'SALE' then
      select appointment_id into invariant_appointment_id
      from public.sales
      where business_id = p_business_id and id = p_aggregate_id;
    end if;

    begin
      execute format(
        'update public.%I set deleted_at = now() where business_id = $1 and id = $2 returning sync_version',
        parent_table
      )
      into new_version
      using p_business_id, p_aggregate_id;

      invariant_breach := public.sync_appointment_deposit_breach(p_business_id, invariant_appointment_id);
      if invariant_breach is not null then
        raise exception 'sync: financial conflict' using errcode = 'SC422';
      end if;
    exception
      when sqlstate 'SC422' then
        -- The tombstone is undone with the savepoint: nothing was written.
        return invariant_breach;
    end;

    return jsonb_build_object('status', 'APPLIED', 'sync_version', new_version);
  end if;

  -- ------------------------------------------------------------- UPSERT ----
  -- The device acknowledged a row the remote no longer holds (administrative
  -- hard delete): never silently recreate it.
  if not remote_found and p_expected_version is not null then
    return jsonb_build_object('status', 'CONFLICT', 'sync_version', null);
  end if;

  -- A stored Sale adjustment never changes what it says: only its status
  -- moves forward (PENDING → SETTLED, PENDING → VOIDED) with its instants. An
  -- identical replay (a lost acknowledgement) passes and changes nothing.
  if p_aggregate_type = 'SALE_ADJUSTMENT' and remote_found and remote_deleted_at is null then
    select * into stored_adjustment
    from public.sale_adjustments
    where business_id = p_business_id and id = p_aggregate_id;

    if stored_adjustment.sale_id is distinct from (p_payload ->> 'sale_id')
       or stored_adjustment.kind is distinct from (p_payload ->> 'kind')
       or stored_adjustment.reverses_adjustment_id is distinct from (p_payload ->> 'reverses_adjustment_id')
       or stored_adjustment.reason is distinct from (p_payload ->> 'reason')
       or stored_adjustment.note is distinct from (p_payload ->> 'note')
       or stored_adjustment.staff_member_id is distinct from (p_payload ->> 'staff_member_id')
       or stored_adjustment.refund_card_cents is distinct from (p_payload ->> 'refund_card_cents')::integer
       or stored_adjustment.refund_cash_cents is distinct from (p_payload ->> 'refund_cash_cents')::integer
       or stored_adjustment.initial_status is distinct from (p_payload ->> 'initial_status')
       or stored_adjustment.recorded_at is distinct from (p_payload ->> 'recorded_at')::timestamptz
       or not public.sync_sale_adjustment_transition_allowed(stored_adjustment.status, p_payload ->> 'status')
       or (
         select coalesce(jsonb_agg(
                  jsonb_build_object(
                    'id', i.id, 'position', i.position, 'sale_item_id', i.sale_item_id,
                    'product_id', i.product_id, 'product_name', i.product_name,
                    'unit_price_cents', i.unit_price_cents, 'quantity', i.quantity, 'restock', i.restock
                  ) order by i.position), '[]'::jsonb)
         from public.sale_adjustment_items i
         where i.business_id = p_business_id and i.adjustment_id = p_aggregate_id
       ) is distinct from (
         select coalesce(jsonb_agg(
                  jsonb_build_object(
                    'id', x.id, 'position', x.position, 'sale_item_id', x.sale_item_id,
                    'product_id', x.product_id, 'product_name', x.product_name,
                    'unit_price_cents', x.unit_price_cents, 'quantity', x.quantity, 'restock', x.restock
                  ) order by x.position), '[]'::jsonb)
         from jsonb_to_recordset(coalesce(p_payload -> 'items', '[]'::jsonb)) as x(
           id text, position integer, sale_item_id text, product_id text, product_name text,
           unit_price_cents integer, quantity integer, restock boolean
         )
       ) then
      return jsonb_build_object(
        'status', 'ADJUSTMENT_CONFLICT',
        'sale_id', stored_adjustment.sale_id,
        'reason', 'IMMUTABLE'
      );
    end if;
  end if;

  begin
    set constraints all deferred;

    if p_aggregate_type = 'CLIENT' then
      insert into public.clients
        (business_id, id, first_name, last_name, phone, email, birthday, notes, photo_path,
         sms_marketing_consent, sms_marketing_consent_updated_at, sms_marketing_consent_source,
         archived_at, deleted_at)
      select p_business_id, p_aggregate_id,
             x.first_name, x.last_name, x.phone, x.email, x.birthday, x.notes, x.photo_path,
             x.sms_marketing_consent, x.sms_marketing_consent_updated_at, x.sms_marketing_consent_source,
             x.archived_at, null
      from jsonb_to_record(p_payload) as x(
        first_name text, last_name text, phone text, email text, birthday text, notes text,
        photo_path text,
        sms_marketing_consent text, sms_marketing_consent_updated_at timestamptz,
        sms_marketing_consent_source text,
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
        -- Same rule for the Client photo: a build that predates it sends no
        -- "photo_path" key and never erases a photo set by a newer build.
        photo_path = case
          when p_payload ? 'photo_path' then excluded.photo_path
          else public.clients.photo_path
        end,
        -- Same rule for the promotional SMS consent: a build that predates it
        -- sends no "sms_marketing_consent" key and can never erase a recorded
        -- consent. A build that knows the consent always sends the three keys
        -- together (values, or three nulls for UNKNOWN), so the triple is
        -- replaced together and the audit CHECK is never tripped.
        sms_marketing_consent = case
          when p_payload ? 'sms_marketing_consent' then excluded.sms_marketing_consent
          else public.clients.sms_marketing_consent
        end,
        sms_marketing_consent_updated_at = case
          when p_payload ? 'sms_marketing_consent' then excluded.sms_marketing_consent_updated_at
          else public.clients.sms_marketing_consent_updated_at
        end,
        sms_marketing_consent_source = case
          when p_payload ? 'sms_marketing_consent' then excluded.sms_marketing_consent_source
          else public.clients.sms_marketing_consent_source
        end,
        archived_at = excluded.archived_at,
        deleted_at = null;

    elsif p_aggregate_type = 'PRODUCT' then
      insert into public.products
        (business_id, id, name, brand, category, barcode, photo_path, price_cents, stock_quantity,
         active, deleted_at)
      select p_business_id, p_aggregate_id,
             x.name, x.brand, x.category, x.barcode, x.photo_path, x.price_cents, x.stock_quantity,
             x.active, null
      from jsonb_to_record(p_payload) as x(
        name text, brand text, category text, barcode text, photo_path text,
        price_cents integer, stock_quantity integer, active boolean
      )
      on conflict (business_id, id) do update set
        name = excluded.name,
        brand = excluded.brand,
        category = excluded.category,
        barcode = excluded.barcode,
        -- A build that predates Product photos sends no "photo_path" key (its
        -- device-local image never leaves the device): keep the shared photo
        -- instead of reading the missing key as "removed". A build that knows
        -- the field always sends it (a path, or null to remove).
        photo_path = case
          when p_payload ? 'photo_path' then excluded.photo_path
          else public.products.photo_path
        end,
        price_cents = excluded.price_cents,
        stock_quantity = excluded.stock_quantity,
        active = excluded.active,
        deleted_at = null;

    elsif p_aggregate_type = 'SERVICE' then
      insert into public.services
        (business_id, id, name, type, price_cents, active, category_id, description, deleted_at)
      select p_business_id, p_aggregate_id, x.name, x.type, x.price_cents, x.active,
             x.category_id, x.description, null
      from jsonb_to_record(p_payload) as x(
        name text, type text, price_cents integer, active boolean, category_id text, description text
      )
      on conflict (business_id, id) do update set
        name = excluded.name,
        type = excluded.type,
        price_cents = excluded.price_cents,
        active = excluded.active,
        -- A build that predates service categories and descriptions sends
        -- neither key: keep the stored values instead of reading the missing
        -- keys as "cleared". A build that knows them always sends both (a
        -- value, or null to clear).
        category_id = case
          when p_payload ? 'category_id' then excluded.category_id
          else public.services.category_id
        end,
        description = case
          when p_payload ? 'description' then excluded.description
          else public.services.description
        end,
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
         discount_percent, discount_amount_cents, client_reminder_enabled, deleted_at)
      select p_business_id, p_aggregate_id,
             x.client_id, x.staff_member_id, x.start_at, x.status, x.notes,
             x.cancelled_at, x.cancelled_by, x.cancellation_reason, x.no_show_recorded_at,
             x.paid_at, x.card_amount_cents, x.cash_amount_cents,
             x.discount_percent, x.discount_amount_cents, x.client_reminder_enabled, null
      from jsonb_to_record(p_payload) as x(
        client_id text, staff_member_id text, start_at timestamptz, status text, notes text,
        cancelled_at timestamptz, cancelled_by text, cancellation_reason text,
        no_show_recorded_at timestamptz,
        paid_at timestamptz, card_amount_cents integer, cash_amount_cents integer,
        discount_percent integer, discount_amount_cents integer,
        client_reminder_enabled boolean
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
        -- A build that predates the reminder flag sends no such key: keep the
        -- stored choice instead of reading the missing key as "reset". A build
        -- that knows the field always sends it (true, false, or null for
        -- "never explicitly set").
        client_reminder_enabled = case
          when p_payload ? 'client_reminder_enabled' then excluded.client_reminder_enabled
          else public.appointments.client_reminder_enabled
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

    elsif p_aggregate_type = 'SERVICE_CATEGORY' then
      -- A professional-defined catalogue category: a name, an optional
      -- description, a position. No child rows; Services name it by id as
      -- plain metadata (no foreign key).
      insert into public.service_categories
        (business_id, id, name, description, position, deleted_at)
      select p_business_id, p_aggregate_id, x.name, x.description, x.position, null
      from jsonb_to_record(p_payload) as x(name text, description text, position integer)
      on conflict (business_id, id) do update set
        name = excluded.name,
        description = excluded.description,
        position = excluded.position,
        deleted_at = null;

    elsif p_aggregate_type = 'SALE_ADJUSTMENT' then
      -- A correction or a refund of ONE Sale (composite FK, same Business).
      -- Only the status and its instants may change (verified above); the
      -- lines are written once, with the record, and never replaced.
      insert into public.sale_adjustments
        (business_id, id, sale_id, kind, reverses_adjustment_id, reason, note, staff_member_id,
         refund_card_cents, refund_cash_cents, initial_status, status,
         refunded_at, settled_at, voided_at, recorded_at, deleted_at)
      select p_business_id, p_aggregate_id, x.sale_id, x.kind, x.reverses_adjustment_id, x.reason,
             x.note, x.staff_member_id, x.refund_card_cents, x.refund_cash_cents, x.initial_status,
             x.status, x.refunded_at, x.settled_at, x.voided_at, x.recorded_at, null
      from jsonb_to_record(p_payload) as x(
        sale_id text, kind text, reverses_adjustment_id text, reason text, note text,
        staff_member_id text, refund_card_cents integer, refund_cash_cents integer,
        initial_status text, status text, refunded_at timestamptz, settled_at timestamptz,
        voided_at timestamptz, recorded_at timestamptz
      )
      on conflict (business_id, id) do update set
        status = excluded.status,
        refunded_at = excluded.refunded_at,
        settled_at = excluded.settled_at,
        voided_at = excluded.voided_at,
        deleted_at = null;

      insert into public.sale_adjustment_items
        (business_id, adjustment_id, id, position, sale_item_id, product_id, product_name,
         unit_price_cents, quantity, restock)
      select p_business_id, p_aggregate_id, x.id, x.position, x.sale_item_id, x.product_id,
             x.product_name, x.unit_price_cents, x.quantity, x.restock
      from jsonb_to_recordset(coalesce(p_payload -> 'items', '[]'::jsonb)) as x(
        id text, position integer, sale_item_id text, product_id text, product_name text,
        unit_price_cents integer, quantity integer, restock boolean
      )
      on conflict (business_id, adjustment_id, id) do nothing;

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

    elsif p_aggregate_type = 'APPOINTMENT_DEPOSIT' then
      -- Money received in advance for ONE Appointment (composite FK, same
      -- Business). A correction is the VOIDED status carried by the row —
      -- never a tombstone. `recorded_at` is the device's entry instant;
      -- `created_at` stays server-owned sync metadata.
      insert into public.appointment_deposits
        (business_id, id, appointment_id, amount_cents, payment_method, paid_at,
         status, voided_at, recorded_at, deleted_at)
      select p_business_id, p_aggregate_id, x.appointment_id, x.amount_cents, x.payment_method,
             x.paid_at, x.status, x.voided_at, x.recorded_at, null
      from jsonb_to_record(p_payload) as x(
        appointment_id text, amount_cents integer, payment_method text, paid_at timestamptz,
        status text, voided_at timestamptz, recorded_at timestamptz
      )
      on conflict (business_id, id) do update set
        appointment_id = excluded.appointment_id,
        amount_cents = excluded.amount_cents,
        payment_method = excluded.payment_method,
        paid_at = excluded.paid_at,
        status = excluded.status,
        voided_at = excluded.voided_at,
        recorded_at = excluded.recorded_at,
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

    -- The financial invariant of the Appointment this write touches. It is
    -- evaluated on the state the write would leave, so the SECOND of two
    -- offline-compatible writes is the one refused.
    if p_aggregate_type = 'APPOINTMENT' then
      invariant_appointment_id := p_aggregate_id;
    elsif p_aggregate_type = 'APPOINTMENT_DEPOSIT' then
      select appointment_id into invariant_appointment_id
      from public.appointment_deposits
      where business_id = p_business_id and id = p_aggregate_id;
    elsif p_aggregate_type = 'SALE' then
      select appointment_id into invariant_appointment_id
      from public.sales
      where business_id = p_business_id and id = p_aggregate_id;
    end if;

    invariant_breach := public.sync_appointment_deposit_breach(p_business_id, invariant_appointment_id);
    if invariant_breach is not null then
      raise exception 'sync: financial conflict' using errcode = 'SC422';
    end if;

    -- A Sale that holds adjustments is FROZEN: any change of its row or of its
    -- lines (an older build trimming a Revente, a device that has not pulled
    -- the adjustment yet) is undone and answered CONFLICT, which every build
    -- understands; an identical replay changes nothing and passes.
    if p_aggregate_type = 'SALE'
       and new_version is distinct from remote_version
       and exists (
         select 1 from public.sale_adjustments a
         where a.business_id = p_business_id and a.sale_id = p_aggregate_id and a.deleted_at is null
       ) then
      raise exception 'sync: adjusted sale is frozen' using errcode = 'SC409';
    end if;

    -- The refund ceilings of the Sale an ADJUSTMENT write touches (§28), on the
    -- state the write would leave: more money or units than the Sale allows, or
    -- an invalid reversal, undoes everything. Only builds that know adjustments
    -- ever push one, so only they ever receive ADJUSTMENT_CONFLICT.
    if p_aggregate_type = 'SALE_ADJUSTMENT' then
      adjustment_breach := public.sync_sale_adjustment_breach(p_business_id, adjustment_sale_id);
      if adjustment_breach is not null then
        raise exception 'sync: adjustment conflict' using errcode = 'SC423';
      end if;
    end if;
  exception
    when sqlstate 'SC409' then
      return jsonb_build_object('status', 'CONFLICT', 'sync_version', remote_version);
    when sqlstate 'SC423' then
      -- Nothing is written; the device keeps its record, pending and refused.
      return adjustment_breach;
    when sqlstate 'SC422' then
      -- Everything written above is undone with the savepoint; the device keeps
      -- its record and surfaces the conflict.
      return invariant_breach;
  end;

  return jsonb_build_object('status', 'APPLIED', 'sync_version', new_version);
end;
$$;

comment on function public.sync_push_aggregate(uuid, text, text, text, bigint, jsonb) is
  'Cloud Sync push: writes ONE aggregate (row + complete child set) atomically, only when the caller acknowledged the current sync_version. Never overwrites an unseen revision. Since multi-profession Step 3: accepts SERVICE_CATEGORY, and a SERVICE payload without category_id / description keeps the stored values. Since the sale adjustments migration: accepts SALE_ADJUSTMENT, keeps every stored adjustment immutable but for its forward status, and answers ADJUSTMENT_CONFLICT — nothing written — when a write would exceed what a Sale allows (CLOUD_SYNC.md §28). Since BeautIzzy Plus 6.5C: under the server-side switch, answers ENTITLEMENT_REQUIRED — nothing written — for an owner without verified production Plus access, except a Client write that only withdraws the promotional SMS consent (sync_withdraw_client_sms_consent).';

revoke all on function public.sync_push_aggregate(uuid, text, text, text, bigint, jsonb) from public, anon;

revoke all on function public.sync_push_aggregate(uuid, text, text, text, bigint, jsonb) from public, anon;
grant execute on function public.sync_push_aggregate(uuid, text, text, text, bigint, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- 7. Pull — the sale_adjustments family, always present
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
            'photo_path', c.photo_path,
            'sms_marketing_consent', c.sms_marketing_consent,
            'sms_marketing_consent_updated_at', public.sync_instant_text(c.sms_marketing_consent_updated_at),
            'sms_marketing_consent_source', c.sms_marketing_consent_source,
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
            'category_id', s.category_id,
            'description', s.description,
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
            'photo_path', pr.photo_path,
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
            'client_reminder_enabled', a.client_reminder_enabled,
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
      ), '[]'::jsonb),

      'appointment_deposits', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'id', d.id,
            'sync_version', d.sync_version,
            'deleted_at', public.sync_instant_text(d.deleted_at),
            'appointment_id', d.appointment_id,
            'amount_cents', d.amount_cents,
            'payment_method', d.payment_method,
            'paid_at', public.sync_instant_text(d.paid_at),
            'status', d.status,
            'voided_at', public.sync_instant_text(d.voided_at),
            'recorded_at', public.sync_instant_text(d.recorded_at)
          )
          order by d.created_at, d.id
        )
        from public.appointment_deposits d
        where d.business_id = p_business_id
          and (p_since is null or d.updated_at > p_since)
      ), '[]'::jsonb),

      -- Always present (an empty array when there is none): its presence is
      -- how a device learns that this remote stores categories and the two
      -- Service fields (docs/architecture/CLOUD_SYNC.md §27).
      'service_categories', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'id', sc.id,
            'sync_version', sc.sync_version,
            'deleted_at', public.sync_instant_text(sc.deleted_at),
            'name', sc.name,
            'description', sc.description,
            'position', sc.position
          )
          order by sc.created_at, sc.id
        )
        from public.service_categories sc
        where sc.business_id = p_business_id
          and (p_since is null or sc.updated_at > p_since)
      ), '[]'::jsonb),

      -- Always present (an empty array when there is none): its presence is
      -- how a device learns that this remote stores sale adjustments and
      -- enforces their ceilings (docs/architecture/CLOUD_SYNC.md §28).
      'sale_adjustments', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'id', sa.id,
            'sync_version', sa.sync_version,
            'deleted_at', public.sync_instant_text(sa.deleted_at),
            'sale_id', sa.sale_id,
            'kind', sa.kind,
            'reverses_adjustment_id', sa.reverses_adjustment_id,
            'reason', sa.reason,
            'note', sa.note,
            'staff_member_id', sa.staff_member_id,
            'refund_card_cents', sa.refund_card_cents,
            'refund_cash_cents', sa.refund_cash_cents,
            'initial_status', sa.initial_status,
            'status', sa.status,
            'refunded_at', public.sync_instant_text(sa.refunded_at),
            'settled_at', public.sync_instant_text(sa.settled_at),
            'voided_at', public.sync_instant_text(sa.voided_at),
            'recorded_at', public.sync_instant_text(sa.recorded_at),
            'items', case when sa.deleted_at is not null then '[]'::jsonb else coalesce((
              select jsonb_agg(
                jsonb_build_object(
                  'id', ai.id,
                  'position', ai.position,
                  'sale_item_id', ai.sale_item_id,
                  'product_id', ai.product_id,
                  'product_name', ai.product_name,
                  'unit_price_cents', ai.unit_price_cents,
                  'quantity', ai.quantity,
                  'restock', ai.restock
                )
                order by ai.position
              )
              from public.sale_adjustment_items ai
              where ai.business_id = sa.business_id and ai.adjustment_id = sa.id
            ), '[]'::jsonb) end
          )
          order by sa.created_at, sa.id
        )
        from public.sale_adjustments sa
        where sa.business_id = p_business_id
          and (p_since is null or sa.updated_at > p_since)
      ), '[]'::jsonb)
    )
  );
end;
$$;

