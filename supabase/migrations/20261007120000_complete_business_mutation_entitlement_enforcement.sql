-- BeautIzzy — BeautIzzy Plus Phase 6.5C, step 5: complete server-side
-- business-mutation entitlement enforcement — the row-level policies, the
-- business-media Storage policy and the communication preference RPCs
--
-- docs/architecture/CLOUD_SYNC.md §26, docs/architecture/COMMUNICATIONS.md §47,
-- docs/architecture/SUBSCRIPTIONS.md. Step 4 (20261006120000) made
-- `sync_push_aggregate` refuse, under the server-side switch
-- BUSINESS_MUTATION_ENTITLEMENT_ENFORCEMENT, the business writes of an owner
-- without a verified production Plus entitlement — at the RPC boundary only.
-- This migration closes the three authenticated write paths that went around
-- it, with THE SAME rule, `business_mutation_is_entitled(business, at)`, and
-- nothing new about subscriptions:
--
--   1. the direct PostgREST table writes the owner-only policies permitted:
--      every INSERT / UPDATE policy of the eleven operational tables (the
--      seven aggregate families and the four nested child tables) now
--      requires ownership AND the rule in its WITH CHECK; every DELETE policy
--      of the four child tables requires both in its USING. The policies are
--      replaced under their EXISTING names (drop + create), so no permissive
--      policy of the previous shape survives to OR its way around the rule;
--      the SELECT policies, the table grants, the triggers, the constraints
--      and the tombstone model are untouched;
--   2. the business-media Storage INSERT policy: an upload needs ownership of
--      the first folder (the Business id) AND the rule for that Business —
--      ONE helper, `is_business_media_writable`, mirrors
--      `is_business_media_owner`. SELECT (reading and listing) and DELETE
--      (removing a photo: cleanup and a privacy operation that creates no
--      business data) are untouched; there is still no UPDATE policy — an
--      object is never overwritten;
--   3. the communication preference RPCs: an owner without Plus may DISABLE
--      email reminders, the dormant appointment SMS flag and either lifecycle
--      SMS automation at any time, and may keep what is already on; she may
--      not turn one ON. The refusal is the same structured answer as the push
--      RPC's, `{ "status": "ENTITLEMENT_REQUIRED" }`, in place of UPDATED —
--      never an error, never a write. Every other answer (UPDATED,
--      INVALID_REPLY_TO, INVALID_VALUE, 42501, 22023) is byte-identical.
--
-- While the switch is DISABLED — its state after this migration, which flips
-- nothing — the rule answers TRUE for every owner, so every policy, the
-- Storage policy and the three RPCs behave EXACTLY as before: the effective
-- write permissions of the deployed app builds are unchanged, for every
-- Business, including the accounts without any mirrored row.
--
-- What stays possible for a read-only account, by design: every read (the
-- SELECT policies, the pull and count RPCs, the Storage SELECT policy),
-- authentication and the Business profile (`businesses` keeps its owner
-- insert / update policies: onboarding and account management are not
-- business data, and the rule needs the Business to exist), disabling any
-- communication, removing a photo, and every service-role path (the worker,
-- the webhook and the mirror functions hold their own privileges and never
-- run as `authenticated`). No broad exception exists: the only write an
-- unentitled owner may still make to a business table is NONE — a consent
-- change recorded by the professional on a client is a business mutation,
-- guarded by the application since Phase 4; the client's own STOP path
-- (`CLIENT_STOP`, reserved) is a server-side write.
--
-- Nothing here reads, trusts or reuses the mobile app's enforcement build
-- constant (src/features/access/enforcement.ts). The flag row of step 4 is
-- reused, never inserted again, never flipped. Additive and non-destructive:
-- policies replaced under their names, ONE new helper, ONE Storage policy
-- replaced, THREE functions replaced IN PLACE (same signatures, same grants,
-- the deployed bodies plus the gate). No row of any table is read, written,
-- rescheduled or deleted by applying it. Safe to re-run (`drop policy if
-- exists` on the named policies only, `create or replace`).

