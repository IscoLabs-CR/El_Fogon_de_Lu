-- ============================================================
-- add_restaurant_user: agrega un usuario (cobrador o admin) a un restaurante ya
-- existente. Lo usa el skill para los "N usuarios ademas del admin", y sirve
-- tambien para dar de alta gente despues del lanzamiento. Solo service_role.
--
-- Mismo cuidado que provision_restaurant: los campos de token de auth.users van
-- en '' (no NULL) para que GoTrue pueda leerlos en el login.
-- ============================================================
create or replace function public.add_restaurant_user(
  p_tenant_id uuid,
  p_username  text,
  p_password  text,
  p_full_name text default null,
  p_role      text default 'cobrador'
) returns uuid
language plpgsql security definer set search_path = public, auth, extensions as $$
declare v_user uuid := gen_random_uuid(); v_slug text; v_domain text;
begin
  if p_role not in ('admin','cobrador') then
    raise exception 'Rol invalido: %', p_role using errcode = '22023';
  end if;
  select slug into v_slug from public.restaurants where id = p_tenant_id;
  if v_slug is null then raise exception 'Restaurante inexistente.'; end if;
  v_domain := v_slug || '.local';

  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
    confirmation_token, recovery_token, email_change, email_change_token_new,
    email_change_token_current, phone_change, phone_change_token, reauthentication_token)
  values (
    '00000000-0000-0000-0000-000000000000', v_user, 'authenticated', 'authenticated',
    lower(p_username) || '@' || v_domain,
    extensions.crypt(p_password, extensions.gen_salt('bf')),
    now(), now(), now(),
    jsonb_build_object('provider','email','providers',array['email'],
                       'tenant_id', p_tenant_id::text, 'role', p_role, 'active', true),
    jsonb_build_object('username', lower(p_username),
                       'full_name', coalesce(p_full_name, initcap(p_username)), 'role', p_role),
    '', '', '', '', '', '', '', '');
  insert into auth.identities (id, user_id, provider, provider_id, identity_data, created_at, updated_at, last_sign_in_at)
  values (gen_random_uuid(), v_user, 'email', v_user::text,
    jsonb_build_object('sub', v_user::text, 'email', lower(p_username)||'@'||v_domain,
                       'email_verified', true, 'phone_verified', false),
    now(), now(), now());
  -- handle_new_user crea el profile (tenant_id/role/active desde app_metadata);
  -- la unicidad de username por inquilino la impone profiles_tenant_username_key.
  return v_user;
end $$;

revoke execute on function public.add_restaurant_user(uuid,text,text,text,text)
  from public, anon, authenticated;
