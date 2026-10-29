'use client';
import { useData } from './data';
import { sb } from './supabase';
import type { ColSpec } from './excel';
import type { Vehicle } from './types';
import { DOC_VEHICLE_DEFAULT, isFuel, nrm, okOdo, pDate, pNum } from './util';

export const TRIP_SPEC: ColSpec[] = [
  { k: 'v', l: 'Vehículo (con la patente entre paréntesis)', re: /^veh[ií]culo$|^patente|^dominio/ },
  { k: 'd', l: 'Día', re: /^d[ií]a$|^fecha/ },
  { k: 'c', l: 'Distancia calculada (km)', re: /calculada/ },
  { k: 'r', l: 'Distancia reportada (km)', re: /reportada/ },
  { k: 'x', l: 'Velocidad máxima (km/h)', re: /m[aá]xima/ },
  { k: 'm', l: 'Tiempo en movimiento', re: /en movimiento/ },
];

export const FUEL_SPEC: ColSpec[] = [
  { k: 'p', l: 'Patente / dominio', re: /^identificacion tarjeta$|^patente|^dominio/ },
  { k: 't', l: 'N° de tarjeta', re: /^tarjeta$/ },
  { k: 'f', l: 'Fecha', re: /^fecha/ },
  { k: 'l', l: 'Litros / unidades', re: /^litros/ },
  { k: 'i', l: 'Importe sin IVA ($)', re: /importe total sin iva|^importe|^monto/ },
  { k: 'k', l: 'Odómetro', re: /od[oó]metro|kilometraje/ },
  { k: 'e', l: 'Establecimiento', re: /^establecimiento$|^estaci[oó]n/ },
  { k: 'loc', l: 'Localidad', re: /^localidad$/ },
  { k: 'pr', l: 'Producto', re: /^producto$/ },
  { k: 'c', l: 'Conductor', re: /^conductor$/ },
  { k: 'r', l: 'Remito', re: /^remito$/ },
];

export const KM_SPEC: ColSpec[] = [
  { k: 'v', l: 'Vehículo (patente o marca/patente)', re: /^veh[ií]culo$|^patente|^dominio|^identificaci[ó]n/ },
  { k: 'd', l: 'Día / Fecha', re: /^d[ií]a$|^fecha/ },
  { k: 'c', l: 'Distancia (km calculados o reportados)', re: /distancia|^km$|kilometraje|calculada|reportada/ },
];

const r2 = (n: number) => Math.round(n * 100) / 100;
const title = (s: string) => s.toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase());
const patOf = (s: unknown) => { const m = String(s ?? '').match(/\(([^)]+)\)/); return nrm(m ? m[1] : s); };
const brandOf = (s: unknown) => {
  const t = String(s ?? '').replace(/\(.*\)/, '').trim().toUpperCase().replace(/\./g, '').trim();
  if (!t) return '';
  return /^M BENZ/.test(t) ? 'Mercedes-Benz' : t.charAt(0) + t.slice(1).toLowerCase();
};

