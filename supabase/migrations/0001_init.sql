-- ============================================================
-- El Fogon de Lu - esquema inicial
-- Proyecto Supabase: isco-soda
-- Zona operativa: America/Costa_Rica. Moneda: CRC.
--
-- Principios:
--   1. Cero policies de INSERT/UPDATE/DELETE. Toda escritura pasa por RPC
--      security definer, de modo que la caja no se pueda saltar.
--   2. business_date se hereda de la sesion de caja, nunca del reloj.
--   3. El cobrador no alcanza filas de ventas fuera del dia operativo:
--      esa es la unica forma real de ocultarle los totales mensuales.
-- ============================================================

create extension if not exists pgcrypto;

-- ---------- Helpers ----------
create or replace function public.today_cr()
returns date language sql stable set search_path = public as
$$ select (now() at time zone 'America/Costa_Rica')::date $$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as
$$ select exists (
     select 1 from public.profiles
      where id = auth.uid() and role = 'admin' and active
   ) $$;

create or replace function public.is_staff()
returns boolean language sql stable security definer set search_path = public as
$$ select exists (
     select 1 from public.profiles
      where id = auth.uid() and active
   ) $$;

-- ---------- Tablas ----------
create table public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  username   text not null unique,
  full_name  text not null,
  role       text not null check (role in ('admin','cobrador')),
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.cash_sessions (
  id             uuid primary key default gen_random_uuid(),
  business_date  date not null default public.today_cr(),
  status         text not null default 'abierta' check (status in ('abierta','cerrada')),
  opened_by      uuid not null references public.profiles(id) on delete restrict,
  opened_at      timestamptz not null default now(),
  opening_amount numeric(12,2) not null check (opening_amount >= 0),
  closed_by      uuid references public.profiles(id) on delete restrict,
  closed_at      timestamptz,
  counted_cash   numeric(12,2) check (counted_cash >= 0),
  expected_cash  numeric(12,2),
  difference     numeric(12,2) generated always as (counted_cash - expected_cash) stored,
  -- Snapshots al cierre: el arqueo debe sobrevivir al purgado anual de movimientos.
  total_sales             numeric(12,2),
  total_efectivo          numeric(12,2),
  total_sinpe             numeric(12,2),
  total_tarjeta           numeric(12,2),
  total_expenses_efectivo numeric(12,2),
  total_charges           numeric(12,2),
  notes text,
  constraint cash_sessions_closed_shape check (
    (status = 'abierta' and closed_at is null and closed_by is null
      and counted_cash is null and expected_cash is null)
    or
    (status = 'cerrada' and closed_at is not null and closed_by is not null
      and counted_cash is not null and expected_cash is not null)
  )
);

-- Garantia dura de "una sola caja abierta", en la base y no en el codigo.
create unique index cash_sessions_one_open
  on public.cash_sessions (status) where status = 'abierta';
create index cash_sessions_bdate_idx
  on public.cash_sessions (business_date desc);

