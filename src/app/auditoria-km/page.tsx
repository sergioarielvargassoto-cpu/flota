'use client';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useData } from '@/lib/data';
import { fd, isFuel, num } from '@/lib/util';
import { Badge } from '@/components/Badge';
import { gpsRange, outsideRange } from '@/lib/kmAudit';
import { readingDateOf, readingsOf } from '@/lib/kmAnchor';
import { trajectoryOutliers } from '@/lib/kmTrajectory';
import { gpsReliability } from '@/lib/kmAudit';
import { explainCase, type Explanation } from '@/lib/kmExplain';
import { explainConsumption, explainGps, explainInvalidReading, explainPair } from '@/lib/kmExplainCases';
import { caseNoteFor } from '@/lib/kmCases';
import { confusablePairs, crossFits } from '@/lib/confusable';
import { PARAM_DOCS, STALE_READING_DAYS, UNCOVERED_GPS_KM_PER_DAY } from '@/lib/params';
import { fuelPairs, invalidReadings, monthLabel, monthRange, vehicleMonth, availableMonths, type Data } from '@/lib/fleetStats';

type Reading = { date: string; km: number; src: string; who: string; rejected?: boolean };
const SRC_LABEL: Record<string, string> = {
  manual: '✍ A mano',
  registro: '🧾 Registro',
  estacion: '⛽ Estación',
  taller: '🔧 Taller (mantenimiento/reparación)',
};
const localDate = (iso: string) => new Date(iso).toLocaleDateString('en-CA');
const daysBetween = (a: string, b: string) =>
  Math.round((+new Date(b + 'T00:00:00') - +new Date(a + 'T00:00:00')) / 864e5);

/** Muestra una explicación automática (qué vio el sistema / qué pudo pasar / qué hacer / efecto). */
function ExplainView({ e }: { e: Explanation }) {
  const block = (title: string, items: string[]) => (
    <div>
      <b>{title}</b>
      <ul style={{ margin: '4px 0 0 18px' }}>
        {items.map((t, k) => (
          <li key={k}>{t}</li>
        ))}
      </ul>
    </div>
  );
  return (
    <div style={{ display: 'grid', gap: 8, fontSize: 13, marginTop: 8 }}>
      {block('Qué vio el sistema', e.seen)}
      {block('Qué pudo haber pasado (hipótesis)', e.causes)}
      {block('Qué conviene hacer', e.todo)}
      {block('Qué efecto tiene', e.impact)}
    </div>
  );
}

