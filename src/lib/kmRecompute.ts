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

/** Cálculo puro: nuevo km y fecha, o null si no hay lecturas (se deja el valor guardado). */
export function computeVehicleKm(v: Pick<Vehicle, 'km' | 'km_date'>, vehicleId: string, d: KmData): { km: number; km_date: string } | null {
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
  // Sin GPS que cubra desde la lectura: solo se actualiza si la lectura es tan reciente como el dato guardado
  // (si no, el km guardado puede incluir recorridos que no podemos reconstruir).
  if (!v.km_date || a.date >= v.km_date) return { km: a.km, km_date: a.date };
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
export async function recomputeVehicleKm(vehicleId: string): Promise<boolean> {
  const { data: v, error } = await sb().from('vehicles').select('id,km,km_date').eq('id', vehicleId).maybeSingle();
  if (error || !v) return false;
  const eq = (t: string, cols: string) =>
    selectAll<Record<string, unknown>>(
      (a, b) =>
        sb().from(t).select(cols).eq('vehicle_id', vehicleId).order('id').range(a, b) as unknown as PromiseLike<{
          data: Record<string, unknown>[] | null;
          error: { message: string } | null;
        }>
    );
  const [fuel, hist, maint, reps, trips] = await Promise.all([
    eq('fuel_loads', 'id,vehicle_id,date,km,product,liters'),
    eq('km_history', 'id,vehicle_id,km,recorded_at,changed_by'),
    eq('maintenance', 'id,vehicle_id,date,km'),
    eq('repairs', 'id,vehicle_id,date,km'),
    eq('trips', 'id,date,km_calc'),
  ]);
  const res = computeVehicleKm(v as Vehicle, vehicleId, {
    fuel_loads: fuel as unknown as Fuel[],
    km_history: hist as unknown as KmHistory[],
    maintenance: maint as unknown as Maint[],
    repairs: reps as unknown as Repair[],
    trips: trips as unknown as TripRow[],
  });
  if (!res || (res.km === v.km && res.km_date === v.km_date)) return false;
  const { error: e2 } = await sb().from('vehicles').update({ km: res.km, km_date: res.km_date }).eq('id', vehicleId);
  if (e2) throw e2;
  if (res.km !== v.km) await recordKmChange(vehicleId, res.km, v.km, 'registro');
  return true;
}
