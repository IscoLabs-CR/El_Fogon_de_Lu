-- ============================================================
-- El Fogon de Lu - bajas con deuda viva y borrado de fichas
-- Proyecto Supabase: isco-soda
--
-- Reconstruye lo que la app ya usa y 0001 no define:
--   1. get_employee_balances devuelve employee_active / company_active.
--   2. El que se fue de la empresa debiendo sigue listado: hay que cobrarle.
--   3. delete_employee / delete_company, solo para fichas sin historial.
--
-- Principio heredado de 0001: nada de policies de escritura. Todo pasa por RPC
-- security definer, y ninguna ficha con movimientos se puede borrar.
-- ============================================================

-- ---------- Saldos ----------
-- Cambia el tipo de retorno (dos columnas nuevas), y create or replace no puede
-- con eso: hay que soltar la funcion primero.
drop function if exists public.get_employee_balances(uuid);

create function public.get_employee_balances(p_company_id uuid default null)
returns table (
  employee_id uuid, employee_name text,
  company_id uuid, company_name text,
  balance numeric, last_movement date,
  employee_active boolean, company_active boolean
)
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_staff() then raise exception 'No autorizado.' using errcode = '42501'; end if;
  return query
  with saldos as (
    select ce.id     as emp_id,
           ce.name   as emp_name,
           c.id      as comp_id,
           c.name    as comp_name,
           ce.active as emp_active,
           c.active  as comp_active,
           -- opening_balance es la deuda que dejo el purgado anual. Sin sumarla,
           -- el saldo mentiria a partir del primer purgado del empleado.
           ce.opening_balance
             + coalesce((select sum(ch.amount) from public.account_charges ch
                          where ch.employee_id = ce.id), 0)
             - coalesce((select sum(s.amount) from public.sales s
                          where s.employee_id = ce.id and s.source = 'abono'), 0) as saldo,
           greatest(
             (select max(ch.business_date) from public.account_charges ch
               where ch.employee_id = ce.id),
             (select max(s.business_date) from public.sales s
               where s.employee_id = ce.id and s.source = 'abono')
           ) as ultimo
      from public.company_employees ce
      join public.companies c on c.id = ce.company_id
     where p_company_id is null or ce.company_id = p_company_id
  )
  select emp_id, emp_name, comp_id, comp_name, saldo, ultimo, emp_active, comp_active
    from saldos
   -- El `where ce.active` de 0001 escondia justo al que hay que cobrarle: el que
   -- se fue debiendo. Se lista mientras el saldo no este en cero. La app lo marca
   -- "De baja", le bloquea consumos nuevos y le deja cobrar. Un saldo negativo
   -- (sobrepago) tambien queda visible: es plata que se le debe a el.
   where (emp_active and comp_active) or saldo <> 0
   order by comp_name, emp_name;
end $$;

-- ---------- Borrado de fichas ----------
-- Borrar es para la ficha recien creada por error. Lo que ya tiene movimientos se
-- da de baja: sus abonos son ventas del historial y sus cargos, deuda de alguien.
create or replace function public.delete_employee(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_emp public.company_employees;
begin
  if not public.is_admin() then raise exception 'Solo el administrador.' using errcode = '42501'; end if;

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
  if not public.is_admin() then raise exception 'Solo el administrador.' using errcode = '42501'; end if;

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

-- ---------- Grants ----------
-- Postgres concede EXECUTE a PUBLIC en toda funcion nueva, y el revoke de 0001 fue
-- de una sola vez: no alcanza a lo que se cree despues. Ademas get_employee_balances
-- perdio sus grants al soltarla. Se repite el patron de 0001: revocar todo y
-- conceder solo la superficie deliberada.
revoke execute on function
  public.get_employee_balances(uuid),
  public.delete_employee(uuid),
  public.delete_company(uuid)
from public, anon, authenticated;

grant execute on function
  public.get_employee_balances(uuid),
  public.delete_employee(uuid),
  public.delete_company(uuid)
to authenticated;
