-- =====================================================================
-- Reporte Mensual de Kilómetros
-- Agregar campos a vehicles y crear tabla km_reports
-- =====================================================================

-- Agregar campos a vehicles si no existen
ALTER TABLE public.vehicles
ADD COLUMN IF NOT EXISTS branch text DEFAULT 'Corrientes',
ADD COLUMN IF NOT EXISTS exclude_from_reports boolean DEFAULT false;

-- Crear tabla de histórico de km mensuales
CREATE TABLE IF NOT EXISTS public.km_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id uuid NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
  month int NOT NULL CHECK (month >= 1 AND month <= 12),
  year int NOT NULL CHECK (year >= 2020),
  km_total numeric NOT NULL DEFAULT 0,
  km_previous numeric,                              -- km del mes anterior (para calcular variación)
  km_by_day jsonb,                                  -- {"2026-09-01": 45.5, "2026-09-02": 62.1, ...}
  branch text,                                      -- sucursal al momento de importación
  imported_at timestamptz NOT NULL DEFAULT now(),
  imported_from text,                               -- nombre del archivo de Gestya
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(vehicle_id, month, year),
  CONSTRAINT km_reports_positive_km CHECK (km_total >= 0)
);

CREATE INDEX IF NOT EXISTS km_reports_vehicle_idx ON public.km_reports(vehicle_id);
CREATE INDEX IF NOT EXISTS km_reports_month_year_idx ON public.km_reports(year, month DESC);
CREATE INDEX IF NOT EXISTS km_reports_branch_idx ON public.km_reports(branch);

-- Agregar RLS si no está activo
ALTER TABLE public.km_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "km_reports_solo_logueados"
ON public.km_reports FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

-- Actualizar table list en aplicación si necesario (solo para referencia)
-- Agregar 'km_reports' a la lista de tablas en src/lib/types.ts TableName
