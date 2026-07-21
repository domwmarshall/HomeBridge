-- HomeBridge v0.7.0 database patch
-- Run once after the original schema and v0.6 patch.

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

alter table public.household_invites
  add column if not exists revoked_at timestamptz;

alter table public.calendar_events
  add column if not exists all_day boolean not null default false,
  add column if not exists rsvp_deadline date,
  add column if not exists required_item_ids uuid[] not null default '{}',
  add column if not exists attachment_path text;

alter table public.calendar_events
  drop constraint if exists calendar_events_category_check;

alter table public.calendar_events
  add constraint calendar_events_category_check
  check (
    category in (
      'School',
      'Handover',
      'Party',
      'Trip',
      'Medical',
      'Holiday',
      'Reminder'
    )
  );

update public.calendar_events
set all_day = true
where category = 'Holiday'
  and all_day = false;

create table if not exists public.care_overrides (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null
    references public.households(id) on delete cascade,
  child_id uuid not null
    references public.children(id) on delete cascade,
  starts_on date not null,
  ends_on date not null,
  household_label text not null
    check (household_label in ('Dad''s house', 'Mum''s house')),
  note text,
  created_by uuid not null references auth.users(id),
  updated_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_on >= starts_on)
);

create index if not exists care_overrides_household_dates_idx
  on public.care_overrides(household_id, starts_on, ends_on);

create or replace function public.remove_deleted_item_from_calendar_events()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $fn$
begin
  update public.calendar_events
  set required_item_ids = array_remove(required_item_ids, old.id)
  where household_id = old.household_id
    and old.id = any(required_item_ids);
  return old;
end;
$fn$;

drop trigger if exists items_remove_from_calendar_events
on public.items;

create trigger items_remove_from_calendar_events
after delete on public.items
for each row execute function public.remove_deleted_item_from_calendar_events();

drop trigger if exists care_overrides_touch_updated_at
on public.care_overrides;

create trigger care_overrides_touch_updated_at
before update on public.care_overrides
for each row execute function public.touch_updated_at();

alter table public.care_overrides enable row level security;

drop policy if exists care_overrides_select_members
on public.care_overrides;
create policy care_overrides_select_members
on public.care_overrides
for select
using (public.is_household_member(household_id));

drop policy if exists care_overrides_insert_editors
on public.care_overrides;
create policy care_overrides_insert_editors
on public.care_overrides
for insert
with check (
  public.is_household_editor(household_id)
  and created_by = auth.uid()
  and updated_by = auth.uid()
);

drop policy if exists care_overrides_update_editors
on public.care_overrides;
create policy care_overrides_update_editors
on public.care_overrides
for update
using (public.is_household_editor(household_id))
with check (
  public.is_household_editor(household_id)
  and updated_by = auth.uid()
);

drop policy if exists care_overrides_delete_editors
on public.care_overrides;
create policy care_overrides_delete_editors
on public.care_overrides
for delete
using (public.is_household_editor(household_id));

create or replace function public.homebridge_invite_hash(
  p_code text
)
returns text
language sql
immutable
security definer
set search_path = public, extensions, pg_catalog
as $fn$
  select encode(
    digest(
      upper(trim(p_code))::text,
      'sha256'::text
    ),
    'hex'
  );
$fn$;