-- ---------------------------------------------------------------------------
-- 1. Row-level policies — ownership AND the rule on every authenticated write
-- ---------------------------------------------------------------------------
-- INSERT: WITH CHECK on the new row. UPDATE: USING keeps ownership only (the
-- row stays targetable, so a refused update is an explicit 42501 on the new
-- row, never a silent "0 rows"); WITH CHECK requires both. DELETE (children
-- only — parents are tombstoned through UPDATE): USING requires both.
-- `business_id` is pinned by the before-write trigger on parents, and a
-- child's new `business_id` must be a Business the caller owns AND may write:
-- a row can never be moved to another Business to escape the rule.

-- clients
drop policy if exists "clients: owner can insert" on public.clients;
create policy "clients: owner can insert" on public.clients
  for insert to authenticated
  with check ((select public.is_business_owner(business_id)) and (select public.business_mutation_is_entitled(business_id)));
drop policy if exists "clients: owner can update" on public.clients;
create policy "clients: owner can update" on public.clients
  for update to authenticated
  using ((select public.is_business_owner(business_id)))
  with check ((select public.is_business_owner(business_id)) and (select public.business_mutation_is_entitled(business_id)));

-- services
drop policy if exists "services: owner can insert" on public.services;
create policy "services: owner can insert" on public.services
  for insert to authenticated
  with check ((select public.is_business_owner(business_id)) and (select public.business_mutation_is_entitled(business_id)));
drop policy if exists "services: owner can update" on public.services;
create policy "services: owner can update" on public.services
  for update to authenticated
  using ((select public.is_business_owner(business_id)))
  with check ((select public.is_business_owner(business_id)) and (select public.business_mutation_is_entitled(business_id)));

-- service_phases (nested child)
drop policy if exists "service_phases: owner can insert" on public.service_phases;
create policy "service_phases: owner can insert" on public.service_phases
  for insert to authenticated
  with check ((select public.is_business_owner(business_id)) and (select public.business_mutation_is_entitled(business_id)));
drop policy if exists "service_phases: owner can update" on public.service_phases;
create policy "service_phases: owner can update" on public.service_phases
  for update to authenticated
  using ((select public.is_business_owner(business_id)))
  with check ((select public.is_business_owner(business_id)) and (select public.business_mutation_is_entitled(business_id)));
drop policy if exists "service_phases: owner can delete" on public.service_phases;
create policy "service_phases: owner can delete" on public.service_phases
  for delete to authenticated
  using ((select public.is_business_owner(business_id)) and (select public.business_mutation_is_entitled(business_id)));

-- appointments
drop policy if exists "appointments: owner can insert" on public.appointments;
create policy "appointments: owner can insert" on public.appointments
  for insert to authenticated
  with check ((select public.is_business_owner(business_id)) and (select public.business_mutation_is_entitled(business_id)));
drop policy if exists "appointments: owner can update" on public.appointments;
create policy "appointments: owner can update" on public.appointments
  for update to authenticated
  using ((select public.is_business_owner(business_id)))
  with check ((select public.is_business_owner(business_id)) and (select public.business_mutation_is_entitled(business_id)));

-- appointment_items (nested child)
drop policy if exists "appointment_items: owner can insert" on public.appointment_items;
create policy "appointment_items: owner can insert" on public.appointment_items
  for insert to authenticated
  with check ((select public.is_business_owner(business_id)) and (select public.business_mutation_is_entitled(business_id)));
drop policy if exists "appointment_items: owner can update" on public.appointment_items;
create policy "appointment_items: owner can update" on public.appointment_items
  for update to authenticated
  using ((select public.is_business_owner(business_id)))
  with check ((select public.is_business_owner(business_id)) and (select public.business_mutation_is_entitled(business_id)));
