-- Souris — Cloud Sync V1D: consistent, owner-scoped aggregate read
--
-- The device reads its Business for two purposes (docs/architecture/
-- CLOUD_SYNC.md §11.2, §16): the new-device restore (the COMPLETE dataset)
-- and the incremental pull (what changed since its cursor). Both need every
-- aggregate together with its COMPLETE child set, as ONE snapshot.
--
-- Plain PostgREST table calls cannot give that: `services`, then
-- `service_phases`, then `appointments`, … are separate requests, i.e.
-- separate snapshots. A push landing between two of them would hand the
-- device a Service row of one revision with the phases of another, under a
-- `sync_version` that matches neither — and the device would ACKNOWLEDGE that
-- version. This function is the whole remote read surface of the sync worker:
--
--   sync_pull_business_aggregates(p_business_id, p_since)
--
-- It is ONE SQL statement, so it reads ONE snapshot whatever the isolation
-- level: a parent's `sync_version` always describes exactly the children
-- returned with it.
--
-- Result (jsonb):
--
--   { "pulled_at": <now()>,
--     "clients":      [ { id, sync_version, deleted_at, first_name, … } ],
--     "services":     [ { id, sync_version, deleted_at, name, …, "phases": [ … ] } ],
--     "products":     [ { id, sync_version, deleted_at, name, … } ],
--     "appointments": [ { id, sync_version, deleted_at, client_id, …,
--                         "items": [ { id, item_order, …, "phases": [ … ] } ] } ],
--     "sales":        [ { id, sync_version, deleted_at, client_id, …, "items": [ … ] } ] }
--
--   * the columns are exactly the ones `sync_push_aggregate` accepts, under
--     the same names — a pulled aggregate and a pushed one compare field for
--     field; cents are the stored integers; `business_id` is not repeated;
--   * TOMBSTONES ARE INCLUDED (`deleted_at` set): a pull must download
--     deletions. Their children are not returned — a tombstoned aggregate is
--     never live data (CLOUD_SYNC.md §8);
--   * each family is ordered by `created_at, id` (a restore rebuilds the local
--     list order), children by their position;
--   * every instant is text in ONE fixed form — UTC, milliseconds, `Z`
--     (`2026-09-11T09:15:00.000Z`), exactly what the device pushed — instead
--     of the session-dependent timestamptz → jsonb rendering (`+00:00`, 0 to 6
--     fraction digits). The device never stored more than milliseconds, so
--     nothing is lost, and `pulled_at` is only ever rounded DOWN (safe side);
--   * `p_since` NULL returns everything; otherwise only aggregates whose
--     `updated_at` is STRICTLY greater. `updated_at` moves on every meaningful
--     change of the row or of a child (V1A triggers), so a phase-only edit is
--     returned as its Service;
--   * `pulled_at` is `now()`, the start of THIS transaction. `updated_at` is
--     the start of the WRITING transaction, so a write that began before
--     `pulled_at` and commits after this read is older than `pulled_at` yet
--     was not returned: the device must re-read an overlap window before its
--     cursor (it does — src/persistence/sync/pull-cursor.ts) and skip what it
--     already acknowledged by `sync_version`.
--
-- Security model — unchanged from V1A / V1C:
--
--   * SECURITY INVOKER: every table is read under the caller's own rights;
--     the owner-only SELECT policies decide every row. The function adds
--     consistency, not privilege;
--   * an explicit `is_business_owner` check fails with 42501 instead of
--     letting RLS answer "no rows", which a restore would read as an EMPTY
--     Business;
--   * EXECUTE is granted to `authenticated` only; `anon` / `public` get none;
--   * `search_path = ''` and schema-qualified names everywhere;
--   * STABLE, read-only: no write, no service_role, no SECURITY DEFINER.

-- ---------------------------------------------------------------------------
-- 1. Instant → the device's ISO-8601 form (UTC, milliseconds, Z)
-- ---------------------------------------------------------------------------
create function public.sync_instant_text(p_value timestamptz)
returns text
language sql
stable
security invoker
set search_path = ''
as $$
  select to_char(p_value at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
$$;

comment on function public.sync_instant_text(timestamptz) is
  'Cloud Sync: timestamptz as ISO-8601 UTC text with millisecond precision (NULL stays NULL). Pure formatting; reads nothing.';

-- ---------------------------------------------------------------------------
-- 2. The read
-- ---------------------------------------------------------------------------
create function public.sync_pull_business_aggregates(p_business_id uuid, p_since timestamptz)
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
      ), '[]'::jsonb)
    )
  );
end;
$$;

comment on function public.sync_pull_business_aggregates(uuid, timestamptz) is
  'Cloud Sync pull / restore: every aggregate of the caller''s Business changed after p_since (NULL = all), tombstones included, each with its complete child set, read in ONE snapshot.';

-- ---------------------------------------------------------------------------
-- 3. Grants — authenticated owners only
-- ---------------------------------------------------------------------------
revoke all on function public.sync_instant_text(timestamptz) from public, anon;
revoke all on function public.sync_pull_business_aggregates(uuid, timestamptz) from public, anon;
grant execute on function public.sync_instant_text(timestamptz) to authenticated;
grant execute on function public.sync_pull_business_aggregates(uuid, timestamptz) to authenticated;
