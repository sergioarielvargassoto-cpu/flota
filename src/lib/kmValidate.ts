/**
 * Validación de UNA lectura de odómetro (carga de estación) contra la última lectura confiable (ancla) y el GPS.
 * Función pura, usada por el importador de combustible y por las pruebas de regresión.
 */
import { gpsRange, lastGpsDate, outsideRange, type TripLite } from './kmAudit';
import {
  OKODO_BACK_KM,
  OKODO_BASE_KM,
  OKODO_KM_PER_DAY,
  PHYSICAL_MIN_L_PER_100,
  PHYSICAL_RULE_MAX_GAP_DAYS,
  TALLER_ROUND_KM,
  UNCOVERED_GPS_KM_PER_DAY,
} from './params';

export type Anchor = { date: string; km: number; src?: 'estación' | 'manual' | 'mantenimiento' | 'reparación' };
export type Verdict = { ok: boolean; reason: string; rangeMin?: number; rangeMax?: number };

const days = (a: string, b: string) => Math.round((+new Date(b + 'T00:00:00') - +new Date(a + 'T00:00:00')) / 864e5);

/**
 * Margen extra cuando la referencia es APROXIMADA: un km cargado a mano o anotado en el taller puede venir redondeado
 * (a 500 o 1.000 km) en CUALQUIER dirección. Una lectura de estación válida es exacta y no lleva margen extra.
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
  const gap = days(a.date, fecha); // >0: la lectura es posterior a la referencia

  // ── Mismo día que la referencia: sin hora no se sabe el orden. Se acepta un pequeño retroceso (redondeo) y un avance de hasta un día de recorrido.
  if (gap === 0) {
    const dayKm = lg && lg >= fecha ? gpsRange(trips, vid, fecha, fecha).max : OKODO_KM_PER_DAY;
    const delta = odo - a.km;
    const ok = delta >= -(slack + OKODO_BACK_KM) && delta <= dayKm + slack + OKODO_BACK_KM;
    return { ok, reason: ok ? 'mismo día que la referencia: coherente' : 'mismo día que la referencia: avance imposible' };
  }

  // ── Lectura ANTERIOR a la referencia (remitos tardíos, archivos de un mes ya cubierto): ancla − GPS del tramo
  if (gap < 0) {
    if (lg && lg >= fecha) {
      // Si la referencia es más nueva que el último día de GPS cargado (p. ej. un service del 03/11 con GPS hasta el 31/10),
      // se usa el GPS que haya y se admite un recorrido por los días sin datos.
      const end = a.date <= lg ? a.date : lg;
      const unc = a.date > lg ? days(lg, a.date) * UNCOVERED_GPS_KM_PER_DAY : 0;
      const rg = gpsRange(trips, vid, fecha, end);
      const out = outsideRange(a.km - odo, { min: Math.max(0, rg.min - slack), max: rg.max + slack + unc });
      return { ok: out === 0, reason: out === 0 ? 'coincide con el GPS hacia atrás' : `fuera del rango de GPS por ${Math.abs(out)} km`, rangeMin: rg.min, rangeMax: rg.max };
    }
    const ok = odo > 0 && odo <= a.km + OKODO_BACK_KM + slack && odo >= a.km - (-gap * OKODO_KM_PER_DAY + OKODO_BASE_KM);
    return { ok, reason: ok ? 'plausible (sin GPS)' : 'implausible sin GPS' };
  }

  // ── Lectura POSTERIOR a la referencia
  // Regla física: con el combustible disponible no se recorre más que (litros + tanque) / consumo mínimo. Solo vale si la referencia es
  // reciente: con una referencia vieja pudo haber otras cargas que no están en los datos (se confía en el GPS en ese caso).
  if (gap <= PHYSICAL_RULE_MAX_GAP_DAYS && odo - a.km > (litros + tankL) / (PHYSICAL_MIN_L_PER_100 / 100)) return { ok: false, reason: 'imposible con el combustible disponible' };
  if (!lg || lg < fecha) {
    // Sin GPS que cubra la fecha: solo plausibilidad. El margen de una referencia aproximada se suma a AMBOS lados.
    const ok = odo >= a.km - OKODO_BACK_KM - slack && odo <= a.km + Math.max(1, gap) * OKODO_KM_PER_DAY + OKODO_BASE_KM + slack;
    return { ok, reason: ok ? (lg === null && p.gpsOk === false ? 'plausible (GPS no confiable)' : 'plausible (GPS aún sin cargar)') : 'implausible (sin GPS que lo respalde)' };
  }
  const rg = gpsRange(trips, vid, a.date, fecha);
  const out = outsideRange(odo - a.km, { min: Math.max(0, rg.min - slack), max: rg.max + slack });
  return { ok: out === 0, reason: out === 0 ? 'coincide con el GPS' : `fuera del rango de GPS por ${Math.abs(out)} km`, rangeMin: rg.min, rangeMax: rg.max };
}
