-- HomeBridge v0.2 live Supabase schema
-- Run ONCE in a new Supabase project using SQL Editor.
-- The mobile app uses only the Project URL and publishable key.

create extension if not exists pgcrypto;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Our family',
  timezone text not null default 'Europe/London',
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create table public.household_members (
  household_id uuid not null references public.households(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner','parent','guardian','viewer')) default 'parent',
  display_name text not null,
  parent_label text,
  joined_at timestamptz not null default now(),
  primary key (household_id, user_id)
);
create index household_members_user_idx on public.household_members(user_id);

create table public.household_invites (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  code_hash text not null unique,
  intended_parent_label text,
  created_by uuid not null references auth.users(id),
  expires_at timestamptz not null default (now() + interval '7 days'),
  accepted_by uuid references auth.users(id),
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);
create index household_invites_household_idx on public.household_invites(household_id);

create table public.children (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  first_name text not null,
  date_of_birth date,
  school_name text,
  class_name text,
  clothing_size text,
  shoe_size text,
  allergies text[] not null default '{}',
  current_household_label text not null default 'Dad''s house',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index children_household_idx on public.children(household_id);

create table public.care_schedule_rules (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  child_id uuid not null references public.children(id) on delete cascade,
  title text not null,
  recurrence_rule text not null,
  household_label text not null,
  pickup_parent_label text,
  pickup_location text,
  starts_on date not null,
  ends_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index care_schedule_household_idx on public.care_schedule_rules(household_id);

create table public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  child_id uuid references public.children(id) on delete cascade,
  title text not null,
  category text not null check (category in ('School','Handover','Party','Trip','Medical','Holiday')),
  starts_at timestamptz not null,
  ends_at timestamptz,
  location text,
  responsible_parent_label text not null default 'Both' check (responsible_parent_label in ('Dad','Mum','Both')),
  notes text,
  created_by uuid not null references auth.users(id),
  updated_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index calendar_events_household_start_idx on public.calendar_events(household_id, starts_at);

create table public.event_acknowledgements (
  event_id uuid not null references public.calendar_events(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  acknowledged_at timestamptz not null default now(),
  primary key (event_id, user_id)
);

create table public.items (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  child_id uuid references public.children(id) on delete cascade,
  name text not null,
  category text not null check (category in ('Uniform','Clothing','Toy','School','Medical','Other')),
  quantity integer not null default 1 check (quantity > 0),
  current_location text not null,
  needed_at text,
  minimum_at_dad integer,
  minimum_at_mum integer,
  photo_path text,
  notes text,
  updated_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index items_household_idx on public.items(household_id);

create table public.handovers (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  child_id uuid not null references public.children(id) on delete cascade,
  starts_at timestamptz not null,
  from_household_label text not null,
  to_household_label text not null,
  pickup_parent_label text,
  pickup_location text,
  note text,
  completed_at timestamptz,
  completed_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index handovers_household_start_idx on public.handovers(household_id, starts_at);

create table public.handover_items (
  id uuid primary key default gen_random_uuid(),
  handover_id uuid not null references public.handovers(id) on delete cascade,
  item_id uuid references public.items(id) on delete set null,
  label text not null,
  sort_order integer not null default 0,
  is_essential boolean not null default false,
  is_done boolean not null default false,
  checked_by uuid references auth.users(id),
  checked_at timestamptz
);
create index handover_items_handover_idx on public.handover_items(handover_id, sort_order);

create table public.medical_items (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  child_id uuid not null references public.children(id) on delete cascade,
  name text not null,
  location text not null,
  quantity integer not null default 1 check (quantity > 0),
  expiry_date date,
  label_photo_path text,
  last_checked_at timestamptz,
  replacement_status text not null default 'OK' check (replacement_status in ('OK','Due soon','Requested','Replaced')),
  updated_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index medical_items_household_expiry_idx on public.medical_items(household_id, expiry_date);

create table public.activity_log (
  id bigint generated always as identity primary key,
  household_id uuid not null references public.households(id) on delete cascade,
  actor_id uuid references auth.users(id),
  action text not null,
  entity_type text not null,
  entity_id text,
  summary text not null,
  created_at timestamptz not null default now()
);
create index activity_log_household_idx on public.activity_log(household_id, created_at desc);

create or replace function public.touch_updated_at()
returns trigger language plpgsql set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_touch_updated_at before update on public.profiles for each row execute function public.touch_updated_at();
create trigger children_touch_updated_at before update on public.children for each row execute function public.touch_updated_at();
create trigger care_schedule_touch_updated_at before update on public.care_schedule_rules for each row execute function public.touch_updated_at();
create trigger calendar_events_touch_updated_at before update on public.calendar_events for each row execute function public.touch_updated_at();
create trigger items_touch_updated_at before update on public.items for each row execute function public.touch_updated_at();
create trigger handovers_touch_updated_at before update on public.handovers for each row execute function public.touch_updated_at();
create trigger medical_items_touch_updated_at before update on public.medical_items for each row execute function public.touch_updated_at();

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, nullif(new.raw_user_meta_data ->> 'display_name', ''))
  on conflict (id) do nothing;
  return new;
end;
$$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

create or replace function public.is_household_member(target_household uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.household_members hm
    where hm.household_id = target_household and hm.user_id = auth.uid()
  )
$$;

create or replace function public.is_household_editor(target_household uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.household_members hm
    where hm.household_id = target_household
      and hm.user_id = auth.uid()
      and hm.role in ('owner','parent','guardian')
  )
$$;

create or replace function public.is_household_owner(target_household uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.household_members hm
    where hm.household_id = target_household
      and hm.user_id = auth.uid()
      and hm.role = 'owner'
  )
$$;

create or replace function public.create_household_with_child(
  p_household_name text,
  p_display_name text,
  p_parent_label text,
  p_child_name text
)
returns table (household_id uuid, child_id uuid)
language plpgsql security definer set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_household uuid;
  v_child uuid;
  v_handover uuid;
  v_school_bag uuid;
  v_medication_bag uuid;
  v_current_house text;
  v_other_house text;
  v_other_parent text;
  v_local_now timestamp;
  v_days_to_tuesday integer;
  v_first_handover timestamptz;
begin
  if v_user is null then raise exception 'You must be signed in.'; end if;
  if coalesce(trim(p_household_name), '') = '' or coalesce(trim(p_display_name), '') = '' or coalesce(trim(p_child_name), '') = '' then
    raise exception 'Household, parent and child names are required.';
  end if;
  if p_parent_label not in ('Dad','Mum') then raise exception 'Parent label must be Dad or Mum.'; end if;
  if exists (select 1 from public.household_members where user_id = v_user) then
    raise exception 'This account already belongs to a HomeBridge household.';
  end if;

  v_current_house := case when p_parent_label = 'Mum' then 'Mum''s house' else 'Dad''s house' end;
  v_other_house := case when p_parent_label = 'Mum' then 'Dad''s house' else 'Mum''s house' end;
  v_other_parent := case when p_parent_label = 'Mum' then 'Dad' else 'Mum' end;
  v_local_now := now() at time zone 'Europe/London';
  v_days_to_tuesday := (2 - extract(isodow from v_local_now)::integer + 7) % 7;
  if v_days_to_tuesday = 0 and v_local_now::time >= time '15:15' then v_days_to_tuesday := 7; end if;
  v_first_handover := (date_trunc('day', v_local_now) + make_interval(days => v_days_to_tuesday) + interval '15 hours 15 minutes') at time zone 'Europe/London';

  insert into public.households (name, created_by) values (trim(p_household_name), v_user) returning id into v_household;
  insert into public.household_members (household_id, user_id, role, display_name, parent_label)
  values (v_household, v_user, 'owner', trim(p_display_name), p_parent_label);
  update public.profiles set display_name = trim(p_display_name) where id = v_user;

  insert into public.children (household_id, first_name, current_household_label)
  values (v_household, trim(p_child_name), v_current_house) returning id into v_child;

  insert into public.items (household_id, child_id, name, category, quantity, current_location, needed_at, updated_by)
  values (v_household, v_child, 'School bag', 'School', 1, v_current_house, 'Handover bag', v_user)
  returning id into v_school_bag;

  insert into public.items (household_id, child_id, name, category, quantity, current_location, needed_at, notes, updated_by)
  values (v_household, v_child, 'Travel medication pouch', 'Medical', 1, v_current_house, 'Handover bag', 'Add the actual medicine names, quantities and expiry dates separately.', v_user)
  returning id into v_medication_bag;

  insert into public.care_schedule_rules (household_id, child_id, title, recurrence_rule, household_label, pickup_parent_label, pickup_location, starts_on)
  values (v_household, v_child, 'Alternating Tuesday handover', 'FREQ=WEEKLY;INTERVAL=1;BYDAY=TU', v_other_house, v_other_parent, 'school or agreed handover point', v_first_handover::date);

  insert into public.handovers (household_id, child_id, starts_at, from_household_label, to_household_label, pickup_parent_label, pickup_location)
  values (v_household, v_child, v_first_handover, v_current_house, v_other_house, v_other_parent, 'school or agreed handover point')
  returning id into v_handover;

  insert into public.handover_items (handover_id, item_id, label, sort_order, is_essential) values
    (v_handover, v_school_bag, 'School bag and reading record', 10, true),
    (v_handover, v_medication_bag, 'Travel medication pouch', 20, true),
    (v_handover, null, 'Pass on school or homework messages', 30, false);

  -- Norfolk County Council model school holidays. These remain editable because school and INSET dates can differ.
  insert into public.calendar_events (household_id, child_id, title, category, starts_at, ends_at, responsible_parent_label, notes, created_by, updated_by) values
    (v_household, v_child, 'Norfolk summer holiday', 'Holiday', timestamptz '2026-07-18 09:00 Europe/London', timestamptz '2026-09-02 17:00 Europe/London', 'Both', 'Norfolk model dates. Confirm the school-specific calendar and INSET days.', v_user, v_user),
    (v_household, v_child, 'Norfolk autumn half-term', 'Holiday', timestamptz '2026-10-23 09:00 Europe/London', timestamptz '2026-10-30 17:00 Europe/London', 'Both', 'Norfolk model dates. Confirm the school-specific calendar.', v_user, v_user),
    (v_household, v_child, 'Norfolk Christmas holiday', 'Holiday', timestamptz '2026-12-21 09:00 Europe/London', timestamptz '2027-01-04 17:00 Europe/London', 'Both', 'Norfolk model dates. Confirm the school-specific calendar.', v_user, v_user),
    (v_household, v_child, 'Norfolk spring half-term', 'Holiday', timestamptz '2027-02-15 09:00 Europe/London', timestamptz '2027-02-19 17:00 Europe/London', 'Both', 'Norfolk model dates. Confirm the school-specific calendar.', v_user, v_user),
    (v_household, v_child, 'Norfolk Easter holiday', 'Holiday', timestamptz '2027-03-26 09:00 Europe/London', timestamptz '2027-04-12 17:00 Europe/London', 'Both', 'Norfolk model dates. Confirm the school-specific calendar.', v_user, v_user),
    (v_household, v_child, 'Norfolk summer half-term', 'Holiday', timestamptz '2027-05-31 09:00 Europe/London', timestamptz '2027-06-04 17:00 Europe/London', 'Both', 'Norfolk model dates. Confirm the school-specific calendar.', v_user, v_user),
    (v_household, v_child, 'Norfolk summer holiday', 'Holiday', timestamptz '2027-07-22 09:00 Europe/London', timestamptz '2027-09-05 17:00 Europe/London', 'Both', 'Norfolk model dates. Confirm the school-specific calendar and INSET days.', v_user, v_user),
    (v_household, v_child, 'Norfolk autumn half-term', 'Holiday', timestamptz '2027-10-25 09:00 Europe/London', timestamptz '2027-10-29 17:00 Europe/London', 'Both', 'Norfolk model dates. Confirm the school-specific calendar.', v_user, v_user),
    (v_household, v_child, 'Norfolk Christmas holiday', 'Holiday', timestamptz '2027-12-20 09:00 Europe/London', timestamptz '2028-01-04 17:00 Europe/London', 'Both', 'Norfolk model dates. Confirm the school-specific calendar.', v_user, v_user),
    (v_household, v_child, 'Norfolk spring half-term', 'Holiday', timestamptz '2028-02-14 09:00 Europe/London', timestamptz '2028-02-18 17:00 Europe/London', 'Both', 'Norfolk model dates. Confirm the school-specific calendar.', v_user, v_user),
    (v_household, v_child, 'Norfolk Easter holiday', 'Holiday', timestamptz '2028-04-03 09:00 Europe/London', timestamptz '2028-04-18 17:00 Europe/London', 'Both', 'Norfolk model dates. Confirm the school-specific calendar.', v_user, v_user),
    (v_household, v_child, 'Norfolk summer half-term', 'Holiday', timestamptz '2028-05-29 09:00 Europe/London', timestamptz '2028-06-02 17:00 Europe/London', 'Both', 'Norfolk model dates. Confirm the school-specific calendar.', v_user, v_user);

  insert into public.activity_log (household_id, actor_id, action, entity_type, entity_id, summary)
  values (v_household, v_user, 'created', 'household', v_household::text, 'Created the HomeBridge household.');

  return query select v_household, v_child;
end;
$$;

create or replace function public.create_household_invite(p_household_id uuid, p_parent_label text default null)
returns table (invite_code text, expires_at timestamptz)
language plpgsql security definer set search_path = public
as $$
declare
  v_code text;
  v_expiry timestamptz := now() + interval '7 days';
begin
  if not public.is_household_editor(p_household_id) then raise exception 'You cannot invite members to this household.'; end if;
  v_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));
  insert into public.household_invites (household_id, code_hash, intended_parent_label, created_by, expires_at)
  values (p_household_id, encode(digest(v_code, 'sha256'), 'hex'), nullif(trim(p_parent_label), ''), auth.uid(), v_expiry);
  return query select v_code, v_expiry;
end;
$$;

create or replace function public.join_household_by_code(p_invite_code text, p_display_name text, p_parent_label text)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_invite public.household_invites%rowtype;
begin
  if v_user is null then raise exception 'You must be signed in.'; end if;
  if coalesce(trim(p_display_name), '') = '' then raise exception 'Your display name is required.'; end if;
  if p_parent_label not in ('Dad','Mum') then raise exception 'Parent label must be Dad or Mum.'; end if;
  if exists (select 1 from public.household_members where user_id = v_user) then
    raise exception 'This account already belongs to a HomeBridge household.';
  end if;

  select * into v_invite from public.household_invites
  where code_hash = encode(digest(upper(trim(p_invite_code)), 'sha256'), 'hex')
    and accepted_at is null and expires_at > now()
  for update;
  if not found then raise exception 'That invite code is invalid, expired or already used.'; end if;

  insert into public.household_members (household_id, user_id, role, display_name, parent_label)
  values (v_invite.household_id, v_user, 'parent', trim(p_display_name), p_parent_label);
  update public.profiles set display_name = trim(p_display_name) where id = v_user;
  update public.household_invites set accepted_by = v_user, accepted_at = now() where id = v_invite.id;
  insert into public.activity_log (household_id, actor_id, action, entity_type, entity_id, summary)
  values (v_invite.household_id, v_user, 'joined', 'household', v_invite.household_id::text, trim(p_display_name) || ' joined the household.');
  return v_invite.household_id;
end;
$$;

create or replace function public.complete_handover(p_handover_id uuid)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_handover public.handovers%rowtype;
  v_next_handover uuid;
  v_next_parent text;
begin
  select * into v_handover from public.handovers where id = p_handover_id for update;
  if not found then raise exception 'Handover not found.'; end if;
  if not public.is_household_editor(v_handover.household_id) then raise exception 'You cannot complete this handover.'; end if;
  if v_handover.completed_at is not null then raise exception 'This handover has already been completed.'; end if;
  if exists (select 1 from public.handover_items where handover_id = p_handover_id and is_essential and not is_done) then
    raise exception 'All essential items must be confirmed first.';
  end if;

  update public.items i
  set current_location = v_handover.to_household_label,
      needed_at = null,
      updated_by = auth.uid()
  where i.id in (
    select hi.item_id from public.handover_items hi
    where hi.handover_id = p_handover_id and hi.is_done and hi.item_id is not null
  );

  update public.handovers
  set completed_at = now(), completed_by = auth.uid()
  where id = p_handover_id;

  update public.children
  set current_household_label = v_handover.to_household_label
  where id = v_handover.child_id;

  v_next_parent := case when lower(v_handover.from_household_label) like '%mum%' then 'Mum' else 'Dad' end;
  insert into public.handovers (household_id, child_id, starts_at, from_household_label, to_household_label, pickup_parent_label, pickup_location)
  values (v_handover.household_id, v_handover.child_id, ((v_handover.starts_at at time zone 'Europe/London') + interval '7 days') at time zone 'Europe/London', v_handover.to_household_label, v_handover.from_household_label, v_next_parent, v_handover.pickup_location)
  returning id into v_next_handover;

  insert into public.handover_items (handover_id, item_id, label, sort_order, is_essential)
  select v_next_handover, item_id, label, sort_order, is_essential
  from public.handover_items where handover_id = p_handover_id order by sort_order;

  insert into public.activity_log (household_id, actor_id, action, entity_type, entity_id, summary)
  values (v_handover.household_id, auth.uid(), 'completed', 'handover', p_handover_id::text, 'Completed handover to ' || v_handover.to_household_label || '.');

  return v_next_handover;
end;
$$;

revoke all on function public.create_household_with_child(text,text,text,text) from public;
revoke all on function public.create_household_invite(uuid,text) from public;
revoke all on function public.join_household_by_code(text,text,text) from public;
revoke all on function public.complete_handover(uuid) from public;
grant execute on function public.create_household_with_child(text,text,text,text) to authenticated;
grant execute on function public.create_household_invite(uuid,text) to authenticated;
grant execute on function public.join_household_by_code(text,text,text) to authenticated;
grant execute on function public.complete_handover(uuid) to authenticated;

alter table public.profiles enable row level security;
alter table public.households enable row level security;
alter table public.household_members enable row level security;
alter table public.household_invites enable row level security;
alter table public.children enable row level security;
alter table public.care_schedule_rules enable row level security;
alter table public.calendar_events enable row level security;
alter table public.event_acknowledgements enable row level security;
alter table public.items enable row level security;
alter table public.handovers enable row level security;
alter table public.handover_items enable row level security;
alter table public.medical_items enable row level security;
alter table public.activity_log enable row level security;

create policy profiles_select_own on public.profiles for select using (id = auth.uid());
create policy profiles_update_own on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());

create policy households_select_members on public.households for select using (public.is_household_member(id));
create policy households_update_owner on public.households for update using (public.is_household_owner(id)) with check (public.is_household_owner(id));

create policy members_select_household on public.household_members for select using (user_id = auth.uid() or public.is_household_member(household_id));
create policy members_update_owner on public.household_members for update using (public.is_household_owner(household_id)) with check (public.is_household_owner(household_id));
create policy members_delete_owner on public.household_members for delete using (public.is_household_owner(household_id) and role <> 'owner');

create policy invites_select_editors on public.household_invites for select using (public.is_household_editor(household_id));
create policy invites_delete_editors on public.household_invites for delete using (public.is_household_editor(household_id));

create policy children_select_members on public.children for select using (public.is_household_member(household_id));
create policy children_insert_editors on public.children for insert with check (public.is_household_editor(household_id));
create policy children_update_editors on public.children for update using (public.is_household_editor(household_id)) with check (public.is_household_editor(household_id));
create policy children_delete_editors on public.children for delete using (public.is_household_editor(household_id));

create policy schedule_select_members on public.care_schedule_rules for select using (public.is_household_member(household_id));
create policy schedule_insert_editors on public.care_schedule_rules for insert with check (public.is_household_editor(household_id));
create policy schedule_update_editors on public.care_schedule_rules for update using (public.is_household_editor(household_id)) with check (public.is_household_editor(household_id));
create policy schedule_delete_editors on public.care_schedule_rules for delete using (public.is_household_editor(household_id));

create policy events_select_members on public.calendar_events for select using (public.is_household_member(household_id));
create policy events_insert_editors on public.calendar_events for insert with check (public.is_household_editor(household_id) and created_by = auth.uid() and updated_by = auth.uid());
create policy events_update_editors on public.calendar_events for update using (public.is_household_editor(household_id)) with check (public.is_household_editor(household_id) and updated_by = auth.uid());
create policy events_delete_editors on public.calendar_events for delete using (public.is_household_editor(household_id));

create policy acknowledgements_select_members on public.event_acknowledgements for select using (
  exists (select 1 from public.calendar_events e where e.id = event_id and public.is_household_member(e.household_id))
);
create policy acknowledgements_insert_self on public.event_acknowledgements for insert with check (
  user_id = auth.uid() and exists (select 1 from public.calendar_events e where e.id = event_id and public.is_household_member(e.household_id))
);
create policy acknowledgements_update_self on public.event_acknowledgements for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy acknowledgements_delete_self on public.event_acknowledgements for delete using (user_id = auth.uid());

create policy items_select_members on public.items for select using (public.is_household_member(household_id));
create policy items_insert_editors on public.items for insert with check (public.is_household_editor(household_id) and updated_by = auth.uid());
create policy items_update_editors on public.items for update using (public.is_household_editor(household_id)) with check (public.is_household_editor(household_id) and updated_by = auth.uid());
create policy items_delete_editors on public.items for delete using (public.is_household_editor(household_id));

create policy handovers_select_members on public.handovers for select using (public.is_household_member(household_id));
create policy handovers_insert_editors on public.handovers for insert with check (public.is_household_editor(household_id));
create policy handovers_update_editors on public.handovers for update using (public.is_household_editor(household_id)) with check (public.is_household_editor(household_id));
create policy handovers_delete_editors on public.handovers for delete using (public.is_household_editor(household_id));

create policy handover_items_select_members on public.handover_items for select using (
  exists (select 1 from public.handovers h where h.id = handover_id and public.is_household_member(h.household_id))
);
create policy handover_items_insert_editors on public.handover_items for insert with check (
  exists (select 1 from public.handovers h where h.id = handover_id and public.is_household_editor(h.household_id))
);
create policy handover_items_update_editors on public.handover_items for update using (
  exists (select 1 from public.handovers h where h.id = handover_id and public.is_household_editor(h.household_id))
) with check (
  exists (select 1 from public.handovers h where h.id = handover_id and public.is_household_editor(h.household_id))
);
create policy handover_items_delete_editors on public.handover_items for delete using (
  exists (select 1 from public.handovers h where h.id = handover_id and public.is_household_editor(h.household_id))
);

create policy medical_select_members on public.medical_items for select using (public.is_household_member(household_id));
create policy medical_insert_editors on public.medical_items for insert with check (public.is_household_editor(household_id) and updated_by = auth.uid());
create policy medical_update_editors on public.medical_items for update using (public.is_household_editor(household_id)) with check (public.is_household_editor(household_id) and updated_by = auth.uid());
create policy medical_delete_editors on public.medical_items for delete using (public.is_household_editor(household_id));

create policy activity_select_members on public.activity_log for select using (public.is_household_member(household_id));
create policy activity_insert_self on public.activity_log for insert with check (public.is_household_member(household_id) and actor_id = auth.uid());

insert into storage.buckets (id, name, public) values ('household-private', 'household-private', false)
on conflict (id) do nothing;

create policy private_household_uploads on storage.objects for insert to authenticated with check (
  bucket_id = 'household-private' and public.is_household_editor(((storage.foldername(name))[1])::uuid)
);
create policy private_household_reads on storage.objects for select to authenticated using (
  bucket_id = 'household-private' and public.is_household_member(((storage.foldername(name))[1])::uuid)
);
create policy private_household_updates on storage.objects for update to authenticated using (
  bucket_id = 'household-private' and public.is_household_editor(((storage.foldername(name))[1])::uuid)
) with check (
  bucket_id = 'household-private' and public.is_household_editor(((storage.foldername(name))[1])::uuid)
);
create policy private_household_deletes on storage.objects for delete to authenticated using (
  bucket_id = 'household-private' and public.is_household_editor(((storage.foldername(name))[1])::uuid)
);

-- Add live-updating tables to Supabase Realtime without replacing any existing publication entries.
do $$
declare
  table_name text;
begin
  foreach table_name in array array['children','calendar_events','event_acknowledgements','items','handovers','handover_items','medical_items']
  loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = table_name
    ) then
      execute format('alter publication supabase_realtime add table public.%I', table_name);
    end if;
  end loop;
end $$;
-- HomeBridge v0.6.0 database patch
-- Safe to run once after the original four-part schema.

alter table public.medical_items
  add column if not exists notes text;

create or replace function public.create_household_invite_v2(
  p_household_id uuid,
  p_parent_label text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text;
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

  v_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));

  insert into public.household_invites (
    household_id,
    code_hash,
    intended_parent_label,
    created_by,
    expires_at
  )
  values (
    p_household_id,
    encode(digest(v_code, 'sha256'), 'hex'),
    nullif(trim(p_parent_label), ''),
    auth.uid(),
    v_expires_at
  );

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
    null,
    'Created a one-time household invitation.'
  );

  return jsonb_build_object(
    'invite_code', v_code,
    'expires_at', v_expires_at
  );
end;
$$;

revoke all
on function public.create_household_invite_v2(uuid, text)
from public;

grant execute
on function public.create_household_invite_v2(uuid, text)
to authenticated;

notify pgrst, 'reload schema';

-- ===== HomeBridge v0.7.0 additions =====

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
