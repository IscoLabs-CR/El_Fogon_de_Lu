-- ============================================================
-- Base multitenant de restaurantes (isco-restaurantes) — NUCLEO
-- Convierte el esquema single-tenant de El Fogon en multitenant.
--
-- Se aplica DESPUES de clonar el esquema original (0001-0004) y de CARGAR los
-- datos de El Fogon, porque crea el inquilino, agrega tenant_id y hace backfill
-- de las filas existentes (todas son de El Fogon).
--
-- Aislamiento: cada usuario lleva tenant_id en app_metadata (viaja en el JWT).
-- current_tenant_id() lo lee; toda policy y todo RPC filtran por el.
-- ============================================================

-- 1) Inquilinos ------------------------------------------------
create table public.restaurants (
  id         uuid primary key default gen_random_uuid(),
  slug       text not null unique,
  name       text not null,
  timezone   text not null default 'America/Costa_Rica',
  currency   text not null default 'CRC',
  theme      jsonb  not null default '{}'::jsonb,
  -- Modulos opcionales por restaurante. `creditos` = fiado a empleados de empresas.
  features   jsonb  not null default '{"creditos": true}'::jsonb,
  active     boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.restaurants enable row level security;

-- 2) Tenant del JWT (app_metadata.tenant_id) ------------------
create or replace function public.current_tenant_id()
returns uuid language sql stable set search_path = public as $$
  select nullif(auth.jwt() -> 'app_metadata' ->> 'tenant_id', '')::uuid
$$;

-- 3) El Fogon de Lu = primer inquilino ------------------------
insert into public.restaurants (slug, name, timezone, currency, features)
values ('el-fogon-de-lu', 'El Fogón de Lu', 'America/Costa_Rica', 'CRC', '{"creditos": true}'::jsonb);

-- 4) tenant_id en todas las tablas + backfill al Fogon --------
do $$
declare v uuid;
begin
  select id into v from public.restaurants where slug = 'el-fogon-de-lu';

  alter table public.profiles          add column tenant_id uuid;
  alter table public.cash_sessions     add column tenant_id uuid;
  alter table public.companies         add column tenant_id uuid;
  alter table public.company_employees add column tenant_id uuid;
  alter table public.sales             add column tenant_id uuid;
  alter table public.account_charges   add column tenant_id uuid;
  alter table public.expenses          add column tenant_id uuid;
  alter table public.monthly_rollups   add column tenant_id uuid;

  update public.profiles          set tenant_id = v;
  update public.cash_sessions     set tenant_id = v;
  update public.companies         set tenant_id = v;
  update public.company_employees set tenant_id = v;
  update public.sales             set tenant_id = v;
  update public.account_charges   set tenant_id = v;
  update public.expenses          set tenant_id = v;
  update public.monthly_rollups   set tenant_id = v;
end $$;

-- 5) NOT NULL + FK a restaurants ------------------------------
alter table public.profiles          alter column tenant_id set not null,
  add constraint profiles_tenant_fk          foreign key (tenant_id) references public.restaurants(id) on delete restrict;
alter table public.cash_sessions     alter column tenant_id set not null,
  add constraint cash_sessions_tenant_fk     foreign key (tenant_id) references public.restaurants(id) on delete restrict;
alter table public.companies         alter column tenant_id set not null,
  add constraint companies_tenant_fk         foreign key (tenant_id) references public.restaurants(id) on delete restrict;
alter table public.company_employees alter column tenant_id set not null,
  add constraint company_employees_tenant_fk foreign key (tenant_id) references public.restaurants(id) on delete restrict;
alter table public.sales             alter column tenant_id set not null,
  add constraint sales_tenant_fk             foreign key (tenant_id) references public.restaurants(id) on delete restrict;
alter table public.account_charges   alter column tenant_id set not null,
  add constraint account_charges_tenant_fk   foreign key (tenant_id) references public.restaurants(id) on delete restrict;
alter table public.expenses          alter column tenant_id set not null,
  add constraint expenses_tenant_fk          foreign key (tenant_id) references public.restaurants(id) on delete restrict;
alter table public.monthly_rollups   alter column tenant_id set not null,
  add constraint monthly_rollups_tenant_fk   foreign key (tenant_id) references public.restaurants(id) on delete restrict;

-- 6) Indices unicos: de GLOBALES a POR-INQUILINO --------------
-- El fix critico: una caja abierta POR restaurante, no una en todo el sistema.
drop index if exists public.cash_sessions_one_open;
create unique index cash_sessions_one_open on public.cash_sessions (tenant_id) where status = 'abierta';

-- username unico por inquilino (dos restaurantes pueden tener "admin").
alter table public.profiles drop constraint profiles_username_key;
alter table public.profiles add constraint profiles_tenant_username_key unique (tenant_id, username);

-- nombre de empresa unico por inquilino.
alter table public.companies drop constraint companies_name_key;
alter table public.companies add constraint companies_tenant_name_key unique (tenant_id, name);

-- rollups: PK (period) -> (tenant_id, period).
alter table public.monthly_rollups drop constraint monthly_rollups_pkey;
alter table public.monthly_rollups add primary key (tenant_id, period);

-- 7) Indices de rendimiento por inquilino ---------------------
create index profiles_tenant_idx          on public.profiles (tenant_id);
create index cash_sessions_tenant_idx     on public.cash_sessions (tenant_id, business_date desc);
create index companies_tenant_idx         on public.companies (tenant_id);
create index company_employees_tenant_idx on public.company_employees (tenant_id);
create index sales_tenant_idx             on public.sales (tenant_id, business_date);
create index account_charges_tenant_idx   on public.account_charges (tenant_id, business_date);
create index expenses_tenant_idx          on public.expenses (tenant_id, business_date);

-- 8) RLS de restaurants: cada quien ve solo su fila -----------
create policy p_restaurants_read on public.restaurants
  for select to authenticated using (id = public.current_tenant_id());

-- 9) Grants ---------------------------------------------------
revoke execute on function public.current_tenant_id() from public, anon;
grant execute on function public.current_tenant_id() to authenticated;
