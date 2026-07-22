-- ============================================================
-- Base multitenant de restaurantes — COMPORTAMIENTO
-- RLS, RPCs, triggers, purge y provisioning, todo filtrado por inquilino.
-- Se aplica DESPUES de 0005 (que ya creo tenant_id, el inquilino y los indices).
--
-- Principio intacto de El Fogon: cero policies de escritura; todo pasa por RPC
-- security definer. Aqui cada RPC ademas ESTAMPA y FILTRA por current_tenant_id().
-- ============================================================

-- ---------- Guards de rol (ahora tambien validan inquilino) ----------
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as
$$ select exists (
     select 1 from public.profiles
      where id = auth.uid() and role = 'admin' and active
        and tenant_id = public.current_tenant_id()
   ) $$;

create or replace function public.is_staff()
returns boolean language sql stable security definer set search_path = public as
$$ select exists (
     select 1 from public.profiles
      where id = auth.uid() and active
        and tenant_id = public.current_tenant_id()
   ) $$;

-- ---------- Trigger de integridad de caja (estampa tenant desde la sesion) ----------
create or replace function public.tg_session_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare s record;
begin
  select id, status, business_date, tenant_id into s
    from public.cash_sessions where id = new.session_id for share;
  if not found then raise exception 'Sesion de caja inexistente.' using errcode = '23503'; end if;
  if s.status <> 'abierta' then raise exception 'La caja de ese movimiento ya esta cerrada.' using errcode = 'P0001'; end if;

  if tg_op = 'UPDATE' then
    if new.session_id <> old.session_id then raise exception 'No se puede mover un movimiento de sesion.'; end if;
    new.business_date := old.business_date;
    new.tenant_id    := old.tenant_id;
  else
    new.business_date := s.business_date;
    new.tenant_id     := s.tenant_id;   -- el tenant lo manda la sesion, nunca el cliente
  end if;
  return new;
end $$;

-- ---------- Alta de usuarios (tenant/role/active desde app_metadata) ----------
-- role y active vienen de app_metadata (solo service_role lo escribe, via
-- provision_restaurant): un signup no puede autoconcederse admin.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, tenant_id, username, full_name, role, active)
  values (
    new.id,
    (new.raw_app_meta_data->>'tenant_id')::uuid,
    coalesce(new.raw_user_meta_data->>'username', split_part(new.email,'@',1)),
    coalesce(new.raw_user_meta_data->>'full_name', 'Sin nombre'),
    coalesce(new.raw_app_meta_data->>'role', 'cobrador'),
    coalesce((new.raw_app_meta_data->>'active')::boolean, false)
  );
  return new;
end $$;

-- ============================================================
-- RLS: se reescriben todas con filtro por inquilino
-- ============================================================
drop policy p_profiles_read  on public.profiles;
create policy p_profiles_read on public.profiles for select to authenticated
  using (tenant_id = public.current_tenant_id() and (select public.is_staff()));

drop policy p_companies_read  on public.companies;
create policy p_companies_read on public.companies for select to authenticated
  using (tenant_id = public.current_tenant_id() and (select public.is_staff()));

drop policy p_employees_read  on public.company_employees;
create policy p_employees_read on public.company_employees for select to authenticated
  using (tenant_id = public.current_tenant_id() and (select public.is_staff()));

drop policy p_expenses_read  on public.expenses;
create policy p_expenses_read on public.expenses for select to authenticated
  using (tenant_id = public.current_tenant_id() and (select public.is_staff()));

drop policy p_charges_read  on public.account_charges;
create policy p_charges_read on public.account_charges for select to authenticated
  using (tenant_id = public.current_tenant_id() and (select public.is_staff()));

drop policy p_sales_read on public.sales;
create policy p_sales_read on public.sales for select to authenticated using (
  tenant_id = public.current_tenant_id() and (
    (select public.is_admin())
    or business_date = public.today_cr()
    or exists (select 1 from public.cash_sessions cs
                where cs.id = sales.session_id and cs.status = 'abierta')
  ));

