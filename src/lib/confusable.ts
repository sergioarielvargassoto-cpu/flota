/**
 * Vehículos que se pueden CONFUNDIR entre sí al cargar datos (patentes parecidas, mismo estilo de patente y km parecidos).
 * Sirve para avisar en la ficha, al importar combustible y en la auditoría: "no mezclar datos de estos dos vehículos".
 */
import { readingsOf } from './kmAnchor';
import { gpsReliability } from './kmAudit';
import { trajectoryOutliers, type TReading } from './kmTrajectory';
import type { Fuel, KmHistory, Maint, Repair, Trip, Vehicle } from './types';

export type Pair = { a: string; b: string; reasons: string[]; byOwner: boolean };

/** Pares señalados por el responsable (siempre se avisan, aunque las reglas automáticas no los detecten). */
export const OWNER_PAIRS: [string, string][] = [['OQK804', 'OUG184']];

const lev = (a: string, b: string) => {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
};
const oldFormat = (p: string) => /^[A-Z]{3}\d{3}$/.test(p);

export function confusablePairs(vehicles: Pick<Vehicle, 'plate' | 'km' | 'status'>[]): Pair[] {
  const vs = vehicles.filter((v) => v.status !== 'Baja');
  const key = (a: string, b: string) => [a, b].sort().join('|');
  const map = new Map<string, Pair>();
  const add = (a: string, b: string, reason: string, owner = false) => {
    const k = key(a, b);
    const cur = map.get(k) ?? { a: [a, b].sort()[0], b: [a, b].sort()[1], reasons: [], byOwner: false };
    if (!cur.reasons.includes(reason)) cur.reasons.push(reason);
    cur.byOwner = cur.byOwner || owner;
    map.set(k, cur);
  };
  for (const [a, b] of OWNER_PAIRS) if (vs.some((v) => v.plate === a) && vs.some((v) => v.plate === b)) add(a, b, 'Señalado por el responsable: no mezclar los datos de estos dos vehículos.', true);
  for (let i = 0; i < vs.length; i++)
    for (let j = i + 1; j < vs.length; j++) {
      const A = vs[i],
        B = vs[j];
      if (lev(A.plate, B.plate) <= 2) add(A.plate, B.plate, `Las patentes se diferencian en ${lev(A.plate, B.plate)} carácter(es): fácil de tipear una por otra.`);
      if (oldFormat(A.plate) && oldFormat(B.plate) && A.plate[0] === B.plate[0] && A.km && B.km && Math.abs(A.km - B.km) / Math.max(A.km, B.km) <= 0.1)
        add(A.plate, B.plate, `Patentes del mismo estilo que empiezan igual (${A.plate[0]}) y con km parecidos (${A.km.toLocaleString('es-AR')} y ${B.km.toLocaleString('es-AR')}): un dato de uno parece del otro.`);
    }
  return [...map.values()];
}
export const twinsOf = (plate: string, pairs: Pair[]): string[] => pairs.filter((p) => p.a === plate || p.b === plate).map((p) => (p.a === plate ? p.b : p.a));

type Data = { vehicles: Vehicle[]; fuel_loads: Fuel[]; km_history: KmHistory[]; maintenance: Maint[]; repairs: Repair[]; trips: Trip[] };

/** Datos cargados a `from` (cargas, mantenimientos, reparaciones) que ENCAJAN con la trayectoria de `to`: pudieron cargarse en el vehículo equivocado. */
export function crossFits(from: Vehicle, to: Vehicle, d: Data): { what: string; date: string; km: number; valid: boolean }[] {
  const toRef = {
    fuel_loads: d.fuel_loads.filter((x) => x.vehicle_id === to.id),
    km_history: d.km_history.filter((x) => x.vehicle_id === to.id),
    maintenance: d.maintenance.filter((x) => x.vehicle_id === to.id),
    repairs: d.repairs.filter((x) => x.vehicle_id === to.id),
  };
  const base: TReading[] = readingsOf(to.id, toRef).map((r) => ({ key: `${r.date}|${r.km}`, date: r.date, km: r.km, src: r.src }));
  if (base.length < 1) return [];
  const vt = d.trips.filter((t) => t.vehicle_id === to.id);
  const ok = gpsReliability(to.id, d.fuel_loads, d.trips).reliable;
  const cands = [
    ...d.fuel_loads
      .filter((x) => x.vehicle_id === from.id && x.km_raw != null && !/azul|adblue/i.test(x.product ?? ''))
      .map((x) => ({ what: `carga de ${x.driver_name ?? 'sin dato'} (${x.liters} L)`, date: x.date, km: x.km_raw as number, valid: x.km != null })),
    ...d.maintenance.filter((x) => x.vehicle_id === from.id && x.km != null).map((x) => ({ what: `mantenimiento ${x.type}`, date: x.date, km: x.km as number, valid: true })),
    ...d.repairs.filter((x) => x.vehicle_id === from.id && x.km != null).map((x) => ({ what: 'reparación', date: x.date, km: x.km as number, valid: true })),
  ];
  return cands.filter((c) => {
    const withC: TReading[] = [...base, { key: 'X', date: c.date, km: c.km, src: 'estación' }];
    return !trajectoryOutliers(withC, vt, to.id, ok).some((f) => f.key === 'X');
  });
}