drop policy if exists "appointment_items: owner can delete" on public.appointment_items;
create policy "appointment_items: owner can delete" on public.appointment_items
  for delete to authenticated
  using ((select public.is_business_owner(business_id)) and (select public.business_mutation_is_entitled(business_id)));

-- appointment_phases (nested child)
drop policy if exists "appointment_phases: owner can insert" on public.appointment_phases;
create policy "appointment_phases: owner can insert" on public.appointment_phases
  for insert to authenticated
  with check ((select public.is_business_owner(business_id)) and (select public.business_mutation_is_entitled(business_id)));
drop policy if exists "appointment_phases: owner can update" on public.appointment_phases;
create policy "appointment_phases: owner can update" on public.appointment_phases
  for update to authenticated
  using ((select public.is_business_owner(business_id)))
  with check ((select public.is_business_owner(business_id)) and (select public.business_mutation_is_entitled(business_id)));
drop policy if exists "appointment_phases: owner can delete" on public.appointment_phases;
create policy "appointment_phases: owner can delete" on public.appointment_phases
  for delete to authenticated
  using ((select public.is_business_owner(business_id)) and (select public.business_mutation_is_entitled(business_id)));

-- products
drop policy if exists "products: owner can insert" on public.products;
create policy "products: owner can insert" on public.products
  for insert to authenticated
  with check ((select public.is_business_owner(business_id)) and (select public.business_mutation_is_entitled(business_id)));
drop policy if exists "products: owner can update" on public.products;
create policy "products: owner can update" on public.products
  for update to authenticated
  using ((select public.is_business_owner(business_id)))
  with check ((select public.is_business_owner(business_id)) and (select public.business_mutation_is_entitled(business_id)));

-- sales
drop policy if exists "sales: owner can insert" on public.sales;
create policy "sales: owner can insert" on public.sales
  for insert to authenticated
  with check ((select public.is_business_owner(business_id)) and (select public.business_mutation_is_entitled(business_id)));
drop policy if exists "sales: owner can update" on public.sales;
create policy "sales: owner can update" on public.sales
  for update to authenticated
  using ((select public.is_business_owner(business_id)))
  with check ((select public.is_business_owner(business_id)) and (select public.business_mutation_is_entitled(business_id)));

-- sale_items (nested child)
drop policy if exists "sale_items: owner can insert" on public.sale_items;
create policy "sale_items: owner can insert" on public.sale_items
  for insert to authenticated
  with check ((select public.is_business_owner(business_id)) and (select public.business_mutation_is_entitled(business_id)));
drop policy if exists "sale_items: owner can update" on public.sale_items;
create policy "sale_items: owner can update" on public.sale_items
  for update to authenticated
  using ((select public.is_business_owner(business_id)))
  with check ((select public.is_business_owner(business_id)) and (select public.business_mutation_is_entitled(business_id)));
drop policy if exists "sale_items: owner can delete" on public.sale_items;
create policy "sale_items: owner can delete" on public.sale_items
  for delete to authenticated
  using ((select public.is_business_owner(business_id)) and (select public.business_mutation_is_entitled(business_id)));

-- calendar_blocks
drop policy if exists "calendar_blocks: owner can insert" on public.calendar_blocks;
create policy "calendar_blocks: owner can insert" on public.calendar_blocks
  for insert to authenticated
  with check ((select public.is_business_owner(business_id)) and (select public.business_mutation_is_entitled(business_id)));
drop policy if exists "calendar_blocks: owner can update" on public.calendar_blocks;
create policy "calendar_blocks: owner can update" on public.calendar_blocks
  for update to authenticated
  using ((select public.is_business_owner(business_id)))
  with check ((select public.is_business_owner(business_id)) and (select public.business_mutation_is_entitled(business_id)));

-- appointment_deposits
drop policy if exists "appointment_deposits: owner can insert" on public.appointment_deposits;
create policy "appointment_deposits: owner can insert" on public.appointment_deposits
  for insert to authenticated
  with check ((select public.is_business_owner(business_id)) and (select public.business_mutation_is_entitled(business_id)));
