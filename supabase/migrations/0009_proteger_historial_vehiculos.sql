-- =====================================================================
-- 0009 · Proteger el historial de los vehículos (conservación legal y estadística)
-- Regla: un vehículo que tiene CUALQUIER registro asociado (documentos, reparaciones, mantenimientos, cargas, recorridos,
-- historial de km, reportes, infracciones, etc.) no puede eliminarse. Se da de baja (estado "Baja") y se conserva todo.
-- Antes: algunas relaciones borraban en cascada y el botón "Eliminar" de la app también borraba los archivos adjuntos.
-- Este disparador lo impide a nivel base de datos, aunque se intente borrar desde el panel de Supabase o la API.
-- Correr en el SQL Editor de Supabase. Es seguro: solo agrega una protección.
-- =====================================================================
create or replace function public.protect_vehicle_history() returns trigger
language plpgsql set search_path = ''
as $$
declare
  r record;
  n bigint;
begin
  for r in
    select c.conrelid::regclass as tbl, a.attname as col
    from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
    where c.contype = 'f' and c.confrelid = 'public.vehicles'::regclass
  loop
    execute format('select count(*) from %s where %I = $1', r.tbl, r.col) into n using old.id;
    if n > 0 then
      raise exception 'No se puede eliminar el vehículo %: tiene % registro(s) en %. Dalo de baja (estado Baja) para conservar el historial.',
        old.plate, n, r.tbl using errcode = '23503';
    end if;
  end loop;
  return old;
end;
$$;

drop trigger if exists vehicles_protect_history on public.vehicles;
create trigger vehicles_protect_history
  before delete on public.vehicles
  for each row execute function public.protect_vehicle_history();

-- Prueba (debe fallar con el mensaje de arriba si el vehículo tiene historial):
--   delete from public.vehicles where plate = 'AG416OE';