create table public.companies (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.company_employees (
  id         uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  name       text not null,
  active     boolean not null default true,
  -- Saldo arrastrado de los movimientos ya purgados (mas de un ano).
  -- Sin esto, purgar borraria deudas vivas.
  opening_balance numeric(12,2) not null default 0,
  created_at timestamptz not null default now(),
  unique (company_id, name)
);
create index company_employees_company_idx
  on public.company_employees (company_id) where active;

create table public.sales (
  id             uuid primary key default gen_random_uuid(),
  session_id     uuid not null references public.cash_sessions(id) on delete restrict,
  business_date  date not null,                       -- lo estampa el trigger desde la sesion
  amount         numeric(12,2) not null check (amount > 0),
  description    text not null default '',
  payment_method text not null check (payment_method in ('efectivo','sinpe','tarjeta')),
  source         text not null check (source in ('mostrador','abono')),
  employee_id    uuid references public.company_employees(id) on delete restrict,
  created_by     uuid not null references public.profiles(id) on delete restrict,
  created_at     timestamptz not null default now(),
  constraint sales_abono_requires_employee check ((source = 'abono') = (employee_id is not null))
);
create index sales_bdate_idx    on public.sales (business_date);
create index sales_session_idx  on public.sales (session_id);
create index sales_employee_idx on public.sales (employee_id) where source = 'abono';

-- Consumos a credito. NO son ingreso: el ingreso se reconoce cuando el empleado paga.
create table public.account_charges (
  id            uuid primary key default gen_random_uuid(),
  session_id    uuid not null references public.cash_sessions(id) on delete restrict,
  business_date date not null,
  employee_id   uuid not null references public.company_employees(id) on delete restrict,
  amount        numeric(12,2) not null check (amount > 0),
  description   text not null default '',
  created_by    uuid not null references public.profiles(id) on delete restrict,
  created_at    timestamptz not null default now()
);
create index charges_employee_idx on public.account_charges (employee_id);
create index charges_bdate_idx    on public.account_charges (business_date);
create index charges_session_idx  on public.account_charges (session_id);

create table public.expenses (
  id            uuid primary key default gen_random_uuid(),
  session_id    uuid not null references public.cash_sessions(id) on delete restrict,
  business_date date not null,
  amount        numeric(12,2) not null check (amount > 0),
  description   text not null default '',
  category      text not null default 'otros'
    check (category in ('insumos','servicios','planilla','mantenimiento','otros')),
  paid_with     text not null check (paid_with in ('efectivo','sinpe','tarjeta')),
  created_by    uuid not null references public.profiles(id) on delete restrict,
  created_at    timestamptz not null default now()
);
create index expenses_bdate_idx   on public.expenses (business_date);
create index expenses_session_idx on public.expenses (session_id);

-- 12 filas por ano. Se escriben antes de purgar para que las comparaciones sobrevivan.
create table public.monthly_rollups (
  period          date primary key,                   -- primer dia del mes
  total_sales     numeric(14,2) not null default 0,
  total_efectivo  numeric(14,2) not null default 0,
  total_sinpe     numeric(14,2) not null default 0,
  total_tarjeta   numeric(14,2) not null default 0,
  total_mostrador numeric(14,2) not null default 0,
  total_abonos    numeric(14,2) not null default 0,
  total_expenses  numeric(14,2) not null default 0,
  total_charges   numeric(14,2) not null default 0,
  sales_count     integer       not null default 0,
  created_at      timestamptz not null default now()
);

-- ---------- Integridad de caja + business_date ----------
create or replace function public.tg_session_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare s record;
begin
  select id, status, business_date into s
    from public.cash_sessions
   where id = new.session_id
   for share;   -- bloquea el cierre concurrente hasta que este movimiento commitee

  if not found then
    raise exception 'Sesion de caja inexistente.' using errcode = '23503';
  end if;
  if s.status <> 'abierta' then
    raise exception 'La caja de ese movimiento ya esta cerrada.' using errcode = 'P0001';
  end if;

  if tg_op = 'UPDATE' then
    if new.session_id <> old.session_id then
      raise exception 'No se puede mover un movimiento de sesion.';
    end if;
    new.business_date := old.business_date;
  else
    new.business_date := s.business_date;   -- el dia operativo manda, no el reloj
  end if;
  return new;
end $$;

create trigger sales_session_guard    before insert or update on public.sales
  for each row execute function public.tg_session_guard();
create trigger expenses_session_guard before insert or update on public.expenses
  for each row execute function public.tg_session_guard();
create trigger charges_session_guard  before insert or update on public.account_charges
  for each row execute function public.tg_session_guard();
-- Deliberadamente no en DELETE, para que el purgado pueda borrar historico cerrado.

-- ---------- Alta de usuarios ----------
-- Todo usuario nuevo nace cobrador e INACTIVO. Si se leyera el rol de raw_user_meta_data
-- y el signup quedara abierto en Auth, cualquiera se registraria mandando
-- {"role":"admin"} y entraria como administrador. is_staff() exige active, asi que un
-- perfil recien creado no puede leer ni escribir nada hasta que se le habilite a mano:
--   update public.profiles set active = true, role = 'admin' where username = 'nuevo';
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, username, full_name, role, active)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'username', split_part(new.email,'@',1)),
    coalesce(new.raw_user_meta_data->>'full_name', 'Sin nombre'),
    'cobrador',
    false
  );
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================
-- RLS
-- ============================================================
alter table public.profiles          enable row level security;
alter table public.cash_sessions     enable row level security;
alter table public.companies         enable row level security;
alter table public.company_employees enable row level security;
alter table public.sales             enable row level security;
alter table public.account_charges   enable row level security;
alter table public.expenses          enable row level security;
alter table public.monthly_rollups   enable row level security;