export default function AuditoriaKm() {
  const { vehicles, trips, fuel_loads, km_history, settings, drivers, repairs, maintenance, infractions } = useData();
  const [selM, setSelM] = useState('');
  const [onlyFlags, setOnlyFlags] = useState(true);
  const fleet: Data = useMemo(
    () => ({ vehicles, drivers, fuel_loads, trips, repairs, maintenance, infractions }),
    [vehicles, drivers, fuel_loads, trips, repairs, maintenance, infractions]
  );
  // Confiabilidad del GPS de cada vehículo, calculada UNA vez (antes se repetía por cada fila)
  const gpsRel = useMemo(() => new Map(vehicles.map((v) => [v.id, gpsReliability(v.id, fuel_loads, trips).reliable])), [vehicles, fuel_loads, trips]);
  // Lecturas de cualquier fuente que no encajan con las vecinas (todo el historial): errores de tipeo en estaciones, talleres o cargas a mano
  const offTrack = useMemo(() => {
    const out: { plate: string; vehicleId: string; date: string; km: number; src: string; label?: string; level: string; agree: number; of: number; lo?: number; hi?: number; reason: string; explain: Explanation; note: ReturnType<typeof caseNoteFor> }[] = [];
    for (const v of vehicles) {
      if (v.status === 'Baja') continue;
      const rd = readingsOf(v.id, { fuel_loads, km_history, maintenance, repairs });
      const found = trajectoryOutliers(
        rd.map((r) => ({ key: `${r.date}|${r.km}|${r.src}`, date: r.date, km: r.km, src: r.src })),
        trips,
        v.id,
        gpsRel.get(v.id) ?? true
      );
      const vTrips = trips.filter((t) => t.vehicle_id === v.id);
      for (const f of found) {
        const [date, km, src] = f.key.split('|');
        const kmN = Number(km);
        const rec = src === 'mantenimiento' ? maintenance.find((m) => m.vehicle_id === v.id && m.date === date && m.km === kmN) : src === 'reparación' ? repairs.find((r) => r.vehicle_id === v.id && r.date === date && r.km === kmN) : undefined;
        const label = rec ? ('type' in rec ? (rec as { type: string }).type : (rec as { description: string }).description) : undefined;
        const others = rd.filter((r) => !(r.date === date && r.km === kmN && r.src === src)).map((r) => ({ date: r.date, km: r.km, src: r.src }));
        const explain = explainCase({
          plate: v.plate,
          date,
          km: kmN,
          src: src as 'estación' | 'manual' | 'mantenimiento' | 'reparación',
          label,
          level: f.level,
          agree: f.agree,
          of: f.of,
          neighbors: others,
          expectedLo: f.expectedLo,
          expectedHi: f.expectedHi,
          trips: vTrips,
          vehicleId: v.id,
          gpsReliable: gpsRel.get(v.id) ?? true,
          serviceKm: settings.service_km,
          lastServiceKm: v.last_service_km,
          currentKm: v.km,
          isService: src === 'mantenimiento' && /service/i.test(label ?? ''),
        });
        out.push({ plate: v.plate, vehicleId: v.id, date, km: kmN, src, label, level: f.level, agree: f.agree, of: f.of, lo: f.expectedLo, hi: f.expectedHi, reason: f.reason, explain, note: caseNoteFor(v.plate, date, kmN) });
      }
    }
    return out.sort((a, b) => b.date.localeCompare(a.date));
  }, [vehicles, trips, fuel_loads, km_history, maintenance, repairs, settings, gpsRel]);
  // Pares de vehículos que se pueden confundir y datos de uno que también encajan con el otro
  const twins = useMemo(() => {
    const pairs = confusablePairs(vehicles);
    const d = { vehicles, fuel_loads, km_history, maintenance, repairs, trips };
    return pairs.map((p) => {
      const A = vehicles.find((v) => v.plate === p.a);
      const B = vehicles.find((v) => v.plate === p.b);
      return {
        p,
        A,
        B,
        aInB: A && B ? crossFits(A, B, d) : [],
        bInA: A && B ? crossFits(B, A, d) : [],
      };
    });
  }, [vehicles, fuel_loads, km_history, maintenance, repairs, trips]);
  const fuelMonths = useMemo(
    () => [...new Set(fuel_loads.map((f) => f.date.slice(0, 7)))].sort().reverse(),
    [fuel_loads]
  );
  const mKey = fuelMonths.includes(selM) ? selM : (fuelMonths[0] ?? availableMonths(fleet)[0] ?? '');
  const between = useMemo(() => {
    if (!mKey) return { pairs: [], wins: [] };
    const { from, to } = monthRange(mKey);
    return { pairs: fuelPairs(fleet, from, to), wins: vehicleMonth(fleet, mKey) };
  }, [fleet, mKey]);
  // Casos del mes elegido, cada uno con su explicación automática (lecturas inválidas, tramos que no cierran, consumo, GPS)
  const monthCases = useMemo(() => {
    if (!mKey) return { invalid: [], pairs: [], cons: [], gps: [] };
    const { from, to } = monthRange(mKey);
    const ref = { fuel_loads, km_history, maintenance, repairs };
    const validByVeh = new Map(vehicles.map((v) => [v.id, readingsOf(v.id, ref).map((r) => ({ date: r.date, km: r.km, src: r.src as string }))]));
    const fleet = vehicles.flatMap((v) => (validByVeh.get(v.id) ?? []).filter((r) => r.src === 'estación').map((r) => ({ plate: v.plate, date: r.date, km: r.km })));
    const invalid = invalidReadings(fleet0(), from, to).map((r) => ({
      r,
      e: explainInvalidReading({
        plate: r.plate,
        date: r.load.date,
        declared: r.declared,
        expected: r.expected,
        station: r.station,
        driver: r.driver,
        liters: Number(r.load.liters),
        neighbors: validByVeh.get(r.load.vehicle_id) ?? [],
        fleet: fleet.filter((x) => x.plate !== r.plate),
      }),
    }));
    function fleet0(): Data {
      return { vehicles, drivers, fuel_loads, trips, repairs, maintenance, infractions };
    }
    const pairs = between.pairs
      .filter((p) => p.sameDay || (p.gpsDiff !== null && p.gpsDiff !== 0))
      .map((p) => ({
        p,
        e: explainPair({
          plate: p.vehicle.plate,
          prev: { date: p.prev.date, km: p.prevKm },
          cur: { date: p.cur.date, km: p.curKm },
          dKm: p.dKm,
          gpsMin: p.gpsMin,
          gpsMax: p.gpsMax,
          gpsDiff: p.gpsDiff,
          sameDay: p.sameDay,
          others: (validByVeh.get(p.vehicle.id) ?? []).filter((x) => !(x.date === p.prev.date && x.km === p.prevKm) && !(x.date === p.cur.date && x.km === p.curKm)),
          trips: trips.filter((t) => t.vehicle_id === p.vehicle.id),
          vehicleId: p.vehicle.id,
          gpsReliable: gpsRel.get(p.vehicle.id) ?? true,
        }),
      }));
    const cons = between.wins
      .filter((w) => w.l100Signif && w.l100 !== null && w.l100Ref !== null && w.l100Dev !== null)
      .map((w) => ({
        w,
        e: explainConsumption({
          plate: w.v.plate,
          l100: w.l100 as number,
          ref: w.l100Ref as number,
          devPct: w.l100Dev as number,
          band: w.l100Band,
          odoKm: w.odoKm,
          gpsMin: w.gpsWinMin,
          gpsMax: w.gpsWinMax,
          winLiters: w.winLiters,
          rejected: w.rejected,
          fills: w.fills,
          tankCap: w.tankCap,
          drivers: [...new Set(fuel_loads.filter((f) => f.vehicle_id === w.v.id && f.date >= from && f.date < to).map((f) => f.driver_name ?? '').filter(Boolean))],
        }),
      }));
    const gps = vehicles
      .filter((v) => v.status !== 'Baja')
      .map((v) => ({ v, g: gpsReliability(v.id, fuel_loads, trips) }))
      .filter((x) => !x.g.reliable)
      .map(({ v, g }) => {
        const vt = trips.filter((t) => t.vehicle_id === v.id);
        return { v, e: explainGps({ plate: v.plate, ratio: g.ratio, n: g.n, zeroDays: vt.filter((t) => Number(t.km_calc) < 5).length, totalDays: vt.length }) };
      });
    return { invalid, pairs, cons, gps };
  }, [mKey, vehicles, drivers, fuel_loads, km_history, maintenance, repairs, trips, infractions, between, gpsRel]);

  const { flags, stale, services, discarded } = useMemo(() => {
    const today = new Date().toLocaleDateString('en-CA');
    const flags: { plate: string; from: Reading; to: Reading; gps: number; gpsMin: number; expected: number; diff: number }[] = [];
    const stale: { plate: string; last: Reading | null; days: number | null }[] = [];
    let discarded = 0;

    for (const v of vehicles) {
      if (v.status === 'Baja') continue;
      // Lecturas de TABLERO: estaciones de servicio + cargas manuales / registros (el GPS no cuenta como lectura)
      const rs: Reading[] = [];
      // Las lecturas manuales/de taller que no cuentan (marcador 0 "pendiente" y todo lo anterior a él) se excluyen igual que en el resto del sistema
      const okRd = new Set(readingsOf(v.id, { fuel_loads, km_history, maintenance, repairs }).map((r) => `${r.date}|${r.km}|${r.src}`));
      fuel_loads.forEach((f) => {
        if (f.vehicle_id === v.id && f.km_raw !== null && f.km_raw !== undefined && isFuel(f.product))
          rs.push({ date: f.date, km: f.km_raw, src: 'estacion', who: f.station ?? '', rejected: f.km === null || f.km === undefined });
      });
      km_history.forEach((h) => {
        if (h.vehicle_id !== v.id) return;
        const i = h.changed_by.indexOf(':');
        const src = i > 0 ? h.changed_by.slice(0, i) : 'manual';
        if (src === 'gps' || src === 'combustible' || src === 'registro') return; // combustible ya está en fuel_loads; registro = mantenimiento/reparación con su fecha real
        if (!okRd.has(`${readingDateOf(h)}|${h.km}|manual`)) return;
        rs.push({ date: readingDateOf(h), km: h.km, src, who: (i > 0 ? h.changed_by.slice(i + 1) : h.changed_by).replace(/\s*\[lectura:\d{4}-\d{2}-\d{2}\]/, '') });
      });
      // Mantenimientos y reparaciones: el km se anota en el taller leyendo el tablero (puede venir redondeado)
      maintenance.forEach((m) => {
        if (m.vehicle_id === v.id && m.km !== null && okRd.has(`${m.date}|${m.km}|mantenimiento`)) rs.push({ date: m.date, km: m.km, src: 'taller', who: m.type });
      });
      repairs.forEach((r) => {
        if (r.vehicle_id === v.id && r.km !== null && okRd.has(`${r.date}|${r.km}|reparación`)) rs.push({ date: r.date, km: r.km, src: 'taller', who: r.description });
      });
      rs.sort((a, b) => a.date.localeCompare(b.date) || a.km - b.km);

      // GPS del vehículo
      const vt = trips.filter((t) => t.vehicle_id === v.id);
      const first = vt.reduce<string | null>((m, t) => (!m || t.date < m ? t.date : m), null);
      const last = vt.reduce<string | null>((m, t) => (!m || t.date > m ? t.date : m), null);

      // Referencia = última lectura confiable (aceptada al importar, o cargada por el responsable).
      // Las lecturas descartadas al importar (tipeos) se comparan contra esa referencia, pero nunca la reemplazan.
      let anchor: Reading | null = null;
      for (const r of rs) {
        // Una lectura descartada al importar es un dato inválido (tipeo, número inventado): no es una "discrepancia con el GPS".
        // Se cuenta aparte y se detalla en el Informe de gestión → Calidad de los km declarados.
        if (r.rejected) {
          discarded++;
          continue;
        }
        if (!anchor) {
          anchor = r;
          continue;
        }
        if (r.date <= anchor.date) continue;
        let flagged = false;
        if (first && last && anchor.date >= first) {
          // Se compara contra el RANGO posible de GPS (la carga no tiene hora y el GPS suma días completos)
          const upTo = r.date < last ? r.date : last;
          const rg = gpsRange(trips, v.id, anchor.date, upTo);
          const extra = Math.max(0, daysBetween(last, r.date)) * UNCOVERED_GPS_KM_PER_DAY; // días sin GPS cargado todavía
          const delta = r.km - anchor.km;
          let diff = outsideRange(delta, { min: rg.min, max: rg.max + extra });
          if (diff !== 0) {
            flagged = true;
            flags.push({
              plate: v.plate,
              from: anchor,
              to: r,
              gps: Math.round(rg.max),
              expected: Math.round(diff < 0 ? anchor.km + rg.min : anchor.km + rg.max),
              diff,
              gpsMin: Math.round(rg.min),
            });
          }
        }
        // La lectura del responsable manda como nuevo punto de partida; las de estación solo si cuadran con el GPS
        if (!r.rejected && (r.src !== 'estacion' || !flagged)) anchor = r;
      }
      const lastR = rs.length ? rs[rs.length - 1] : null;
      const days = lastR ? daysBetween(lastR.date, today) : null;
      if (days === null || days > STALE_READING_DAYS) stale.push({ plate: v.plate, last: lastR, days });
    }

    const services = vehicles
      .filter((v) => v.status !== 'Baja' && v.last_service_km !== null && v.km !== null)
      .map((v) => ({ v, left: v.last_service_km! + settings.service_km - v.km! }))
      .filter((x) => x.left <= settings.km_alert)
      .sort((a, b) => a.left - b.left);

    flags.sort((a, b) => b.to.date.localeCompare(a.to.date));
    return { flags, stale, services, discarded };
  }, [vehicles, trips, fuel_loads, km_history, maintenance, repairs, settings]);

  return (
    <>
      <div style={{ margin: '0 0 16px', padding: 12, borderRadius: 8, background: '#e3f2fd', fontSize: 14 }}>
        <b>Cómo se cuida el kilometraje:</b> lo más profesional es que el responsable (Ariel) anote a mano, cada cierto
        tiempo (por ejemplo una vez al mes, con foto del tablero), el km real de cada vehículo. Esa lectura manda; el GPS
        completa los días entre lecturas y sirve para <b>auditar</b> que lo declarado sea coherente.
        <br />
        <b>Nada se da por hecho solo:</b> un service (y cualquier mantenimiento o reparación) se considera realizado
        únicamente cuando se carga en su sección con el vehículo correspondiente. Si el km real supera el del service y
        no hay registro, queda <b>vencido</b> hasta que se verifique si se hizo y se cargue.
      </div>

      {twins.length > 0 && (
        <>
          <h3>⚠ Vehículos que no hay que mezclar</h3>
          <p className="muted">
            Pares de vehículos fáciles de confundir al cargar datos (patentes parecidas, o del mismo estilo y con km parecidos). Si una carga, un service o una
            reparación se carga en el vehículo equivocado, los km y los consumos de los dos quedan mal. Con YPF en Ruta cada tarjeta está asociada a un vehículo,
            por lo que es poco probable, pero conviene verificar la patente antes de guardar.
          </p>
          <div style={{ display: 'grid', gap: 10 }}>
            {twins.map((t) => (
              <div key={t.p.a + t.p.b} style={{ background: '#fff8e1', border: '1px solid #f1d98a', borderRadius: 10, padding: 12, fontSize: 13 }}>
                <b>
                  {t.p.a} ↔ {t.p.b}
                  {t.p.byOwner ? ' · indicado por el responsable' : ''}
                </b>
                <ul style={{ margin: '4px 0 0 18px' }}>
                  {t.p.reasons.map((r, i) => (
                    <li key={i}>{r}</li>
                  ))}
                  {t.A && t.B && (
                    <li>
                      {t.A.plate}: {t.A.brand} {t.A.model}, {num(t.A.km)} km, tarjeta …{t.A.fuel_card ?? '—'} · {t.B.plate}: {t.B.brand} {t.B.model}, {num(t.B.km)} km, tarjeta …{t.B.fuel_card ?? '—'}
                    </li>
                  )}
                </ul>
                <div style={{ marginTop: 6 }}>
                  <b>¿Hay datos cargados a uno que también encajan con el otro?</b>
                  {t.aInB.length + t.bInA.length === 0 ? (
                    <div>✔ No: ningún dato de uno encaja con la trayectoria del otro.</div>
                  ) : (
                    <ul style={{ margin: '4px 0 0 18px' }}>
                      {t.aInB.map((x, i) => (
                        <li key={'a' + i}>
                          Cargado a {t.A?.plate}: {x.what}, {num(x.km)} km el {fd(x.date)}{x.valid ? '' : ' (hoy descartado)'} → también encaja con {t.B?.plate}{x.weak ? ' (evidencia DÉBIL: ' + t.B?.plate + ' no tiene GPS confiable, así que “encaja” solo significa “es posible”)' : ' (evidencia FUERTE: coincide con el GPS)'}. No se puede asegurar de cuál es.
                        </li>
                      ))}
                      {t.bInA.map((x, i) => (
                        <li key={'b' + i}>
                          Cargado a {t.B?.plate}: {x.what}, {num(x.km)} km el {fd(x.date)}{x.valid ? '' : ' (hoy descartado)'} → también encaja con {t.A?.plate}{x.weak ? ' (evidencia DÉBIL: ' + t.A?.plate + ' no tiene GPS confiable, así que “encaja” solo significa “es posible”)' : ' (evidencia FUERTE: coincide con el GPS)'}. No se puede asegurar de cuál es.
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <h3>🧭 Lecturas que no encajan con las demás del vehículo</h3>
      <p className="muted">
        Cada lectura (de estación, cargada a mano, de mantenimiento o de reparación) se contrasta con hasta 3 anteriores y 3 posteriores, y con el GPS.
        <b> Atípica</b>: no concuerda con ninguna. <b>Dudosa</b>: concuerda con menos de la mitad. Se aceptan diferencias de hasta ±500 km por registro de taller o carga manual
        (hasta ±1.000 km entre dos de ellos) por el redondeo. Con más datos esta revisión será más precisa.
      </p>
      {offTrack.length ? (
        <div className="tw">
          <table>
            <thead>
              <tr>
                <th>Vehículo</th>
                <th>Fecha</th>
                <th>Km cargado</th>
                <th>Fuente</th>
                <th>Resultado</th>
                <th>Lo esperable en esa fecha</th>
              </tr>
            </thead>
            <tbody>
              {offTrack.map((o, i) => (
                <tr key={i}>
                  <td>
                    <b>{o.plate}</b>
                  </td>
                  <td>{fd(o.date)}</td>
                  <td>
                    <b>{num(o.km)}</b>
                  </td>
                  <td>{o.src}</td>
                  <td>
                    <Badge status="vencido">
                      {o.level === 'atípica' ? '⚠ Atípica' : '⚠ Dudosa'} ({o.agree}/{o.of})
                    </Badge>
                  </td>
                  <td>
                    {o.lo !== undefined ? `${num(o.lo)} – ${num(o.hi)} km` : '—'}
                    <div className="muted">Corregir el km en el registro correspondiente</div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="empty">✔ Todas las lecturas encajan con las de su vehículo.</div>
      )}
      {offTrack.length > 0 && (
        <>
          <h4 style={{ margin: '16px 0 8px' }}>🔎 Detalle de cada caso: qué vio el sistema, qué pudo pasar y qué hacer</h4>
          <p className="muted">
            Las causas son <b>hipótesis</b> ordenadas según lo que muestran los datos (números redondos, dígitos de más o de menos, fecha equivocada,
            km “programado” del service). Se confirman con el comprobante original. Esta explicación se genera sola para cualquier caso parecido en el futuro.
          </p>
          <div style={{ display: 'grid', gap: 12 }}>
            {offTrack.map((o, i) => (
              <div key={i} style={{ background: '#fff', border: '1px solid var(--b)', borderRadius: 10, padding: 14 }}>
                <div style={{ fontWeight: 700, marginBottom: 6 }}>
                  <Link href={`/vehiculos/${o.vehicleId}`}>{o.plate}</Link> · {o.level === 'atípica' ? '⚠ Atípica' : '⚠ Dudosa'} · {num(o.km)} km el {fd(o.date)} ({o.src}
                  {o.label ? `: ${o.label}` : ''})
                </div>
                {o.note && (
                  <div style={{ background: '#fff8e1', border: '1px solid #f1d98a', borderRadius: 8, padding: 10, margin: '6px 0', fontSize: 13 }}>
                    <b>📝 Aclaración del {o.note.by.toLowerCase()} ({fd(o.note.on)}):</b> {o.note.note}
                  </div>
                )}
                <ExplainView e={o.explain} />
              </div>
            ))}
          </div>
        </>
      )}

      <h3>🧾 Casos del mes explicados ({mKey ? monthLabel(mKey) : '—'})</h3>
      <p className="muted">
        Cada anomalía que detecta el sistema trae su explicación automática: qué vio, qué pudo haber pasado, qué hacer y qué efecto tiene. Funciona para cualquier caso
        nuevo del mismo tipo (el mes se elige más abajo, en “Auditoría entre cargas”). Las causas son hipótesis a confirmar con el comprobante original.
      </p>
      {([
        { title: 'Lecturas de estación inválidas', items: monthCases.invalid.map((x, i) => ({ k: 'i' + i, head: `${x.r.plate} · ${fd(x.r.load.date)} · declararon ${num(x.r.declared)} km`, e: x.e, note: caseNoteFor(x.r.plate, x.r.load.date, x.r.declared) })) },
        { title: 'Tramos entre cargas que no cierran con el GPS (o con cargas el mismo día)', items: monthCases.pairs.map((x, i) => ({ k: 'p' + i, head: `${x.p.vehicle.plate} · ${fd(x.p.prev.date)} → ${fd(x.p.cur.date)} · odómetro ${num(x.p.dKm)} km`, e: x.e })) },
        { title: 'Consumo fuera de lo esperado', items: monthCases.cons.map((x, i) => ({ k: 'c' + i, head: `${x.w.v.plate} · ${(x.w.l100 as number).toLocaleString('es-AR', { maximumFractionDigits: 1 })} L/100 km (${(x.w.l100Dev as number) > 0 ? '+' : ''}${Math.round(x.w.l100Dev as number)} %)`, e: x.e })) },
        { title: 'GPS poco confiable', items: monthCases.gps.map((x, i) => ({ k: 'g' + i, head: `${x.v.plate}`, e: x.e })) },
      ] as { title: string; items: { k: string; head: string; e: Explanation; note?: ReturnType<typeof caseNoteFor> }[] }[]).map((sec) => (
        <details key={sec.title} style={{ margin: '8px 0' }} open={sec.items.length > 0 && sec.items.length <= 3}>
          <summary style={{ cursor: 'pointer', fontWeight: 600 }}>
            {sec.title} ({sec.items.length})
          </summary>
          {sec.items.length ? (
            <div style={{ display: 'grid', gap: 8, marginTop: 8 }}>
              {sec.items.map((it) => (
                <details key={it.k} style={{ background: '#fff', border: '1px solid var(--b)', borderRadius: 8, padding: '8px 12px' }}>
                  <summary style={{ cursor: 'pointer' }}>{it.head}</summary>
                  {it.note && (
                    <div style={{ background: '#fff8e1', border: '1px solid #f1d98a', borderRadius: 8, padding: 10, margin: '8px 0 0', fontSize: 13 }}>
                      <b>📝 Aclaración del {it.note.by.toLowerCase()} ({fd(it.note.on)}):</b> {it.note.note}
                    </div>
                  )}
                  <ExplainView e={it.e} />
                </details>
              ))}
            </div>
          ) : (
            <div className="empty">✔ Sin casos de este tipo.</div>
          )}
        </details>
      ))}

      <h3>⚠ Lecturas que no coinciden con el GPS</h3>
      {flags.length ? (
        <div className="tw">
          <table>
            <thead>
              <tr>
                <th>Vehículo</th>
                <th>Lectura anterior</th>
                <th>Lectura nueva</th>
                <th>GPS máx. del tramo</th>
                <th>Límite del rango</th>
                <th>Fuera del rango</th>
                <th>Origen</th>
              </tr>
            </thead>
            <tbody>
              {flags.map((f, i) => (
                <tr key={i}>
                  <td>
                    <b>{f.plate}</b>
                  </td>
                  <td>
                    {fd(f.from.date)} · {num(f.from.km)} km
                  </td>
                  <td>
                    {fd(f.to.date)} · <b>{num(f.to.km)} km</b>
                  </td>
                  <td>{num(f.gps)} km</td>
                  <td>{num(f.expected)} km</td>
                  <td>
                    <Badge status="vencido">
                      {f.diff > 0 ? '+' : ''}
                      {num(f.diff)} km
                    </Badge>
                  </td>
                  <td>
                    {SRC_LABEL[f.to.src] ?? f.to.src}{f.to.rejected ? ' (descartada al importar)' : ''} <span className="muted">{f.to.who}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="empty">✔ Todas las lecturas auditables coinciden con el GPS.</div>
      )}
      {discarded > 0 && (
        <p className="muted">
          ℹ {discarded} lecturas de estaciones fueron descartadas por ser datos inválidos (por ejemplo, un km tipeado de cualquier manera).
          No se usan en ningún cálculo y no se muestran acá: están detalladas en el <Link href="/informe">Informe de gestión</Link>, sección
          “Calidad de los km declarados en las estaciones”.
        </p>
      )}
      <p className="muted">
        Se compara cada lectura de tablero (estaciones y cargas manuales) con la anterior más los km que midió el GPS en
        ese tramo (tolerancia: 100 km o 10 %, lo que sea mayor). Una diferencia grande puede ser un tablero mal leído, un GPS sin señal o un
        km anterior que estaba estimado: hay que verificarlo.
      </p>


      <h3>⛽ Auditoría entre cargas de combustible</h3>
      <div className="bar">
        <select value={mKey} onChange={(e) => setSelM(e.target.value)} aria-label="Mes">
          {(fuelMonths.length ? fuelMonths : [mKey]).filter(Boolean).map((m) => (
            <option key={m} value={m}>
              {monthLabel(m)}
            </option>
          ))}
        </select>
        <label style={{ fontSize: 13 }}>
          <input type="checkbox" checked={onlyFlags} onChange={(e) => setOnlyFlags(e.target.checked)} /> Solo tramos con alertas
        </label>
      </div>
      <p className="muted">
        Solo se comparan lecturas válidas; las cargas con km mal digitado en el surtidor se listan en el <b>Informe de gestión</b> (sección “Calidad de los km declarados”). El GPS suma días completos y las cargas no traen hora (una carga a la 1 AM deja casi todo el día después; una a las 23 h, casi todo antes), por eso cada tramo se compara contra un <b>rango</b>: el mínimo son solo los días completos entre ambas cargas y el máximo incluye además los dos días de las cargas. Solo se marca lo que queda <b>fuera</b> de ese rango. Cada fila es el tramo entre una carga y la anterior del mismo vehículo (incluye la última del mes anterior, así que
        el cruce de meses queda cubierto). El consumo de un tramo suelto es <b>indicativo</b>: no se sabe con cuánto
        combustible salió el vehículo. El control confiable es el consumo acumulado de todo el mes (tabla siguiente).
      </p>
      {(() => {
        const rows = between.pairs.filter((p) => !onlyFlags || p.flags.length);
        return rows.length ? (
          <div className="tw">
            <table>
              <thead>
                <tr>
                  <th>Vehículo</th>
                  <th>Carga anterior</th>
                  <th>Carga</th>
                  <th>Km odómetro</th>
                  <th>Km GPS (mín – máx)</th>
                  <th>Litros</th>
                  <th>L/100 (indic.)</th>
                  <th>Alertas</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p, i) => (
                  <tr key={i}>
                    <td>
                      <b>{p.vehicle.plate}</b>
                    </td>
                    <td>
                      {fd(p.prev.date)} · {num(p.prevKm)}
                    </td>
                    <td>
                      {fd(p.cur.date)} · {num(p.curKm)}
                      <div className="muted">{p.cur.station}</div>
                    </td>
                    <td>{num(p.dKm)}</td>
                    <td>
                      {p.gpsMin === null || p.gpsMax === null ? (
                        <span className="muted">sin GPS</span>
                      ) : (
                        `${num(Math.round(p.gpsMin))} – ${num(Math.round(p.gpsMax))}`
                      )}
                    </td>
                    <td>{num(p.cur.liters)}</td>
                    <td>{p.l100 === null ? '—' : p.l100.toLocaleString('es-AR', { maximumFractionDigits: 1 })}</td>
                    <td>
                      {p.flags.length ? (
                        p.flags.map((f, k) => (
                          <div key={k} style={{ color: '#7a4b00', fontSize: 12 }}>
                            ⚠ {f}
                          </div>
                        ))
                      ) : (
                        <span className="muted">✔</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty">✔ No hay tramos con alertas{mKey ? ` en ${monthLabel(mKey)}` : ''}.</div>
        );
      })()}

      <h4 style={{ margin: '18px 0 6px' }}>Consumo acumulado del mes por vehículo (método tanque a tanque)</h4>
      <div className="tw">
        <table>
          <thead>
            <tr>
              <th>Vehículo</th>
              <th>Km odómetro</th>
              <th>Km GPS (mín – máx)</th>
              <th>Diferencia</th>
              <th>Litros (ventana)</th>
              <th>L/100 km</th>
              <th>Referencia</th>
              <th>Desvío</th>
              <th>Margen por tanque</th>
            </tr>
          </thead>
          <tbody>
            {between.wins
              .filter((w) => w.odoKm !== null || w.fills > 0)
              .map((w) => (
                <tr key={w.v.id}>
                  <td>
                    <b>{w.v.plate}</b>
                  </td>
                  <td>{w.odoKm === null ? '—' : num(w.odoKm)}</td>
                  <td>
                    {w.hasGps ? (
                      w.gpsWinMin === null || w.gpsWinMax === null ? '—' : `${num(Math.round(w.gpsWinMin))} – ${num(Math.round(w.gpsWinMax))}`
                    ) : (
                      <span className="muted">sin GPS</span>
                    )}
                  </td>
                  <td>{w.gpsVsOdo === null ? '—' : w.gpsVsOdo === 0 ? '✔ dentro del rango' : `⚠ ${num(w.gpsVsOdo)} km fuera`}</td>
                  <td>{w.winLiters === null ? '—' : num(Math.round(w.winLiters))}</td>
                  <td>{w.l100 === null ? '—' : w.l100.toLocaleString('es-AR', { maximumFractionDigits: 1 })}</td>
                  <td>{w.l100Ref === null ? '—' : w.l100Ref.toLocaleString('es-AR', { maximumFractionDigits: 1 })}</td>
                  <td>
                    {w.l100Dev === null ? (
                      '—'
                    ) : (
                      <b style={{ color: w.l100Signif ? '#a32424' : '#52514e' }}>
                        {w.l100Dev > 0 ? '+' : ''}
                        {Math.round(w.l100Dev)} %{w.l100Signif ? ' ⚠' : ''}
                      </b>
                    )}
                  </td>
                  <td>{w.l100Band === null ? '—' : `±${w.l100Band.toLocaleString('es-AR', { maximumFractionDigits: 1 })} (tanque ~${Math.round(w.tankCap)} L)`}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      <p className="muted">
        Referencia: el consumo del mes anterior del mismo vehículo o, si no hay, la mediana de vehículos del mismo tipo. Como no se sabe con cuánto combustible salió el vehículo, cada consumo lleva un margen
        (capacidad del tanque ÷ km de la ventana): solo se marca ⚠ si el desvío supera el 25 % y ese margen. Un desvío marcado amerita revisar lecturas de odómetro, estado del vehículo o uso del combustible.
      </p>

      <h3>🛠 Services vencidos o próximos</h3>
      {services.length ? (
        <div className="tw">
          <table>
            <thead>
              <tr>
                <th>Vehículo</th>
                <th>Km actual</th>
                <th>Último service registrado</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {services.map(({ v, left }) => (
                <tr key={v.id}>
                  <td>
                    <Link href={`/vehiculos/${v.id}`}>
                      <b>{v.plate}</b>
                    </Link>{' '}
                    <span className="muted">{v.brand}</span>
                  </td>
                  <td>{num(v.km)} km</td>
                  <td>{num(v.last_service_km)} km</td>
                  <td>
                    <Badge status={left <= 0 ? 'vencido' : 'proximo'}>
                      {left <= 0 ? `Vencido hace ${num(-left)} km` : `Faltan ${num(left)} km`}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="empty">✔ Ningún service vencido ni próximo.</div>
      )}
      <p className="muted">
        Si un vehículo figura vencido: verificar si el service se hizo. Si se hizo, cargarlo en <b>Mantenimientos</b>{' '}
        (tipo “Service”); recién ahí se da por realizado.
      </p>

      <h3>📝 Vehículos sin lectura de tablero reciente (más de {STALE_READING_DAYS} días)</h3>
      {stale.length ? (
        <div className="tw">
          <table>
            <thead>
              <tr>
                <th>Vehículo</th>
                <th>Última lectura</th>
                <th>Hace</th>
              </tr>
            </thead>
            <tbody>
              {stale.map((s) => (
                <tr key={s.plate}>
                  <td>
                    <b>{s.plate}</b>
                  </td>
                  <td>
                    {s.last ? `${fd(s.last.date)} · ${num(s.last.km)} km (${SRC_LABEL[s.last.src] ?? s.last.src})` : 'Nunca'}
                  </td>
                  <td>{s.days === null ? '—' : `${s.days} días`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="empty">✔ Todos los vehículos tienen una lectura reciente.</div>
      )}
      <p className="muted">
        Anotar el km real en Vehículos → “Actualizar km”, indicando <b>la fecha en que se leyó el tablero</b>. Queda registrado como carga manual con esa fecha.
      </p>

      <details style={{ marginTop: 24 }}>
        <summary style={{ cursor: 'pointer', fontWeight: 600 }}>📐 Parámetros y criterios de esta auditoría (y por qué)</summary>
        <p className="muted">
          Provisorios: salen del análisis de septiembre (un solo mes de combustible). Se recalibran con 3 o más meses de datos (ver PLAN_REANALISIS_DATOS.md).
        </p>
        <div className="tw">
          <table>
            <thead>
              <tr>
                <th>Criterio</th>
                <th>Valor</th>
                <th>Por qué</th>
                <th>Cuándo revisarlo</th>
              </tr>
            </thead>
            <tbody>
              {PARAM_DOCS.map((p) => (
                <tr key={p.name}>
                  <td>
                    <b>{p.name}</b>
                  </td>
                  <td>{p.value}</td>
                  <td>{p.why}</td>
                  <td className="muted">{p.review}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </>
  );
}
