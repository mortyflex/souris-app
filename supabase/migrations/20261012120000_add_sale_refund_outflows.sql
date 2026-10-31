-- BeautIzzy — Sale adjustments: exceptional outflows after a server refusal
--
-- docs/domain/SALES.md §15.1, docs/architecture/CLOUD_SYNC.md §28.1. Additive
-- and non-destructive. NO table, column, index, row, trigger, policy or grant
-- of an existing table changes; no `updated_at` / `sync_version` moves.
--
-- The problem. Two devices refund the same Sale offline; the remote evaluates
-- them one after the other (Sale-row lock) and REFUSES the second one if both
-- together exceed what the Sale received (20261011120000, ADJUSTMENT_CONFLICT,
-- reason CEILING). That refusal is right for the books of the Sale — but the
-- money of the refused refund may REALLY have been handed back. Voiding it
-- would erase a real cash outflow.
--
-- The answer. The refused device asks the professional what really happened:
--
--   money NOT returned   the refused record is voided (VOIDED — already accepted
--                        by 20261011120000: a VOIDED record counts nowhere)
--   money returned       the refused record is voided AND an EXCEPTIONAL OUTFLOW
--                        is recorded: an ordinary SALE_ADJUSTMENT row, kind
--                        REFUND, whose id is `<refused id>-outflow` — the link to
--                        the refusal, and ONE outflow per refusal (the primary
--                        key) across retries and devices
--
-- What this migration changes — exactly ONE function body, replaced in place
-- with its signature, grants and comment re-stated, plus ONE new immutable
-- helper:
--
--   sync_sale_refund_outflow_source(id)   the refused id an outflow id names
--                                         (NULL for every other id)
--   sync_sale_adjustment_breach           identical to 20261011120000, plus:
--     * an outflow is EXCLUDED from the money and unit ceilings (it records
--       money that left beyond them — never a normal refund);
--     * an outflow must be money only (no line, so it can never move stock),
--       an amount > 0, kind REFUND, SETTLED at once and final;
--     * when the remote holds the refused record it names, that record must be
--       the SAME refund (same Sale, kind, card and cash cents, refund day),
--       settled when recorded, and now VOIDED — so the same money can never be
--       counted twice (a live source with its outflow is refused, whichever of
--       the two arrives first);
--     each refusal answers { status: ADJUSTMENT_CONFLICT, sale_id, reason:
--     'OUTFLOW' } and writes NOTHING (the push savepoint, unchanged).
--
-- Unchanged: `sync_push_aggregate` (it already evaluates this breach inside the
-- write savepoint for every SALE_ADJUSTMENT write and the Sale-row lock still
-- serialises them), `sync_pull_business_aggregates` (the id travels as it is,
-- so a restore recovers the link), the immutability rule (an outflow is a
-- stored adjustment like any other: only an identical replay passes).
--
-- Backward compatibility.
--   * The Production build in daily use (TestFlight build 10, schema v17) never
--     names SALE_ADJUSTMENT: nothing it sends or reads changes.
--   * A build that writes adjustments but predates outflows never creates an
--     id ending in `-outflow` (its ids are UUID v4): every answer it can get is
--     the one it got before. Pulling an outflow, it reads an ordinary settled
--     refund: the money is counted in its Caisse (correct), its local
--     « remaining » for that Sale reads 0 (conservative, never negative).
--   * The build that creates outflows, in front of a remote WITHOUT this
--     migration: the outflow is answered CEILING like any over-refund — kept
--     pending on the device, shown as not yet accepted, never voidable, still
--     counted in its Caisse — and sent as soon as this migration is applied.
--     (Should a plain-ceiling remote ever ACCEPT one — room freed by a reversal
--     in the meantime — it stores the same row with the same id: this
--     migration then reads it as the outflow it is.)
--
-- Safe to re-run: `create or replace` only. Apply BY HAND, Staging first
-- (supabase/README.md). NEVER on Production before its Staging validation.

-- ---------------------------------------------------------------------------
-- 1. The link an outflow id carries
-- ---------------------------------------------------------------------------
create or replace function public.sync_sale_refund_outflow_source(p_id text)
returns text
language sql
immutable
security invoker
set search_path = ''
as $$
  select case
    when p_id is not null and char_length(p_id) > 8 and right(p_id, 8) = '-outflow'
      then left(p_id, char_length(p_id) - 8)
  end;
$$;

comment on function public.sync_sale_refund_outflow_source(text) is
  'Sale adjustments (CLOUD_SYNC.md §28.1): the refused record an exceptional-outflow id `<id>-outflow` carries forward; NULL for any other id.';

-- ---------------------------------------------------------------------------
-- 2. The refund rules, server-side (20261011120000 + exceptional outflows)
-- ---------------------------------------------------------------------------
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
  'Cloud Sync: the ADJUSTMENT_CONFLICT answer when the adjustments of a Sale give back more money than it received, more units than it sold, carry an invalid reversal or an invalid exceptional outflow, or outlive the Sale; NULL otherwise. Exceptional outflows (`<refused id>-outflow`) stand outside the ceilings.';

revoke all on function public.sync_sale_refund_outflow_source(text) from public, anon;
revoke all on function public.sync_sale_adjustment_breach(uuid, text) from public, anon;
grant execute on function public.sync_sale_refund_outflow_source(text) to authenticated;
grant execute on function public.sync_sale_adjustment_breach(uuid, text) to authenticated;