drop policy p_sessions_read on public.cash_sessions;
create policy p_sessions_read on public.cash_sessions for select to authenticated using (
  tenant_id = public.current_tenant_id() and ((select public.is_admin()) or status = 'abierta'));

drop policy p_rollups_read on public.monthly_rollups;
create policy p_rollups_read on public.monthly_rollups for select to authenticated using (
  tenant_id = public.current_tenant_id() and (select public.is_admin()));

-- ============================================================
-- RPCs de escritura (create or replace conserva los grants de 0001)
-- ============================================================
create or replace function public.open_cash_session(p_opening_amount numeric, p_notes text default null)
returns public.cash_sessions language plpgsql security definer set search_path = public as $$
declare v public.cash_sessions; t uuid := public.current_tenant_id();
begin
  if not public.is_staff() then raise exception 'No autorizado.' using errcode = '42501'; end if;
  if p_opening_amount is null or p_opening_amount < 0 then raise exception 'Monto de apertura invalido.'; end if;
  begin
    insert into public.cash_sessions (tenant_id, business_date, opened_by, opening_amount, notes)
    values (t, public.today_cr(), auth.uid(), p_opening_amount, p_notes)
    returning * into v;
  exception when unique_violation then
    raise exception 'Ya hay una caja abierta. Cierrela antes de abrir otra.' using errcode = 'P0001';
  end;
  return v;
end $$;

create or replace function public.close_cash_session(p_counted_cash numeric, p_notes text default null)
returns public.cash_sessions language plpgsql security definer set search_path = public as $$
declare s public.cash_sessions; v record; e record; c numeric;
begin
  if not public.is_staff() then raise exception 'No autorizado.' using errcode = '42501'; end if;
  if p_counted_cash is null or p_counted_cash < 0 then raise exception 'Efectivo contado invalido.'; end if;

  select * into s from public.cash_sessions
   where status = 'abierta' and tenant_id = public.current_tenant_id() for update;
  if not found then raise exception 'No hay caja abierta.'; end if;

  select coalesce(sum(amount),0)                                          as total,
         coalesce(sum(amount) filter (where payment_method='efectivo'),0) as efec,
         coalesce(sum(amount) filter (where payment_method='sinpe'),0)    as sinpe,
         coalesce(sum(amount) filter (where payment_method='tarjeta'),0)  as tarj
    into v from public.sales where session_id = s.id;
  select coalesce(sum(amount) filter (where paid_with='efectivo'),0) as efec
    into e from public.expenses where session_id = s.id;
  select coalesce(sum(amount),0) into c from public.account_charges where session_id = s.id;

  update public.cash_sessions set
    status='cerrada', closed_by=auth.uid(), closed_at=now(), counted_cash=p_counted_cash,
    expected_cash = s.opening_amount + v.efec - e.efec,
    total_sales=v.total, total_efectivo=v.efec, total_sinpe=v.sinpe, total_tarjeta=v.tarj,
    total_expenses_efectivo=e.efec, total_charges=c, notes=coalesce(p_notes, s.notes)
  where id = s.id returning * into s;
  return s;
end $$;

create or replace function public.register_sale(
  p_amount numeric, p_description text, p_payment_method text, p_employee_id uuid default null)
returns public.sales language plpgsql security definer set search_path = public as $$
declare v_session uuid; t uuid := public.current_tenant_id(); r public.sales;
begin
  if not public.is_staff() then raise exception 'No autorizado.' using errcode = '42501'; end if;
  select id into v_session from public.cash_sessions where status='abierta' and tenant_id = t;
  if v_session is null then raise exception 'No hay caja abierta. Abra la caja antes de registrar movimientos.'; end if;

  insert into public.sales (tenant_id, session_id, amount, description, payment_method, source, employee_id, created_by)
  values (t, v_session, p_amount, coalesce(p_description,''), p_payment_method,
          case when p_employee_id is null then 'mostrador' else 'abono' end, p_employee_id, auth.uid())
  returning * into r;   -- el trigger estampa business_date y tenant_id desde la sesion
  return r;