revoke all on all tables in schema public from anon;
revoke insert, update, delete on all tables in schema public from authenticated;
-- Lecturas: por RLS. Escrituras: exclusivamente por RPC security definer.

create policy p_profiles_read on public.profiles
  for select to authenticated using ((select public.is_staff()));

create policy p_companies_read on public.companies
  for select to authenticated using ((select public.is_staff()));

create policy p_employees_read on public.company_employees
  for select to authenticated using ((select public.is_staff()));

-- Gastos y consumos a credito: lectura completa para ambos roles; no revelan ventas.
create policy p_expenses_read on public.expenses
  for select to authenticated using ((select public.is_staff()));

create policy p_charges_read on public.account_charges
  for select to authenticated using ((select public.is_staff()));

-- El candado real del rol cobrador. Solo alcanza filas de hoy o de la caja abierta,
-- asi que no puede sumar un mes: esas filas no existen para su JWT, y RLS filtra
-- antes de agregar (los agregados de PostgREST tambien quedan cubiertos).
create policy p_sales_read on public.sales
  for select to authenticated using (
    (select public.is_admin())
    or business_date = public.today_cr()
    or exists (
      select 1 from public.cash_sessions cs
       where cs.id = sales.session_id and cs.status = 'abierta'
    )
  );

create policy p_sessions_read on public.cash_sessions
  for select to authenticated using (
    (select public.is_admin())
    or status = 'abierta'
    or business_date = public.today_cr()
  );

create policy p_rollups_read on public.monthly_rollups
  for select to authenticated using ((select public.is_admin()));

-- ============================================================
-- RPCs: unica superficie de escritura y de agregados historicos
-- ============================================================
create or replace function public.open_cash_session(p_opening_amount numeric, p_notes text default null)
returns public.cash_sessions
language plpgsql security definer set search_path = public as $$
declare v public.cash_sessions;
begin
  if not public.is_staff() then raise exception 'No autorizado.' using errcode = '42501'; end if;
  if p_opening_amount is null or p_opening_amount < 0 then
    raise exception 'Monto de apertura invalido.';
  end if;
  begin
    insert into public.cash_sessions (business_date, opened_by, opening_amount, notes)
    values (public.today_cr(), auth.uid(), p_opening_amount, p_notes)
    returning * into v;
  exception when unique_violation then
    raise exception 'Ya hay una caja abierta. Cierrela antes de abrir otra.' using errcode = 'P0001';
  end;
  return v;
end $$;

create or replace function public.close_cash_session(p_counted_cash numeric, p_notes text default null)
returns public.cash_sessions
language plpgsql security definer set search_path = public as $$
declare s public.cash_sessions; v record; e record; c numeric;
begin
  if not public.is_staff() then raise exception 'No autorizado.' using errcode = '42501'; end if;
  if p_counted_cash is null or p_counted_cash < 0 then
    raise exception 'Efectivo contado invalido.';
  end if;

  select * into s from public.cash_sessions where status = 'abierta' for update;
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
    status        = 'cerrada',
    closed_by     = auth.uid(),
    closed_at     = now(),
    counted_cash  = p_counted_cash,
    -- Solo el efectivo mueve la caja. Un abono por tarjeta o sinpe es venta pero no efectivo.
    expected_cash = s.opening_amount + v.efec - e.efec,
    total_sales             = v.total,
    total_efectivo          = v.efec,
    total_sinpe             = v.sinpe,
    total_tarjeta           = v.tarj,
    total_expenses_efectivo = e.efec,
    total_charges           = c,
    notes = coalesce(p_notes, s.notes)
  where id = s.id
  returning * into s;
  return s;
