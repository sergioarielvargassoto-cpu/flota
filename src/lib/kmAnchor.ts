/**
 * Última lectura REAL de odómetro de un vehículo (el "ancla" del kilometraje).
 * Fuentes confiables, en orden de la fecha más reciente:
 *  - carga de combustible con odómetro validado,
 *  - kilometraje cargado a mano o tomado de un registro (historial de km),
 *  - Mantenimientos y Reparaciones (el km se anota en el taller leyendo el tablero; puede venir redondeado).
 * El km "calculado con GPS" NO es una lectura: nunca sirve de ancla. km actual = ancla + km del GPS posteriores a su fecha.
 */
import type { Fuel, KmHistory, Maint, Repair } from './types';

export type Reading = { date: string; km: number; src: 'estación' | 'manual' | 'mantenimiento' | 'reparación'; at?: string; knownAt?: string };
/** Desempate entre lecturas del MISMO día: lo cargado a mano manda sobre el taller, y el taller sobre la estación. */
const RANK = { estación: 1, reparación: 2, mantenimiento: 2, manual: 3 } as const;

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
      out.push({ date: f.date, km: f.km, src: 'estación', knownAt: (f as { created_at?: string }).created_at ?? f.date + 'T00:00:00Z' });
  for (const h of d.km_history) {
    if (h.vehicle_id !== vehicleId) continue;
    const i = h.changed_by.indexOf(':');
    const src = i > 0 ? h.changed_by.slice(0, i) : 'manual';
    // gps: calculado. combustible: ya cuenta como carga de estación. registro: viene de un mantenimiento/reparación/etc.,
    // que ya se lee con su fecha REAL (la del historial es la fecha en que se cargó, no la de la lectura).
    if (src === 'gps' || src === 'combustible' || src === 'registro') continue;
    out.push({ date: readingDateOf(h), km: h.km, src: 'manual', at: h.recorded_at, knownAt: h.recorded_at });
  }
  for (const m of d.maintenance)
    if (m.vehicle_id === vehicleId && m.km !== null && m.km !== undefined) out.push({ date: m.date, km: m.km, src: 'mantenimiento', knownAt: (m as { created_at?: string }).created_at ?? m.date + 'T00:00:00Z' });
  for (const r of d.repairs)
    if (r.vehicle_id === vehicleId && r.km !== null && r.km !== undefined) out.push({ date: r.date, km: r.km, src: 'reparación', knownAt: (r as { created_at?: string }).created_at ?? r.date + 'T00:00:00Z' });
  // Mismo día: prioridad por origen; entre cargas manuales, la ÚLTIMA cargada (si no, la de mayor km)
  // Un km 0 (o negativo) cargado a mano es un marcador de "pendiente de verificar": no es una lectura y deja SIN EFECTO todo lo que se conocía
  // hasta ese momento (el responsable volverá a cargar el km real). Lo que se registre después, aunque tenga fecha anterior, sí cuenta.
  const manual = d.km_history.filter((h) => h.vehicle_id === vehicleId && !/^(gps|combustible|registro):/.test(h.changed_by));
  const marker = manual.sort((a, b) => a.recorded_at.localeCompare(b.recorded_at)).pop();
  const cut = marker && marker.km <= 0 ? marker.recorded_at : null;
  return out
    .filter((r) => r.km > 0 && (!cut || new Date(r.knownAt ?? 0).getTime() > new Date(cut).getTime()))
    .sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      RANK[a.src] - RANK[b.src] ||
      (a.at && b.at ? a.at.localeCompare(b.at) : 0) ||
      a.km - b.km
  );
}

/** ¿El GPS cubre desde la lectura? El primer día con GPS puede ser el mismo día de la lectura o el siguiente (continuidad). */
export function gpsCoversFrom(firstGpsDate: string | null, readingDate: string): boolean {
  if (!firstGpsDate) return false;
  const next = new Date(new Date(readingDate + 'T00:00:00').getTime() + 864e5).toLocaleDateString('en-CA');
  return firstGpsDate <= next;
}

/**
 * ¿El último km cargado a mano de este vehículo es un marcador 0/negativo ("pendiente de verificar")?
 * Mientras sea así, ni el combustible ni el GPS acumulado deben pisar el km del vehículo.
 */
export function isPendingKm(vehicleId: string, hist: KmHistory[]): boolean {
  const m = hist
    .filter((h) => h.vehicle_id === vehicleId && !/^(gps|combustible|registro):/.test(h.changed_by))
    .sort((a, b) => a.recorded_at.localeCompare(b.recorded_at))
    .pop();
  return !!m && m.km <= 0;
}

/** La lectura más reciente por fecha; a igual fecha manda el origen (a mano > taller > estación) y, entre cargas manuales, la última cargada. */
export function lastReading(
  vehicleId: string,
  d: { fuel_loads: Fuel[]; km_history: KmHistory[]; maintenance: Maint[]; repairs: Repair[] }
): Reading | null {
  const all = readingsOf(vehicleId, d);
  return all.length ? all[all.length - 1] : null;
}
