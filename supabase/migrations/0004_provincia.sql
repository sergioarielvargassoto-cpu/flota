-- Agregar campo provincia a vehículos
ALTER TABLE public.vehicles
ADD COLUMN IF NOT EXISTS provincia text DEFAULT 'Corrientes';

-- Crear índice para búsquedas rápidas
CREATE INDEX IF NOT EXISTS vehicles_provincia_idx ON public.vehicles(provincia);
