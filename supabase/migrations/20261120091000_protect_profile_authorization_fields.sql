create or replace function public.protect_profile_authorization_fields()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user <> 'postgres'
     and (select auth.uid()) = old.id
     and old.role not in ('treasurer'::public.app_role, 'deputy_treasurer'::public.app_role, 'admin'::public.app_role)
     and (
       new.role is distinct from old.role
       or new.active is distinct from old.active
       or new.display_name is distinct from old.display_name
     ) then
    raise exception 'Only finance administrators can change profile authorization fields';
  end if;
  return new;
end;
$$;

revoke all on function public.protect_profile_authorization_fields() from public, anon, authenticated;

drop trigger if exists profiles_protect_authorization_fields on public.profiles;
create trigger profiles_protect_authorization_fields
before update on public.profiles
for each row execute function public.protect_profile_authorization_fields();

