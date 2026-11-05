/**
 * Consistencia de una lectura con TODA la trayectoria del vehículo (no solo con la última lectura).
 *
 * Idea: se juntan las lecturas del vehículo de todas las fuentes (estación válida, km a mano, mantenimiento, reparación) y cada una
 * se contrasta con sus lecturas VECINAS (hasta 3 antes y 3 después). Una lectura "tiene respaldo" si concuerda con al menos una vecina:
 *  - con GPS confiable: el avance del odómetro cabe en el rango de GPS entre ambas fechas (ver gpsRange);
 *  - sin GPS (o GPS no confiable): el avance es posible (no retrocede más que el redondeo y no supera 700 km/día + 1.000 km).
 * Una lectura que no concuerda con NINGUNA vecina es un valor atípico: un tipeo de más (213.000 en vez de 143.000) o de menos (123).
 * Un valor bueno rodeado de un tipeo sigue teniendo respaldo con las otras vecinas, así que un error aislado no arrastra a los demás.
 */
import { gpsRange, outsideRange, type TripLite } from './kmAudit';
import { NEIGHBORS_EACH_SIDE, OKODO_BASE_KM, OKODO_KM_PER_DAY, TALLER_ROUND_KM } from './params';

export type TReading = { key: string; date: string; km: number; src: 'estación' | 'manual' | 'mantenimiento' | 'reparación' };
export type Outlier = { key: string; reason: string; near: { date: string; km: number; src: string } | null; expectedLo?: number; expectedHi?: number };


const days = (a: string, b: string) => Math.round((+new Date(b + 'T00:00:00') - +new Date(a + 'T00:00:00')) / 864e5);
const slackOf = (s: TReading['src']) => (s === 'estación' ? 0 : TALLER_ROUND_KM);

/** ¿El par de lecturas (en orden cronológico) es compatible? */
export function pairOk(a: TReading, b: TReading, trips: TripLite[], vid: string, gps: { ok: boolean; first: string | null; last: string | null }): boolean {
  // Cada lectura de taller/manual puede venir redondeada hacia un lado distinto: el margen del par es la SUMA
  const slack = slackOf(a.src) + slackOf(b.src);
  const delta = b.km - a.km;
  const d = days(a.date, b.date);
  const plausible = delta >= -slack && delta <= Math.max(1, d) * OKODO_KM_PER_DAY + OKODO_BASE_KM + slack;
  if (!gps.ok || !gps.first || !gps.last || a.date < gps.first || b.date > gps.last || d === 0) return plausible;
  // Con GPS confiable (ya verificado a nivel vehículo en gpsReliability) un tramo en que el GPS casi no registró pero el odómetro saltó
  // NO es un corte de GPS: es una lectura inconsistente. Los GPS poco confiables ya se descartan antes (gpsOk=false).
  const rg = gpsRange(trips, vid, a.date, b.date);
  return outsideRange(delta, { min: Math.max(0, rg.min - slack), max: rg.max + slack }) === 0;
}

export type Level = 'atípica' | 'dudosa';
export type Finding = Outlier & { level: Level; agree: number; of: number };

/**
 * Votación contra las lecturas confiables vecinas: hasta 3 ANTERIORES y 3 POSTERIORES (de cualquier fuente: estación, a mano, taller).
 *  - "atípica": no concuerda con NINGUNA vecina (un salto imposible, un tipeo como 123 o 213.000);
 *  - "dudosa": con 3 o más vecinas, concuerda con menos de la mitad.
 * Concordar = que el avance del odómetro entre las dos fechas quepa en el rango de GPS (o sea plausible si no hay GPS confiable).
 */
export function trajectoryOutliers(readings: TReading[], trips: TripLite[], vehicleId: string, gpsOk: boolean): Finding[] {
  const R = [...readings].filter((r) => r.km > 0).sort((a, b) => a.date.localeCompare(b.date) || a.km - b.km);
  if (R.length < 2) return [];
  const vt = trips.filter((t) => t.vehicle_id === vehicleId);
  const gps = {
    ok: gpsOk && vt.length > 0,
    first: vt.length ? vt.reduce((m, t) => (t.date < m ? t.date : m), vt[0].date) : null,
    last: vt.length ? vt.reduce((m, t) => (t.date > m ? t.date : m), vt[0].date) : null,
  };
  const out: Finding[] = [];
  R.forEach((r, i) => {
    const idx: number[] = [];
    for (let k = Math.max(0, i - NEIGHBORS_EACH_SIDE); k <= Math.min(R.length - 1, i + NEIGHBORS_EACH_SIDE); k++) if (k !== i) idx.push(k);
    if (!idx.length) return;
    const agree = idx.filter((k) => (k < i ? pairOk(R[k], r, vt, vehicleId, gps) : pairOk(r, R[k], vt, vehicleId, gps))).length;
    // Con UNA sola vecina no hay forma de saber cuál de las dos está mal: se marca 'dudosa' (y no 'atípica', que es lo que el importador descarta)
    const level: Level | null = agree === 0 ? (idx.length >= 2 ? 'atípica' : 'dudosa') : idx.length >= 3 && agree < Math.ceil(idx.length / 2) ? 'dudosa' : null;
    if (!level) return;
    const near = [...idx].sort((p, q) => Math.abs(days(R[p].date, r.date)) - Math.abs(days(R[q].date, r.date)))[0];
    const n = R[near];
    let lo: number | undefined, hi: number | undefined;
    if (gps.ok && gps.first && gps.last && n.date >= gps.first && r.date <= gps.last && n.date !== r.date) {
      const rg = n.date < r.date ? gpsRange(vt, vehicleId, n.date, r.date) : gpsRange(vt, vehicleId, r.date, n.date);
      lo = n.date < r.date ? n.km + rg.min : n.km - rg.max;
      hi = n.date < r.date ? n.km + rg.max : n.km - rg.min;
    } else {
      lo = n.date < r.date ? n.km : n.km - Math.max(1, days(r.date, n.date)) * OKODO_KM_PER_DAY - OKODO_BASE_KM;
      hi = n.date < r.date ? n.km + Math.max(1, days(n.date, r.date)) * OKODO_KM_PER_DAY + OKODO_BASE_KM : n.km;
    }
    out.push({
      key: r.key,
      level,
      agree,
      of: idx.length,
      near: { date: n.date, km: n.km, src: n.src },
      expectedLo: Math.round(lo),
      expectedHi: Math.round(hi),
      reason: `${agree === 0 ? `No concuerda con ${idx.length === 1 ? 'la única lectura vecina' : `ninguna de las ${idx.length} lecturas vecinas`}` : `Concuerda solo con ${agree} de ${idx.length} lecturas vecinas`} (la más cercana: ${n.km.toLocaleString('es-AR')} km el ${n.date.split('-').reverse().join('/')}, ${n.src}). ${hi - lo > 8000 ? 'Con las lecturas vecinas disponibles no se puede acotar un valor esperable (el rango sería demasiado ancho).' : `Lo esperable era entre ${Math.round(lo).toLocaleString('es-AR')} y ${Math.round(hi).toLocaleString('es-AR')} km.`}${idx.length === 1 ? ' Con una sola vecina no se puede saber cuál de las dos lecturas está mal.' : ''}`,
    });
  });
  return out;
}