end $$;

-- Venta de mostrador (p_employee_id null) o abono de empleado (p_employee_id no null).
-- El abono ES el evento de ingreso: entra a sales y fluye solo al panel del dia y al arqueo.
create or replace function public.register_sale(
  p_amount numeric, p_description text, p_payment_method text, p_employee_id uuid default null)
returns public.sales
language plpgsql security definer set search_path = public as $$
declare v_session uuid; r public.sales;
begin
  if not public.is_staff() then raise exception 'No autorizado.' using errcode = '42501'; end if;
  select id into v_session from public.cash_sessions where status = 'abierta';
  if v_session is null then
    raise exception 'No hay caja abierta. Abra la caja antes de registrar movimientos.';
  end if;

  insert into public.sales (session_id, amount, description, payment_method, source, employee_id, created_by)
  values (v_session, p_amount, coalesce(p_description,''), p_payment_method,
          case when p_employee_id is null then 'mostrador' else 'abono' end,
          p_employee_id, auth.uid())
  returning * into r;   -- el trigger estampa business_date desde la sesion
  return r;
end $$;

create or replace function public.register_charge(p_employee_id uuid, p_amount numeric, p_description text)
returns public.account_charges
language plpgsql security definer set search_path = public as $$
declare v_session uuid; r public.account_charges;
begin
  if not public.is_staff() then raise exception 'No autorizado.' using errcode = '42501'; end if;
  select id into v_session from public.cash_sessions where status = 'abierta';
  if v_session is null then raise exception 'No hay caja abierta.'; end if;

  insert into public.account_charges (session_id, employee_id, amount, description, created_by)
  values (v_session, p_employee_id, p_amount, coalesce(p_description,''), auth.uid())
  returning * into r;
  return r;
end $$;

create or replace function public.register_expense(
  p_amount numeric, p_description text, p_category text, p_paid_with text)
returns public.expenses
language plpgsql security definer set search_path = public as $$
declare v_session uuid; r public.expenses;
begin
  if not public.is_staff() then raise exception 'No autorizado.' using errcode = '42501'; end if;
  select id into v_session from public.cash_sessions where status = 'abierta';
  if v_session is null then raise exception 'No hay caja abierta.'; end if;

  insert into public.expenses (session_id, amount, description, category, paid_with, created_by)
  values (v_session, p_amount, coalesce(p_description,''), coalesce(p_category,'otros'), p_paid_with, auth.uid())
  returning * into r;
  return r;
end $$;

