/**
 * El km actual de un vehículo se DERIVA, no se "pega": última lectura real (carga de estación válida, km a mano,
 * Mantenimientos, Reparaciones) + todo el GPS posterior a la fecha de esa lectura.
 * Se recalcula cada vez que se crea, edita o borra un mantenimiento, una reparación o una carga de combustible, así
 * corregir un registro mal cargado corrige también el km del vehículo (antes un km tipeado de más quedaba pegado).
 */
import { sb } from './supabase';
import { recordKmChange } from './history';
import { gpsCoversFrom, lastReading } from './kmAnchor';
import type { Fuel, KmHistory, Maint, Repair, Vehicle } from './types';

type TripRow = { date: string; km_calc: number | string };
export type KmData = { fuel_loads: Fuel[]; km_history: KmHistory[]; maintenance: Maint[]; repairs: Repair[]; trips: TripRow[] };

/**
 * "Km del último service" derivado de los registros de Mantenimientos tipo Service (el más reciente por fecha; a igual fecha, el de mayor km).
 * null si el vehículo no tiene ningún service con km: en ese caso se respeta el valor cargado a mano en la ficha.
 */
export function computeLastServiceKm(maintenance: Pick<Maint, 'type' | 'date' | 'km'>[]): number | null {
  const svc = maintenance.filter((m) => /service/i.test(m.type) && m.km !== null && m.km !== undefined && Number(m.km) > 0);
  if (!svc.length) return null;
  svc.sort((a, b) => a.date.localeCompare(b.date) || Number(a.km) - Number(b.km));
  return Number(svc[svc.length - 1].km);
}

/** Cálculo puro: nuevo km y fecha, o null si no hay lecturas (se deja el valor guardado). */
export function computeVehicleKm(
  v: Pick<Vehicle, 'km' | 'km_date'>,
  vehicleId: string,
  d: KmData,
  /** true = el km guardado fue DERIVADO por el sistema (GPS/registro), no tipeado por una persona: se puede recalcular sin miedo a pisar un dato manual */
  derived = false
): { km: number; km_date: string } | null {
  const a = lastReading(vehicleId, d);
  if (!a) return null;
  const first = d.trips.reduce<string | null>((m, t) => (!m || t.date < m ? t.date : m), null);
  if (gpsCoversFrom(first, a.date)) {
    const after = d.trips.filter((t) => t.date > a.date);
    return {
      km: Math.round(a.km + after.reduce((s, t) => s + (Number(t.km_calc) || 0), 0)),
      km_date: after.reduce((m, t) => (t.date > m ? t.date : m), a.date),
    };
  }
  // Sin GPS que cubra desde la lectura: solo se actualiza si la lectura es tan reciente como el dato guardado, o si el km guardado
  // era DERIVADO (p. ej. venía de un registro que se corrigió o borró). Un km tipeado a mano sin respaldo se respeta.
  if (!v.km_date || a.date >= v.km_date || derived) return { km: a.km, km_date: a.date };
  return null;
}

async function selectAll<T>(make: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await make(from, from + 999);
    if (error) throw error;
    out.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return out;
}

/** Recalcula y guarda el km de un vehículo desde la base. Devuelve true si cambió. */
export type RecomputeResult = { changed: boolean; km?: number; km_date?: string };
export async function recomputeVehicleKm(vehicleId: string): Promise<RecomputeResult> {
  const { data: v, error } = await sb().from('vehicles').select('id,km,km_date,last_service_km').eq('id', vehicleId).maybeSingle();
  if (error || !v) return { changed: false };
  const eq = (t: string, cols: string) =>
    selectAll<Record<string, unknown>>(
      (a, b) =>
        sb().from(t).select(cols).eq('vehicle_id', vehicleId).order('id').range(a, b) as unknown as PromiseLike<{
          data: Record<string, unknown>[] | null;
          error: { message: string } | null;
        }>
    );
  const [fuel, hist, maint, reps, trips] = await Promise.all([
    eq('fuel_loads', 'id,vehicle_id,date,km,product,liters,created_at'),
    eq('km_history', 'id,vehicle_id,km,recorded_at,changed_by'),
    eq('maintenance', 'id,vehicle_id,type,date,km,created_at'),
    eq('repairs', 'id,vehicle_id,date,km,created_at'),
    eq('trips', 'id,date,km_calc'),
  ]);
  // ¿El km guardado coincide con el último cambio del historial hecho por el sistema (GPS / registro / combustible)? Entonces es derivado.
  const lastH = [...(hist as { km: number; recorded_at: string; changed_by: string }[])].sort((x, y) => x.recorded_at.localeCompare(y.recorded_at)).pop();
  const derived = !!lastH && lastH.km === v.km && /^(gps|combustible|registro):/.test(lastH.changed_by);
  const res = computeVehicleKm(v as Vehicle, vehicleId, {
    fuel_loads: fuel as unknown as Fuel[],
    km_history: hist as unknown as KmHistory[],
    maintenance: maint as unknown as Maint[],
    repairs: reps as unknown as Repair[],
    trips: trips as unknown as TripRow[],
  }, derived);
  // El "km del último service" también se deriva de los registros: corregir o borrar un service lo corrige (antes solo podía subir)
  const svcKm = computeLastServiceKm(maint as unknown as Maint[]);
  const svcChanged = svcKm !== null && svcKm !== v.last_service_km;
  if (svcChanged) {
    const { error: e3 } = await sb().from('vehicles').update({ last_service_km: svcKm }).eq('id', vehicleId);
    if (e3) throw e3;
  }
  if (!res || (res.km === v.km && res.km_date === v.km_date)) return { changed: svcChanged };
  const { error: e2 } = await sb().from('vehicles').update({ km: res.km, km_date: res.km_date }).eq('id', vehicleId);
  if (e2) throw e2;
  if (res.km !== v.km) await recordKmChange(vehicleId, res.km, v.km, 'registro');
  return { changed: true, km: res.km, km_date: res.km_date };
}
