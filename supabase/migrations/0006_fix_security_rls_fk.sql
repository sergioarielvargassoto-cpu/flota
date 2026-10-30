-- ======================================
-- FIX SEGURIDAD: RLS Policies + FK DELETE
-- ======================================

-- 1. HABILITAR RLS EN TODAS LAS TABLAS
ALTER TABLE public.vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.drivers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workshops ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.repairs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.maintenance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fuel_loads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trips ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.infractions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fines ENABLE ROW LEVEL SECURITY;

-- 2. POLÍTICAS RLS BÁSICAS - Autenticado = toda la data (TODO: mejorar a nivel rama/usuario)
CREATE POLICY "vehicles_auth_all" ON public.vehicles FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "drivers_auth_all" ON public.drivers FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "documents_auth_all" ON public.documents FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "workshops_auth_all" ON public.workshops FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "repairs_auth_all" ON public.repairs FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "maintenance_auth_all" ON public.maintenance FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "fuel_loads_auth_all" ON public.fuel_loads FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "trips_auth_all" ON public.trips FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "attachments_auth_all" ON public.attachments FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "infractions_auth_all" ON public.infractions FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "fines_auth_all" ON public.fines FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 3. FIX FK DELETE POLICIES - Cambiar CASCADE → RESTRICT para prevenir pérdida accidental
ALTER TABLE public.fuel_loads
DROP CONSTRAINT IF EXISTS fuel_loads_vehicle_id_fkey,
ADD CONSTRAINT fuel_loads_vehicle_id_fkey
  FOREIGN KEY (vehicle_id) REFERENCES public.vehicles(id) ON DELETE RESTRICT;

ALTER TABLE public.documents
DROP CONSTRAINT IF EXISTS documents_vehicle_id_fkey,
ADD CONSTRAINT documents_vehicle_id_fkey
  FOREIGN KEY (vehicle_id) REFERENCES public.vehicles(id) ON DELETE RESTRICT;

ALTER TABLE public.trips
DROP CONSTRAINT IF EXISTS trips_vehicle_id_fkey,
ADD CONSTRAINT trips_vehicle_id_fkey
  FOREIGN KEY (vehicle_id) REFERENCES public.vehicles(id) ON DELETE RESTRICT;

-- Mantener CASCADE para reparaciones/mantenimientos (lógica esperada)
-- repairs y maintenance ya tienen CASCADE, mantener así

-- 4. ÍNDICES EN FOREIGN KEYS (prevenir tabla completa en queries)
CREATE INDEX IF NOT EXISTS fuel_loads_vehicle_idx ON public.fuel_loads(vehicle_id);
CREATE INDEX IF NOT EXISTS documents_vehicle_idx ON public.documents(vehicle_id);
CREATE INDEX IF NOT EXISTS trips_vehicle_idx ON public.trips(vehicle_id);