create or replace function public.create_household_invite_v3(
  p_household_id uuid,
  p_parent_label text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_catalog
as $fn$
declare
  v_code text;
  v_invite_id uuid;
  v_expires_at timestamptz := now() + interval '7 days';
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;

  if not public.is_household_editor(p_household_id) then
    raise exception 'You cannot invite members to this household.';
  end if;

  if p_parent_label is not null
    and p_parent_label not in ('Dad', 'Mum')
  then
    raise exception 'Parent label must be Dad or Mum.';
  end if;

  if p_parent_label is not null
    and exists (
      select 1
      from public.household_members hm
      where hm.household_id = p_household_id
        and hm.parent_label = p_parent_label
    )
  then
    raise exception 'That parent role is already connected to this household.';
  end if;

  update public.household_invites
  set revoked_at = now()
  where household_id = p_household_id
    and accepted_at is null
    and revoked_at is null
    and expires_at > now()
    and (
      p_parent_label is null
      or intended_parent_label = p_parent_label
    );

  v_code := upper(
    substr(
      replace(gen_random_uuid()::text, '-', ''),
      1,
      10
    )
  );

  insert into public.household_invites (
    household_id,
    code_hash,
    intended_parent_label,
    created_by,
    expires_at
  )
  values (
    p_household_id,
    public.homebridge_invite_hash(v_code),
    nullif(trim(p_parent_label), ''),
    auth.uid(),
    v_expires_at
  )
  returning id into v_invite_id;

  insert into public.activity_log (
    household_id,
    actor_id,
    action,
    entity_type,
    entity_id,
    summary
  )
  values (
    p_household_id,
    auth.uid(),
    'created',
    'household_invite',
    v_invite_id::text,
    'Created a one-time household invitation.'
  );

  return jsonb_build_object(
    'invite_id', v_invite_id,
    'invite_code', v_code,
    'expires_at', v_expires_at
  );
end;
$fn$;

create or replace function public.revoke_household_invite(
  p_invite_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, extensions, pg_catalog
as $fn$
declare
  v_invite public.household_invites%rowtype;
begin
  select *
  into v_invite
  from public.household_invites
  where id = p_invite_id
  for update;

  if not found then
    raise exception 'Invitation not found.';
  end if;

  if not public.is_household_editor(v_invite.household_id) then
    raise exception 'You cannot revoke this invitation.';
  end if;

  if v_invite.accepted_at is not null then
    raise exception 'This invitation has already been used.';
  end if;

  update public.household_invites
  set revoked_at = now()
  where id = p_invite_id;

  insert into public.activity_log (
    household_id,
    actor_id,
    action,
    entity_type,
    entity_id,
    summary
  )
  values (
    v_invite.household_id,
    auth.uid(),
    'revoked',
    'household_invite',
    p_invite_id::text,
    'Revoked a household invitation.'
  );
end;
$fn$;

create or replace function public.join_household_by_code(
  p_invite_code text,
  p_display_name text,
  p_parent_label text
)
returns uuid
language plpgsql
security definer
set search_path = public, extensions, pg_catalog
as $fn$
declare
  v_user uuid := auth.uid();
  v_invite public.household_invites%rowtype;
begin
  if v_user is null then
    raise exception 'You must be signed in.';
  end if;

  if coalesce(trim(p_display_name), '') = '' then
    raise exception 'Your display name is required.';
  end if;

  if coalesce(trim(p_invite_code), '') = '' then
    raise exception 'An invite code is required.';
  end if;

  if p_parent_label not in ('Dad', 'Mum') then
    raise exception 'Parent label must be Dad or Mum.';
  end if;

  if exists (
    select 1
    from public.household_members
    where user_id = v_user
  ) then
    raise exception 'This account already belongs to a HomeBridge household.';
  end if;

  select *
  into v_invite
  from public.household_invites
  where code_hash = public.homebridge_invite_hash(p_invite_code)
    and accepted_at is null
    and revoked_at is null
    and expires_at > now()
  for update;

  if not found then
    raise exception 'That invite code is invalid, expired, revoked or already used.';
  end if;

  if v_invite.intended_parent_label is not null
    and v_invite.intended_parent_label <> p_parent_label
  then
    raise exception 'This invitation was created for the other parent role.';
  end if;

  if exists (
    select 1
    from public.household_members hm
    where hm.household_id = v_invite.household_id
      and hm.parent_label = p_parent_label
  ) then
    raise exception 'That parent role is already connected to this household.';
  end if;

  insert into public.household_members (
    household_id,
    user_id,
    role,
    display_name,
    parent_label
  )
  values (
    v_invite.household_id,
    v_user,
    'parent',
    trim(p_display_name),
    p_parent_label
  );

  update public.profiles
  set display_name = trim(p_display_name)
  where id = v_user;

  update public.household_invites
  set
    accepted_by = v_user,
    accepted_at = now()
  where id = v_invite.id;

  update public.household_invites
  set revoked_at = now()
  where household_id = v_invite.household_id
    and id <> v_invite.id
    and intended_parent_label = p_parent_label
    and accepted_at is null
    and revoked_at is null;

  insert into public.activity_log (
    household_id,
    actor_id,
    action,
    entity_type,
    entity_id,
    summary
  )
  values (
    v_invite.household_id,
    v_user,
    'joined',
    'household',
    v_invite.household_id::text,
    trim(p_display_name) || ' joined the household.'
  );

  return v_invite.household_id;
end;
$fn$;

revoke all
on function public.homebridge_invite_hash(text)
from public;

revoke all
on function public.create_household_invite_v3(uuid, text)
from public;

revoke all
on function public.revoke_household_invite(uuid)
from public;

revoke all
on function public.join_household_by_code(text, text, text)
from public;

grant execute
on function public.create_household_invite_v3(uuid, text)
to authenticated;

grant execute
on function public.revoke_household_invite(uuid)
to authenticated;

grant execute
on function public.join_household_by_code(text, text, text)
to authenticated;

-- Add newly live-updating tables without duplicating publication entries.
do $block$
declare
  table_name text;
begin
  foreach table_name in array array[
    'care_overrides',
    'care_schedule_rules',
    'household_members',
    'household_invites'
  ]
  loop
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = table_name
    ) then
      execute format(
        'alter publication supabase_realtime add table public.%I',
        table_name
      );
    end if;
  end loop;
end;
$block$;

notify pgrst, 'reload schema';
