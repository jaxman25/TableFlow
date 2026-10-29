-- Audit writes from server actions.
--
-- `authenticated` has no INSERT privilege on audit_logs, so privileged changes
-- record their trail through this narrowly scoped function. The actor is always
-- the caller (never client-supplied), and only owners/managers of the restaurant
-- may append entries.

create or replace function public.write_audit(
  p_restaurant_id uuid,
  p_action text,
  p_entity_type text,
  p_entity_id uuid,
  p_metadata jsonb default '{}'::jsonb
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
begin
  if v_actor is null then
    return false;
  end if;
  if not public.has_role(p_restaurant_id, array['owner', 'manager']) then
    return false;
  end if;
  if p_action is null or char_length(p_action) = 0 or char_length(p_action) > 100 then
    return false;
  end if;
  if p_entity_type is null or char_length(p_entity_type) > 60 then
    return false;
  end if;

  insert into public.audit_logs (
    restaurant_id, actor_id, action, entity_type, entity_id, metadata_redacted
  )
  values (
    p_restaurant_id, v_actor, p_action, p_entity_type, p_entity_id,
    coalesce(p_metadata, '{}'::jsonb)
  );

  return true;
end;
$$;

revoke all on function public.write_audit(uuid, text, text, uuid, jsonb) from public;
grant execute on function public.write_audit(uuid, text, text, uuid, jsonb) to authenticated, service_role;