drop policy if exists "appointment_deposits: owner can update" on public.appointment_deposits;
create policy "appointment_deposits: owner can update" on public.appointment_deposits
  for update to authenticated
  using ((select public.is_business_owner(business_id)))
  with check ((select public.is_business_owner(business_id)) and (select public.business_mutation_is_entitled(business_id)));

-- ---------------------------------------------------------------------------
-- 2. Storage — an upload needs ownership of the Business folder AND the rule
-- ---------------------------------------------------------------------------
-- The first folder of a business-media object path is the Business id
-- (<business_id>/clients/… or <business_id>/products/…). A first folder that
-- is not a UUID is refused without ever being cast, exactly like
-- `is_business_media_owner`; ownership is checked BEFORE the rule.
create or replace function public.is_business_media_writable(object_name text)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select case
    when (storage.foldername(object_name))[1]
      ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then public.is_business_owner(((storage.foldername(object_name))[1])::uuid)
         and public.business_mutation_is_entitled(((storage.foldername(object_name))[1])::uuid)
    else false
  end;
$$;

comment on function public.is_business_media_writable(text) is
  'BeautIzzy Plus 6.5C: true when the first folder of a business-media object path is a Business the signed-in user owns AND may write (business_mutation_is_entitled). Storage INSERT predicate.';

revoke all on function public.is_business_media_writable(text) from public, anon, service_role;
grant execute on function public.is_business_media_writable(text) to authenticated;

drop policy if exists "business-media: owner can insert" on storage.objects;
create policy "business-media: owner can insert"
  on storage.objects
  for insert
  to authenticated
  with check (bucket_id = 'business-media' and public.is_business_media_writable(name));

-- ---------------------------------------------------------------------------
-- 3. Communication preferences — turning a paid communication ON needs Plus
-- ---------------------------------------------------------------------------
-- Replaced IN PLACE (identical signatures; EXECUTE grants and revokes
-- re-stated). Each body is the deployed one with exactly one addition: after
-- the owner check and the required-argument check, BEFORE any validation or
-- write, a request that would turn a switch ON that is not already on is
-- refused with { "status": "ENTITLEMENT_REQUIRED" } unless the rule holds.
-- Turning a switch OFF, keeping an ON switch on (a Reply-To edit, a knob
-- change), and every validation answer are exactly as before.

-- 3a. Email reminders (Lot B)
create or replace function public.communications_update_preferences(
  p_business_id uuid,
  p_email_reminders_enabled boolean,
  p_reply_to_email text
) returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_reply_to text;
  v_currently_enabled boolean;
begin
  if not public.is_business_owner(p_business_id) then
    raise exception 'communications: not the owner of this Business' using errcode = '42501';
  end if;
  if p_email_reminders_enabled is null then
    raise exception 'communications: email_reminders_enabled is required' using errcode = '22023';
  end if;

  -- BeautIzzy Plus (6.5C, step 5): enabling is a paid business mutation.
  select email_reminders_enabled into v_currently_enabled
    from public.business_communication_preferences
   where business_id = p_business_id;
  if p_email_reminders_enabled
     and not coalesce(v_currently_enabled, false)
     and not public.business_mutation_is_entitled(p_business_id) then
    return jsonb_build_object('status', 'ENTITLEMENT_REQUIRED');
  end if;

  v_reply_to := nullif(btrim(coalesce(p_reply_to_email, '')), '');
  if v_reply_to is not null and not public.communications_is_valid_email(v_reply_to) then
    return jsonb_build_object('status', 'INVALID_REPLY_TO');
  end if;
  if p_email_reminders_enabled and v_reply_to is null then
    return jsonb_build_object('status', 'INVALID_REPLY_TO');
  end if;

  insert into public.business_communication_preferences
    (business_id, email_reminders_enabled, reply_to_email)
  values (p_business_id, p_email_reminders_enabled, v_reply_to)
  on conflict (business_id) do update set
    email_reminders_enabled = excluded.email_reminders_enabled,
    reply_to_email = excluded.reply_to_email;

  return jsonb_build_object(
    'status', 'UPDATED',
    'email_reminders_enabled', p_email_reminders_enabled,
    'reply_to_email', v_reply_to
  );
