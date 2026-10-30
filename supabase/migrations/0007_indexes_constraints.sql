-- Índices en Foreign Keys y columnas filtradas frecuentemente
CREATE INDEX IF NOT EXISTS drivers_dni_idx ON public.drivers(dni);
CREATE INDEX IF NOT EXISTS drivers_name_idx ON public.drivers(name);
CREATE INDEX IF NOT EXISTS workshops_name_idx ON public.workshops(name);
CREATE INDEX IF NOT EXISTS vehicles_status_idx ON public.vehicles(status);
CREATE INDEX IF NOT EXISTS vehicles_branch_idx ON public.vehicles(branch);
CREATE INDEX IF NOT EXISTS repairs_status_idx ON public.repairs(status);
CREATE INDEX IF NOT EXISTS documents_vehicle_doc_type_idx ON public.documents(vehicle_id, doc_type);

-- UNIQUE Constraints para prevenir duplicados
CREATE UNIQUE INDEX IF NOT EXISTS documents_vehicle_doc_type_unique
  ON public.documents(vehicle_id, doc_type) WHERE vehicle_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS km_reports_vehicle_month_year_unique
  ON public.km_reports(vehicle_id, month, year);

-- Índices para auditoría (history tables)
CREATE INDEX IF NOT EXISTS repair_history_repair_idx ON public.repair_history(repair_id);
CREATE INDEX IF NOT EXISTS maintenance_history_maintenance_idx ON public.maintenance_history(maintenance_id);
