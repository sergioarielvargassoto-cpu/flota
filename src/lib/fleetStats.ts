/**
 * Métricas de gestión de flota (logística + auditoría). Funciones puras: reciben los datos ya cargados y devuelven
 * indicadores por mes / provincia / chofer / vehículo. Todo se calcula por FECHA (no por mes cerrado), por lo que una
 * carga del 27/09 y otra del 03/10 se encadenan correctamente aunque cambie el mes.
 */
import type { Driver, Fuel, Infraction, Maint, Repair, Trip, Vehicle } from './types';
import { gpsBetween, tolerance } from './kmAudit';

export type Data = {
  vehicles: Vehicle[];
  drivers: Driver[];
  fuel_loads: Fuel[];
  trips: Trip[];
  repairs: Repair[];
  maintenance: Maint[];
  infractions: Infraction[];
};

const isFuelProduct = (p: string | null | undefined) => !/azul|adblue/i.test(p ?? '');
const norm = (s: unknown) =>
  String(s ?? '')
    .toUpperCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Z0-9]/g, '');
const sum = (a: number[]) => a.reduce((s, x) => s + x, 0);
const median = (a: number[]) => {
  if (!a.length) return null;
  const s = [...a].sort((x, y) => x - y);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

export const monthKey = (y: number, m: number) => `${y}-${String(m).padStart(2, '0')}`;
export const monthRange = (key: string) => {
  const [y, m] = key.split('-').map(Number);
  const ny = m === 12 ? y + 1 : y;
  const nm = m === 12 ? 1 : m + 1;
  return { from: `${key}-01`, to: `${monthKey(ny, nm)}-01` };
};
export const prevMonth = (key: string) => {
  const [y, m] = key.split('-').map(Number);
  return m === 1 ? monthKey(y - 1, 12) : monthKey(y, m - 1);
};
export const monthLabel = (key: string) => {
  const [y, m] = key.split('-').map(Number);
  const n = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  return `${n[m - 1]} ${y}`;
};
const daysIn = (key: string) => {
  const { from, to } = monthRange(key);
  return Math.round((+new Date(to) - +new Date(from)) / 864e5);
};
const daysBetween = (a: string, b: string) => Math.round((+new Date(b + 'T00:00:00') - +new Date(a + 'T00:00:00')) / 864e5);

/** Meses (AAAA-MM) con algún dato de combustible o GPS, del más nuevo al más viejo. */
export function availableMonths(d: Data): string[] {
  const s = new Set<string>();
  d.fuel_loads.forEach((f) => s.add(f.date.slice(0, 7)));
  d.trips.forEach((t) => s.add(t.date.slice(0, 7)));
  return [...s].sort().reverse();
}

/** Cargas de combustible con odómetro aceptado (validado al importar), ordenadas por fecha y km. */
function acceptedLoads(d: Data, vid: string) {
  return d.fuel_loads
    .filter((f) => f.vehicle_id === vid && isFuelProduct(f.product) && f.km !== null && f.km !== undefined)
    .sort((a, b) => a.date.localeCompare(b.date) || (a.km as number) - (b.km as number));
}

/** Odómetro interpolado (lineal por fecha) entre dos lecturas aceptadas; null si no hay lecturas a ambos lados. */
function odoAt(acc: Fuel[], date: string): number | null {
  let prev: Fuel | null = null,
    next: Fuel | null = null;
  for (const f of acc) {
    if (f.date <= date) prev = f;
    else {
      next = f;
      break;
    }
  }
  if (!prev) return null;
  if (prev.date === date) return prev.km as number;
  if (!next) return null;
  const span = daysBetween(prev.date, next.date);
  if (span <= 0) return null;
  const frac = daysBetween(prev.date, date) / span;
  return (prev.km as number) + ((next.km as number) - (prev.km as number)) * frac;
}

export type VehicleMonth = {
  v: Vehicle;
  kmSource: 'gps' | 'odometro' | 'ninguno'; // de dónde sale el km operativo

  prov: string;
  driverName: string;
  hasGps: boolean;
  gpsKm: number | null;
  gpsDays: number;
  fills: number;
  liters: number;
  fuelCost: number;
  odoKm: number | null; // km entre la última carga anterior al mes y la última del mes (ventana de consumo)
  odoCalKm: number | null; // km del mes calendario por odómetro (interpolado en los bordes; sin solapes entre meses)
  winLiters: number | null;
  l100: number | null;
  l100Ref: number | null; // consumo de referencia (mes anterior propio o mediana de pares)
  l100Dev: number | null; // desvío % contra la referencia
  tankCap: number; // capacidad estimada del tanque (mayor carga vista, mínimo 40 L)
  l100Band: number | null; // incertidumbre por nivel de tanque desconocido (±L/100 km): capacidad ÷ km de la ventana
  l100Signif: boolean; // el desvío supera el 25 % Y el margen por tanque
  opKm: number | null; // km operativos: GPS si tiene, si no odómetro
  gpsWinKm: number | null; // km del GPS en la MISMA ventana que el odómetro (entre la carga base y la última del mes)
  gpsVsOdo: number | null; // odoKm - gpsWinKm
  maintCost: number;
  repairCost: number;
  totalCost: number;
  costPerKm: number | null;
  fuelPerKm: number | null;
  utilization: number | null; // días con movimiento / días del mes (solo con GPS)
  rejected: number; // lecturas de odómetro descartadas al importar
};

export function vehicleMonth(d: Data, key: string, withRef = true): VehicleMonth[] {
  const { from, to } = monthRange(key);
  const drMap = new Map(d.drivers.map((x) => [x.id, x.name]));
  const hasGpsAny = new Set(d.trips.map((t) => t.vehicle_id));
  const rows: VehicleMonth[] = [];
  for (const v of d.vehicles) {
    if (v.status === 'Baja' || v.exclude_from_reports) continue;
    const fl = d.fuel_loads.filter((f) => f.vehicle_id === v.id && f.date >= from && f.date < to && isFuelProduct(f.product));
    const tr = d.trips.filter((t) => t.vehicle_id === v.id && t.date >= from && t.date < to);
    const hasGps = hasGpsAny.has(v.id);
    const gpsKm = hasGps ? sum(tr.map((t) => Number(t.km_calc) || 0)) : null;
    const gpsDays = tr.filter((t) => Number(t.km_calc) > 5).length;

    // Ventana de odómetro: desde la última carga aceptada ANTES del mes hasta la última del mes
    const acc = acceptedLoads(d, v.id);
    const inMonth = acc.filter((f) => f.date >= from && f.date < to);
    const before = acc.filter((f) => f.date < from);
    let odoKm: number | null = null,
      winLiters: number | null = null,
      gpsWinKm: number | null = null;
    if (inMonth.length) {
      const base = before.length ? before[before.length - 1] : inMonth[0];
      const last = inMonth[inMonth.length - 1];
      const after = before.length ? inMonth : inMonth.slice(1);
      const km = (last.km as number) - (base.km as number);
      if (km > 0 && after.length) {
        odoKm = km;
        winLiters = sum(after.map((f) => Number(f.liters) || 0));
        if (hasGps) gpsWinKm = gpsBetween(d.trips, v.id, base.date, last.date);
      }
    }
    // Km del mes calendario por odómetro: lectura interpolada al inicio y al fin del mes. Mes siguiente = mismo borde => sin doble conteo.
    let odoCalKm: number | null = null;
    if (acc.length >= 2) {
      const S = odoAt(acc, from) ?? (inMonth.length ? (inMonth[0].km as number) : null);
      const E = odoAt(acc, to) ?? (inMonth.length ? (inMonth[inMonth.length - 1].km as number) : null);
      if (S !== null && E !== null && E > S) odoCalKm = E - S;
    }
    const l100 = odoKm && winLiters ? (winLiters / odoKm) * 100 : null;
    const maxLoad = Math.max(0, ...d.fuel_loads.filter((f) => f.vehicle_id === v.id && isFuelProduct(f.product)).map((f) => Number(f.liters) || 0));
    const tankCap = Math.max(maxLoad, 40);
    // Si el GPS casi no registró (equipo sin señal / apagado) frente al odómetro, se usa el odómetro
    const gpsDead = hasGps && gpsWinKm !== null && odoKm !== null && gpsWinKm < 0.2 * odoKm;
    const opKm = hasGps && !gpsDead ? gpsKm : (odoCalKm ?? odoKm ?? gpsKm);
    const kmSource: 'gps' | 'odometro' | 'ninguno' = opKm === null ? 'ninguno' : hasGps && !gpsDead ? 'gps' : 'odometro';
    const maintCost = sum(d.maintenance.filter((m) => m.vehicle_id === v.id && m.date >= from && m.date < to).map((m) => Number(m.cost) || 0));
    const repairCost = sum(d.repairs.filter((r) => r.vehicle_id === v.id && r.date >= from && r.date < to).map((r) => Number(r.cost) || 0));
    const fuelCost = sum(fl.map((f) => Number(f.amount) || 0));
    const total = fuelCost + maintCost + repairCost;
    rows.push({
      v,
      kmSource,
      odoCalKm,
      prov: v.provincia || 'Sin designar',
      driverName: v.driver_id ? (drMap.get(v.driver_id) ?? '—') : '—',
      hasGps,
      gpsKm,
      gpsDays,
      fills: fl.length,
      liters: sum(fl.map((f) => Number(f.liters) || 0)),
      fuelCost,
      odoKm,
      winLiters,
      l100,
      l100Ref: null,
      l100Dev: null,
      tankCap,
      l100Band: odoKm ? (tankCap / odoKm) * 100 : null,
      l100Signif: false,
      opKm,
      gpsWinKm,
      gpsVsOdo: gpsWinKm !== null && odoKm !== null ? odoKm - gpsWinKm : null,
      maintCost,
      repairCost,
      totalCost: total,
      costPerKm: opKm && opKm > 50 && total > 0 ? total / opKm : null,
      fuelPerKm: opKm && opKm > 50 && fuelCost > 0 ? fuelCost / opKm : null,
      utilization: hasGps ? gpsDays / daysIn(key) : null,
      rejected: d.fuel_loads.filter((f) => f.vehicle_id === v.id && f.date >= from && f.date < to && isFuelProduct(f.product) && (f.km === null || f.km === undefined) && f.km_raw !== null && f.km_raw !== undefined).length,
    });
  }
  if (withRef) {
    const prev = vehicleMonth(d, prevMonth(key), false);
    const prevMap = new Map(prev.map((p) => [p.v.id, p.l100]));
    rows.forEach((r) => {
      let ref = prevMap.get(r.v.id) ?? null;
      if (ref === null) {
        const peers = rows.filter((x) => x.v.id !== r.v.id && x.v.type === r.v.type && x.l100 !== null).map((x) => x.l100 as number);
        ref = peers.length >= 3 ? median(peers) : null;
      }
      r.l100Ref = ref;
      r.l100Dev = ref && r.l100 ? ((r.l100 - ref) / ref) * 100 : null;
      r.l100Signif = !!(ref && r.l100 && r.l100Band !== null && Math.abs(r.l100 - ref) > Math.max(0.25 * ref, r.l100Band));
    });
  }
  return rows;
}

export type DriverMonth = {
  id: string | null;
  name: string;
  prov: string;
  fills: number;
  fillDays: number;
  liters: number;
  amount: number;
  avgLiters: number | null;
  km: number; // km atribuidos: tramos entre cargas consecutivas del vehículo, al chofer de la carga que cierra el tramo
  kmLiters: number;
  l100: number | null;
  vehicles: number;
  stations: number;
  notAssigned: number; // cargas en un vehículo que no es el suyo
  rejected: number;
  finesCount: number;
  finesAmount: number;
};

export function driverMonth(d: Data, key: string): DriverMonth[] {
  const { from, to } = monthRange(key);
  const byName = new Map(d.drivers.map((x) => [norm(x.name), x]));
  const vMap = new Map(d.vehicles.map((v) => [v.id, v]));
  const out = new Map<string, DriverMonth & { _v: Set<string>; _s: Set<string>; _d: Set<string>; _p: Map<string, number> }>();
  const get = (raw: string) => {
    const k = norm(raw) || 'SINDATO';
    let r = out.get(k);
    if (!r) {
      const dr = byName.get(k);
      r = {
        id: dr?.id ?? null,
        name: dr?.name ?? (raw || 'Sin dato'),
        prov: '—',
        fills: 0,
        fillDays: 0,
        liters: 0,
        amount: 0,
        avgLiters: null,
        km: 0,
        kmLiters: 0,
        l100: null,
        vehicles: 0,
        stations: 0,
        notAssigned: 0,
        rejected: 0,
        finesCount: 0,
        finesAmount: 0,
        _v: new Set(),
        _s: new Set(),
        _d: new Set(),
        _p: new Map(),
      };
      out.set(k, r);
    }
    return r;
  };
  const loads = d.fuel_loads.filter((f) => isFuelProduct(f.product));
  for (const f of loads.filter((x) => x.date >= from && x.date < to)) {
    const r = get(f.driver_name ?? '');
    r.fills++;
    r._d.add(f.date);
    r.liters += Number(f.liters) || 0;
    r.amount += Number(f.amount) || 0;
    r._v.add(f.vehicle_id);
    if (f.station) r._s.add(f.station);
    const v = vMap.get(f.vehicle_id);
    if (v) {
      const p = v.provincia || 'Sin designar';
      r._p.set(p, (r._p.get(p) ?? 0) + 1);
      const assigned = v.driver_id ? d.drivers.find((x) => x.id === v.driver_id) : undefined;
      if (assigned && norm(assigned.name) !== norm(f.driver_name)) r.notAssigned++;
    }
    if ((f.km === null || f.km === undefined) && f.km_raw !== null && f.km_raw !== undefined) r.rejected++;
  }
  // Tramos entre cargas aceptadas consecutivas del vehículo
  for (const v of d.vehicles) {
    const acc = acceptedLoads(d, v.id);
    for (let i = 1; i < acc.length; i++) {
      const cur = acc[i],
        pr = acc[i - 1];
      if (cur.date < from || cur.date >= to) continue;
      const dk = (cur.km as number) - (pr.km as number);
      if (dk <= 0 || dk > 1500) continue;
      const r = get(cur.driver_name ?? '');
      r.km += dk;
      r.kmLiters += Number(cur.liters) || 0;
    }
  }
  const fin = d.infractions.filter((i) => i.date >= from && i.date < to && i.status !== 'Anulada');
  fin.forEach((i) => {
    const dr = d.drivers.find((x) => x.id === i.driver_id);
    if (!dr) return;
    const r = get(dr.name);
    r.finesCount++;
    r.finesAmount += Number(i.fine_amount) || 0;
  });
  return [...out.values()]
    .map((r) => {
      const prov = [...r._p.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '—';
      return {
        id: r.id,
        name: r.name,
        prov,
        fills: r.fills,
        fillDays: r._d.size,
        liters: r.liters,
        amount: r.amount,
        avgLiters: r.fills ? r.liters / r.fills : null,
        km: r.km,
        kmLiters: r.kmLiters,
        l100: r.km > 0 ? (r.kmLiters / r.km) * 100 : null,
        vehicles: r._v.size,
        stations: r._s.size,
        notAssigned: r.notAssigned,
        rejected: r.rejected,
        finesCount: r.finesCount,
        finesAmount: r.finesAmount,
      };
    })
    .filter((r) => r.fills > 0 || r.finesCount > 0)
    .sort((a, b) => b.liters - a.liters);
}

export type ProvMonth = {
  prov: string;
  vehicles: number;
  opKm: number;
  liters: number;
  fuelCost: number;
  l100: number | null;
  fuelPerKm: number | null;
  costPerKm: number | null;
  totalCost: number;
  fills: number;
};
export function provinceMonth(rows: VehicleMonth[]): ProvMonth[] {
  const g = new Map<string, VehicleMonth[]>();
  rows.forEach((r) => g.set(r.prov, [...(g.get(r.prov) ?? []), r]));
  return [...g.entries()]
    .map(([prov, rs]) => {
      const opKm = sum(rs.map((r) => r.opKm ?? 0));
      const withL = rs.filter((r) => r.l100 !== null);
      const winKm = sum(withL.map((r) => r.odoKm as number));
      const winL = sum(withL.map((r) => r.winLiters as number));
      const fuelCost = sum(rs.map((r) => r.fuelCost));
      const totalCost = sum(rs.map((r) => r.totalCost));
      return {
        prov,
        vehicles: rs.length,
        opKm,
        liters: sum(rs.map((r) => r.liters)),
        fuelCost,
        l100: winKm > 0 ? (winL / winKm) * 100 : null,
        fuelPerKm: opKm > 0 && fuelCost > 0 ? fuelCost / opKm : null,
        costPerKm: opKm > 0 && totalCost > 0 ? totalCost / opKm : null,
        totalCost,
        fills: sum(rs.map((r) => r.fills)),
      };
    })
    .sort((a, b) => b.opKm - a.opKm);
}

export type FleetTotals = {
  opKm: number;
  gpsKm: number; // parte medida por GPS
  odoOnlyKm: number; // parte medida por odómetro (vehículos sin GPS o con GPS que no registró)
  liters: number;
  fuelCost: number;
  fills: number;
  l100: number | null;
  fuelPerKm: number | null;
  upkeep: number;
  totalCost: number;
  costPerKm: number | null;
};
export function totals(rows: VehicleMonth[]): FleetTotals {
  const opKm = sum(rows.map((r) => r.opKm ?? 0));
  const withL = rows.filter((r) => r.l100 !== null);
  const winKm = sum(withL.map((r) => r.odoKm as number));
  const winL = sum(withL.map((r) => r.winLiters as number));
  const fuelCost = sum(rows.map((r) => r.fuelCost));
  const upkeep = sum(rows.map((r) => r.maintCost + r.repairCost));
  const totalCost = fuelCost + upkeep;
  return {
    opKm,
    gpsKm: sum(rows.filter((r) => r.kmSource === 'gps').map((r) => r.opKm ?? 0)),
    odoOnlyKm: sum(rows.filter((r) => r.kmSource === 'odometro').map((r) => r.opKm ?? 0)),
    liters: sum(rows.map((r) => r.liters)),
    fuelCost,
    fills: sum(rows.map((r) => r.fills)),
    l100: winKm > 0 ? (winL / winKm) * 100 : null,
    fuelPerKm: opKm > 0 && fuelCost > 0 ? fuelCost / opKm : null,
    upkeep,
    totalCost,
    costPerKm: opKm > 0 && totalCost > 0 ? totalCost / opKm : null,
  };
}

/* ───────────────────────── Auditoría entre cargas ───────────────────────── */

export type PairRow = {
  vehicle: Vehicle;
  prev: Fuel;
  cur: Fuel;
  prevKm: number;
  curKm: number;
  dKm: number;
  days: number;
  sameDay: boolean;
  gpsKm: number | null;
  gpsDiff: number | null;
  l100: number | null; // indicativo: litros de la carga que cierra el tramo / km (no sabemos con cuánto salió)
  flags: string[];
};

/**
 * Pares de cargas consecutivas por vehículo usando SOLO lecturas válidas (las inválidas se listan aparte en
 * `invalidReadings`). El GPS suma días completos y la carga ocurre a cualquier hora, por eso el margen de comparación
 * incluye el recorrido de un día promedio del vehículo.
 */
export function fuelPairs(d: Data, from: string, to: string): PairRow[] {
  const out: PairRow[] = [];
  for (const v of d.vehicles) {
    if (v.status === 'Baja') continue;
    const all = acceptedLoads(d, v.id).map((f) => ({ f, odo: f.km as number }));
    const vt = d.trips.filter((t) => t.vehicle_id === v.id);
    const first = vt.reduce<string | null>((m, t) => (!m || t.date < m ? t.date : m), null);
    const last = vt.reduce<string | null>((m, t) => (!m || t.date > m ? t.date : m), null);
    const daily = vt.length ? Math.max(50, sum(vt.map((t) => Number(t.km_calc) || 0)) / vt.length) : 0;
    for (let i = 1; i < all.length; i++) {
      const a = all[i - 1],
        b = all[i];
      if (b.f.date < from || b.f.date >= to) continue;
      const dKm = b.odo - a.odo;
      const days = daysBetween(a.f.date, b.f.date);
      const sameDay = days === 0;
      const flags: string[] = [];
      if (dKm <= 0) flags.push('El odómetro no avanza');
      if (sameDay) flags.push('Mismo día: el orden real es incierto (revisar hora en el remito)');
      let gpsKm: number | null = null,
        gpsDiff: number | null = null;
      if (first && last && a.f.date >= first && b.f.date <= last && !sameDay) {
        gpsKm = gpsBetween(d.trips, v.id, a.f.date, b.f.date);
        gpsDiff = dKm - gpsKm;
        if (Math.abs(gpsDiff) > tolerance(gpsKm) + daily)
          flags.push(gpsDiff > 0 ? 'El odómetro marca bastante más km que el GPS' : 'El GPS marca bastante más km que el odómetro');
      }
      const l100 = dKm > 0 ? ((Number(b.f.liters) || 0) / dKm) * 100 : null;
      if (l100 !== null && dKm > 150 && (l100 < 4 || l100 > 30)) flags.push('Consumo implícito fuera de rango en este tramo (indicativo)');
      out.push({ vehicle: v, prev: a.f, cur: b.f, prevKm: a.odo, curKm: b.odo, dKm, days, sameDay, gpsKm, gpsDiff, l100, flags });
    }
  }
  return out.sort((a, b) => b.cur.date.localeCompare(a.cur.date));
}

export type InvalidRow = {
  load: Fuel;
  plate: string;
  driver: string;
  station: string;
  declared: number;
  expected: number | null; // odómetro esperable según las lecturas válidas vecinas
  why: string;
};

/** Lecturas de odómetro inválidas (tipeos en el surtidor, valores absurdos) del período, con el valor esperable. */
export function invalidReadings(d: Data, from: string, to: string): InvalidRow[] {
  const out: InvalidRow[] = [];
  const vMap = new Map(d.vehicles.map((v) => [v.id, v]));
  for (const f of d.fuel_loads) {
    if (f.date < from || f.date >= to || !isFuelProduct(f.product)) continue;
    if (f.km !== null && f.km !== undefined) continue;
    if (f.km_raw === null || f.km_raw === undefined) continue;
    const v = vMap.get(f.vehicle_id);
    if (!v) continue;
    const acc = acceptedLoads(d, v.id);
    let expected: number | null = odoAt(acc, f.date);
    if (expected === null) {
      const lastBefore = [...acc].reverse().find((x) => x.date <= f.date);
      const firstAfter = acc.find((x) => x.date >= f.date);
      expected = lastBefore ? (lastBefore.km as number) : firstAfter ? (firstAfter.km as number) : null;
    }
    const decl = Number(f.km_raw);
    let why = 'Km inconsistente con las lecturas vecinas';
    if (decl < 1000) why = 'Km demasiado bajo (parece un número inventado o incompleto)';
    else if (expected !== null && decl > expected * 1.5) why = 'Km muy superior al real (probable dígito de más)';
    else if (expected !== null && decl < expected * 0.7) why = 'Km muy inferior al real (probable dígito de menos)';
    out.push({ load: f, plate: v.plate, driver: f.driver_name ?? 'Sin dato', station: f.station ?? '—', declared: decl, expected: expected === null ? null : Math.round(expected), why });
  }
  return out.sort((a, b) => b.load.date.localeCompare(a.load.date));
}

export type QualityRow = { name: string; loads: number; invalid: number; pct: number };
/** % de cargas con odómetro inválido, por chofer y por estación. */
export function readingQuality(d: Data, from: string, to: string) {
  const mk = (keyOf: (f: Fuel) => string) => {
    const m = new Map<string, { loads: number; invalid: number }>();
    d.fuel_loads
      .filter((f) => f.date >= from && f.date < to && isFuelProduct(f.product))
      .forEach((f) => {
        const k = keyOf(f) || 'Sin dato';
        const r = m.get(k) ?? { loads: 0, invalid: 0 };
        r.loads++;
        if ((f.km === null || f.km === undefined) && f.km_raw !== null && f.km_raw !== undefined) r.invalid++;
        m.set(k, r);
      });
    return [...m.entries()]
      .map(([name, r]) => ({ name, loads: r.loads, invalid: r.invalid, pct: r.loads ? (r.invalid / r.loads) * 100 : 0 }))
      .sort((a, b) => b.invalid - a.invalid || b.pct - a.pct);
  };
  const total = d.fuel_loads.filter((f) => f.date >= from && f.date < to && isFuelProduct(f.product));
  const invalid = total.filter((f) => (f.km === null || f.km === undefined) && f.km_raw !== null && f.km_raw !== undefined).length;
  return {
    byDriver: mk((f) => f.driver_name ?? ''),
    byStation: mk((f) => (f.station ?? '').replace(/\s*\(.*\)\s*$/, '')),
    total: total.length,
    invalid,
    pct: total.length ? (invalid / total.length) * 100 : 0,
  };
}

/** Desfasaje medio del GPS frente al odómetro (ventanas completas del mes; excluye GPS que casi no registró). */
export function gpsBias(rows: VehicleMonth[]): { pct: number | null; n: number } {
  const ok = rows.filter((r) => r.gpsWinKm !== null && r.odoKm && r.gpsWinKm >= 0.2 * r.odoKm && r.gpsWinKm > 200);
  const o = sum(ok.map((r) => r.odoKm as number));
  const g = sum(ok.map((r) => r.gpsWinKm as number));
  return { pct: g > 0 ? (o / g - 1) * 100 : null, n: ok.length };
}

/* ───────────────────────── Hallazgos para decidir ───────────────────────── */

export type Insight = { sev: 'critical' | 'warning' | 'info' | 'good'; area: string; title: string; detail: string };

export function insights(
  cur: VehicleMonth[],
  prev: VehicleMonth[],
  drv: DriverMonth[],
  tot: FleetTotals,
  prevTot: FleetTotals,
  extras: { servicesOverdue: number; docsOverdue: number; finesLoaded: number; key: string }
): Insight[] {
  const out: Insight[] = [];
  const pc = (a: number | null, b: number | null) => (a !== null && b ? ((a - b) / b) * 100 : null);
  const f1 = (n: number) => n.toLocaleString('es-AR', { maximumFractionDigits: 1 });

  // Consumo por vehículo vs su referencia
  cur
    .filter((r) => r.l100Signif && (r.l100Dev as number) > 0)
    .sort((a, b) => (b.l100Dev as number) - (a.l100Dev as number))
    .forEach((r) =>
      out.push({
        sev: (r.l100Dev as number) > 40 ? 'critical' : 'warning',
        area: 'Consumo',
        title: `${r.v.plate}: consume ${f1(r.l100Dev as number)} % más que su referencia`,
        detail: `${f1(r.l100 as number)} L/100 km contra ${f1(r.l100Ref as number)} de referencia (margen por nivel de tanque ±${f1(r.l100Band as number)}). Revisar estado mecánico, forma de manejo o cargas de combustible para otros fines.`,
      })
    );
  // Consumo implausiblemente bajo: suele indicar odómetro sobreestimado o combustible cargado para otro fin
  cur
    .filter((r) => r.l100Signif && (r.l100Dev as number) < -30 && (r.odoKm ?? 0) > 300)
    .forEach((r) =>
      out.push({
        sev: 'warning',
        area: 'Auditoría',
        title: `${r.v.plate}: consumo anormalmente bajo (${f1(r.l100 as number)} L/100 km)`,
        detail: `Esperable ~${f1(r.l100Ref as number)}. Un consumo tan bajo suele deberse a un odómetro mal cargado (de más) o a litros no registrados. Revisar las lecturas del mes.`,
      })
    );
  // GPS vs odómetro
  cur
    .filter((r) => r.gpsVsOdo !== null && r.gpsWinKm !== null && Math.abs(r.gpsVsOdo) > tolerance(r.gpsWinKm) + 100)
    .forEach((r) =>
      out.push({
        sev: 'warning',
        area: 'Auditoría',
        title: `${r.v.plate}: el odómetro de las estaciones y el GPS difieren en ${f1(Math.abs(r.gpsVsOdo as number))} km`,
        detail: `Entre las mismas dos cargas: odómetro ${f1(r.odoKm as number)} km contra GPS ${f1(r.gpsWinKm as number)} km. ${(r.gpsWinKm as number) < 0.2 * (r.odoKm as number) ? 'El GPS casi no registró: revisar el equipo.' : 'Puede ser GPS sin señal, uso fuera de cobertura o lecturas mal cargadas.'}`,
      })
    );
  // Lecturas descartadas por chofer
  drv
    .filter((x) => x.rejected >= 2)
    .forEach((x) =>
      out.push({
        sev: 'warning',
        area: 'Auditoría',
        title: `${x.name}: ${x.rejected} lecturas de odómetro descartadas`,
        detail: 'Cargas con km inconsistente (tipeo o dato falso). Conviene capacitar o controlar al cargar en el surtidor.',
      })
    );
  // Cargas en vehículo no asignado
  drv
    .filter((x) => x.notAssigned >= 3)
    .forEach((x) =>
      out.push({
        sev: 'info',
        area: 'Control',
        title: `${x.name}: ${x.notAssigned} cargas en vehículos que no tiene asignados`,
        detail: 'Si es habitual, actualizar la asignación; si no, verificar el uso de tarjetas.',
      })
    );
  // Baja utilización
  cur
    .filter((r) => r.opKm !== null && r.opKm < 300 && (r.hasGps || r.fills > 0))
    .forEach((r) =>
      out.push({
        sev: 'info',
        area: 'Utilización',
        title: `${r.v.plate}: solo ${f1(r.opKm as number)} km en el mes`,
        detail: 'Baja utilización con costos fijos. Evaluar reasignarlo, venderlo o dar de baja.',
      })
    );
  // Sin carga en el mes
  cur
    .filter((r) => r.fills === 0 && r.v.status === 'Activo' && (r.opKm ?? 0) > 300)
    .forEach((r) =>
      out.push({
        sev: 'info',
        area: 'Datos',
        title: `${r.v.plate}: recorrió ${f1(r.opKm as number)} km pero no tiene cargas de combustible en el mes`,
        detail: 'Faltan cargas en el archivo de YPF o el vehículo se abastece por otro medio.',
      })
    );
  // Costo por km más alto
  const worst = [...cur].filter((r) => r.costPerKm !== null).sort((a, b) => (b.costPerKm as number) - (a.costPerKm as number)).slice(0, 3);
  if (worst.length)
    out.push({
      sev: 'info',
      area: 'Costos',
      title: `Mayor costo por km: ${worst.map((w) => `${w.v.plate} ($ ${Math.round(w.costPerKm as number).toLocaleString('es-AR')})`).join(', ')}`,
      detail: 'Combustible + mantenimiento + reparaciones del mes dividido los km. Priorizar su revisión.',
    });
  // Evolución del costo por km de la flota
  const dpk = pc(tot.fuelPerKm, prevTot.fuelPerKm);
  if (dpk !== null && dpk > 10)
    out.push({ sev: 'warning', area: 'Costos', title: `El gasto de combustible por km subió ${f1(dpk)} % contra el mes anterior`, detail: 'Puede deberse a precio del combustible, mayor consumo o menos km por carga. Ver la tabla por provincia y por vehículo.' });
  else if (dpk !== null && dpk < -10)
    out.push({ sev: 'good', area: 'Costos', title: `El gasto de combustible por km bajó ${f1(-dpk)} % contra el mes anterior`, detail: 'Mejora en eficiencia o en precio. Mantener los controles.' });
  // Cumplimiento
  if (extras.servicesOverdue)
    out.push({ sev: 'critical', area: 'Mantenimiento', title: `${extras.servicesOverdue} vehículo(s) con service vencido`, detail: 'Un service se da por realizado solo cuando se carga en Mantenimientos. Verificar si se hizo y cargarlo.' });
  if (extras.docsOverdue)
    out.push({ sev: 'critical', area: 'Documentación', title: `${extras.docsOverdue} documento(s) vencido(s)`, detail: 'Riesgo legal y de seguro. Ver Vencimientos.' });
  if (!extras.finesLoaded)
    out.push({ sev: 'info', area: 'Multas', title: 'No hay multas cargadas en este período', detail: 'Cuando se carguen en Infracciones, aparecen acá por chofer y por vehículo.' });
  if (!out.length) out.push({ sev: 'good', area: 'General', title: 'Sin desvíos relevantes en el período', detail: 'No se detectaron alertas con los datos cargados.' });
  const order = { critical: 0, warning: 1, info: 2, good: 3 } as const;
  return out.sort((a, b) => order[a.sev] - order[b.sev]);
}
