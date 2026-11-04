'use client';
import { useData } from './data';
import { sb } from './supabase';
import { recordKmChange } from './history';
import { checkReading, lastGpsDate, type TripLite } from './kmAudit';
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
const patOf = (s: unknown) => {
  const m = String(s ?? '').match(/\(([^)]+)\)/);
  return nrm(m ? m[1] : s);
};
const brandOf = (s: unknown) => {
  const t = String(s ?? '')
    .replace(/\(.*\)/, '')
    .trim()
    .toUpperCase()
    .replace(/\./g, '')
    .trim();
  if (!t) return '';
  return /^M BENZ/.test(t) ? 'Mercedes-Benz' : t.charAt(0) + t.slice(1).toLowerCase();
};

export function useImporters() {
  const { vehicles, trips, fuel_loads, reload } = useData();

  /** Devuelve patente→vehículo; ofrece crear los vehículos que no existan todavía. */
  async function ensureVehicles(found: Map<string, string>): Promise<Map<string, Vehicle>> {
    const byPlate = new Map(vehicles.map((v) => [nrm(v.plate), v]));
    const missing = [...found.keys()].filter((p) => !byPlate.has(p));
    if (
      missing.length &&
      confirm(
        `Estos ${missing.length} vehículos no están cargados en la app:\n${missing.join(', ')}\n\n¿Querés crearlos ahora? (Si cancelás, se omiten sus filas)`
      )
    ) {
      const { data, error } = await sb()
        .from('vehicles')
        .insert(missing.map((p) => ({ plate: p, brand: found.get(p) || null })))
        .select();
      if (error) throw error;
      const nv = (data ?? []) as Vehicle[];
      const d = await sb()
        .from('documents')
        .insert(nv.flatMap((v) => DOC_VEHICLE_DEFAULT.map((t) => ({ vehicle_id: v.id, doc_type: t }))));
      if (d.error) throw d.error;
      nv.forEach((v) => byPlate.set(nrm(v.plate), v));
    }
    return byPlate;
  }

  async function importTrips(data: unknown[][], m: Record<string, number>, quiet = false) {
    if (m.v < 0 || m.d < 0 || (m.c < 0 && m.r < 0)) {
      alert('Hacen falta vehículo, día y distancia.');
      return null;
    }
    const parsed = data
      .map((r) => ({
        pt: patOf(r[m.v]),
        brand: brandOf(r[m.v]),
        fecha: pDate(r[m.d]),
        c: m.c >= 0 ? pNum(r[m.c]) : NaN,
        r: m.r >= 0 ? pNum(r[m.r]) : NaN,
        x: m.x >= 0 ? pNum(r[m.x]) : NaN,
        mov: m.m >= 0 ? String(r[m.m] ?? '') : '',
      }))
      .filter((x) => x.pt && x.fecha && (!isNaN(x.c) || !isNaN(x.r)));
    if (!parsed.length) {
      alert('No encontré filas con datos válidos.');
      return null;
    }

    const byPlate = await ensureVehicles(new Map(parsed.map((x) => [x.pt, x.brand])));
    const existing = new Set(trips.map((t) => t.vehicle_id + '|' + t.date));
    const rows = new Map<
      string,
      {
        vehicle_id: string;
        date: string;
        km_calc: number;
        km_reported: number | null;
        max_speed: number | null;
        moving_time: string | null;
      }
    >();
    let skipped = 0;
    for (const x of parsed) {
      const v = byPlate.get(x.pt);
      if (!v) {
        skipped++;
        continue;
      }
      rows.set(v.id + '|' + x.fecha, {
        vehicle_id: v.id,
        date: x.fecha,
        // Se usa la distancia REPORTADA (la calculada de Gestya no es confiable); la calculada solo es respaldo.
        km_calc: r2(!isNaN(x.r) ? x.r : x.c),
        km_reported: isNaN(x.r) ? null : r2(x.r),
        max_speed: isNaN(x.x) ? null : Math.round(x.x),
        moving_time: x.mov || null,
      });
    }
    const list = [...rows.values()];
    for (let i = 0; i < list.length; i += 500) {
      const { error } = await sb()
        .from('trips')
        .upsert(list.slice(i, i + 500), { onConflict: 'vehicle_id,date' });
      if (error) throw error;
    }
    // km actual = última lectura de odómetro + km del GPS posteriores a esa lectura (solo días nuevos)
    const fresh = list.filter((t) => !existing.has(t.vehicle_id + '|' + t.date));
    const noBase: string[] = [];
    let updated = 0;
    // Se suman TODOS los días posteriores a la última lectura (no solo los nuevos): cada km se cuenta una sola vez
    // porque km_date marca hasta dónde ya está incluido en el km actual.
    const inList = new Set(list.map((t) => t.vehicle_id));
    const kds = [...byPlate.values()].filter((v) => inList.has(v.id) && v.km_date).map((v) => v.km_date!);
    const minKd = kds.length ? kds.reduce((a, b) => (a < b ? a : b)) : '2000-01-01';
    const dbT = await sb().from('trips').select('vehicle_id,date,km_calc').gt('date', minKd).limit(10000);
    if (dbT.error) throw dbT.error;
    const byVeh = new Map<string, { vehicle_id: string; date: string; km_calc: number }[]>();
    ((dbT.data ?? []) as { vehicle_id: string; date: string; km_calc: number }[]).forEach((t) => {
      if (inList.has(t.vehicle_id))
        byVeh.set(t.vehicle_id, [...(byVeh.get(t.vehicle_id) ?? []), { ...t, km_calc: Number(t.km_calc) || 0 }]);
    });
    for (const [vid, arr] of byVeh) {
      const v = [...byPlate.values()].find((x) => x.id === vid);
      if (!v) continue;
      if (v.km === null || !v.km_date) {
        if (arr.some((t) => t.km_calc > 0)) noBase.push(v.plate);
        continue;
      }
      const nd = arr.filter((t) => t.date > v.km_date!);
      if (!nd.length) continue;
      const newKm = Math.round(v.km + nd.reduce((s, t) => s + t.km_calc, 0));
      if (newKm === v.km) continue;
      const { error } = await sb()
        .from('vehicles')
        .update({
          km: newKm,
          km_date: nd.reduce((mx, t) => (t.date > mx ? t.date : mx), v.km_date),
        })
        .eq('id', vid);
      if (error) throw error;
      await recordKmChange(vid, newKm, v.km);
      updated++;
    }
    await reload('vehicles', 'documents', 'trips');
    const noBaseMsg = noBase.length
      ? `
⚠ Sin km inicial cargado (cargalo en Vehículos y volvé a importar): ${noBase.join(', ')}`
      : '';
    if (quiet) return { list, fresh: fresh.length, skipped, updated, noBaseMsg };
    alert(
      `${fresh.length} días nuevos, ${list.length - fresh.length} actualizados${skipped ? `, ${skipped} filas omitidas (vehículo no creado)` : ''}.\nEl km actual de cada vehículo se actualizó sumando la distancia posterior a su última lectura de odómetro (${updated} vehículos).${noBaseMsg}`
    );
    return { list, fresh: fresh.length, skipped, updated, noBaseMsg };
  }

  /**
   * Importación mensual de Gestya en un solo paso:
   *  1) guarda los días en `trips` y actualiza el km actual de cada vehículo (solo días posteriores a su última lectura),
   *  2) reconstruye `km_reports` de cada mes que aparezca en el archivo a partir de `trips`.
   * El mes sale de la columna Día, no hay que indicarlo. Los meses que no están en el archivo no se tocan.
   */
  async function importGestya(data: unknown[][], m: Record<string, number>) {
    const res = await importTrips(data, m, true);
    if (!res) return;
    const periods = new Map<string, { y: number; mo: number }>();
    res.list.forEach((t) => {
      const [y, mo] = t.date.split('-').map(Number);
      periods.set(`${y}-${mo}`, { y, mo });
    });
    const vehById = new Map(vehicles.map((v) => [v.id, v]));
    const summary: string[] = [];
    const allTrips: TripLite[] = [];
    let minD = '9999',
      maxD = '0000';
    for (const { y, mo } of [...periods.values()].sort((a, b) => a.y * 12 + a.mo - (b.y * 12 + b.mo))) {
      const pad = String(mo).padStart(2, '0');
      const from = `${y}-${pad}-01`;
      const to = `${mo === 12 ? y + 1 : y}-${String(mo === 12 ? 1 : mo + 1).padStart(2, '0')}-01`;
      const { data: tr, error } = await sb()
        .from('trips')
        .select('vehicle_id,date,km_calc')
        .gte('date', from)
        .lt('date', to)
        .limit(5000);
      if (error) throw error;
      allTrips.push(...((tr ?? []) as TripLite[]));
      if (from < minD) minD = from;
      if (to > maxD) maxD = to;
      const byV = new Map<string, { total: number; day: Record<string, number> }>();
      for (const t of (tr ?? []) as { vehicle_id: string; date: string; km_calc: number }[]) {
        if (!(t.km_calc > 0)) continue;
        const e = byV.get(t.vehicle_id) ?? { total: 0, day: {} };
        e.total += Number(t.km_calc);
        e.day[t.date] = Number(t.km_calc);
        byV.set(t.vehicle_id, e);
      }
      const py = mo === 1 ? y - 1 : y,
        pm = mo === 1 ? 12 : mo - 1;
      const prev = await sb().from('km_reports').select('vehicle_id,km_total').eq('year', py).eq('month', pm);
      const prevMap = new Map(
        ((prev.data ?? []) as { vehicle_id: string; km_total: number }[]).map((r) => [r.vehicle_id, r.km_total])
      );
      const rows = [...byV.entries()].map(([vid, e]) => ({
        vehicle_id: vid,
        month: mo,
        year: y,
        km_total: r2(e.total),
        km_previous: prevMap.get(vid) || null,
        km_by_day: e.day,
        branch: vehById.get(vid)?.branch || 'Corrientes',
        imported_from: 'Gestya ' + new Date().toISOString().slice(0, 10),
      }));
      const del = await sb().from('km_reports').delete().eq('year', y).eq('month', mo);
      if (del.error) throw del.error;
      for (let i = 0; i < rows.length; i += 200) {
        const { error: e2 } = await sb().from('km_reports').insert(rows.slice(i, i + 200));
        if (e2) throw e2;
      }
      summary.push(`${pad}/${y}: ${rows.length} vehículos`);
    }
    // Auditoría: lecturas de odómetro declaradas en estaciones vs. km del GPS en cada tramo
    const flags: string[] = [];
    const fl = await sb()
      .from('fuel_loads')
      .select('vehicle_id,date,km_raw')
      .not('km_raw', 'is', null)
      .gte('date', minD)
      .lt('date', maxD)
      .order('date')
      .limit(5000);
    if (!fl.error) {
      const byVeh = new Map<string, { date: string; km: number }[]>();
      (fl.data as { vehicle_id: string; date: string; km_raw: number }[]).forEach((r) =>
        byVeh.set(r.vehicle_id, [...(byVeh.get(r.vehicle_id) ?? []), { date: r.date, km: r.km_raw }])
      );
      for (const [vid, arr] of byVeh) {
        let a = arr[0];
        for (const cur of arr.slice(1)) {
          if (cur.date === a.date) continue;
          const c = checkReading(allTrips, vid, a, cur);
          if (c.ok) a = cur;
          else if (flags.length < 15)
            flags.push(
              `${vehById.get(vid)?.plate ?? vid} ${cur.date}: declaró ${cur.km.toLocaleString('es-AR')}, GPS indica ~${c.expected.toLocaleString('es-AR')} (dif ${c.diff > 0 ? '+' : ''}${c.diff} km)`
            );
        }
      }
    }
    await reload('km_reports', 'vehicles', 'trips');
    alert(
      `✅ Gestya importado.\nReportes: ${summary.join(' · ')}\n${res.fresh} días nuevos en recorridos; km actualizado en ${res.updated} vehículos.${res.noBaseMsg}${res.skipped ? `\n${res.skipped} filas omitidas (vehículo no creado).` : ''}${flags.length ? `\n\n⚠ Odómetros que no coinciden con el GPS:\n${flags.join('\n')}` : '\n✔ Odómetros de estaciones coherentes con el GPS.'}`
    );
  }

  async function importFuel(data: unknown[][], m: Record<string, number>) {
    if (m.f < 0 || m.l < 0 || (m.p < 0 && m.t < 0)) return alert('Hace falta fecha, litros y patente o tarjeta.');
    const g = (r: unknown[], k: string) => (m[k] >= 0 ? String(r[m[k]] ?? '').trim() : '');
    const byCard = (t: string) => vehicles.find((x) => nrm(x.fuel_card) && nrm(x.fuel_card) === nrm(t).slice(-6));
    const L = data
      .map((r) => {
        const t = nrm(g(r, 't'));
        let pt = nrm(g(r, 'p'));
        if (!pt && t) {
          const v = byCard(t);
          if (v) pt = nrm(v.plate);
        }
        const loc = g(r, 'loc');
        return {
          pt,
          tarj: t,
          fecha: pDate(r[m.f]),
          lit: pNum(r[m.l]),
          im: m.i >= 0 ? pNum(r[m.i]) : NaN,
          odo: m.k >= 0 ? pNum(r[m.k]) : NaN,
          est: [g(r, 'e').replace(/^\d+\s*-\s*/, ''), loc ? `(${title(loc)})` : ''].filter(Boolean).join(' '),
          prod: title(g(r, 'pr')),
          cond: g(r, 'c'),
          rem: g(r, 'r'),
        };
      })
      .filter((x) => x.fecha && !isNaN(x.lit) && x.pt);
    if (!L.length) return alert('No encontré filas con datos válidos (fecha, litros y patente).');

    const byPlate = await ensureVehicles(new Map(L.map((x) => [x.pt, ''])));
    L.sort((a, b) => a.fecha.localeCompare(b.fecha));
    const haveReceipt = new Set(fuel_loads.map((f) => f.receipt).filter(Boolean));
    const haveKey = new Set(fuel_loads.map((f) => [f.vehicle_id, f.date, f.liters, f.amount].join('|')));
    // Fuente de verdad del km = odómetro del tablero leído en la estación. El GPS (Gestya) solo rellena entre lecturas.
    type St = {
      km: number | null;
      date: string | null;
      card: string | null;
      changed: boolean;
      prevKm: number | null;
      odoDate: string | null;
      odo: number | null;
    };
    // Ancla = última lectura de tablero aceptada (o, si no hay, el km actual del vehículo con su fecha).
    const anchor = new Map<string, { date: string; km: number }>();
    fuel_loads.forEach((f) => {
      if (f.km === null || f.km === undefined) return;
      const a = anchor.get(f.vehicle_id);
      if (!a || f.date > a.date) anchor.set(f.vehicle_id, { date: f.date, km: f.km });
    });
    const state = new Map<string, St>();
    byPlate.forEach((v) => {
      if (!anchor.has(v.id) && v.km !== null && v.km_date) anchor.set(v.id, { date: v.km_date, km: v.km });
      const a = anchor.get(v.id);
      state.set(v.id, {
        km: v.km,
        date: v.km_date,
        card: v.fuel_card,
        changed: false,
        prevKm: v.km,
        odoDate: a?.date ?? null,
        odo: null,
      });
    });
    const alerts: string[] = [];
    /** Valida una lectura nueva: contra el GPS si hay datos hasta esa fecha; si no, con el tope de plausibilidad. */
    const validate = (vid: string, plate: string, st: St, fecha: string, odo: number) => {
      const a = anchor.get(vid);
      if (!a) return true; // primera lectura del vehículo: se acepta y queda como ancla
      if (fecha <= a.date) return okOdo(st.km, st.date, fecha, odo) || st.km === null;
      const lg = lastGpsDate(trips, vid);
      if (!lg || lg < fecha) return okOdo(st.km, st.date, fecha, odo); // GPS aún sin cargar: se audita al subir Gestya
      const c = checkReading(trips, vid, a, { date: fecha, km: odo });
      if (!c.ok && alerts.length < 12)
        alerts.push(`${plate} ${fecha}: declaró ${odo.toLocaleString('es-AR')}, GPS indica ~${c.expected.toLocaleString('es-AR')} (dif ${c.diff > 0 ? '+' : ''}${c.diff} km)`);
      return c.ok;
    };
    const rows: object[] = [];
    let dup = 0,
      bad = 0,
      skipped = 0;
    for (const x of L) {
      const v = byPlate.get(x.pt);
      if (!v) {
        skipped++;
        continue;
      }
      const liters = r2(x.lit),
        amount = isNaN(x.im) ? null : r2(x.im);
      if (x.rem ? haveReceipt.has(x.rem) : haveKey.has([v.id, x.fecha, liters, amount].join('|'))) {
        dup++;
        continue;
      }
      if (x.rem) haveReceipt.add(x.rem);
      else haveKey.add([v.id, x.fecha, liters, amount].join('|'));
      const st = state.get(v.id)!;
      const odo = isNaN(x.odo) ? null : Math.round(x.odo);
      const good = odo !== null && isFuel(x.prod) && validate(v.id, x.pt, st, x.fecha, odo);
      if (odo !== null && !good && isFuel(x.prod)) bad++;
      if (good && (!st.odoDate || x.fecha >= st.odoDate)) {
        st.odo = odo;
        st.odoDate = x.fecha;
        st.changed = true;
        anchor.set(v.id, { date: x.fecha, km: odo! });
      }
      if (!st.card && x.tarj) {
        st.card = x.tarj.slice(-6);
        st.changed = true;
      }
      rows.push({
        vehicle_id: v.id,
        date: x.fecha,
        liters,
        amount,
        km: good ? odo : null,
        km_raw: odo,
        station: x.est || null,
        product: x.prod || null,
        driver_name: x.cond || null,
        receipt: x.rem || null,
      });
    }
    for (let i = 0; i < rows.length; i += 200) {
      const { error } = await sb()
        .from('fuel_loads')
        .insert(rows.slice(i, i + 200));
      if (error) throw error;
    }
    for (const [vid, st] of state) {
      if (!st.changed) continue;
      // km = último odómetro leído + km reportados por GPS posteriores a esa lectura
      let km = st.km,
        kmDate = st.date;
      if (st.odo !== null && st.odoDate) {
        const after = trips.filter((t) => t.vehicle_id === vid && t.date > st.odoDate!);
        km = Math.round(st.odo + after.reduce((a, t) => a + Number(t.km_calc || 0), 0));
        kmDate = after.reduce((mx, t) => (t.date > mx ? t.date : mx), st.odoDate);
      }
      const { error } = await sb().from('vehicles').update({ km, km_date: kmDate, fuel_card: st.card }).eq('id', vid);
      if (error) throw error;
      if (km !== null && km !== st.prevKm) await recordKmChange(vid, km, st.prevKm);
    }
    await reload('vehicles', 'documents', 'fuel_loads');
    alert(
      `${rows.length} cargas importadas.${dup ? `\n${dup} ya estaban (omitidas).` : ''}${bad ? `\n${bad} odómetros descartados por no coincidir con el GPS:\n${alerts.join('\n')}` : ''}${skipped ? `\n${skipped} filas omitidas (vehículo no creado).` : ''}`
    );
  }

  async function importKmReport(
    data: unknown[][],
    m: Record<string, number>,
    month: number,
    year: number,
    fileName: string
  ) {
    // Detectar si es formato Gestya (patente en paréntesis) o simple
    const isGestya = data.some((r) => String(r[m.v] ?? '').includes('('));

    const parsed = data
      .map((r) => {
        const vehicleStr = String(r[m.v] ?? '').trim();
        const pt = isGestya ? patOf(vehicleStr) : nrm(vehicleStr);
        const brand = isGestya ? brandOf(vehicleStr) : '';
        const fecha = pDate(r[m.d]);
        const km = pNum(r[m.c]);
        return { pt, brand, fecha, km: isNaN(km) ? 0 : Math.round(km * 100) / 100 };
      })
      .filter((x) => x.pt && x.km > 0);

    if (!parsed.length) return alert('No encontré filas con datos válidos (patente y km > 0).');

    // Validar que todas las fechas sean del mes elegido
    const outOfRange = parsed.filter((x) => {
      const [y, m] = x.fecha.split('-').map(Number);
      return y !== year || m !== month;
    });
    if (outOfRange.length) {
      const oos = outOfRange.map((x) => `${x.pt}: ${x.fecha}`).slice(0, 5);
      if (
        !confirm(
          `${outOfRange.length} filas están fuera del período ${year}-${String(month).padStart(2, '0')}:\n${oos.join('\n')}\n\n¿Continuar omitiendo estas filas?`
        )
      )
        return;
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

    const prevMap = new Map((kmPrevMonth.data ?? []).map((r: any) => [r.vehicle_id, r.km_total]));

    // Verificar si el mes ya existe
    const existing = await sb().from('km_reports').select('vehicle_id').eq('year', year).eq('month', month);

    if ((existing.data ?? []).length > 0) {
      const replace = confirm(
        `Ya existe reporte para ${year}-${String(month).padStart(2, '0')}.\n\n¿Reemplazar datos?`
      );
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
      const { error } = await sb()
        .from('km_reports')
        .insert(rows.slice(i, i + 200));
      if (error) throw error;
    }

    await reload('km_reports', 'vehicles');
    alert(
      `✅ ${rows.length} vehículos importados para ${year}-${String(month).padStart(2, '0')}.\n${outOfRange.length > 0 ? `(${outOfRange.length} filas omitidas por fecha)` : ''}`
    );
  }

  return { importTrips, importFuel, importKmReport, importGestya };
}
