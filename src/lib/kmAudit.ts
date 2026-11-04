/**
 * Auditoría de odómetros: el GPS (km reportados de Gestya) controla lo que se declara en las estaciones.
 * Entre dos lecturas del tablero, la diferencia debe coincidir con los km que registró el GPS en ese lapso.
 */
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