end;
$$;

comment on function public.communications_update_preferences(uuid, boolean, text) is
  'Communications Lot B: the owner turns email reminders on/off and sets the Reply-To. Enabling requires a valid Reply-To and, since BeautIzzy Plus 6.5C, verified Plus access under the server-side switch (ENTITLEMENT_REQUIRED otherwise); disabling never needs it. Reconciliation follows through the table trigger.';

revoke all on function public.communications_update_preferences(uuid, boolean, text) from public, anon;
grant execute on function public.communications_update_preferences(uuid, boolean, text) to authenticated;

-- 3b. The dormant appointment-SMS flag (Lot C1, deprecated since the SMS pivot)
create or replace function public.communications_update_sms_preferences(
  p_business_id uuid,
  p_sms_reminders_enabled boolean
) returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_row record;
  v_currently_enabled boolean;
begin
  if not public.is_business_owner(p_business_id) then
    raise exception 'communications: not the owner of this Business' using errcode = '42501';
  end if;
  if p_sms_reminders_enabled is null then
    raise exception 'communications: sms_reminders_enabled is required' using errcode = '22023';
  end if;

  -- BeautIzzy Plus (6.5C, step 5): enabling is a paid business mutation.
  select sms_reminders_enabled into v_currently_enabled
    from public.business_communication_preferences
   where business_id = p_business_id;
  if p_sms_reminders_enabled
     and not coalesce(v_currently_enabled, false)
     and not public.business_mutation_is_entitled(p_business_id) then
    return jsonb_build_object('status', 'ENTITLEMENT_REQUIRED');
  end if;

  insert into public.business_communication_preferences
    (business_id, sms_reminders_enabled)
  values (p_business_id, p_sms_reminders_enabled)
  on conflict (business_id) do update set
    sms_reminders_enabled = excluded.sms_reminders_enabled;

  select email_reminders_enabled, sms_reminders_enabled, reply_to_email
    into v_row
    from public.business_communication_preferences
   where business_id = p_business_id;

  return jsonb_build_object(
    'status', 'UPDATED',
    'email_reminders_enabled', v_row.email_reminders_enabled,
    'sms_reminders_enabled', v_row.sms_reminders_enabled,
    'reply_to_email', v_row.reply_to_email
  );
end;
$$;

comment on function public.communications_update_sms_preferences(uuid, boolean) is
  'DEPRECATED (SMS pivot Phase 1): kept for backwards/schema compatibility. Writes the dormant sms_reminders_enabled flag; reconciles nothing and can never create an SMS. Since BeautIzzy Plus 6.5C, enabling needs verified Plus access under the server-side switch.';

revoke all on function public.communications_update_sms_preferences(uuid, boolean) from public, anon;
grant execute on function public.communications_update_sms_preferences(uuid, boolean) to authenticated;

-- 3c. Lifecycle SMS automations (SMS pivot Phase 2)
create or replace function public.communications_update_lifecycle_sms_preferences(
  p_business_id uuid,
  p_birthday_sms_enabled boolean,
  p_winback_sms_enabled boolean,
  p_birthday_discount_percent integer default null,
  p_birthday_validity_days integer default null,
  p_winback_after_days integer default null,
  p_winback_discount_percent integer default null,
  p_winback_validity_days integer default null
) returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_row record;
  v_current record;