-- Borrado solo mientras la caja siga abierta. Tras el cierre los movimientos son inmutables;
-- un error posterior se corrige con un movimiento de ajuste en la caja actual.
create or replace function public.delete_sale(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_staff() then raise exception 'No autorizado.' using errcode = '42501'; end if;
  delete from public.sales s using public.cash_sessions cs
   where s.id = p_id and cs.id = s.session_id and cs.status = 'abierta';
  if not found then
    raise exception 'No se puede eliminar: la caja de ese movimiento ya fue cerrada.';
  end if;
end $$;

create or replace function public.delete_expense(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_staff() then raise exception 'No autorizado.' using errcode = '42501'; end if;
  delete from public.expenses x using public.cash_sessions cs
   where x.id = p_id and cs.id = x.session_id and cs.status = 'abierta';
  if not found then
    raise exception 'No se puede eliminar: la caja de ese movimiento ya fue cerrada.';
  end if;
end $$;

create or replace function public.delete_charge(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_staff() then raise exception 'No autorizado.' using errcode = '42501'; end if;
  delete from public.account_charges c using public.cash_sessions cs
   where c.id = p_id and cs.id = c.session_id and cs.status = 'abierta';
  if not found then
    raise exception 'No se puede eliminar: la caja de ese movimiento ya fue cerrada.';
  end if;
end $$;

-- Resumen del dia. Cobrador: solo hoy. Admin: cualquier dia.
create or replace function public.get_day_summary(p_date date default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare d date; res jsonb;
begin
  if not public.is_staff() then raise exception 'No autorizado.' using errcode = '42501'; end if;
  d := coalesce(p_date, public.today_cr());
  if not public.is_admin() and d <> public.today_cr() then
    raise exception 'Solo el administrador puede consultar dias anteriores.' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'business_date',   d,
    'ventas_total',    coalesce((select sum(amount) from sales where business_date = d),0),
    'ventas_efectivo', coalesce((select sum(amount) from sales where business_date = d and payment_method='efectivo'),0),
    'ventas_sinpe',    coalesce((select sum(amount) from sales where business_date = d and payment_method='sinpe'),0),
    'ventas_tarjeta',  coalesce((select sum(amount) from sales where business_date = d and payment_method='tarjeta'),0),
    'ventas_mostrador',coalesce((select sum(amount) from sales where business_date = d and source='mostrador'),0),
    'abonos_cobrados', coalesce((select sum(amount) from sales where business_date = d and source='abono'),0),
    'gastos_total',    coalesce((select sum(amount) from expenses where business_date = d),0),
    'gastos_efectivo', coalesce((select sum(amount) from expenses where business_date = d and paid_with='efectivo'),0),
    -- No es venta. Se expone aparte para que el panel del dia no se lea mal.
    'consumo_credito', coalesce((select sum(amount) from account_charges where business_date = d),0),
    'neto',            coalesce((select sum(amount) from sales where business_date = d),0)
                     - coalesce((select sum(amount) from expenses where business_date = d),0),
    'tickets',         (select count(*) from sales where business_date = d)
  ) into res;
  return res;
end $$;

-- Solo admin. Unico camino a agregados historicos de ventas.
create or replace function public.get_month_summary(p_year int, p_month int)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare d1 date; d2 date; res jsonb;
begin
  if not public.is_admin() then
    raise exception 'Solo el administrador puede ver totales mensuales.' using errcode = '42501';
  end if;
  d1 := make_date(p_year, p_month, 1);
  d2 := (d1 + interval '1 month')::date;

  select jsonb_build_object(
    'period',          d1,
    'ventas_total',    coalesce((select sum(amount) from sales where business_date >= d1 and business_date < d2),0),
    'ventas_efectivo', coalesce((select sum(amount) from sales where business_date >= d1 and business_date < d2 and payment_method='efectivo'),0),
    'ventas_sinpe',    coalesce((select sum(amount) from sales where business_date >= d1 and business_date < d2 and payment_method='sinpe'),0),
    'ventas_tarjeta',  coalesce((select sum(amount) from sales where business_date >= d1 and business_date < d2 and payment_method='tarjeta'),0),
    'ventas_mostrador',coalesce((select sum(amount) from sales where business_date >= d1 and business_date < d2 and source='mostrador'),0),
    'abonos_cobrados', coalesce((select sum(amount) from sales where business_date >= d1 and business_date < d2 and source='abono'),0),
    'gastos_total',    coalesce((select sum(amount) from expenses where business_date >= d1 and business_date < d2),0),
    'consumo_credito', coalesce((select sum(amount) from account_charges where business_date >= d1 and business_date < d2),0),
    'tickets',         (select count(*) from sales where business_date >= d1 and business_date < d2),
    'neto',            coalesce((select sum(amount) from sales where business_date >= d1 and business_date < d2),0)
                     - coalesce((select sum(amount) from expenses where business_date >= d1 and business_date < d2),0),
    'por_dia', coalesce((
      select jsonb_agg(x order by x->>'d')
        from (select jsonb_build_object(
                       'd', business_date,
                       'ventas', sum(amount),
                       'gastos', coalesce((select sum(e.amount) from expenses e
                                            where e.business_date = s.business_date),0)
                     ) as x
                from sales s
               where business_date >= d1 and business_date < d2
               group by business_date) q), '[]'::jsonb)
  ) into res;
  return res;
end $$;

-- Gastos por semana o por mes. Ambos roles: no revelan ventas.
create or replace function public.get_expenses_rollup(p_from date, p_to date, p_bucket text default 'week')
returns table (bucket date, total numeric, por_categoria jsonb)
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_staff() then raise exception 'No autorizado.' using errcode = '42501'; end if;
  if p_bucket not in ('week','month') then raise exception 'Agrupacion invalida.'; end if;

  return query
  with base as (
    select date_trunc(p_bucket, business_date)::date as b, category, sum(amount) as cat_total
      from public.expenses
     where business_date between p_from and p_to
     group by 1, 2
  )
  select b, sum(cat_total), jsonb_object_agg(category, cat_total)
    from base group by b order by b;
end $$;

-- Saldos. Siempre incluyen opening_balance (lo ya purgado).
-- No se usa una vista: una vista security_invoker sobre sales daria saldos falsos al
-- cobrador, porque su RLS solo alcanza el dia de hoy.
create or replace function public.get_employee_balances(p_company_id uuid default null)
returns table (
  employee_id uuid, employee_name text,
  company_id uuid, company_name text,
  balance numeric, last_movement date
)
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_staff() then raise exception 'No autorizado.' using errcode = '42501'; end if;
  return query
  select ce.id, ce.name, c.id, c.name,
         ce.opening_balance
           + coalesce((select sum(ch.amount) from public.account_charges ch
                        where ch.employee_id = ce.id), 0)
           - coalesce((select sum(s.amount) from public.sales s
                        where s.employee_id = ce.id and s.source = 'abono'), 0),
         greatest(
           (select max(ch.business_date) from public.account_charges ch where ch.employee_id = ce.id),
           (select max(s.business_date)  from public.sales s
             where s.employee_id = ce.id and s.source = 'abono')
         )
    from public.company_employees ce
    join public.companies c on c.id = ce.company_id
   where ce.active and (p_company_id is null or ce.company_id = p_company_id)
   order by c.name, ce.name;
end $$;

create or replace function public.get_employee_statement(p_employee_id uuid, p_limit int default 100)
returns table (fecha date, tipo text, descripcion text, monto numeric, metodo text, mov_id uuid)
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_staff() then raise exception 'No autorizado.' using errcode = '42501'; end if;
  return query
  select business_date, 'cargo'::text, description, amount, null::text, id
    from public.account_charges where employee_id = p_employee_id
  union all
  select business_date, 'abono'::text, description, amount, payment_method, id
    from public.sales where employee_id = p_employee_id and source = 'abono'
  order by 1 desc, 2
  limit p_limit;
end $$;

-- Alta y edicion de empresas y empleados: solo admin.
create or replace function public.upsert_company(p_id uuid, p_name text, p_active boolean default true)
returns public.companies
language plpgsql security definer set search_path = public as $$
declare r public.companies;
begin
  if not public.is_admin() then raise exception 'Solo el administrador.' using errcode = '42501'; end if;
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
  if not public.is_admin() then raise exception 'Solo el administrador.' using errcode = '42501'; end if;
  insert into public.company_employees (id, company_id, name, active)
  values (coalesce(p_id, gen_random_uuid()), p_company_id, p_name, p_active)
  on conflict (id) do update set
    company_id = excluded.company_id, name = excluded.name, active = excluded.active
  returning * into r;
  return r;
end $$;

-- ============================================================
-- Retencion a un ano
-- ============================================================
create or replace function public.purge_old_records()
returns void
language plpgsql security definer set search_path = public as $$
declare cutoff date := (public.today_cr() - interval '1 year')::date;
begin
  -- 1) Congelar los meses en rollups ANTES de borrar.
  --    Acumulativo: un mismo mes puede purgarse en dos tandas.
  with mov as (
    select date_trunc('month', business_date)::date as period,
           amount as venta,
           case when payment_method = 'efectivo' then amount else 0 end as efec,
           case when payment_method = 'sinpe'    then amount else 0 end as sinpe,
           case when payment_method = 'tarjeta'  then amount else 0 end as tarj,
           case when source = 'mostrador' then amount else 0 end as most,
           case when source = 'abono'     then amount else 0 end as abo,
           0::numeric as gasto, 0::numeric as cargo, 1 as cnt
      from public.sales where business_date < cutoff
    union all
    select date_trunc('month', business_date)::date, 0,0,0,0,0,0, amount, 0, 0
      from public.expenses where business_date < cutoff
    union all
    select date_trunc('month', business_date)::date, 0,0,0,0,0,0, 0, amount, 0
      from public.account_charges where business_date < cutoff
  )
  insert into public.monthly_rollups as m
    (period, total_sales, total_efectivo, total_sinpe, total_tarjeta, total_mostrador,
     total_abonos, total_expenses, total_charges, sales_count)
  select period, sum(venta), sum(efec), sum(sinpe), sum(tarj), sum(most),
         sum(abo), sum(gasto), sum(cargo), sum(cnt)
    from mov group by period
  on conflict (period) do update set
    total_sales     = m.total_sales     + excluded.total_sales,
    total_efectivo  = m.total_efectivo  + excluded.total_efectivo,
    total_sinpe     = m.total_sinpe     + excluded.total_sinpe,
    total_tarjeta   = m.total_tarjeta   + excluded.total_tarjeta,
    total_mostrador = m.total_mostrador + excluded.total_mostrador,
    total_abonos    = m.total_abonos    + excluded.total_abonos,
    total_expenses  = m.total_expenses  + excluded.total_expenses,
    total_charges   = m.total_charges   + excluded.total_charges,
    sales_count     = m.sales_count     + excluded.sales_count;

  -- 2) Critico: plegar el neto historico en opening_balance.
  --    Sin este paso, purgar borraria deudas vivas de los empleados.
  update public.company_employees ce
     set opening_balance = ce.opening_balance
         + coalesce((select sum(ch.amount) from public.account_charges ch
                      where ch.employee_id = ce.id and ch.business_date < cutoff), 0)
         - coalesce((select sum(s.amount) from public.sales s
                      where s.employee_id = ce.id and s.source = 'abono'
                        and s.business_date < cutoff), 0);

  -- 3) Borrado en orden seguro. Las FK son on delete restrict a proposito:
  --    una cascada desde cash_sessions podria evaporar ingresos en silencio.
  delete from public.expenses        where business_date < cutoff;
  delete from public.sales           where business_date < cutoff;
  delete from public.account_charges where business_date < cutoff;
  delete from public.cash_sessions   where business_date < cutoff and status = 'cerrada';
