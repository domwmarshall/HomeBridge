-- HomeBridge v1.0.0 — reliable invitations, parent messaging and navigation-safe communication

-- Ensure the hashing helper exists even if an earlier invite hotfix was skipped.
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

create or replace function public.homebridge_invite_hash(p_code text)
returns text
language sql
immutable
security definer
set search_path = public, extensions, pg_catalog
as $$
  select encode(
    digest(upper(trim(p_code))::text, 'sha256'::text),
    'hex'
  );
$$;

-- Keep an active one-time code visible to authorised household editors until it is used,
-- revoked or expires. It remains protected by the existing household_invites RLS policies.
alter table public.household_invites
  add column if not exists display_code text;

-- Existing installations already have revoked_at from v0.7, but keep this migration idempotent.
alter table public.household_invites
  add column if not exists revoked_at timestamptz;

-- Allow message alerts in the existing shared inbox notification table.
alter table public.household_notifications
  drop constraint if exists household_notifications_kind_check;

alter table public.household_notifications
  add constraint household_notifications_kind_check
  check (kind in (
    'calendar','care_change','item_request','medical','member','handover','system','message'
  ));

-- Household message thread. Deleted messages retain an audit-safe tombstone rather than
-- disappearing from the conversation.
create table if not exists public.household_messages (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  body text,
  reply_to_id uuid references public.household_messages(id) on delete set null,
  attachment_path text,
  attachment_name text,
  attachment_mime_type text,
  context_type text check (context_type is null or context_type in (
    'calendar_event','item','handover','medical_item','care_change_request'
  )),
  context_id text,
  context_label text,
  client_id text,
  created_at timestamptz not null default now(),
  edited_at timestamptz,
  deleted_at timestamptz,
  constraint household_messages_content_check
    check (
      deleted_at is not null
      or nullif(trim(coalesce(body, '')), '') is not null
      or attachment_path is not null
      or context_id is not null
    )
);

create index if not exists household_messages_household_created_idx
  on public.household_messages(household_id, created_at desc);

create unique index if not exists household_messages_client_id_idx
  on public.household_messages(household_id, sender_id, client_id)
  where client_id is not null;

create table if not exists public.household_message_reads (
  message_id uuid not null references public.household_messages(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (message_id, user_id)
);

create index if not exists household_message_reads_user_idx
  on public.household_message_reads(user_id, read_at desc);

alter table public.household_messages enable row level security;
alter table public.household_message_reads enable row level security;

drop policy if exists messages_select_members on public.household_messages;
create policy messages_select_members
on public.household_messages
for select
using (public.is_household_member(household_id));

drop policy if exists messages_insert_members on public.household_messages;
create policy messages_insert_members
on public.household_messages
for insert
with check (
  public.is_household_editor(household_id)
  and sender_id = auth.uid()
);

drop policy if exists messages_update_sender on public.household_messages;

drop policy if exists message_reads_select_members on public.household_message_reads;
create policy message_reads_select_members
on public.household_message_reads
for select
using (
  exists (
    select 1
    from public.household_messages m
    where m.id = message_id
      and public.is_household_member(m.household_id)
  )
);

drop policy if exists message_reads_insert_self on public.household_message_reads;
create policy message_reads_insert_self
on public.household_message_reads
for insert
with check (
  user_id = auth.uid()
  and exists (
    select 1
    from public.household_messages m
    where m.id = message_id
      and public.is_household_member(m.household_id)
  )
);

drop policy if exists message_reads_update_self on public.household_message_reads;
create policy message_reads_update_self
on public.household_message_reads
for update
using (user_id = auth.uid())
with check (user_id = auth.uid());

-- Stable v4 invite function. The app can display an active code after a refresh without
-- regenerating it, while the joining flow still validates the SHA-256 hash.
create or replace function public.create_household_invite_v4(
  p_household_id uuid,
  p_parent_label text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_catalog
as $$
declare
  v_user uuid := auth.uid();
  v_code text;
  v_invite_id uuid;
  v_expires_at timestamptz := now() + interval '7 days';
begin
  if v_user is null then
    raise exception 'You must be signed in.';
  end if;

  if not public.is_household_editor(p_household_id) then
    raise exception 'You cannot invite members to this household.';
  end if;

  if p_parent_label is not null and p_parent_label not in ('Dad','Mum') then
    raise exception 'Parent label must be Dad or Mum.';
  end if;

  if p_parent_label is not null and exists (
    select 1
    from public.household_members hm
    where hm.household_id = p_household_id
      and hm.parent_label = p_parent_label
  ) then
    raise exception 'That parent role is already connected to this household.';
  end if;

  -- Revoke older unused codes for the same role so there is one clear active invite.
  update public.household_invites
  set revoked_at = now(), display_code = null
  where household_id = p_household_id
    and accepted_at is null
    and revoked_at is null
    and expires_at > now()
    and intended_parent_label is not distinct from nullif(trim(p_parent_label), '');

  v_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));

  insert into public.household_invites (
    household_id,
    code_hash,
    display_code,
    intended_parent_label,
    created_by,
    expires_at
  )
  values (
    p_household_id,
    public.homebridge_invite_hash(v_code),
    v_code,
    nullif(trim(p_parent_label), ''),
    v_user,
    v_expires_at
  )
  returning id into v_invite_id;

  insert into public.activity_log (
    household_id, actor_id, action, entity_type, entity_id, summary
  ) values (
    p_household_id, v_user, 'created', 'household_invite', v_invite_id::text,
    'Created a one-time household invitation.'
  );

  return jsonb_build_object(
    'invite_id', v_invite_id,
    'invite_code', v_code,
    'expires_at', v_expires_at,
    'parent_label', nullif(trim(p_parent_label), '')
  );
