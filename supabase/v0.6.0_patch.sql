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
