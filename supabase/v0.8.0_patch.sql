-- HomeBridge v0.8.0 database patch
-- Date engine guard + two-parent care-change approval workflow.
-- Run once after v0.7.0.

create or replace function public.normalise_care_schedule_start()
returns trigger
language plpgsql
set search_path = public, pg_catalog
as $fn$
declare
  v_shift integer;
begin
  if new.recurrence_rule like '%BYDAY=TU%' then
    v_shift := (2 - extract(dow from new.starts_on)::integer + 7) % 7;
    new.starts_on := new.starts_on + v_shift;
  end if;
  return new;
end;
$fn$;

drop trigger if exists care_schedule_normalise_start
on public.care_schedule_rules;

create trigger care_schedule_normalise_start
before insert or update on public.care_schedule_rules
for each row execute function public.normalise_care_schedule_start();

-- HomeBridge handovers happen every Tuesday; the household alternates each week.
update public.care_schedule_rules
set recurrence_rule = 'FREQ=WEEKLY;INTERVAL=1;BYDAY=TU'
where recurrence_rule like '%BYDAY=TU%'
  and recurrence_rule <> 'FREQ=WEEKLY;INTERVAL=1;BYDAY=TU';

-- Correct any existing rule whose saved anchor landed on Monday or another day.
update public.care_schedule_rules
set starts_on = starts_on + ((2 - extract(dow from starts_on)::integer + 7) % 7)
where recurrence_rule like '%BYDAY=TU%'
  and extract(dow from starts_on)::integer <> 2;

create table if not exists public.care_change_requests (
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
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'rejected', 'cancelled')),
  requested_by uuid not null references auth.users(id),
  requested_by_name text not null,
  responded_by uuid references auth.users(id),
  responded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_on >= starts_on)
);

create index if not exists care_change_requests_household_status_idx
  on public.care_change_requests(household_id, status, created_at desc);

create index if not exists care_change_requests_dates_idx
  on public.care_change_requests(household_id, starts_on, ends_on);

drop trigger if exists care_change_requests_touch_updated_at
on public.care_change_requests;

create trigger care_change_requests_touch_updated_at
before update on public.care_change_requests
for each row execute function public.touch_updated_at();

alter table public.care_change_requests enable row level security;

drop policy if exists care_change_requests_select_members
on public.care_change_requests;
create policy care_change_requests_select_members
on public.care_change_requests
for select
using (public.is_household_member(household_id));

-- Writes are deliberately limited to security-definer RPCs.

create or replace function public.propose_care_change(
  p_household_id uuid,
  p_child_id uuid,
  p_starts_on date,
  p_ends_on date,
  p_household_label text,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_catalog
as $fn$
declare
  v_user uuid := auth.uid();
  v_name text;
  v_request_id uuid;
begin
  if v_user is null then
    raise exception 'You must be signed in.';
  end if;

  if not public.is_household_editor(p_household_id) then
    raise exception 'You cannot propose a change for this household.';
  end if;

  if p_ends_on < p_starts_on then
    raise exception 'The end date must be on or after the start date.';
  end if;

  if p_household_label not in ('Dad''s house', 'Mum''s house') then
    raise exception 'Choose Dad''s house or Mum''s house.';
  end if;

  if not exists (
    select 1 from public.children c
    where c.id = p_child_id
      and c.household_id = p_household_id
  ) then
    raise exception 'Child does not belong to this household.';
  end if;

  select hm.display_name
  into v_name
  from public.household_members hm
  where hm.household_id = p_household_id
    and hm.user_id = v_user;

  if exists (
    select 1
    from public.care_change_requests r
    where r.household_id = p_household_id
      and r.status = 'pending'
      and p_starts_on <= r.ends_on
      and p_ends_on >= r.starts_on
  ) then
    raise exception 'A pending care change already overlaps these dates.';
  end if;

  insert into public.care_change_requests (
    household_id,
    child_id,
    starts_on,
    ends_on,
    household_label,
    note,
    requested_by,
    requested_by_name
  )
  values (
    p_household_id,
    p_child_id,
    p_starts_on,
    p_ends_on,
    p_household_label,
    nullif(trim(p_note), ''),
    v_user,
    coalesce(v_name, 'Parent')
  )
  returning id into v_request_id;

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
    v_user,
    'proposed',
    'care_change_request',
    v_request_id::text,
    'Proposed a temporary care change.'
  );

  return v_request_id;
