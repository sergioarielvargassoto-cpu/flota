/**
 * Auditoría de odómetros: el GPS (km reportados de Gestya) controla lo que se declara en las estaciones.
 * Entre dos lecturas del tablero, la diferencia debe coincidir con los km que registró el GPS en ese lapso.
 */
import { RANGE_TOL_ABS_KM, RANGE_TOL_PCT } from './params';

export type TripLite = { vehicle_id: string; date: string; km_calc: number | string };

/** Km de GPS en el intervalo (desde, hasta], ambos 'AAAA-MM-DD'. */
export function gpsBetween(trips: TripLite[], vid: string, from: string, to: string): number {
  let s = 0;
  for (const t of trips) if (t.vehicle_id === vid && t.date > from && t.date <= to) s += Number(t.km_calc) || 0;
  return s;
}

/** Último día con datos de GPS del vehículo (para saber si se puede auditar un tramo). */
export function lastGpsDate(trips: TripLite[], vid: string): string | null {
  let m: string | null = null;
  for (const t of trips) if (t.vehicle_id === vid && (!m || t.date > m)) m = t.date;
  return m;
}

/** Tolerancia: 100 km fijos o 10 % de lo recorrido, lo que sea mayor (el GPS pierde señal, el tablero redondea). */
export const tolerance = (gps: number) => Math.max(100, gps * 0.1);

export type Check = { ok: boolean; expected: number; diff: number; gps: number };

/** Compara una lectura contra la anterior aceptada + el GPS del tramo. */
export function checkReading(
  trips: TripLite[],
  vid: string,
  prev: { date: string; km: number },
  cur: { date: string; km: number }
): Check {
  const gps = gpsBetween(trips, vid, prev.date, cur.date);
  const expected = prev.km + gps;
  const diff = cur.km - expected;
  return { ok: Math.abs(diff) <= tolerance(gps), expected: Math.round(expected), diff: Math.round(diff), gps: Math.round(gps) };
}

/**
 * Rango de km de GPS entre dos lecturas de odómetro. Las cargas no tienen hora, y el GPS suma DÍAS COMPLETOS:
 * una carga a la 1 AM deja casi todo su día después de la carga; una a las 23 h, casi todo antes.
 *  - mínimo: solo los días completos ENTRE ambas fechas (cada carga en el extremo del día más desfavorable);
 *  - máximo: esos días más los dos días de las cargas completos.
 * Un odómetro coherente cae dentro de [mínimo, máximo].
 */
export function gpsRange(trips: TripLite[], vid: string, from: string, to: string): { min: number; max: number } {
  let min = 0,
    max = 0;
  for (const t of trips) {
    if (t.vehicle_id !== vid || t.date < from || t.date > to) continue;
    const km = Number(t.km_calc) || 0;
    max += km;
    if (t.date > from && t.date < to) min += km;
  }
  return { min, max };
}
/** Margen sobre el rango: error del GPS y redondeo del tablero. */
export const rangeTol = (max: number) => Math.max(RANGE_TOL_ABS_KM, max * RANGE_TOL_PCT);
/** Distancia a la que el odómetro queda FUERA del rango de GPS: 0 = dentro; negativo = marcó menos que el mínimo; positivo = más que el máximo. */
export function outsideRange(delta: number, r: { min: number; max: number }): number {
  const tol = rangeTol(r.max);
  if (delta < r.min - tol) return Math.round(delta - r.min);
  if (delta > r.max + tol) return Math.round(delta - r.max);
  return 0;
}
