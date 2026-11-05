'use client';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useData } from '@/lib/data';
import { fd, isFuel, num } from '@/lib/util';
import { Badge } from '@/components/Badge';
import { gpsBetween, tolerance } from '@/lib/kmAudit';
import { fuelPairs, monthLabel, monthRange, vehicleMonth, availableMonths, type Data } from '@/lib/fleetStats';

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

export default function AuditoriaKm() {
  const { vehicles, trips, fuel_loads, km_history, settings, drivers, repairs, maintenance, infractions } = useData();
  const [selM, setSelM] = useState('');
  const [onlyFlags, setOnlyFlags] = useState(true);
  const fleet: Data = useMemo(
    () => ({ vehicles, drivers, fuel_loads, trips, repairs, maintenance, infractions }),
    [vehicles, drivers, fuel_loads, trips, repairs, maintenance, infractions]
  );
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

  const { flags, stale, services, discarded } = useMemo(() => {
    const today = new Date().toLocaleDateString('en-CA');
    const flags: { plate: string; from: Reading; to: Reading; gps: number; expected: number; diff: number }[] = [];
    const stale: { plate: string; last: Reading | null; days: number | null }[] = [];
    let discarded = 0;

    for (const v of vehicles) {
      if (v.status === 'Baja') continue;
      // Lecturas de TABLERO: estaciones de servicio + cargas manuales / registros (el GPS no cuenta como lectura)
      const rs: Reading[] = [];
      fuel_loads.forEach((f) => {
        if (f.vehicle_id === v.id && f.km_raw !== null && f.km_raw !== undefined && isFuel(f.product))
          rs.push({ date: f.date, km: f.km_raw, src: 'estacion', who: f.station ?? '', rejected: f.km === null || f.km === undefined });
      });
      km_history.forEach((h) => {
        if (h.vehicle_id !== v.id) return;
        const i = h.changed_by.indexOf(':');
        const src = i > 0 ? h.changed_by.slice(0, i) : 'manual';
        if (src === 'gps' || src === 'combustible' || src === 'registro') return; // combustible ya está en fuel_loads; registro = mantenimiento/reparación con su fecha real
        rs.push({ date: localDate(h.recorded_at), km: h.km, src, who: i > 0 ? h.changed_by.slice(i + 1) : h.changed_by });
      });
      // Mantenimientos y reparaciones: el km se anota en el taller leyendo el tablero (puede venir redondeado)
      maintenance.forEach((m) => {
        if (m.vehicle_id === v.id && m.km !== null) rs.push({ date: m.date, km: m.km, src: 'taller', who: m.type });
      });
      repairs.forEach((r) => {
        if (r.vehicle_id === v.id && r.km !== null) rs.push({ date: r.date, km: r.km, src: 'taller', who: r.description });
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
          const upTo = r.date < last ? r.date : last;
          const gps = gpsBetween(trips, v.id, anchor.date, upTo);
          const extra = Math.max(0, daysBetween(last, r.date)) * 400; // días sin GPS cargado todavía
          const expected = anchor.km + gps;
          const diff = r.km - expected;
          if (diff > tolerance(gps) + extra || diff < -tolerance(gps)) {
            flagged = true;
            flags.push({
              plate: v.plate,
              from: anchor,
              to: r,
              gps: Math.round(gps),
              expected: Math.round(expected),
              diff: Math.round(diff),
            });
          }
        }
        // La lectura del responsable manda como nuevo punto de partida; las de estación solo si cuadran con el GPS
        if (!r.rejected && (r.src !== 'estacion' || !flagged)) anchor = r;
      }
      const lastR = rs.length ? rs[rs.length - 1] : null;
      const days = lastR ? daysBetween(lastR.date, today) : null;
      if (days === null || days > 35) stale.push({ plate: v.plate, last: lastR, days });
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

      <h3>⚠ Lecturas que no coinciden con el GPS</h3>
      {flags.length ? (
        <div className="tw">
          <table>
            <thead>
              <tr>
                <th>Vehículo</th>
                <th>Lectura anterior</th>
                <th>Lectura nueva</th>
                <th>GPS en el tramo</th>
                <th>Se esperaba</th>
                <th>Diferencia</th>
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
        Solo se comparan lecturas válidas; las cargas con km mal digitado en el surtidor se listan en el <b>Informe de gestión</b> (sección “Calidad de los km declarados”). La comparación con el GPS admite un margen de un día de recorrido, porque el GPS suma días completos. Cada fila es el tramo entre una carga y la anterior del mismo vehículo (incluye la última del mes anterior, así que
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
                  <th>Km GPS</th>
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
                    <td>{p.gpsKm === null ? <span className="muted">sin GPS</span> : num(Math.round(p.gpsKm))}</td>
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
          <div className="empty">✔ No hay tramos con alertas en {monthLabel(mKey)}.</div>
        );
      })()}

      <h4 style={{ margin: '18px 0 6px' }}>Consumo acumulado del mes por vehículo (método tanque a tanque)</h4>
      <div className="tw">
        <table>
          <thead>
            <tr>
              <th>Vehículo</th>
              <th>Km odómetro</th>
              <th>Km GPS (mismo tramo)</th>
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
                  <td>{w.hasGps ? (w.gpsWinKm === null ? '—' : num(Math.round(w.gpsWinKm))) : <span className="muted">sin GPS</span>}</td>
                  <td>{w.gpsVsOdo === null ? '—' : num(Math.round(w.gpsVsOdo))}</td>
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

      <h3>📝 Vehículos sin lectura de tablero reciente (más de 35 días)</h3>
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
      <p className="muted">Anotar el km real en Vehículos → “Actualizar km”. Queda registrado como carga manual.</p>
    </>
  );
}