end;
$$;

create or replace function public.revoke_household_invite(
  p_invite_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_invite public.household_invites%rowtype;
begin
  select * into v_invite
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
  set revoked_at = now(), display_code = null
  where id = p_invite_id;

  insert into public.activity_log (
    household_id, actor_id, action, entity_type, entity_id, summary
  ) values (
    v_invite.household_id, auth.uid(), 'revoked', 'household_invite', p_invite_id::text,
    'Revoked a household invitation.'
  );
end;
$$;

create or replace function public.join_household_by_code(
  p_invite_code text,
  p_display_name text,
  p_parent_label text
)
returns uuid
language plpgsql
security definer
set search_path = public, extensions, pg_catalog
as $$
declare
  v_user uuid := auth.uid();
  v_invite public.household_invites%rowtype;
begin
  if v_user is null then raise exception 'You must be signed in.'; end if;
  if coalesce(trim(p_display_name), '') = '' then raise exception 'Your display name is required.'; end if;
  if coalesce(trim(p_invite_code), '') = '' then raise exception 'An invite code is required.'; end if;
  if p_parent_label not in ('Dad','Mum') then raise exception 'Parent label must be Dad or Mum.'; end if;

  if exists (select 1 from public.household_members where user_id = v_user) then
    raise exception 'This account already belongs to a HomeBridge household.';
  end if;

  select * into v_invite
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
     and v_invite.intended_parent_label <> p_parent_label then
    raise exception 'This invitation was created for the other parent role.';
  end if;

  if exists (
    select 1 from public.household_members hm
    where hm.household_id = v_invite.household_id
      and hm.parent_label = p_parent_label
  ) then
    raise exception 'That parent role is already connected to this household.';
  end if;

  insert into public.household_members (
    household_id, user_id, role, display_name, parent_label
  ) values (
    v_invite.household_id, v_user, 'parent', trim(p_display_name), p_parent_label
  );

  update public.profiles set display_name = trim(p_display_name) where id = v_user;

  update public.household_invites
  set accepted_by = v_user,
      accepted_at = now(),
      display_code = null
  where id = v_invite.id;

  insert into public.activity_log (
    household_id, actor_id, action, entity_type, entity_id, summary
  ) values (
    v_invite.household_id, v_user, 'joined', 'household', v_invite.household_id::text,
    trim(p_display_name) || ' joined the household.'
  );

  return v_invite.household_id;
end;
$$;

-- Idempotent message sending. client_id prevents duplicate messages if a phone retries after
-- temporarily losing its connection.
create or replace function public.send_household_message(
  p_household_id uuid,
  p_body text default null,
  p_reply_to_id uuid default null,
  p_attachment_path text default null,
  p_attachment_name text default null,
  p_attachment_mime_type text default null,
  p_context_type text default null,
  p_context_id text default null,
  p_context_label text default null,
  p_client_id text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_user uuid := auth.uid();
  v_message_id uuid;
  v_display_name text;
begin
  if v_user is null then raise exception 'You must be signed in.'; end if;
  if not public.is_household_editor(p_household_id) then
    raise exception 'You cannot send messages in this household.';
  end if;
  if nullif(trim(coalesce(p_body, '')), '') is null
     and p_attachment_path is null
     and p_context_id is null then
    raise exception 'Write a message or attach something before sending.';
  end if;
  if p_attachment_path is not null
     and p_attachment_path not like p_household_id::text || '/messages/%' then
    raise exception 'The message attachment is not in this household.';
  end if;
  if p_reply_to_id is not null and not exists (
    select 1 from public.household_messages m
    where m.id = p_reply_to_id and m.household_id = p_household_id
  ) then
    raise exception 'The message you are replying to is not available.';
  end if;

  if p_client_id is not null then
    select id into v_message_id
    from public.household_messages
    where household_id = p_household_id
      and sender_id = v_user
      and client_id = p_client_id;
    if found then return v_message_id; end if;
  end if;

  insert into public.household_messages (
    household_id, sender_id, body, reply_to_id,
    attachment_path, attachment_name, attachment_mime_type,
    context_type, context_id, context_label, client_id
  ) values (
    p_household_id, v_user, nullif(trim(p_body), ''), p_reply_to_id,
    p_attachment_path, p_attachment_name, p_attachment_mime_type,
    p_context_type, p_context_id, nullif(trim(p_context_label), ''), p_client_id
  ) returning id into v_message_id;

  select display_name into v_display_name
  from public.household_members
  where household_id = p_household_id and user_id = v_user;

  perform public.homebridge_notify_members(
    p_household_id,
    v_user,
    'message',
    'New message from ' || coalesce(v_display_name, 'the other parent'),
    left(coalesce(nullif(trim(p_body), ''), 'Sent an attachment'), 180),
    'household_message',
    v_message_id::text,
    'inbox',
    false
  );

  insert into public.activity_log (
    household_id, actor_id, action, entity_type, entity_id, summary
  ) values (
    p_household_id, v_user, 'sent', 'household_message', v_message_id::text,
    'Sent a household message.'
  );

  return v_message_id;
end;
$$;

create or replace function public.edit_household_message(
  p_message_id uuid,
  p_body text
)
returns void
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_message public.household_messages%rowtype;
begin
  select * into v_message
  from public.household_messages
  where id = p_message_id
  for update;

  if not found then raise exception 'Message not found.'; end if;
  if v_message.sender_id <> auth.uid() then raise exception 'You can only edit your own message.'; end if;
  if v_message.deleted_at is not null then raise exception 'A removed message cannot be edited.'; end if;
  if v_message.created_at < now() - interval '30 minutes' then
    raise exception 'Messages can be edited for 30 minutes after sending.';
  end if;
  if nullif(trim(coalesce(p_body, '')), '') is null
     and v_message.attachment_path is null
     and v_message.context_id is null then
    raise exception 'The message cannot be empty.';
  end if;

  update public.household_messages
  set body = nullif(trim(p_body), ''), edited_at = now()
  where id = p_message_id;
end;
$$;

create or replace function public.remove_household_message(
  p_message_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_message public.household_messages%rowtype;
begin
  select * into v_message
  from public.household_messages
  where id = p_message_id
  for update;

  if not found then raise exception 'Message not found.'; end if;
  if v_message.sender_id <> auth.uid() then raise exception 'You can only remove your own message.'; end if;

  update public.household_messages
  set body = null,
      attachment_path = null,
      attachment_name = null,
      attachment_mime_type = null,
      context_type = null,
      context_id = null,
      context_label = null,
      deleted_at = coalesce(deleted_at, now()),
      edited_at = null
  where id = p_message_id;
end;
$$;

create or replace function public.mark_household_messages_read(
  p_household_id uuid,
  p_message_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  if auth.uid() is null then raise exception 'You must be signed in.'; end if;
  if not public.is_household_member(p_household_id) then
    raise exception 'You cannot read messages in this household.';
  end if;

  insert into public.household_message_reads(message_id, user_id, read_at)
  select m.id, auth.uid(), now()
  from public.household_messages m
  where m.household_id = p_household_id
    and m.id = any(p_message_ids)
    and m.sender_id <> auth.uid()
  on conflict (message_id, user_id)
  do update set read_at = excluded.read_at;
end;
$$;

revoke all on function public.create_household_invite_v4(uuid, text) from public;
revoke all on function public.revoke_household_invite(uuid) from public;
revoke all on function public.join_household_by_code(text, text, text) from public;
revoke all on function public.send_household_message(uuid, text, uuid, text, text, text, text, text, text, text) from public;
revoke all on function public.edit_household_message(uuid, text) from public;
revoke all on function public.remove_household_message(uuid) from public;
revoke all on function public.mark_household_messages_read(uuid, uuid[]) from public;

grant execute on function public.create_household_invite_v4(uuid, text) to authenticated;
grant execute on function public.revoke_household_invite(uuid) to authenticated;
grant execute on function public.join_household_by_code(text, text, text) to authenticated;
grant execute on function public.send_household_message(uuid, text, uuid, text, text, text, text, text, text, text) to authenticated;
grant execute on function public.edit_household_message(uuid, text) to authenticated;
grant execute on function public.remove_household_message(uuid) to authenticated;
grant execute on function public.mark_household_messages_read(uuid, uuid[]) to authenticated;

-- Publish live message changes to connected phones.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'household_messages'
  ) then
    alter publication supabase_realtime add table public.household_messages;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'household_message_reads'
  ) then
    alter publication supabase_realtime add table public.household_message_reads;
  end if;
end;
$$;

notify pgrst, 'reload schema';
