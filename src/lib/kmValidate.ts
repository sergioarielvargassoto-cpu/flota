/**
 * Validación de UNA lectura de odómetro (carga de estación) contra la última lectura confiable (ancla) y el GPS.
 * Función pura, usada por el importador de combustible y por las pruebas de regresión.
 */
import { gpsRange, lastGpsDate, outsideRange, type TripLite } from './kmAudit';
import { okOdo } from './util';
import { GPS_DEAD_RATIO, OKODO_BACK_KM, OKODO_BASE_KM, OKODO_KM_PER_DAY, PHYSICAL_MIN_L_PER_100, TALLER_ROUND_KM } from './params';

export type Anchor = { date: string; km: number; src?: 'estación' | 'manual' | 'mantenimiento' | 'reparación' };
export type Verdict = { ok: boolean; reason: string; rangeMin?: number; rangeMax?: number };

const days = (a: string, b: string) => Math.round((+new Date(b + 'T00:00:00') - +new Date(a + 'T00:00:00')) / 864e5);

/**
 * Margen extra cuando la referencia es APROXIMADA: un km cargado a mano o anotado en el taller puede venir redondeado
 * (a 500 o 1.000 km). Una lectura de estación válida es exacta y no lleva margen extra.
 */
export const anchorSlack = (a: Anchor): number => (a.src === 'manual' || a.src === 'mantenimiento' || a.src === 'reparación' ? TALLER_ROUND_KM : 0);

export function validateReading(p: {
  anchor: Anchor | null;
  trips: TripLite[];
  vehicleId: string;
  fecha: string;
  odo: number;
  litros: number;
  tankL: number;
  /** false = el GPS de este vehículo no es confiable (ver gpsReliability): no se usa para descartar lecturas. */
  gpsOk?: boolean;
}): Verdict {
  const { anchor: a, trips, vehicleId: vid, fecha, odo, litros, tankL } = p;
  if (!a) return { ok: true, reason: 'primera lectura del vehículo' };
  const slack = anchorSlack(a);
  const lg = p.gpsOk === false ? null : lastGpsDate(trips, vid);
  if (fecha <= a.date) {
    // Lectura ANTERIOR a la referencia (remitos tardíos, archivos de un mes ya cubierto): ancla − GPS del tramo
    if (lg && lg >= a.date) {
      const rg = gpsRange(trips, vid, fecha, a.date);
      // GPS caído en el tramo (casi no registró): no sirve para validar; se usa solo la plausibilidad
      if (rg.max < GPS_DEAD_RATIO * Math.abs(a.km - odo)) {
        const okBack = odo > 0 && odo <= a.km + OKODO_BACK_KM + slack && odo >= a.km - (days(fecha, a.date) * OKODO_KM_PER_DAY + OKODO_BASE_KM);
        return { ok: okBack, reason: okBack ? 'GPS sin datos en el tramo: plausible' : 'GPS sin datos en el tramo e implausible' };
      }
      const out = outsideRange(a.km - odo, { min: Math.max(0, rg.min - slack), max: rg.max + slack });
      return { ok: out === 0, reason: out === 0 ? 'coincide con el GPS hacia atrás' : `fuera del rango de GPS por ${Math.abs(out)} km`, rangeMin: rg.min, rangeMax: rg.max };
    }
    const dd = days(fecha, a.date);
    const ok = odo > 0 && odo <= a.km + OKODO_BACK_KM + slack && odo >= a.km - (dd * OKODO_KM_PER_DAY + OKODO_BASE_KM);
    return { ok, reason: ok ? 'plausible (sin GPS)' : 'implausible sin GPS' };
  }
  // Lectura POSTERIOR a la referencia
  if (odo - a.km > (litros + tankL) / (PHYSICAL_MIN_L_PER_100 / 100)) return { ok: false, reason: 'imposible con el combustible disponible' };
  if (!lg || lg < fecha) {
    const ok = okOdo(a.km - slack, a.date, fecha, odo);
    return { ok, reason: ok ? 'plausible (GPS aún sin cargar)' : 'implausible (GPS aún sin cargar)' };
  }
  const rg = gpsRange(trips, vid, a.date, fecha);
  if (rg.max < GPS_DEAD_RATIO * Math.abs(odo - a.km)) {
    const ok = okOdo(a.km - slack, a.date, fecha, odo);
    return { ok, reason: ok ? 'GPS sin datos en el tramo: plausible' : 'GPS sin datos en el tramo e implausible' };
  }
  const out = outsideRange(odo - a.km, { min: Math.max(0, rg.min - slack), max: rg.max + slack });
  return { ok: out === 0, reason: out === 0 ? 'coincide con el GPS' : `fuera del rango de GPS por ${Math.abs(out)} km`, rangeMin: rg.min, rangeMax: rg.max };
}