end $$;

create or replace function public.register_charge(p_employee_id uuid, p_amount numeric, p_description text)
returns public.account_charges language plpgsql security definer set search_path = public as $$
declare v_session uuid; t uuid := public.current_tenant_id(); r public.account_charges;
begin
  if not public.is_staff() then raise exception 'No autorizado.' using errcode = '42501'; end if;
  select id into v_session from public.cash_sessions where status='abierta' and tenant_id = t;
  if v_session is null then raise exception 'No hay caja abierta.'; end if;

  insert into public.account_charges (tenant_id, session_id, employee_id, amount, description, created_by)
  values (t, v_session, p_employee_id, p_amount, coalesce(p_description,''), auth.uid())
  returning * into r;
  return r;
end $$;

create or replace function public.register_expense(
  p_amount numeric, p_description text, p_category text, p_paid_with text)
returns public.expenses language plpgsql security definer set search_path = public as $$
declare v_session uuid; t uuid := public.current_tenant_id(); r public.expenses;
begin
  if not public.is_staff() then raise exception 'No autorizado.' using errcode = '42501'; end if;
  select id into v_session from public.cash_sessions where status='abierta' and tenant_id = t;
  if v_session is null then raise exception 'No hay caja abierta.'; end if;

  insert into public.expenses (tenant_id, session_id, amount, description, category, paid_with, created_by)
  values (t, v_session, p_amount, coalesce(p_description,''), coalesce(p_category,'otros'), p_paid_with, auth.uid())
  returning * into r;
  return r;
end $$;

