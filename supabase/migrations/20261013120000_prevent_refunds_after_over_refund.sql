-- BeautIzzy — Sale adjustments: no NEW refund once the money really given back
-- reaches what the Sale received
--
-- docs/domain/SALES.md §15.1, docs/architecture/CLOUD_SYNC.md §28.2. Additive
-- and non-destructive. NO table, column, index, row, trigger, policy or grant
-- of an existing table changes; no `updated_at` / `sync_version` moves.
--
-- The problem. An exceptional outflow (20261012120000) records money really
-- returned beyond the Sale's ceiling, and stands OUTSIDE that ceiling — so the
-- ceiling alone still accepted a new refund for the room it never used: an 18 €
-- Sale, 12 € refunded, 10 € really returned after a refusal (22 € given back),
-- still accepted 6 € more.
--
-- The answer — exactly ONE function body replaced in place, its signature,
-- grants and comment re-stated:
--
--   sync_sale_adjustment_breach   identical to 20261012120000, plus ONE rule:
--     a NEW money refund (a row inserted by this very transaction: its
--     server-owned `created_at` is now(); not an outflow; amount > 0; PENDING or
--     SETTLED) is refused — { status: ADJUSTMENT_CONFLICT, reason: 'CEILING' },
--     nothing written — when the effective refunds plus the effective outflows
--     exceed what the Sale received.
--
-- Why « inserted by this transaction ». The breach reads the WHOLE state of the
-- Sale after a write. A state-only rule (refunds + outflows ≤ base) would refuse
-- the very outflow that records the over-refund, and then EVERY later write of
-- that Sale — a lost acknowledgement replayed, a pending refund settled, a
-- compensation, a correction of units. Only a refund that adds money is ever
-- refused here. `created_at` is set by its column default on insert and never
-- written by `sync_push_aggregate` (its ON CONFLICT moves only the status and
-- its instants), and every write of one Sale is serialised by the Sale-row lock.
--
-- Unchanged: the ceiling of normal refunds (an outflow is still excluded from
-- it, and from units), the outflow rule, the reversal rule, immutability, and
-- every sync RPC.
--
-- Backward compatibility.
--   * The Production build in daily use (TestFlight build 10, schema v17) never
--     names SALE_ADJUSTMENT: nothing it sends or reads changes.
--   * Every answer is one the adjustment builds already know: ADJUSTMENT_CONFLICT
--     / CEILING. A device that refunded offline before it saw the outflow gets
--     its refund refused like any over-refund; the build that knows outflows
--     then asks whether that money really left, an older v18 build offers to
--     void it (its own refusal flow).
--   * A build that predates outflows reads a pulled outflow as an ordinary
--     refund: its local remainder was already 0 — this rule only aligns the
--     remote with it.
--   * The current build already refuses such a refund locally (`remainingCents`
--     counts outflows since November 2026): only devices that have not pulled
--     the outflow yet, and older builds, ever meet this answer.
--
-- Safe to re-run: `create or replace` only. Apply BY HAND, Staging first
-- (supabase/README.md), after 20261012120000. NEVER on Production before its
-- Staging validation.

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
  elsif exists (
    -- An exceptional outflow: money only, settled at once and final; and the
    -- refused record it names, when held here, is the same refund, VOIDED.
    select 1
    from public.sale_adjustments o
    left join public.sale_adjustments s
      on s.business_id = o.business_id
     and s.id = public.sync_sale_refund_outflow_source(o.id)
     and s.deleted_at is null
    where o.business_id = p_business_id and o.sale_id = p_sale_id and o.deleted_at is null
      and public.sync_sale_refund_outflow_source(o.id) is not null
      and (
        o.kind <> 'REFUND' or o.initial_status <> 'SETTLED' or o.status <> 'SETTLED'
        or o.refund_card_cents + o.refund_cash_cents = 0
        or exists (
          select 1 from public.sale_adjustment_items i
          where i.business_id = o.business_id and i.adjustment_id = o.id
        )
        or (
          s.id is not null
          and (
            s.sale_id <> o.sale_id or s.kind <> 'REFUND' or s.status <> 'VOIDED'
            or s.settled_at is null
            or s.refund_card_cents <> o.refund_card_cents or s.refund_cash_cents <> o.refund_cash_cents
            or s.refunded_at is distinct from o.refunded_at
          )
        )
      )
  ) then
    v_reason := 'OUTFLOW';
  else
    -- The effective refunds: PENDING and SETTLED, not VOIDED, not reversed —
    -- and never an exceptional outflow (money that left BEYOND the ceiling).
    select coalesce(sum(a.refund_card_cents::bigint + a.refund_cash_cents), 0)
    into v_committed
    from public.sale_adjustments a
    where a.business_id = p_business_id and a.sale_id = p_sale_id
      and a.deleted_at is null and a.kind = 'REFUND' and a.status <> 'VOIDED'
      and public.sync_sale_refund_outflow_source(a.id) is null
      and not exists (
        select 1 from public.sale_adjustments r
        where r.business_id = a.business_id and r.reverses_adjustment_id = a.id
          and r.deleted_at is null and r.status <> 'VOIDED'
      );
    if v_committed > v_base then
      v_reason := 'CEILING';
    elsif exists (
      -- A NEW money refund — a row this very transaction inserted (`created_at`
      -- is server-owned: now(), and never moved by a later write), not an
      -- exceptional outflow — may not take the money REALLY given back beyond
      -- what the Sale received: effective refunds AND effective outflows. A
      -- replay, a status move, a compensation, a correction without money and
      -- the outflow itself are never refused by this rule.
      select 1
      from public.sale_adjustments n
      where n.business_id = p_business_id and n.sale_id = p_sale_id
        and n.deleted_at is null and n.kind = 'REFUND' and n.status <> 'VOIDED'
        and n.created_at = now()
        and public.sync_sale_refund_outflow_source(n.id) is null
        and n.refund_card_cents + n.refund_cash_cents > 0
    ) and v_committed + (
      select coalesce(sum(o.refund_card_cents::bigint + o.refund_cash_cents), 0)
      from public.sale_adjustments o
      where o.business_id = p_business_id and o.sale_id = p_sale_id
        and o.deleted_at is null and o.kind = 'REFUND' and o.status <> 'VOIDED'
        and public.sync_sale_refund_outflow_source(o.id) is not null
        and not exists (
          select 1 from public.sale_adjustments r
          where r.business_id = o.business_id and r.reverses_adjustment_id = o.id
            and r.deleted_at is null and r.status <> 'VOIDED'
        )
    ) > v_base then
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
          and public.sync_sale_refund_outflow_source(a.id) is null
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
  'Cloud Sync: the ADJUSTMENT_CONFLICT answer when the adjustments of a Sale give back more money than it received, more units than it sold, carry an invalid reversal or an invalid exceptional outflow, or outlive the Sale; NULL otherwise. Exceptional outflows (`<refused id>-outflow`) stand outside the ceilings, but a NEW money refund may not take refunds + outflows beyond what the Sale received.';

revoke all on function public.sync_sale_adjustment_breach(uuid, text) from public, anon;
grant execute on function public.sync_sale_adjustment_breach(uuid, text) to authenticated;
