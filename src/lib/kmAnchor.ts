/**
 * Última lectura REAL de odómetro de un vehículo (el "ancla" del kilometraje).
 * Fuentes confiables, en orden de la fecha más reciente:
 *  - carga de combustible con odómetro validado,
 *  - kilometraje cargado a mano o tomado de un registro (historial de km),
 *  - Mantenimientos y Reparaciones (el km se anota en el taller leyendo el tablero; puede venir redondeado).
 * El km "calculado con GPS" NO es una lectura: nunca sirve de ancla. km actual = ancla + km del GPS posteriores a su fecha.
 */
import type { Fuel, KmHistory, Maint, Repair } from './types';

export type Reading = { date: string; km: number; src: 'estación' | 'manual' | 'mantenimiento' | 'reparación' };

const localDate = (iso: string) => new Date(iso).toLocaleDateString('en-CA');
/** Fecha real de la lectura de un cambio de km manual: la indicada en "[lectura:AAAA-MM-DD]" o, si no hay, el día en que se cargó. */
export const readingDateOf = (h: { changed_by: string; recorded_at: string }): string =>
  h.changed_by.match(/\[lectura:(\d{4}-\d{2}-\d{2})\]/)?.[1] ?? localDate(h.recorded_at);
const isFuelProduct = (p: string | null | undefined) => !/azul|adblue/i.test(p ?? '');

export function readingsOf(
  vehicleId: string,
  d: { fuel_loads: Fuel[]; km_history: KmHistory[]; maintenance: Maint[]; repairs: Repair[] }
): Reading[] {
  const out: Reading[] = [];
  for (const f of d.fuel_loads)
    if (f.vehicle_id === vehicleId && f.km !== null && f.km !== undefined && isFuelProduct(f.product))
      out.push({ date: f.date, km: f.km, src: 'estación' });
  for (const h of d.km_history) {
    if (h.vehicle_id !== vehicleId) continue;
    const i = h.changed_by.indexOf(':');
    const src = i > 0 ? h.changed_by.slice(0, i) : 'manual';
    // gps: calculado. combustible: ya cuenta como carga de estación. registro: viene de un mantenimiento/reparación/etc.,
    // que ya se lee con su fecha REAL (la del historial es la fecha en que se cargó, no la de la lectura).
    if (src === 'gps' || src === 'combustible' || src === 'registro') continue;
    out.push({ date: readingDateOf(h), km: h.km, src: 'manual' });
  }
  for (const m of d.maintenance)
    if (m.vehicle_id === vehicleId && m.km !== null && m.km !== undefined) out.push({ date: m.date, km: m.km, src: 'mantenimiento' });
  for (const r of d.repairs)
    if (r.vehicle_id === vehicleId && r.km !== null && r.km !== undefined) out.push({ date: r.date, km: r.km, src: 'reparación' });
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.km - b.km);
}

/** ¿El GPS cubre desde la lectura? El primer día con GPS puede ser el mismo día de la lectura o el siguiente (continuidad). */
export function gpsCoversFrom(firstGpsDate: string | null, readingDate: string): boolean {
  if (!firstGpsDate) return false;
  const next = new Date(new Date(readingDate + 'T00:00:00').getTime() + 864e5).toLocaleDateString('en-CA');
  return firstGpsDate <= next;
}

/** La lectura más reciente (a igual fecha, la de mayor km), o null si no hay ninguna. */
export function lastReading(
  vehicleId: string,
  d: { fuel_loads: Fuel[]; km_history: KmHistory[]; maintenance: Maint[]; repairs: Repair[] }
): Reading | null {
  const all = readingsOf(vehicleId, d);
  return all.length ? all[all.length - 1] : null;
}
