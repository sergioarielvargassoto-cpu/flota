'use client';
import { useData } from './data';
import { sb } from './supabase';
import { recordKmChange } from './history';
import { gpsRange, gpsReliability, lastGpsDate, outsideRange, type TripLite } from './kmAudit';
import { gpsCoversFrom, lastReading, readingDateOf } from './kmAnchor';
import { validateReading, type Anchor } from './kmValidate';
import { DEFAULT_TANK_L, OKODO_BACK_KM, OKODO_BASE_KM, OKODO_KM_PER_DAY, PHYSICAL_MIN_L_PER_100 } from './params';
import type { ColSpec } from './excel';
import type { Vehicle } from './types';
import { DOC_VEHICLE_DEFAULT, isFuel, nrm, okOdo, pDate, pNum, todayStr } from './util';

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
const daysBetween = (a: string, b: string) => Math.round((+new Date(b + 'T00:00:00') - +new Date(a + 'T00:00:00')) / 864e5);
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

/** Supabase devuelve como máximo 1000 filas por consulta (aunque se pida más con limit): se pagina para no truncar en silencio. */
async function selectAll<T>(
  make: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await make(from, from + 999);
    if (error) throw error;
    out.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return out;
}

export function useImporters() {
  const { vehicles, trips, fuel_loads, km_history, maintenance, repairs, reload } = useData();
  const ref = { fuel_loads, km_history, maintenance, repairs };

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
    const anchorBy = new Map(
      [...byPlate.values()].filter((v) => inList.has(v.id)).map((v) => [v.id, lastReading(v.id, ref)] as const)
    );
    const kds = [...byPlate.values()]
      .filter((v) => inList.has(v.id))
      .flatMap((v) => [v.km_date, anchorBy.get(v.id)?.date ?? null])
      .filter((x): x is string => !!x);
    const minKd = kds.length ? kds.reduce((a, b) => (a < b ? a : b)) : '2000-01-01';
    const dbT = await selectAll<{ vehicle_id: string; date: string; km_calc: number }>((a, b) =>
      sb().from('trips').select('vehicle_id,date,km_calc').gt('date', minKd).order('id').range(a, b)
    );
    const byVeh = new Map<string, { vehicle_id: string; date: string; km_calc: number }[]>();
    dbT.forEach((t) => {
      if (inList.has(t.vehicle_id))
        byVeh.set(t.vehicle_id, [...(byVeh.get(t.vehicle_id) ?? []), { ...t, km_calc: Number(t.km_calc) || 0 }]);
    });
    for (const [vid, arr] of byVeh) {
      const v = [...byPlate.values()].find((x) => x.id === vid);
      if (!v) continue;
      // Preferido: última lectura REAL (estación, km a mano, mantenimiento/reparación) + todo el GPS posterior.
      // Se recalcula siempre desde ahí, así un km guardado de origen dudoso no se arrastra. Requiere que el GPS cubra desde la lectura.
      const anchor = anchorBy.get(vid) ?? null;
      const firstGps = [...trips.filter((t) => t.vehicle_id === vid).map((t) => t.date), ...arr.map((t) => t.date)].reduce<string | null>(
        (m, d) => (!m || d < m ? d : m),
        null
      );
      if (anchor && gpsCoversFrom(firstGps, anchor.date)) {
        const after = arr.filter((t) => t.date > anchor.date);
        const km2 = Math.round(anchor.km + after.reduce((s, t) => s + t.km_calc, 0));
        const kd2 = after.reduce((mx, t) => (t.date > mx ? t.date : mx), anchor.date);
        if (km2 !== v.km || kd2 !== v.km_date) {
          const { error } = await sb().from('vehicles').update({ km: km2, km_date: kd2 }).eq('id', vid);
          if (error) throw error;
          if (km2 !== v.km) {
            await recordKmChange(vid, km2, v.km, 'gps');
            updated++;
          }
        }
        continue;
      }
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
      await recordKmChange(vid, newKm, v.km, 'gps');
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
      const tr = await selectAll<TripLite>((a, b) =>
        sb().from('trips').select('vehicle_id,date,km_calc').gte('date', from).lt('date', to).order('id').range(a, b)
      );
      allTrips.push(...tr);
      if (from < minD) minD = from;
      if (to > maxD) maxD = to;
      const byV = new Map<string, { total: number; day: Record<string, number> }>();
      for (const t of tr as { vehicle_id: string; date: string; km_calc: number }[]) {
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
        imported_from: 'Gestya ' + todayStr(),
      }));
      // Reemplazo con red de seguridad: la tabla tiene UNIQUE(vehicle_id, month, year), así que se borra el mes y se
      // inserta el nuevo; si el insert falla, se restauran las filas anteriores para no perder el reporte.
      const oldRows = await selectAll<Record<string, unknown>>((a, b) =>
        sb().from('km_reports').select('*').eq('year', y).eq('month', mo).order('id').range(a, b)
      );
      const del = await sb().from('km_reports').delete().eq('year', y).eq('month', mo);
      if (del.error) throw del.error;
      try {
        for (let i = 0; i < rows.length; i += 200) {
          const { error: e2 } = await sb().from('km_reports').insert(rows.slice(i, i + 200));
          if (e2) throw e2;
        }
      } catch (ex) {
        await sb().from('km_reports').delete().eq('year', y).eq('month', mo);
        for (let i = 0; i < oldRows.length; i += 200) await sb().from('km_reports').insert(oldRows.slice(i, i + 200));
        throw ex;
      }
      summary.push(`${pad}/${y}: ${rows.length} vehículos`);
    }
    // Auditoría: lecturas de odómetro declaradas en estaciones vs. km del GPS en cada tramo
    const flags: string[] = [];
    const fl = await selectAll<{ vehicle_id: string; date: string; km: number }>((a, b) =>
      sb().from('fuel_loads').select('vehicle_id,date,km').not('km', 'is', null).gte('date', minD).lt('date', maxD).order('id').range(a, b)
    ).then(
      (data) => ({ data, error: null }),
      () => ({ data: [] as { vehicle_id: string; date: string; km: number }[], error: true })
    );
    if (!fl.error) {
      const byVeh = new Map<string, { date: string; km: number }[]>();
      fl.data.sort((x, y) => x.date.localeCompare(y.date));
      fl.data.forEach((r) =>
        byVeh.set(r.vehicle_id, [...(byVeh.get(r.vehicle_id) ?? []), { date: r.date, km: r.km }])
      );
      for (const [vid, arr] of byVeh) {
        // Solo se audita contra GPS donde hay GPS: el vehículo debe tener recorridos cubriendo el tramo
        const vt = allTrips.filter((t) => t.vehicle_id === vid);
        if (!vt.length) continue;
        const first = vt.reduce((m, t) => (t.date < m ? t.date : m), vt[0].date);
        const last = vt.reduce((m, t) => (t.date > m ? t.date : m), vt[0].date);
        let a = arr[0];
        for (const cur of arr.slice(1)) {
          if (cur.date === a.date) continue;
          if (a.date < first || cur.date > last) {
            a = cur;
            continue;
          }
          // El GPS suma días completos y la carga no tiene hora: se compara contra el RANGO posible, no contra un solo número
          const rg = gpsRange(allTrips, vid, a.date, cur.date);
          const out = outsideRange(cur.km - a.km, rg);
          if (out === 0) a = cur;
          else if (flags.length < 15)
            flags.push(
              `${vehById.get(vid)?.plate ?? vid} ${cur.date}: odómetro avanzó ${(cur.km - a.km).toLocaleString('es-AR')} km desde el ${a.date}; el GPS permite entre ${Math.round(rg.min).toLocaleString('es-AR')} y ${Math.round(rg.max).toLocaleString('es-AR')} km`
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
    // Ancla = última lectura REAL de tablero (carga de estación válida, km a mano, mantenimiento o reparación).
    // El km "calculado con GPS" no es una lectura: nunca se usa como ancla si hay una lectura real.
    const anchor = new Map<string, Anchor>();
    byPlate.forEach((v) => {
      const r = lastReading(v.id, ref);
      if (r) anchor.set(v.id, { date: r.date, km: r.km, src: r.src });
    });
    // Vehículos con el km "pendiente de verificar" (último km cargado a mano = 0): el combustible NO pisa su km hasta que el responsable lo cargue
    const pendingKm = new Set<string>();
    byPlate.forEach((v) => {
      const manual = km_history
        .filter((h) => h.vehicle_id === v.id && !/^(gps|combustible|registro):/.test(h.changed_by))
        .sort((a, b) => a.recorded_at.localeCompare(b.recorded_at));
      if (manual.length && manual[manual.length - 1].km === 0) pendingKm.add(v.id);
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
    // Capacidad estimada del tanque = mayor carga vista del vehículo (mínimo 40 L)
    const capCache = new Map<string, number>();
    const capOf = (vid: string) => {
      let c = capCache.get(vid);
      if (c === undefined) {
        c = Math.max(
          DEFAULT_TANK_L,
          ...fuel_loads.filter((f) => f.vehicle_id === vid && isFuel(f.product)).map((f) => Number(f.liters) || 0),
          ...L.filter((x) => byPlate.get(x.pt)?.id === vid && isFuel(x.prod)).map((x) => x.lit || 0)
        );
        capCache.set(vid, c);
      }
      return c;
    };
    // Confiabilidad del GPS de cada vehículo (con sus propias lecturas buenas): un GPS intermitente no debe descartar lecturas buenas
    const gpsOkCache = new Map<string, boolean>();
    const gpsOkOf = (vid: string) => {
      let g = gpsOkCache.get(vid);
      if (g === undefined) {
        g = gpsReliability(vid, fuel_loads, trips).reliable;
        gpsOkCache.set(vid, g);
      }
      return g;
    };
    /** Valida una lectura contra la referencia y el GPS (ver kmValidate.ts); registra el motivo si se descarta. */
    const validate = (vid: string, plate: string, fecha: string, odo: number, litros: number) => {
      const a = anchor.get(vid) ?? null;
      const v = validateReading({ anchor: a, trips, vehicleId: vid, fecha, odo, litros, tankL: capOf(vid), gpsOk: gpsOkOf(vid) });
      if (!v.ok && alerts.length < 12)
        alerts.push(
          `${plate} ${fecha}: declaró ${odo.toLocaleString('es-AR')} (referencia ${a?.km.toLocaleString('es-AR')} del ${a?.date}). ${v.reason}${v.rangeMax !== undefined ? ` (GPS del tramo: entre ${Math.round(v.rangeMin ?? 0).toLocaleString('es-AR')} y ${Math.round(v.rangeMax).toLocaleString('es-AR')} km)` : ''}`
        );
      return v.ok;
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
      const good = odo !== null && isFuel(x.prod) && validate(v.id, x.pt, x.fecha, odo, liters);
      if (odo !== null && !good && isFuel(x.prod)) bad++;
      if (good && (!st.odoDate || x.fecha >= st.odoDate)) {
        st.odo = odo;
        st.odoDate = x.fecha;
        st.changed = true;
        anchor.set(v.id, { date: x.fecha, km: odo!, src: 'estación' });
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
      if (st.odo !== null && st.odoDate && !pendingKm.has(vid)) {
        const after = trips.filter((t) => t.vehicle_id === vid && t.date > st.odoDate!);
        km = Math.round(st.odo + after.reduce((a, t) => a + Number(t.km_calc || 0), 0));
        kmDate = after.reduce((mx, t) => (t.date > mx ? t.date : mx), st.odoDate);
      }
      const { error } = await sb().from('vehicles').update({ km, km_date: kmDate, fuel_card: st.card }).eq('id', vid);
      if (error) throw error;
      if (km !== null && km !== st.prevKm) await recordKmChange(vid, km, st.prevKm, 'combustible');
    }
    await reload('vehicles', 'documents', 'fuel_loads');
    alert(
      `${rows.length} cargas importadas.${dup ? `\n${dup} ya estaban (omitidas).` : ''}${bad ? `\n${bad} odómetros descartados por no coincidir con el GPS:\n${alerts.join('\n')}` : ''}${skipped ? `\n${skipped} filas omitidas (vehículo no creado).` : ''}`
    );
  }

  return { importTrips, importFuel, importGestya };
}
