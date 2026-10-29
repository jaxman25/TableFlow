-- Managers can administer staff, but must never be able to demote, revoke, or
-- delete an owner (including themselves if they are only a manager). The
-- original policies only checked the actor's role, not the target row's role.

drop policy restaurant_members_update on public.restaurant_members;
create policy restaurant_members_update on public.restaurant_members
  for update to authenticated
  using (
    public.has_role(restaurant_id, array['owner'])
    or (
      public.has_role(restaurant_id, array['manager'])
      and role <> 'owner'
    )
  )
  with check (
    public.has_role(restaurant_id, array['owner'])
    or (
      public.has_role(restaurant_id, array['manager'])
      and role <> 'owner'
    )
  );

drop policy restaurant_members_delete on public.restaurant_members;
create policy restaurant_members_delete on public.restaurant_members
  for delete to authenticated
  using (
    public.has_role(restaurant_id, array['owner'])
    or (
      public.has_role(restaurant_id, array['manager'])
      and role <> 'owner'
    )
  );
