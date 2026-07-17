-- ============================================================
-- El Fogon de Lu - el cobrador tambien gestiona empresas
-- Proyecto Supabase: isco-soda
--
-- El cobrador es quien fia en la calle: necesita dar de alta la empresa y sus
-- empleados sin depender del admin. Se abre la gestion de fichas a ambos roles
-- cambiando el guard is_admin() por is_staff() en los cuatro RPC de escritura.
--
-- Lo demas no se toca: get_month_summary sigue solo-admin, y los borrados siguen
-- protegidos por la regla de "sin historial" (ninguna ficha con movimientos se
-- puede eliminar), que es la barrera que importa, no el rol.
--
-- create or replace conserva los grants existentes: no hace falta re-conceder.
-- ============================================================

create or replace function public.upsert_company(p_id uuid, p_name text, p_active boolean default true)
returns public.companies
language plpgsql security definer set search_path = public as $$
declare r public.companies;
begin
  if not public.is_staff() then raise exception 'No autorizado.' using errcode = '42501'; end if;
  insert into public.companies (id, name, active)
  values (coalesce(p_id, gen_random_uuid()), p_name, p_active)
  on conflict (id) do update set name = excluded.name, active = excluded.active
  returning * into r;
  return r;
end $$;

create or replace function public.upsert_employee(
  p_id uuid, p_company_id uuid, p_name text, p_active boolean default true)
returns public.company_employees
language plpgsql security definer set search_path = public as $$
declare r public.company_employees;
begin
  if not public.is_staff() then raise exception 'No autorizado.' using errcode = '42501'; end if;
  insert into public.company_employees (id, company_id, name, active)
  values (coalesce(p_id, gen_random_uuid()), p_company_id, p_name, p_active)
  on conflict (id) do update set
    company_id = excluded.company_id, name = excluded.name, active = excluded.active
  returning * into r;
  return r;
end $$;

create or replace function public.delete_employee(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_emp public.company_employees;
begin
  if not public.is_staff() then raise exception 'No autorizado.' using errcode = '42501'; end if;

  select * into v_emp from public.company_employees where id = p_id;
  if not found then raise exception 'El empleado no existe.'; end if;

  -- Las FK son on delete restrict, asi que el borrado con historial fallaria igual;
  -- esto solo cambia un error de integridad por algo que el duenno entiende.
  -- opening_balance <> 0 cuenta como historial: es deuda viva ya purgada, y las
  -- filas que la respaldaban no existen para frenar el delete.
  if v_emp.opening_balance <> 0
     or exists (select 1 from public.account_charges ch where ch.employee_id = p_id)
     or exists (select 1 from public.sales s where s.employee_id = p_id) then
    raise exception 'No se puede eliminar a %: tiene movimientos. Dele de baja para conservar el historial.',
      v_emp.name using errcode = 'P0001';
  end if;

  delete from public.company_employees where id = p_id;
end $$;

create or replace function public.delete_company(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_comp public.companies; v_con_historial text;
begin
  if not public.is_staff() then raise exception 'No autorizado.' using errcode = '42501'; end if;

  select * into v_comp from public.companies where id = p_id;
  if not found then raise exception 'La empresa no existe.'; end if;

  select ce.name into v_con_historial
    from public.company_employees ce
   where ce.company_id = p_id
     and (ce.opening_balance <> 0
          or exists (select 1 from public.account_charges ch where ch.employee_id = ce.id)
          or exists (select 1 from public.sales s where s.employee_id = ce.id))
   limit 1;

  if v_con_historial is not null then
    raise exception 'No se puede eliminar %: % tiene movimientos. Desactive la empresa para conservar el historial.',
      v_comp.name, v_con_historial using errcode = 'P0001';
  end if;

  -- Ninguno tiene historial, asi que se van con la empresa, como avisa la pantalla.
  -- La FK company_employees -> companies es restrict: van antes, no despues.
  delete from public.company_employees where company_id = p_id;
  delete from public.companies where id = p_id;
end $$;
