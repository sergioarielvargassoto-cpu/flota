-- =====================================================================
-- Historial de cambios de kilometraje
-- Ejecutar en Supabase → SQL Editor → New query → Run
-- =====================================================================

-- Tabla para guardar cada cambio de km (auditoría)
create table public.km_history (
  id         uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  km         int not null,
  recorded_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index km_history_vehicle_idx on public.km_history(vehicle_id, recorded_at desc);
create index km_history_date_idx on public.km_history(recorded_at);

-- Seguridad RLS
alter table public.km_history enable row level security;
create policy "solo_logueados" on public.km_history for all to authenticated using (true) with check (true);

-- Tabla para auditoría de reparaciones y mantenimientos (cambios de estado, fechas, etc.)
create table public.maintenance_history (
  id             uuid primary key default gen_random_uuid(),
  maintenance_id uuid not null references public.maintenance(id) on delete cascade,
  field          text not null,
  old_value      text,
  new_value      text not null,
  changed_at     timestamptz not null default now(),
  created_at     timestamptz not null default now()
);

create index maintenance_history_idx on public.maintenance_history(maintenance_id, changed_at desc);

alter table public.maintenance_history enable row level security;
create policy "solo_logueados" on public.maintenance_history for all to authenticated using (true) with check (true);

-- Tabla para auditoría de reparaciones
create table public.repair_history (
  id        uuid primary key default gen_random_uuid(),
  repair_id uuid not null references public.repairs(id) on delete cascade,
  field     text not null,
  old_value text,
  new_value text not null,
  changed_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index repair_history_idx on public.repair_history(repair_id, changed_at desc);

alter table public.repair_history enable row level security;
create policy "solo_logueados" on public.repair_history for all to authenticated using (true) with check (true);