export function useImporters() {
  const { vehicles, trips, fuel_loads, reload } = useData();

  /** Devuelve patente→vehículo; ofrece crear los vehículos que no existan todavía. */
  async function ensureVehicles(found: Map<string, string>): Promise<Map<string, Vehicle>> {
    const byPlate = new Map(vehicles.map((v) => [nrm(v.plate), v]));
    const missing = [...found.keys()].filter((p) => !byPlate.has(p));
    if (missing.length && confirm(`Estos ${missing.length} vehículos no están cargados en la app:\n${missing.join(', ')}\n\n¿Querés crearlos ahora? (Si cancelás, se omiten sus filas)`)) {
      const { data, error } = await sb().from('vehicles').insert(missing.map((p) => ({ plate: p, brand: found.get(p) || null }))).select();
      if (error) throw error;
      const nv = (data ?? []) as Vehicle[];
      const d = await sb().from('documents').insert(nv.flatMap((v) => DOC_VEHICLE_DEFAULT.map((t) => ({ vehicle_id: v.id, doc_type: t }))));
      if (d.error) throw d.error;
      nv.forEach((v) => byPlate.set(nrm(v.plate), v));
    }
    return byPlate;
  }

  async function importTrips(data: unknown[][], m: Record<string, number>) {
    if (m.v < 0 || m.d < 0 || (m.c < 0 && m.r < 0)) return alert('Hacen falta vehículo, día y distancia.');
    const parsed = data.map((r) => ({
      pt: patOf(r[m.v]), brand: brandOf(r[m.v]), fecha: pDate(r[m.d]),
      c: m.c >= 0 ? pNum(r[m.c]) : NaN, r: m.r >= 0 ? pNum(r[m.r]) : NaN, x: m.x >= 0 ? pNum(r[m.x]) : NaN,
      mov: m.m >= 0 ? String(r[m.m] ?? '') : '',
    })).filter((x) => x.pt && x.fecha && (!isNaN(x.c) || !isNaN(x.r)));
    if (!parsed.length) return alert('No encontré filas con datos válidos.');

    const byPlate = await ensureVehicles(new Map(parsed.map((x) => [x.pt, x.brand])));
    const existing = new Set(trips.map((t) => t.vehicle_id + '|' + t.date));
    const rows = new Map<string, { vehicle_id: string; date: string; km_calc: number; km_reported: number | null; max_speed: number | null; moving_time: string | null }>();
    let skipped = 0;
    for (const x of parsed) {
      const v = byPlate.get(x.pt);
      if (!v) { skipped++; continue; }
      rows.set(v.id + '|' + x.fecha, {
        vehicle_id: v.id, date: x.fecha, km_calc: r2(!isNaN(x.c) ? x.c : x.r), km_reported: isNaN(x.r) ? null : r2(x.r),
        max_speed: isNaN(x.x) ? null : Math.round(x.x), moving_time: x.mov || null,
      });
    }
    const list = [...rows.values()];
    for (let i = 0; i < list.length; i += 500) {
      const { error } = await sb().from('trips').upsert(list.slice(i, i + 500), { onConflict: 'vehicle_id,date' });
      if (error) throw error;
    }
    // km actual = última lectura de odómetro + km del GPS posteriores a esa lectura (solo días nuevos)
    const fresh = list.filter((t) => !existing.has(t.vehicle_id + '|' + t.date));
    const byVeh = new Map<string, typeof fresh>();
    fresh.forEach((t) => byVeh.set(t.vehicle_id, [...(byVeh.get(t.vehicle_id) ?? []), t]));
    for (const [vid, arr] of byVeh) {
      const v = [...byPlate.values()].find((x) => x.id === vid);
      if (!v || v.km === null || !v.km_date) continue;
      const nd = arr.filter((t) => t.date > v.km_date!);
      if (!nd.length) continue;
      const { error } = await sb().from('vehicles').update({
        km: Math.round(v.km + nd.reduce((s, t) => s + t.km_calc, 0)),
        km_date: nd.reduce((mx, t) => (t.date > mx ? t.date : mx), v.km_date),
      }).eq('id', vid);
      if (error) throw error;
    }
    await reload('vehicles', 'documents', 'trips');
    alert(`${fresh.length} días nuevos, ${list.length - fresh.length} actualizados${skipped ? `, ${skipped} filas omitidas (vehículo no creado)` : ''}.\nEl km actual de cada vehículo se actualizó sumando la distancia posterior a su última lectura de odómetro.`);
  }

  async function importFuel(data: unknown[][], m: Record<string, number>) {
    if (m.f < 0 || m.l < 0 || (m.p < 0 && m.t < 0)) return alert('Hace falta fecha, litros y patente o tarjeta.');
    const g = (r: unknown[], k: string) => (m[k] >= 0 ? String(r[m[k]] ?? '').trim() : '');
    const byCard = (t: string) => vehicles.find((x) => nrm(x.fuel_card) && nrm(x.fuel_card) === nrm(t).slice(-6));
    const L = data.map((r) => {
      const t = nrm(g(r, 't'));
      let pt = nrm(g(r, 'p'));
      if (!pt && t) { const v = byCard(t); if (v) pt = nrm(v.plate); }
      const loc = g(r, 'loc');
      return {
        pt, tarj: t, fecha: pDate(r[m.f]), lit: pNum(r[m.l]),
        im: m.i >= 0 ? pNum(r[m.i]) : NaN, odo: m.k >= 0 ? pNum(r[m.k]) : NaN,
        est: [g(r, 'e').replace(/^\d+\s*-\s*/, ''), loc ? `(${title(loc)})` : ''].filter(Boolean).join(' '),
        prod: title(g(r, 'pr')), cond: g(r, 'c'), rem: g(r, 'r'),
      };
    }).filter((x) => x.fecha && !isNaN(x.lit) && x.pt);
    if (!L.length) return alert('No encontré filas con datos válidos (fecha, litros y patente).');

    const byPlate = await ensureVehicles(new Map(L.map((x) => [x.pt, ''])));
    L.sort((a, b) => a.fecha.localeCompare(b.fecha));
    const haveReceipt = new Set(fuel_loads.map((f) => f.receipt).filter(Boolean));
    const haveKey = new Set(fuel_loads.map((f) => [f.vehicle_id, f.date, f.liters, f.amount].join('|')));
    const state = new Map<string, { km: number | null; date: string | null; card: string | null; changed: boolean }>();
    byPlate.forEach((v) => state.set(v.id, { km: v.km, date: v.km_date, card: v.fuel_card, changed: false }));

    const rows: object[] = [];
    let dup = 0, bad = 0, skipped = 0;
    for (const x of L) {
      const v = byPlate.get(x.pt);
      if (!v) { skipped++; continue; }
      const liters = r2(x.lit), amount = isNaN(x.im) ? null : r2(x.im);
      if (x.rem ? haveReceipt.has(x.rem) : haveKey.has([v.id, x.fecha, liters, amount].join('|'))) { dup++; continue; }
      if (x.rem) haveReceipt.add(x.rem); else haveKey.add([v.id, x.fecha, liters, amount].join('|'));
      const st = state.get(v.id)!;
      const odo = isNaN(x.odo) ? null : Math.round(x.odo);
      const good = odo !== null && isFuel(x.prod) && okOdo(st.km, st.date, x.fecha, odo);
      if (odo !== null && !good && isFuel(x.prod)) bad++;
      if (good && (!st.date || x.fecha > st.date)) { st.km = odo; st.date = x.fecha; st.changed = true; }
      if (!st.card && x.tarj) { st.card = x.tarj.slice(-6); st.changed = true; }
      rows.push({
        vehicle_id: v.id, date: x.fecha, liters, amount, km: good ? odo : null, km_raw: odo,
        station: x.est || null, product: x.prod || null, driver_name: x.cond || null, receipt: x.rem || null,
      });
    }
    for (let i = 0; i < rows.length; i += 200) {
      const { error } = await sb().from('fuel_loads').insert(rows.slice(i, i + 200));
      if (error) throw error;
    }
    for (const [vid, st] of state) {
      if (!st.changed) continue;
      const { error } = await sb().from('vehicles').update({ km: st.km, km_date: st.date, fuel_card: st.card }).eq('id', vid);
      if (error) throw error;
    }
    await reload('vehicles', 'documents', 'fuel_loads');
    alert(`${rows.length} cargas importadas.${dup ? `\n${dup} ya estaban (omitidas).` : ''}${bad ? `\n${bad} odómetros descartados por inconsistentes (se marcan con ⚠).` : ''}${skipped ? `\n${skipped} filas omitidas (vehículo no creado).` : ''}`);
  }

  async function importKmReport(data: unknown[][], m: Record<string, number>, month: number, year: number, fileName: string) {
    // Detectar si es formato Gestya (patente en paréntesis) o simple
    const isGestya = data.some((r) => String(r[m.v] ?? '').includes('('));

    const parsed = data.map((r) => {
      const vehicleStr = String(r[m.v] ?? '').trim();
      const pt = isGestya ? patOf(vehicleStr) : nrm(vehicleStr);
      const brand = isGestya ? brandOf(vehicleStr) : '';
      const fecha = pDate(r[m.d]);
      const km = pNum(r[m.c]);
      return { pt, brand, fecha, km: isNaN(km) ? 0 : Math.round(km * 100) / 100 };
    }).filter((x) => x.pt && x.km > 0);

    if (!parsed.length) return alert('No encontré filas con datos válidos (patente y km > 0).');

    // Validar que todas las fechas sean del mes elegido
    const outOfRange = parsed.filter((x) => {
      const [y, m] = x.fecha.split('-').map(Number);
      return y !== year || m !== month;
    });
    if (outOfRange.length) {
      const oos = outOfRange.map((x) => `${x.pt}: ${x.fecha}`).slice(0, 5);
      if (!confirm(`${outOfRange.length} filas están fuera del período ${year}-${String(month).padStart(2, '0')}:\n${oos.join('\n')}\n\n¿Continuar omitiendo estas filas?`)) return;
    }

    const filteredParsed = parsed.filter((x) => {
      const [y, m] = x.fecha.split('-').map(Number);
      return y === year && m === month;
    });

    const byPlate = await ensureVehicles(new Map(filteredParsed.map((x) => [x.pt, x.brand])));

    // Agrupar por vehículo y calcular totales + desglose por día
    const byVid = new Map<string, { v: Vehicle; km_total: number; km_by_day: Record<string, number> }>();
    for (const x of filteredParsed) {
      const v = byPlate.get(x.pt);
      if (!v) continue;
      if (!byVid.has(v.id)) byVid.set(v.id, { v, km_total: 0, km_by_day: {} });
      const entry = byVid.get(v.id)!;
      entry.km_total += x.km;
      entry.km_by_day[x.fecha] = (entry.km_by_day[x.fecha] ?? 0) + x.km;
    }

    // Buscar km del mes anterior para calcular variación
    const kmPrevMonth = await sb()
      .from('km_reports')
      .select('vehicle_id, km_total')
      .eq('year', month === 1 ? year - 1 : year)
      .eq('month', month === 1 ? 12 : month - 1);

    const prevMap = new Map(
      (kmPrevMonth.data ?? []).map((r: any) => [r.vehicle_id, r.km_total])
    );

    // Verificar si el mes ya existe
    const existing = await sb()
      .from('km_reports')
      .select('vehicle_id')
      .eq('year', year)
      .eq('month', month);

    if ((existing.data ?? []).length > 0) {
      const replace = confirm(`Ya existe reporte para ${year}-${String(month).padStart(2, '0')}.\n\n¿Reemplazar datos?`);
      if (!replace) return;
      await sb().from('km_reports').delete().eq('year', year).eq('month', month);
    }

    // Insertar registros
    const rows = [...byVid.entries()].map(([vid, { km_total, km_by_day }]) => ({
      vehicle_id: vid,
      month,
      year,
      km_total,
      km_previous: prevMap.get(vid) || null,
      km_by_day,
      branch: byVid.get(vid)?.v.branch || 'Corrientes',
      imported_from: fileName,
    }));

    for (let i = 0; i < rows.length; i += 200) {
      const { error } = await sb().from('km_reports').insert(rows.slice(i, i + 200));
      if (error) throw error;
    }

    await reload('km_reports', 'vehicles');
    alert(`✅ ${rows.length} vehículos importados para ${year}-${String(month).padStart(2, '0')}.\n${outOfRange.length > 0 ? `(${outOfRange.length} filas omitidas por fecha)` : ''}`);
  }

  return { importTrips, importFuel, importKmReport };
}