-- Borrados: solo con caja abierta Y del propio inquilino.
create or replace function public.delete_sale(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_staff() then raise exception 'No autorizado.' using errcode = '42501'; end if;
  delete from public.sales s using public.cash_sessions cs
   where s.id = p_id and cs.id = s.session_id and cs.status = 'abierta'
     and cs.tenant_id = public.current_tenant_id();
  if not found then raise exception 'No se puede eliminar: la caja de ese movimiento ya fue cerrada.'; end if;
end $$;

create or replace function public.delete_expense(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_staff() then raise exception 'No autorizado.' using errcode = '42501'; end if;
  delete from public.expenses x using public.cash_sessions cs
   where x.id = p_id and cs.id = x.session_id and cs.status = 'abierta'
     and cs.tenant_id = public.current_tenant_id();
  if not found then raise exception 'No se puede eliminar: la caja de ese movimiento ya fue cerrada.'; end if;
end $$;

create or replace function public.delete_charge(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_staff() then raise exception 'No autorizado.' using errcode = '42501'; end if;
  delete from public.account_charges c using public.cash_sessions cs
   where c.id = p_id and cs.id = c.session_id and cs.status = 'abierta'
     and cs.tenant_id = public.current_tenant_id();
  if not found then raise exception 'No se puede eliminar: la caja de ese movimiento ya fue cerrada.'; end if;
end $$;

-- ---------- Resumenes y saldos (security definer: filtran por tenant a mano) ----------
create or replace function public.get_day_summary(p_date date default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare d date; t uuid := public.current_tenant_id(); res jsonb;
begin
  if not public.is_staff() then raise exception 'No autorizado.' using errcode = '42501'; end if;
  d := coalesce(p_date, public.today_cr());
  if not public.is_admin() and d <> public.today_cr() then
    raise exception 'Solo el administrador puede consultar dias anteriores.' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'business_date',   d,
    'ventas_total',    coalesce((select sum(amount) from sales where tenant_id=t and business_date=d),0),
    'ventas_efectivo', coalesce((select sum(amount) from sales where tenant_id=t and business_date=d and payment_method='efectivo'),0),
    'ventas_sinpe',    coalesce((select sum(amount) from sales where tenant_id=t and business_date=d and payment_method='sinpe'),0),
    'ventas_tarjeta',  coalesce((select sum(amount) from sales where tenant_id=t and business_date=d and payment_method='tarjeta'),0),
    'ventas_mostrador',coalesce((select sum(amount) from sales where tenant_id=t and business_date=d and source='mostrador'),0),
    'abonos_cobrados', coalesce((select sum(amount) from sales where tenant_id=t and business_date=d and source='abono'),0),
    'gastos_total',    coalesce((select sum(amount) from expenses where tenant_id=t and business_date=d),0),
    'gastos_efectivo', coalesce((select sum(amount) from expenses where tenant_id=t and business_date=d and paid_with='efectivo'),0),
    'consumo_credito', coalesce((select sum(amount) from account_charges where tenant_id=t and business_date=d),0),
    'neto',            coalesce((select sum(amount) from sales where tenant_id=t and business_date=d),0)
                     - coalesce((select sum(amount) from expenses where tenant_id=t and business_date=d),0),
    'tickets',         (select count(*) from sales where tenant_id=t and business_date=d)
  ) into res;
  return res;
end $$;

create or replace function public.get_month_summary(p_year int, p_month int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare d1 date; d2 date; t uuid := public.current_tenant_id(); res jsonb;
begin
  if not public.is_admin() then raise exception 'Solo el administrador puede ver totales mensuales.' using errcode = '42501'; end if;
  d1 := make_date(p_year, p_month, 1); d2 := (d1 + interval '1 month')::date;

  select jsonb_build_object(
    'period', d1,
    'ventas_total',    coalesce((select sum(amount) from sales where tenant_id=t and business_date>=d1 and business_date<d2),0),
    'ventas_efectivo', coalesce((select sum(amount) from sales where tenant_id=t and business_date>=d1 and business_date<d2 and payment_method='efectivo'),0),
    'ventas_sinpe',    coalesce((select sum(amount) from sales where tenant_id=t and business_date>=d1 and business_date<d2 and payment_method='sinpe'),0),
    'ventas_tarjeta',  coalesce((select sum(amount) from sales where tenant_id=t and business_date>=d1 and business_date<d2 and payment_method='tarjeta'),0),
    'ventas_mostrador',coalesce((select sum(amount) from sales where tenant_id=t and business_date>=d1 and business_date<d2 and source='mostrador'),0),
    'abonos_cobrados', coalesce((select sum(amount) from sales where tenant_id=t and business_date>=d1 and business_date<d2 and source='abono'),0),
    'gastos_total',    coalesce((select sum(amount) from expenses where tenant_id=t and business_date>=d1 and business_date<d2),0),
    'consumo_credito', coalesce((select sum(amount) from account_charges where tenant_id=t and business_date>=d1 and business_date<d2),0),
    'tickets',         (select count(*) from sales where tenant_id=t and business_date>=d1 and business_date<d2),
    'neto',            coalesce((select sum(amount) from sales where tenant_id=t and business_date>=d1 and business_date<d2),0)
                     - coalesce((select sum(amount) from expenses where tenant_id=t and business_date>=d1 and business_date<d2),0),
    'por_dia', coalesce((
      select jsonb_agg(x order by x->>'d') from (
        select jsonb_build_object('d', business_date, 'ventas', sum(amount),
                 'gastos', coalesce((select sum(e.amount) from expenses e
                             where e.tenant_id=t and e.business_date = s.business_date),0)) as x
          from sales s where tenant_id=t and business_date>=d1 and business_date<d2
         group by business_date) q), '[]'::jsonb)
  ) into res;
  return res;
end $$;

create or replace function public.get_expenses_rollup(p_from date, p_to date, p_bucket text default 'week')
returns table (bucket date, total numeric, por_categoria jsonb)
language plpgsql security definer set search_path = public as $$
declare t uuid := public.current_tenant_id();
begin
  if not public.is_staff() then raise exception 'No autorizado.' using errcode = '42501'; end if;
  if p_bucket not in ('week','month') then raise exception 'Agrupacion invalida.'; end if;
  return query
  with base as (
    select date_trunc(p_bucket, business_date)::date as b, category, sum(amount) as cat_total
      from public.expenses where tenant_id = t and business_date between p_from and p_to
     group by 1, 2)
  select b, sum(cat_total), jsonb_object_agg(category, cat_total) from base group by b order by b;
end $$;

create or replace function public.get_employee_balances(p_company_id uuid default null)
returns table (
  employee_id uuid, employee_name text, company_id uuid, company_name text,
  balance numeric, last_movement date, employee_active boolean, company_active boolean)
language plpgsql security definer set search_path = public as $$
declare t uuid := public.current_tenant_id();
begin
  if not public.is_staff() then raise exception 'No autorizado.' using errcode = '42501'; end if;
  return query
  with saldos as (
    select ce.id emp_id, ce.name emp_name, c.id comp_id, c.name comp_name,
           ce.active emp_active, c.active comp_active,
           ce.opening_balance
             + coalesce((select sum(ch.amount) from public.account_charges ch where ch.employee_id = ce.id),0)
             - coalesce((select sum(s.amount) from public.sales s where s.employee_id = ce.id and s.source='abono'),0) as saldo,
           greatest(
             (select max(ch.business_date) from public.account_charges ch where ch.employee_id = ce.id),
             (select max(s.business_date)  from public.sales s where s.employee_id = ce.id and s.source='abono')
           ) as ultimo
      from public.company_employees ce
      join public.companies c on c.id = ce.company_id
     where ce.tenant_id = t and (p_company_id is null or ce.company_id = p_company_id))
  select emp_id, emp_name, comp_id, comp_name, saldo, ultimo, emp_active, comp_active
    from saldos
   where (emp_active and comp_active) or saldo <> 0
   order by comp_name, emp_name;
end $$;

create or replace function public.get_employee_statement(p_employee_id uuid, p_limit int default 100)
returns table (fecha date, tipo text, descripcion text, monto numeric, metodo text, mov_id uuid)
language plpgsql security definer set search_path = public as $$
declare t uuid := public.current_tenant_id();
begin
  if not public.is_staff() then raise exception 'No autorizado.' using errcode = '42501'; end if;
  return query
  select business_date, 'cargo'::text, description, amount, null::text, id
    from public.account_charges where tenant_id = t and employee_id = p_employee_id
  union all
  select business_date, 'abono'::text, description, amount, payment_method, id
    from public.sales where tenant_id = t and employee_id = p_employee_id and source = 'abono'
  order by 1 desc, 2 limit p_limit;
end $$;

-- ---------- Alta/edicion de empresas y empleados (staff, del propio inquilino) ----------
create or replace function public.upsert_company(p_id uuid, p_name text, p_active boolean default true)
returns public.companies language plpgsql security definer set search_path = public as $$
declare r public.companies; t uuid := public.current_tenant_id();
begin
  if not public.is_staff() then raise exception 'No autorizado.' using errcode = '42501'; end if;
  insert into public.companies (id, tenant_id, name, active)
  values (coalesce(p_id, gen_random_uuid()), t, p_name, p_active)
  on conflict (id) do update set name = excluded.name, active = excluded.active
    where public.companies.tenant_id = t
  returning * into r;
  if r.id is null then raise exception 'Empresa no encontrada en este restaurante.'; end if;
  return r;
end $$;

create or replace function public.upsert_employee(
  p_id uuid, p_company_id uuid, p_name text, p_active boolean default true)
returns public.company_employees language plpgsql security definer set search_path = public as $$
declare r public.company_employees; t uuid := public.current_tenant_id();
begin
  if not public.is_staff() then raise exception 'No autorizado.' using errcode = '42501'; end if;
  if not exists (select 1 from public.companies where id = p_company_id and tenant_id = t) then
    raise exception 'La empresa no pertenece a este restaurante.' using errcode = '42501';
  end if;
  insert into public.company_employees (id, tenant_id, company_id, name, active)
  values (coalesce(p_id, gen_random_uuid()), t, p_company_id, p_name, p_active)
  on conflict (id) do update set company_id = excluded.company_id, name = excluded.name, active = excluded.active
    where public.company_employees.tenant_id = t
  returning * into r;
  if r.id is null then raise exception 'Empleado no encontrado en este restaurante.'; end if;
  return r;
end $$;

create or replace function public.delete_employee(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_emp public.company_employees;
begin
  if not public.is_staff() then raise exception 'No autorizado.' using errcode = '42501'; end if;
  select * into v_emp from public.company_employees where id = p_id and tenant_id = public.current_tenant_id();
  if not found then raise exception 'El empleado no existe.'; end if;
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
  select * into v_comp from public.companies where id = p_id and tenant_id = public.current_tenant_id();
  if not found then raise exception 'La empresa no existe.'; end if;
  select ce.name into v_con_historial from public.company_employees ce
   where ce.company_id = p_id
     and (ce.opening_balance <> 0
          or exists (select 1 from public.account_charges ch where ch.employee_id = ce.id)
          or exists (select 1 from public.sales s where s.employee_id = ce.id))
   limit 1;
  if v_con_historial is not null then
    raise exception 'No se puede eliminar %: % tiene movimientos. Desactive la empresa para conservar el historial.',
      v_comp.name, v_con_historial using errcode = 'P0001';
  end if;
  delete from public.company_employees where company_id = p_id;
  delete from public.companies where id = p_id;
end $$;

-- ---------- Retencion a un ano (rollups POR inquilino) ----------
create or replace function public.purge_old_records()
returns void language plpgsql security definer set search_path = public as $$
declare cutoff date := (public.today_cr() - interval '1 year')::date;
begin
  with mov as (
    select tenant_id, date_trunc('month', business_date)::date as period,
           amount as venta,
           case when payment_method='efectivo' then amount else 0 end as efec,
           case when payment_method='sinpe'    then amount else 0 end as sinpe,
           case when payment_method='tarjeta'  then amount else 0 end as tarj,
           case when source='mostrador' then amount else 0 end as most,
           case when source='abono'     then amount else 0 end as abo,
           0::numeric as gasto, 0::numeric as cargo, 1 as cnt
      from public.sales where business_date < cutoff
    union all
    select tenant_id, date_trunc('month', business_date)::date, 0,0,0,0,0,0, amount, 0, 0
      from public.expenses where business_date < cutoff
    union all
    select tenant_id, date_trunc('month', business_date)::date, 0,0,0,0,0,0, 0, amount, 0
      from public.account_charges where business_date < cutoff
  )
  insert into public.monthly_rollups as m
    (tenant_id, period, total_sales, total_efectivo, total_sinpe, total_tarjeta, total_mostrador,
     total_abonos, total_expenses, total_charges, sales_count)
  select tenant_id, period, sum(venta), sum(efec), sum(sinpe), sum(tarj), sum(most),
         sum(abo), sum(gasto), sum(cargo), sum(cnt)
    from mov group by tenant_id, period
  on conflict (tenant_id, period) do update set
    total_sales     = m.total_sales     + excluded.total_sales,
    total_efectivo  = m.total_efectivo  + excluded.total_efectivo,
    total_sinpe     = m.total_sinpe     + excluded.total_sinpe,
    total_tarjeta   = m.total_tarjeta   + excluded.total_tarjeta,
    total_mostrador = m.total_mostrador + excluded.total_mostrador,
    total_abonos    = m.total_abonos    + excluded.total_abonos,
    total_expenses  = m.total_expenses  + excluded.total_expenses,
    total_charges   = m.total_charges   + excluded.total_charges,
    sales_count     = m.sales_count     + excluded.sales_count;

  update public.company_employees ce
     set opening_balance = ce.opening_balance
         + coalesce((select sum(ch.amount) from public.account_charges ch
                      where ch.employee_id = ce.id and ch.business_date < cutoff), 0)
         - coalesce((select sum(s.amount) from public.sales s
                      where s.employee_id = ce.id and s.source='abono' and s.business_date < cutoff), 0);

  delete from public.expenses        where business_date < cutoff;
  delete from public.sales           where business_date < cutoff;
  delete from public.account_charges where business_date < cutoff;
  delete from public.cash_sessions   where business_date < cutoff and status = 'cerrada';
end $$;

-- ---------- Config del propio restaurante (para el frontend) ----------
create or replace function public.get_my_restaurant()
returns public.restaurants language sql stable security definer set search_path = public as $$
  select * from public.restaurants where id = public.current_tenant_id()
$$;

-- ============================================================
-- Provisioning de un restaurante nuevo (solo service_role)
-- Crea el inquilino + usuario admin (y cobrador opcional) con tenant_id en
-- app_metadata. Es la unica llamada para dar de alta un cliente nuevo.
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

  -- Admin
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
  values (
    '00000000-0000-0000-0000-000000000000', v_admin, 'authenticated', 'authenticated',
    lower(p_admin_username) || '@' || v_domain,
    extensions.crypt(p_admin_password, extensions.gen_salt('bf')),
    now(), now(), now(),
    jsonb_build_object('provider','email','providers',array['email'],
                       'tenant_id', v_tenant::text, 'role','admin', 'active', true),
    jsonb_build_object('username', lower(p_admin_username), 'full_name', p_admin_full_name, 'role','admin'));
  insert into auth.identities (id, user_id, provider, provider_id, identity_data, created_at, updated_at, last_sign_in_at)
  values (gen_random_uuid(), v_admin, 'email', v_admin::text,
          jsonb_build_object('sub', v_admin::text, 'email', lower(p_admin_username)||'@'||v_domain,
                             'email_verified', true, 'phone_verified', false),
          now(), now(), now());

  -- Cobrador (opcional)
  if p_cobrador_username is not null and p_cobrador_password is not null then
    v_cobrador := gen_random_uuid();
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
    values (
      '00000000-0000-0000-0000-000000000000', v_cobrador, 'authenticated', 'authenticated',
      lower(p_cobrador_username) || '@' || v_domain,
      extensions.crypt(p_cobrador_password, extensions.gen_salt('bf')),
      now(), now(), now(),
      jsonb_build_object('provider','email','providers',array['email'],
                         'tenant_id', v_tenant::text, 'role','cobrador', 'active', true),
      jsonb_build_object('username', lower(p_cobrador_username), 'full_name', p_cobrador_full_name, 'role','cobrador'));
    insert into auth.identities (id, user_id, provider, provider_id, identity_data, created_at, updated_at, last_sign_in_at)
    values (gen_random_uuid(), v_cobrador, 'email', v_cobrador::text,
            jsonb_build_object('sub', v_cobrador::text, 'email', lower(p_cobrador_username)||'@'||v_domain,
                               'email_verified', true, 'phone_verified', false),
            now(), now(), now());
  end if;

  return jsonb_build_object('tenant_id', v_tenant, 'slug', lower(p_slug),
                            'admin_user_id', v_admin, 'cobrador_user_id', v_cobrador);
end $$;

-- ============================================================
-- Grants de la superficie nueva
-- ============================================================
revoke execute on function public.get_my_restaurant() from public, anon;
grant  execute on function public.get_my_restaurant() to authenticated;
-- provision_restaurant: solo service_role (nunca anon/authenticated).
revoke execute on function public.provision_restaurant(text,text,text,text,text,text,text,jsonb,jsonb,text,text,text)
  from public, anon, authenticated;