begin
  if not public.is_business_owner(p_business_id) then
    raise exception 'communications: not the owner of this Business' using errcode = '42501';
  end if;
  if p_birthday_sms_enabled is null or p_winback_sms_enabled is null then
    raise exception 'communications: both automation switches are required' using errcode = '22023';
  end if;

  -- BeautIzzy Plus (6.5C, step 5): turning an automation ON is a paid business mutation.
  select birthday_sms_enabled, winback_sms_enabled into v_current
    from public.business_lifecycle_sms_preferences
   where business_id = p_business_id;
  if ((p_birthday_sms_enabled and not coalesce(v_current.birthday_sms_enabled, false))
      or (p_winback_sms_enabled and not coalesce(v_current.winback_sms_enabled, false)))
     and not public.business_mutation_is_entitled(p_business_id) then
    return jsonb_build_object('status', 'ENTITLEMENT_REQUIRED');
  end if;

  if p_birthday_discount_percent is not null and p_birthday_discount_percent not between 1 and 100
     or p_winback_discount_percent is not null and p_winback_discount_percent not between 1 and 100
     or p_birthday_validity_days is not null and p_birthday_validity_days not between 1 and 365
     or p_winback_validity_days is not null and p_winback_validity_days not between 1 and 365
     or p_winback_after_days is not null and p_winback_after_days not between 1 and 730 then
    return jsonb_build_object('status', 'INVALID_VALUE');
  end if;

  insert into public.business_lifecycle_sms_preferences as prefs
    (business_id, birthday_sms_enabled, birthday_discount_percent, birthday_validity_days,
     winback_sms_enabled, winback_after_days, winback_discount_percent, winback_validity_days)
  values
    (p_business_id, p_birthday_sms_enabled,
     coalesce(p_birthday_discount_percent, 15), coalesce(p_birthday_validity_days, 7),
     p_winback_sms_enabled,
     coalesce(p_winback_after_days, 60), coalesce(p_winback_discount_percent, 10),
     coalesce(p_winback_validity_days, 7))
  on conflict (business_id) do update set
    birthday_sms_enabled = excluded.birthday_sms_enabled,
    birthday_discount_percent = coalesce(p_birthday_discount_percent, prefs.birthday_discount_percent),
    birthday_validity_days = coalesce(p_birthday_validity_days, prefs.birthday_validity_days),
    winback_sms_enabled = excluded.winback_sms_enabled,
    winback_after_days = coalesce(p_winback_after_days, prefs.winback_after_days),
    winback_discount_percent = coalesce(p_winback_discount_percent, prefs.winback_discount_percent),
    winback_validity_days = coalesce(p_winback_validity_days, prefs.winback_validity_days);

  select * into v_row
    from public.business_lifecycle_sms_preferences
   where business_id = p_business_id;

  return jsonb_build_object(
    'status', 'UPDATED',
    'birthday_sms_enabled', v_row.birthday_sms_enabled,
    'birthday_discount_percent', v_row.birthday_discount_percent,
    'birthday_validity_days', v_row.birthday_validity_days,
    'winback_sms_enabled', v_row.winback_sms_enabled,
    'winback_after_days', v_row.winback_after_days,
    'winback_discount_percent', v_row.winback_discount_percent,
    'winback_validity_days', v_row.winback_validity_days
  );
end;
$$;

comment on function public.communications_update_lifecycle_sms_preferences(uuid, boolean, boolean, integer, integer, integer, integer, integer) is
  'SMS pivot Phase 2: the owner updates the lifecycle SMS automations. Disabling one cancels ITS pending rows through the table trigger; enabling schedules nothing by itself — the daily reconciliation derives. Since BeautIzzy Plus 6.5C, turning an automation ON needs verified Plus access under the server-side switch (ENTITLEMENT_REQUIRED otherwise).';

revoke all on function public.communications_update_lifecycle_sms_preferences(uuid, boolean, boolean, integer, integer, integer, integer, integer) from public, anon;
grant execute on function public.communications_update_lifecycle_sms_preferences(uuid, boolean, boolean, integer, integer, integer, integer, integer) to authenticated;
