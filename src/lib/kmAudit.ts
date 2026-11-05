/**
 * Auditoría de odómetros: el GPS (km reportados de Gestya) controla lo que se declara en las estaciones.
 * Entre dos lecturas del tablero, la diferencia debe coincidir con los km que registró el GPS en ese lapso.
 */
import { GPS_RELIABLE_MAX, GPS_RELIABLE_MIN, RANGE_TOL_ABS_KM, RANGE_TOL_PCT } from './params';

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

/**
 * ¿El GPS de este vehículo es confiable para auditar su odómetro? Se mide con SUS PROPIOS tramos limpios (entre lecturas de estación
 * válidas consecutivas): km de odómetro ÷ punto medio del rango de GPS. Confiable si está entre 0,75 y 1,3 (septiembre: la flota dio 0,99;
 * el Sandero, con GPS intermitente, dio un cociente enorme). Con menos de 2 tramos no hay evidencia en contra y se asume confiable.
 */
export function gpsReliability(
  vehicleId: string,
  loads: { vehicle_id: string; date: string; km: number | null; product: string | null }[],
  trips: TripLite[]
): { reliable: boolean; ratio: number | null; n: number } {
  const vt = trips.filter((t) => t.vehicle_id === vehicleId);
  if (!vt.length) return { reliable: true, ratio: null, n: 0 };
  const first = vt.reduce((m, t) => (t.date < m ? t.date : m), vt[0].date);
  const last = vt.reduce((m, t) => (t.date > m ? t.date : m), vt[0].date);
  const L = loads
    .filter((f) => f.vehicle_id === vehicleId && f.km !== null && !/azul|adblue/i.test(f.product ?? ''))
    .sort((a, b) => a.date.localeCompare(b.date) || (a.km as number) - (b.km as number));
  let odo = 0,
    mid = 0,
    n = 0;
  for (let i = 1; i < L.length; i++) {
    const a = L[i - 1],
      b = L[i];
    if (a.date === b.date || a.date < first || b.date > last) continue;
    const r = gpsRange(vt, vehicleId, a.date, b.date);
    odo += (b.km as number) - (a.km as number);
    mid += (r.min + r.max) / 2;
    n++;
  }
  if (n < 2) return { reliable: true, ratio: null, n };
  const ratio = mid > 0 ? odo / mid : Infinity;
  return { reliable: ratio >= GPS_RELIABLE_MIN && ratio <= GPS_RELIABLE_MAX, ratio: Number.isFinite(ratio) ? ratio : null, n };
}