end $$;

-- ============================================================
-- Grants
-- ============================================================
-- Supabase concede EXECUTE por defecto a `authenticated` sobre toda funcion nueva del
-- schema public. Sin revocarselo, purge_old_records, tg_session_guard y handle_new_user
-- quedarian expuestas como RPC en /rest/v1/rpc/. Se revoca todo y se concede solo la
-- superficie deliberada.
revoke execute on all functions in schema public from public, anon, authenticated;

grant execute on function
  public.open_cash_session(numeric, text),
  public.close_cash_session(numeric, text),
  public.register_sale(numeric, text, text, uuid),
  public.register_charge(uuid, numeric, text),
  public.register_expense(numeric, text, text, text),
  public.delete_sale(uuid),
  public.delete_expense(uuid),
  public.delete_charge(uuid),
  public.get_day_summary(date),
  public.get_month_summary(int, int),
  public.get_expenses_rollup(date, date, text),
  public.get_employee_balances(uuid),
  public.get_employee_statement(uuid, int),
  public.upsert_company(uuid, text, boolean),
  public.upsert_employee(uuid, uuid, text, boolean),
  public.is_admin(),
  public.is_staff(),
  -- is_admin/is_staff/today_cr las necesita el rol invocante para evaluar las policies.
  public.today_cr()
to authenticated;

-- ---------- Purgado programado ----------
create extension if not exists pg_cron with schema pg_catalog;

select cron.schedule(
  'fogon-purge-1y',
  '0 8 1 * *',                        -- el dia 1 de cada mes, 8:00 UTC
  $$ select public.purge_old_records(); $$
);

-- Realtime del panel del dia. Respeta RLS: el cobrador solo recibe lo de hoy.
alter publication supabase_realtime add table public.sales;
alter publication supabase_realtime add table public.expenses;
alter publication supabase_realtime add table public.account_charges;
alter publication supabase_realtime add table public.cash_sessions;
