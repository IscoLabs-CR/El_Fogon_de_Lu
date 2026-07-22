-- ============================================================
-- El Fogon como primer inquilino — sellar app_metadata
-- Los 2 usuarios existentes (admin/cobrador) necesitan tenant_id en app_metadata
-- para que su JWT lo lleve y current_tenant_id() los ubique. Su profile.tenant_id
-- ya quedo con backfill en 0005. Al reloguear reciben el JWT con el tenant.
-- ============================================================
update auth.users u
set raw_app_meta_data = coalesce(u.raw_app_meta_data, '{}'::jsonb)
     || jsonb_build_object(
          'tenant_id', (select id from public.restaurants where slug = 'el-fogon-de-lu')::text,
          'role',   (select role   from public.profiles where id = u.id),
          'active', (select active from public.profiles where id = u.id))
where u.email in ('admin@fogon.local', 'cobrador@fogon.local');
