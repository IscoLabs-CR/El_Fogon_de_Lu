-- ============================================================
-- Fix: provision_restaurant debe inicializar los campos de token de auth.users
-- en '' (no NULL). GoTrue v2 los lee como string no-nulo; si quedan NULL, el
-- login falla con "Scan error on column confirmation_token: converting NULL to
-- string is unsupported". (Se descubrio al migrar El Fogon.)
-- ============================================================
create or replace function public.provision_restaurant(
  p_slug text,
  p_name text,
  p_admin_username text,
  p_admin_password text,
  p_admin_full_name  text default 'Administracion',
  p_timezone text default 'America/Costa_Rica',
  p_currency text default 'CRC',
  p_theme jsonb default '{}'::jsonb,
  p_features jsonb default '{"creditos": true}'::jsonb,
  p_cobrador_username text default null,
  p_cobrador_password text default null,
  p_cobrador_full_name text default 'Cobrador'
) returns jsonb
language plpgsql security definer set search_path = public, auth, extensions as $$
declare
  v_tenant   uuid;
  v_admin    uuid := gen_random_uuid();
  v_cobrador uuid;
  v_domain   text := lower(p_slug) || '.local';
begin
  insert into public.restaurants (slug, name, timezone, currency, theme, features)
  values (lower(p_slug), p_name, p_timezone, p_currency,
          coalesce(p_theme,'{}'::jsonb), coalesce(p_features,'{"creditos": true}'::jsonb))
  returning id into v_tenant;

  -- Admin. Los campos de token van en '' (no NULL) para que GoTrue pueda leerlos.
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
    confirmation_token, recovery_token, email_change, email_change_token_new,
    email_change_token_current, phone_change, phone_change_token, reauthentication_token)
  values (
    '00000000-0000-0000-0000-000000000000', v_admin, 'authenticated', 'authenticated',
    lower(p_admin_username) || '@' || v_domain,
    extensions.crypt(p_admin_password, extensions.gen_salt('bf')),
    now(), now(), now(),
    jsonb_build_object('provider','email','providers',array['email'],
                       'tenant_id', v_tenant::text, 'role','admin', 'active', true),
    jsonb_build_object('username', lower(p_admin_username), 'full_name', p_admin_full_name, 'role','admin'),
    '', '', '', '', '', '', '', '');
  insert into auth.identities (id, user_id, provider, provider_id, identity_data, created_at, updated_at, last_sign_in_at)
  values (gen_random_uuid(), v_admin, 'email', v_admin::text,
          jsonb_build_object('sub', v_admin::text, 'email', lower(p_admin_username)||'@'||v_domain,
                             'email_verified', true, 'phone_verified', false),
          now(), now(), now());

  if p_cobrador_username is not null and p_cobrador_password is not null then
    v_cobrador := gen_random_uuid();
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
      confirmation_token, recovery_token, email_change, email_change_token_new,
      email_change_token_current, phone_change, phone_change_token, reauthentication_token)
    values (
      '00000000-0000-0000-0000-000000000000', v_cobrador, 'authenticated', 'authenticated',
      lower(p_cobrador_username) || '@' || v_domain,
      extensions.crypt(p_cobrador_password, extensions.gen_salt('bf')),
      now(), now(), now(),
      jsonb_build_object('provider','email','providers',array['email'],
                         'tenant_id', v_tenant::text, 'role','cobrador', 'active', true),
      jsonb_build_object('username', lower(p_cobrador_username), 'full_name', p_cobrador_full_name, 'role','cobrador'),
      '', '', '', '', '', '', '', '');
    insert into auth.identities (id, user_id, provider, provider_id, identity_data, created_at, updated_at, last_sign_in_at)
    values (gen_random_uuid(), v_cobrador, 'email', v_cobrador::text,
            jsonb_build_object('sub', v_cobrador::text, 'email', lower(p_cobrador_username)||'@'||v_domain,
                               'email_verified', true, 'phone_verified', false),
            now(), now(), now());
  end if;

  return jsonb_build_object('tenant_id', v_tenant, 'slug', lower(p_slug),
                            'admin_user_id', v_admin, 'cobrador_user_id', v_cobrador);
end $$;

revoke execute on function public.provision_restaurant(text,text,text,text,text,text,text,jsonb,jsonb,text,text,text)
  from public, anon, authenticated;
