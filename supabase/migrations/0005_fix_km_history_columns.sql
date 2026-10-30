-- Arreglar km_history: agregar columnas faltantes km_previous y changed_by
-- Estas columnas son requeridas por src/lib/history.ts y src/lib/audit.ts

ALTER TABLE public.km_history
ADD COLUMN IF NOT EXISTS km_previous integer,
ADD COLUMN IF NOT EXISTS changed_by text DEFAULT 'usuario';

-- Crear índice en changed_by para auditoría rápida
CREATE INDEX IF NOT EXISTS km_history_changed_by_idx ON public.km_history(changed_by);

-- Crear índice en vehicle_id + recorded_at para queries por vehículo/período
CREATE INDEX IF NOT EXISTS km_history_vehicle_recorded_idx ON public.km_history(vehicle_id, recorded_at DESC);
