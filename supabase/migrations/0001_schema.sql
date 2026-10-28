-- =====================================================================
-- Control de Flota · Serprove · Esquema inicial
-- Ejecutar UNA vez en Supabase → SQL Editor → New query → Run
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------- Choferes ----------
create table public.drivers (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  dni        text,
  phone      text,
  notes      text,
  created_at timestamptz not null default now()
);

-- ---------- Vehículos ----------
create table public.vehicles (
  id              uuid primary key default gen_random_uuid(),
  plate           text not null unique,            -- patente normalizada: sin espacios, mayúsculas
  type            text,                            -- Camión, Utilitario, Camioneta…
  brand           text,
  model           text,
  year            int,
  km              int,                             -- último kilometraje conocido
  km_date         date,                            -- fecha de ese kilometraje
  last_service_km int,                             -- km del último service
  fuel_card       text,                            -- últimos dígitos de la tarjeta YPF en Ruta
  driver_id       uuid references public.drivers(id) on delete set null,
  status          text not null default 'Activo' check (status in ('Activo','En taller','Baja')),
  chassis         text,
  notes           text,
  created_at      timestamptz not null default now()
);

-- ---------- Vencimientos (de un vehículo O de un chofer) ----------
create table public.documents (
  id         uuid primary key default gen_random_uuid(),
  vehicle_id uuid references public.vehicles(id) on delete cascade,
  driver_id  uuid references public.drivers(id) on delete cascade,
  doc_type   text not null,
  expires_on date,                                 -- null = pendiente de cargar
  reference  text,
  notes      text,
  created_at timestamptz not null default now(),
  constraint documents_one_owner check (num_nonnulls(vehicle_id, driver_id) = 1)
);
create index documents_vehicle_idx on public.documents(vehicle_id);
create index documents_driver_idx  on public.documents(driver_id);
create index documents_expires_idx on public.documents(expires_on);

-- ---------- Talleres ----------
create table public.workshops (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  phone      text,
  specialty  text,
  address    text,
  notes      text,
  created_at timestamptz not null default now()
);

-- ---------- Reparaciones ----------
create table public.repairs (
  id          uuid primary key default gen_random_uuid(),
  vehicle_id  uuid not null references public.vehicles(id) on delete cascade,
  date        date not null,
  description text not null,
  workshop_id uuid references public.workshops(id) on delete set null,
  km          int,
  cost        numeric(14,2),
  invoice     text,
  status      text not null default 'Finalizada' check (status in ('Pendiente','En curso','Finalizada')),
  created_at  timestamptz not null default now()
);
create index repairs_vehicle_idx on public.repairs(vehicle_id, date desc);

-- ---------- Mantenimientos ----------
create table public.maintenance (
  id          uuid primary key default gen_random_uuid(),
  vehicle_id  uuid not null references public.vehicles(id) on delete cascade,
  type        text not null,
  date        date not null,
  km          int,
  workshop_id uuid references public.workshops(id) on delete set null,
  cost        numeric(14,2),
  next_date   date,
  next_km     int,
  notes       text,
  created_at  timestamptz not null default now()
);
create index maintenance_vehicle_idx on public.maintenance(vehicle_id, date desc);

-- ---------- Cargas de combustible (YPF en Ruta) ----------
create table public.fuel_loads (
  id          uuid primary key default gen_random_uuid(),
  vehicle_id  uuid not null references public.vehicles(id) on delete cascade,
  date        date not null,
  liters      numeric(10,2) not null,
  amount      numeric(14,2),                       -- importe SIN IVA
  km          int,                                 -- odómetro validado
  km_raw      int,                                 -- odómetro tal como vino (puede ser un error de tipeo)
  station     text,
  product     text,
  driver_name text,
  receipt     text unique,                         -- remito: evita duplicar al importar dos veces
  created_at  timestamptz not null default now()
);
create index fuel_vehicle_idx on public.fuel_loads(vehicle_id, date desc);
create index fuel_date_idx    on public.fuel_loads(date);

-- ---------- Recorridos diarios (Gestya) ----------
create table public.trips (
  id          uuid primary key default gen_random_uuid(),
  vehicle_id  uuid not null references public.vehicles(id) on delete cascade,
  date        date not null,
  km_calc     numeric(10,2) not null default 0,
  km_reported numeric(10,2),
  max_speed   int,
  moving_time text,
  unique (vehicle_id, date)                        -- importar dos veces actualiza, no duplica
);
create index trips_date_idx on public.trips(date);

-- ---------- Adjuntos (archivos en Storage) ----------
create table public.attachments (
  id             uuid primary key default gen_random_uuid(),
  document_id    uuid references public.documents(id)   on delete cascade,
  repair_id      uuid references public.repairs(id)     on delete cascade,
  maintenance_id uuid references public.maintenance(id) on delete cascade,
  path           text not null,                    -- ruta dentro del bucket "adjuntos"
  name           text not null,
  created_at     timestamptz not null default now(),
  constraint attachments_one_parent check (num_nonnulls(document_id, repair_id, maintenance_id) = 1)
);

-- ---------- Ajustes (una sola fila) ----------
create table public.settings (
  id         int primary key default 1 check (id = 1),
  company    text not null default 'Serprove',
  d1         int  not null default 21,             -- aviso "próximo" (días antes)
  d2         int  not null default 15,             -- aviso "urgente"
  d3         int  not null default 7,              -- aviso "crítico"
  km_alert   int  not null default 1000,           -- aviso por km faltantes
  service_km int  not null default 10000           -- service cada X km
);
insert into public.settings (id) values (1) on conflict do nothing;

-- =====================================================================
-- SEGURIDAD (RLS): solo usuarios logueados pueden leer y escribir.
-- IMPORTANTE: en Supabase → Authentication → Sign In / Providers
-- desactivá "Allow new users to sign up" para que solo entres vos.
-- =====================================================================
do $$
declare t text;
begin
  foreach t in array array['drivers','vehicles','documents','workshops','repairs',
                           'maintenance','fuel_loads','trips','attachments','settings']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "solo_logueados" on public.%I for all to authenticated using (true) with check (true)', t);
  end loop;
end $$;

-- ---------- Storage: bucket privado para adjuntos (máx. 10 MB por archivo) ----------
insert into storage.buckets (id, name, public, file_size_limit)
values ('adjuntos', 'adjuntos', false, 10485760)
on conflict (id) do nothing;

create policy "adjuntos_solo_logueados" on storage.objects
  for all to authenticated
  using (bucket_id = 'adjuntos')
  with check (bucket_id = 'adjuntos');
