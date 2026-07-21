-- HomeBridge v0.9.0 — safe-area communication and shared inbox

create table if not exists public.household_notifications (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  recipient_id uuid not null references auth.users(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  kind text not null check (kind in ('calendar','care_change','item_request','medical','member','handover','system')),
  title text not null,
  body text not null,
  entity_type text,
  entity_id text,
  target_tab text not null default 'today' check (target_tab in ('today','calendar','things','handover','child','inbox')),
  requires_action boolean not null default false,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists household_notifications_recipient_idx
  on public.household_notifications(recipient_id, created_at desc);
create index if not exists household_notifications_household_idx
  on public.household_notifications(household_id, created_at desc);

create table if not exists public.item_requests (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  child_id uuid not null references public.children(id) on delete cascade,
  item_id uuid not null references public.items(id) on delete cascade,
  requested_by uuid not null references auth.users(id) on delete cascade,
  note text,
  status text not null default 'pending' check (status in ('pending','packed','declined','cancelled')),
  responded_by uuid references auth.users(id) on delete set null,
  responded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists item_requests_household_idx
  on public.item_requests(household_id, created_at desc);
create unique index if not exists item_requests_one_pending_per_item_idx
  on public.item_requests(household_id, item_id)
  where status = 'pending';

drop trigger if exists item_requests_touch_updated_at on public.item_requests;
create trigger item_requests_touch_updated_at
before update on public.item_requests
for each row execute function public.touch_updated_at();

create or replace function public.homebridge_notify_user(
  p_household_id uuid,
  p_recipient_id uuid,
  p_actor_id uuid,
  p_kind text,
  p_title text,
  p_body text,
  p_entity_type text default null,
  p_entity_id text default null,
  p_target_tab text default 'today',
  p_requires_action boolean default false
)
returns void
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  if p_recipient_id is null or p_recipient_id = p_actor_id then
    return;
  end if;

  insert into public.household_notifications (
    household_id, recipient_id, actor_id, kind, title, body,
    entity_type, entity_id, target_tab, requires_action
  )
  values (
    p_household_id, p_recipient_id, p_actor_id, p_kind, p_title, p_body,
    p_entity_type, p_entity_id, p_target_tab, p_requires_action
  );
end;
$$;

create or replace function public.homebridge_notify_members(
  p_household_id uuid,
  p_actor_id uuid,
  p_kind text,
  p_title text,
  p_body text,
  p_entity_type text default null,
  p_entity_id text default null,
  p_target_tab text default 'today',
  p_requires_action boolean default false
)
returns void
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_recipient uuid;
begin
  for v_recipient in
    select hm.user_id
    from public.household_members hm
    where hm.household_id = p_household_id
      and hm.user_id <> p_actor_id
  loop
    perform public.homebridge_notify_user(
      p_household_id, v_recipient, p_actor_id, p_kind, p_title, p_body,
      p_entity_type, p_entity_id, p_target_tab, p_requires_action
    );
  end loop;
end;
$$;

create or replace function public.notify_calendar_event_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  perform public.homebridge_notify_members(
    new.household_id, new.updated_by, 'calendar',
    case when tg_op = 'INSERT' then 'New calendar event' else 'Calendar event updated' end,
    new.title || case when new.location is null then '' else ' · ' || new.location end,
    'calendar_event', new.id::text, 'calendar', false
  );
  return new;
end;
$$;

drop trigger if exists calendar_events_homebridge_notify on public.calendar_events;
create trigger calendar_events_homebridge_notify
after insert or update on public.calendar_events
for each row execute function public.notify_calendar_event_change();

create or replace function public.notify_medical_item_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  perform public.homebridge_notify_members(
    new.household_id, new.updated_by, 'medical',
    case when tg_op = 'INSERT' then 'Medical item added' else 'Medical item updated' end,
    new.name || ' at ' || new.location,
    'medical_item', new.id::text, 'child', false
  );
  return new;
end;
$$;

drop trigger if exists medical_items_homebridge_notify on public.medical_items;
create trigger medical_items_homebridge_notify
after insert or update on public.medical_items
for each row execute function public.notify_medical_item_change();

create or replace function public.notify_care_change_event()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  if tg_op = 'INSERT' then
    perform public.homebridge_notify_members(
      new.household_id, new.requested_by, 'care_change',
      'Care change needs your reply',
      'A temporary arrangement has been proposed for ' || new.starts_on::text ||
        case when new.ends_on = new.starts_on then '' else ' to ' || new.ends_on::text end || '.',
      'care_change_request', new.id::text, 'calendar', true
    );
  elsif old.status is distinct from new.status then
    perform public.homebridge_notify_user(
      new.household_id, new.requested_by, new.responded_by, 'care_change',
      case new.status
        when 'accepted' then 'Care change accepted'
        when 'rejected' then 'Care change declined'
        when 'cancelled' then 'Care change cancelled'
        else 'Care change updated'
      end,
      'The proposed arrangement for ' || new.starts_on::text || ' is now ' || new.status || '.',
      'care_change_request', new.id::text, 'calendar', false
    );
  end if;
  return new;
end;
$$;

drop trigger if exists care_changes_homebridge_notify on public.care_change_requests;
create trigger care_changes_homebridge_notify
after insert or update on public.care_change_requests
for each row execute function public.notify_care_change_event();

create or replace function public.notify_household_join()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  perform public.homebridge_notify_members(
    new.household_id, new.user_id, 'member',
    'Household member joined',
    new.display_name || ' joined HomeBridge as ' || coalesce(new.parent_label, new.role) || '.',
    'household_member', new.user_id::text, 'child', false
  );
  return new;
end;
$$;

drop trigger if exists household_members_homebridge_notify on public.household_members;
create trigger household_members_homebridge_notify
after insert on public.household_members
for each row execute function public.notify_household_join();

create or replace function public.notify_item_request_event()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_item_name text;
begin
  select name into v_item_name from public.items where id = new.item_id;

  if tg_op = 'INSERT' then
    perform public.homebridge_notify_members(
      new.household_id, new.requested_by, 'item_request',
      'Item requested for handover',
      coalesce(v_item_name, 'A tracked item') || ' is needed for the next handover.',
      'item_request', new.id::text, 'inbox', true
    );
  elsif old.status is distinct from new.status then
    perform public.homebridge_notify_user(
      new.household_id, new.requested_by, new.responded_by, 'item_request',
      case new.status
        when 'packed' then 'Item added to handover'
        when 'declined' then 'Item is not available'
        when 'cancelled' then 'Item request cancelled'
        else 'Item request updated'
      end,
      coalesce(v_item_name, 'The requested item') || ' is now marked ' || new.status || '.',
      'item_request', new.id::text, 'inbox', false
    );
  end if;
  return new;
end;
$$;

drop trigger if exists item_requests_homebridge_notify on public.item_requests;
create trigger item_requests_homebridge_notify
after insert or update on public.item_requests
for each row execute function public.notify_item_request_event();

create or replace function public.create_item_request(
  p_item_id uuid,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_user uuid := auth.uid();
  v_item public.items%rowtype;
  v_request uuid;
begin
  if v_user is null then raise exception 'You must be signed in.'; end if;

  select * into v_item from public.items where id = p_item_id;
  if not found then raise exception 'Item not found.'; end if;
  if not public.is_household_member(v_item.household_id) then
    raise exception 'You cannot request this item.';
  end if;
  if not exists (
    select 1 from public.household_members hm
    where hm.household_id = v_item.household_id and hm.user_id <> v_user
  ) then
    raise exception 'Invite the other parent before requesting an item.';
  end if;

  insert into public.item_requests (
    household_id, child_id, item_id, requested_by, note
  ) values (
    v_item.household_id, v_item.child_id, v_item.id, v_user, nullif(trim(p_note), '')
  ) returning id into v_request;

  insert into public.activity_log (household_id, actor_id, action, entity_type, entity_id, summary)
  values (v_item.household_id, v_user, 'requested', 'item', v_item.id::text,
    'Requested ' || v_item.name || ' for the next handover.');

  return v_request;
exception
  when unique_violation then
    raise exception 'This item already has a pending request.';
end;
$$;

create or replace function public.respond_item_request(
  p_request_id uuid,
  p_status text
)
returns void
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_user uuid := auth.uid();
  v_request public.item_requests%rowtype;
  v_item public.items%rowtype;
  v_handover uuid;
begin
  if v_user is null then raise exception 'You must be signed in.'; end if;
  if p_status not in ('packed','declined','cancelled') then
    raise exception 'Invalid item request response.';
  end if;

  select * into v_request from public.item_requests where id = p_request_id for update;
  if not found then raise exception 'Item request not found.'; end if;
  if not public.is_household_member(v_request.household_id) then
    raise exception 'You cannot respond to this request.';
  end if;
  if v_request.status <> 'pending' then raise exception 'This request has already been answered.'; end if;
  if p_status = 'cancelled' and v_request.requested_by <> v_user then
    raise exception 'Only the requester can cancel this request.';
  end if;
  if p_status in ('packed','declined') and v_request.requested_by = v_user then
    raise exception 'The other parent must answer this request.';
  end if;

  select * into v_item from public.items where id = v_request.item_id;

  if p_status = 'packed' then
    select id into v_handover
    from public.handovers
    where household_id = v_request.household_id and completed_at is null
    order by starts_at
    limit 1;

    if v_handover is null then
      raise exception 'No upcoming handover is available.';
    end if;

    insert into public.handover_items (handover_id, item_id, label, sort_order, is_essential)
    select v_handover, v_item.id, v_item.name,
      coalesce((select max(sort_order) + 10 from public.handover_items where handover_id = v_handover), 10),
      false
    where not exists (
      select 1 from public.handover_items
      where handover_id = v_handover and item_id = v_item.id
    );

    update public.items
    set needed_at = 'Handover bag', updated_by = v_user
    where id = v_item.id;
  end if;

  update public.item_requests
  set status = p_status, responded_by = v_user, responded_at = now()
  where id = p_request_id;

  insert into public.activity_log (household_id, actor_id, action, entity_type, entity_id, summary)
  values (v_request.household_id, v_user, p_status, 'item_request', p_request_id::text,
    coalesce(v_item.name, 'Item') || ' request marked ' || p_status || '.');
end;
$$;


revoke all on function public.homebridge_notify_user(uuid, uuid, uuid, text, text, text, text, text, text, boolean) from public, anon, authenticated;
revoke all on function public.homebridge_notify_members(uuid, uuid, text, text, text, text, text, text, boolean) from public, anon, authenticated;
revoke all on function public.notify_calendar_event_change() from public, anon, authenticated;
revoke all on function public.notify_medical_item_change() from public, anon, authenticated;
revoke all on function public.notify_care_change_event() from public, anon, authenticated;
revoke all on function public.notify_household_join() from public, anon, authenticated;
revoke all on function public.notify_item_request_event() from public, anon, authenticated;

revoke all on function public.create_item_request(uuid, text) from public;
revoke all on function public.respond_item_request(uuid, text) from public;
grant execute on function public.create_item_request(uuid, text) to authenticated;
grant execute on function public.respond_item_request(uuid, text) to authenticated;

alter table public.household_notifications enable row level security;
alter table public.item_requests enable row level security;

drop policy if exists notifications_select_recipient on public.household_notifications;
create policy notifications_select_recipient
on public.household_notifications for select
using (recipient_id = auth.uid());

drop policy if exists notifications_update_recipient on public.household_notifications;
create policy notifications_update_recipient
on public.household_notifications for update
using (recipient_id = auth.uid())
with check (recipient_id = auth.uid());

drop policy if exists notifications_delete_recipient on public.household_notifications;
create policy notifications_delete_recipient
on public.household_notifications for delete
using (recipient_id = auth.uid());

drop policy if exists item_requests_select_members on public.item_requests;
create policy item_requests_select_members
on public.item_requests for select
using (public.is_household_member(household_id));

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'household_notifications'
  ) then
    alter publication supabase_realtime add table public.household_notifications;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'item_requests'
  ) then
    alter publication supabase_realtime add table public.item_requests;
  end if;
end;
$$;

notify pgrst, 'reload schema';