end;
$fn$;

create or replace function public.respond_care_change(
  p_request_id uuid,
  p_decision text
)
returns void
language plpgsql
security definer
set search_path = public, pg_catalog
as $fn$
declare
  v_user uuid := auth.uid();
  v_request public.care_change_requests%rowtype;
  v_override_id uuid;
begin
  if v_user is null then
    raise exception 'You must be signed in.';
  end if;

  if p_decision not in ('accepted', 'rejected') then
    raise exception 'Decision must be accepted or rejected.';
  end if;

  select *
  into v_request
  from public.care_change_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception 'Care change request not found.';
  end if;

  if not public.is_household_editor(v_request.household_id) then
    raise exception 'You cannot respond to this care change.';
  end if;

  if v_request.status <> 'pending' then
    raise exception 'This care change has already been decided.';
  end if;

  if v_request.requested_by = v_user then
    raise exception 'The other parent must accept or reject this change.';
  end if;

  if p_decision = 'accepted' then
    if exists (
      select 1
      from public.care_overrides o
      where o.household_id = v_request.household_id
        and v_request.starts_on <= o.ends_on
        and v_request.ends_on >= o.starts_on
    ) then
      raise exception 'An accepted care change already overlaps these dates.';
    end if;

    insert into public.care_overrides (
      household_id,
      child_id,
      starts_on,
      ends_on,
      household_label,
      note,
      created_by,
      updated_by
    )
    values (
      v_request.household_id,
      v_request.child_id,
      v_request.starts_on,
      v_request.ends_on,
      v_request.household_label,
      v_request.note,
      v_request.requested_by,
      v_user
    )
    returning id into v_override_id;
  end if;

  update public.care_change_requests
  set
    status = p_decision,
    responded_by = v_user,
    responded_at = now()
  where id = p_request_id;

  insert into public.activity_log (
    household_id,
    actor_id,
    action,
    entity_type,
    entity_id,
    summary
  )
  values (
    v_request.household_id,
    v_user,
    p_decision,
    'care_change_request',
    p_request_id::text,
    case
      when p_decision = 'accepted' then 'Accepted a temporary care change.'
      else 'Rejected a temporary care change.'
    end
  );
end;
$fn$;

create or replace function public.cancel_care_change(
  p_request_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, pg_catalog
as $fn$
declare
  v_user uuid := auth.uid();
  v_request public.care_change_requests%rowtype;
begin
  select *
  into v_request
  from public.care_change_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception 'Care change request not found.';
  end if;

  if v_request.status <> 'pending' then
    raise exception 'Only pending requests can be cancelled.';
  end if;

  if v_request.requested_by <> v_user
    and not public.is_household_owner(v_request.household_id)
  then
    raise exception 'Only the requester or household owner can cancel this change.';
  end if;

  update public.care_change_requests
  set status = 'cancelled'
  where id = p_request_id;

  insert into public.activity_log (
    household_id,
    actor_id,
    action,
    entity_type,
    entity_id,
    summary
  )
  values (
    v_request.household_id,
    v_user,
    'cancelled',
    'care_change_request',
    p_request_id::text,
    'Cancelled a temporary care change request.'
  );
end;
$fn$;

revoke all on function public.propose_care_change(uuid, uuid, date, date, text, text) from public;
revoke all on function public.respond_care_change(uuid, text) from public;
revoke all on function public.cancel_care_change(uuid) from public;

grant execute on function public.propose_care_change(uuid, uuid, date, date, text, text) to authenticated;
grant execute on function public.respond_care_change(uuid, text) to authenticated;
grant execute on function public.cancel_care_change(uuid) to authenticated;

do $block$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'care_change_requests'
  ) then
    alter publication supabase_realtime
      add table public.care_change_requests;
  end if;
end;
$block$;

notify pgrst, 'reload schema';
