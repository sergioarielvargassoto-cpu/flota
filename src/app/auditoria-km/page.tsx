'use client';
import Link from 'next/link';
import { useMemo } from 'react';
import { useData } from '@/lib/data';
import { fd, isFuel, num } from '@/lib/util';
import { Badge } from '@/components/Badge';
import { gpsBetween, tolerance } from '@/lib/kmAudit';

type Reading = { date: string; km: number; src: string; who: string; rejected?: boolean };
const SRC_LABEL: Record<string, string> = {
  manual: '✍ A mano',
  registro: '🧾 Registro',
  estacion: '⛽ Estación',
};
const localDate = (iso: string) => new Date(iso).toLocaleDateString('en-CA');
const daysBetween = (a: string, b: string) =>
  Math.round((+new Date(b + 'T00:00:00') - +new Date(a + 'T00:00:00')) / 864e5);

export default function AuditoriaKm() {
  const { vehicles, trips, fuel_loads, km_history, settings } = useData();

  const { flags, stale, services } = useMemo(() => {
    const today = new Date().toLocaleDateString('en-CA');
    const flags: { plate: string; from: Reading; to: Reading; gps: number; expected: number; diff: number }[] = [];
    const stale: { plate: string; last: Reading | null; days: number | null }[] = [];

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
        if (src === 'gps' || src === 'combustible') return; // combustible ya está en fuel_loads
        rs.push({ date: localDate(h.recorded_at), km: h.km, src, who: i > 0 ? h.changed_by.slice(i + 1) : h.changed_by });
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
        if (!anchor) {
          if (!r.rejected) anchor = r;
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
    return { flags, stale, services };
  }, [vehicles, trips, fuel_loads, km_history, settings]);

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
      <p className="muted">
        Se compara cada lectura de tablero (estaciones y cargas manuales) con la anterior más los km que midió el GPS en
        ese tramo (tolerancia: 100 km o 10 %, lo que sea mayor). Una diferencia grande puede ser un tablero mal leído, un GPS sin señal o un
        km anterior que estaba estimado: hay que verificarlo.
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
