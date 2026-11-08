'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useData } from '@/lib/data';
import { computeAlerts, daysText, kmText, STATUS_LABEL } from '@/lib/alerts';
import { download, fd, money, todayStr } from '@/lib/util';
import { Badge } from '@/components/Badge';

export default function Panel() {
  const router = useRouter();
  const data = useData();
  const { vehicles, drivers, infractions, fines, settings: s } = data;
  const [all, setAll] = useState(false);
  const [filter, setFilter] = useState('all');
  const pending = computeAlerts(data, false);
  const list = computeAlerts(data, all).filter((a) => filter === 'all' || a.kind === filter);
  const c = (k: string) => pending.filter((x) => x.status === k).length;

  const [backupOld, setBackupOld] = useState(false);
  useEffect(() => {
    try {
      const t = Number(localStorage.getItem('lastBackup') || 0);
      setBackupOld(!t || (Date.now() - t) / 864e5 > 30);
    } catch {
      /* sin storage */
    }
    // notificación de escritorio, una vez por día (si el usuario la activó en Ajustes)
    try {
      if (
        'Notification' in window &&
        Notification.permission === 'granted' &&
        pending.length &&
        localStorage.getItem('lastNotif') !== todayStr()
      ) {
        localStorage.setItem('lastNotif', todayStr());
        new Notification(`Control de Flota: ${pending.length} vencimiento${pending.length > 1 ? 's' : ''} a atender`, {
          body: pending
            .slice(0, 4)
            .map((x) => `${x.who} – ${x.what} (${x.kmLeft !== undefined ? 'km' : daysText(x.days)})`)
            .join('\n'),
        });
      }
    } catch {
      /* ignorar */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const csv = () => {
    const rows = [['Estado', 'Tipo', 'Quién', 'Documento', 'Fecha', 'Detalle']];
    list.forEach((x) =>
      rows.push([
        STATUS_LABEL[x.status],
        x.kind,
        x.who,
        x.what,
        x.date ?? '',
        x.kmLeft !== undefined ? kmText(x.kmLeft) : daysText(x.days),
      ])
    );
    download(
      `vencimientos_${todayStr()}.csv`,
      '﻿' + rows.map((r) => r.map((c) => '"' + String(c).replace(/"/g, '""') + '"').join(';')).join('\r\n'),
      'text/csv'
    );
  };

  return (
    <>
      {backupOld && (vehicles.length > 0 || drivers.length > 0) && (
        <div className="warn">
          ⚠️ Hace más de 30 días que no descargás un respaldo. Andá a <b>Ajustes</b> y exportá una copia.
        </div>
      )}
      <h2>Panel de vencimientos</h2>
      <section className="card" aria-labelledby="kpi-main" style={{ padding: '24px 28px', marginBottom: 16 }}>
        <div className="an-eyebrow" id="kpi-main">
          Vencimientos a atender
        </div>
        <div className="num" style={{ fontSize: 44, fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1.1, marginTop: 6 }}>
          {pending.length}
        </div>
        <p className="an-ink-2" style={{ margin: '6px 0 0' }}>
          {c('vencido') > 0
            ? `${c('vencido')} ya ${c('vencido') === 1 ? 'está vencido' : 'están vencidos'} y ${c('critico')} vence${c('critico') === 1 ? '' : 'n'} en ${s.d3} días o menos.`
            : pending.length
              ? `Nada vencido. ${c('critico')} vence${c('critico') === 1 ? '' : 'n'} en ${s.d3} días o menos.`
              : 'Todo al día.'}{' '}
          {vehicles.filter((v) => v.status !== 'Baja').length} vehículos activos · {drivers.length} choferes.
        </p>
      </section>
      <dl className="cards" style={{ margin: '0 0 24px' }}>
        {(
          [
            ['vencido', '!', 'Vencidos', null],
            ['critico', '!', 'Críticos', `≤ ${s.d3} días`],
            ['urgente', '▲', 'Urgentes', `≤ ${s.d2} días`],
            ['proximo', '•', 'Próximos', `≤ ${s.d1} días`],
            ['nd', '?', 'Sin fecha cargada', 'completar en cada ficha'],
          ] as const
        ).map(([k, ic, label, det]) => (
          <div className="card" key={k}>
            <dt className={'kpi-mk ' + k}>
              <i aria-hidden="true">{ic}</i>
              {label}
            </dt>
            <dd className="n" style={{ margin: '6px 0 0' }}>
              {c(k)}
            </dd>
            {det && (
              <dd className="muted" style={{ margin: 0, fontSize: 12 }}>
                {det}
              </dd>
            )}
          </div>
        ))}
      </dl>
      <div className="bar">
        <label htmlFor="panel-filtro" className="sr-only">
          Mostrar
        </label>
        <select id="panel-filtro" value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="all">Todo</option>
          <option value="Vehículo">Vehículos</option>
          <option value="Chofer">Choferes</option>
          <option value="Mantenimiento">Mantenimientos</option>
        </select>
        <label className="muted">
          <input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} />{' '}
          ver también los que están al día
        </label>
        <span className="sp" />
        <button className="b2" onClick={csv}>
          <span aria-hidden="true">⬇</span> Exportar CSV
        </button>
        <button className="b2" onClick={() => window.print()}>
          <span aria-hidden="true">🖨</span> Imprimir
        </button>
      </div>
      {list.length ? (
        <div className="tw">
          <table>
            <caption className="sr-only">Vencimientos ordenados por urgencia</caption>
            <thead>
              <tr>
                <th scope="col">Estado</th>
                <th scope="col">Tipo</th>
                <th scope="col">Quién</th>
                <th scope="col">Documento / tarea</th>
                <th scope="col">Fecha</th>
                <th scope="col">
                  <span className="sr-only">Abrir</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {list.map((x, i) => (
                <tr key={i} className="cl" onClick={() => router.push(`/${x.owner}/${x.ownerId}`)}>
                  <td>
                    <Badge status={x.status}>{x.kmLeft !== undefined ? kmText(x.kmLeft) : daysText(x.days)}</Badge>
                  </td>
                  <td>{x.kind}</td>
                  <td>{x.who}</td>
                  <td>
                    {x.what}
                    {x.ref && <span className="muted"> · {x.ref}</span>}
                  </td>
                  <td>{fd(x.date)}</td>
                  <td className="muted" aria-hidden="true">
                    ver ›
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="empty">
          {vehicles.length || drivers.length
            ? 'No hay vencimientos próximos. Marcá «ver también los que están al día» para revisar el resto.'
            : 'Todavía no hay datos. Empezá cargando tus vehículos y choferes desde sus pestañas.'}
        </div>
      )}

      <h2 style={{ marginTop: '40px' }}>Infracciones</h2>
      <dl className="cards" style={{ margin: '0 0 24px' }}>
        {(
          [
            ['urgente', '!', 'Registradas', infractions.filter((i) => i.status === 'Registrada').length],
            ['ok', '✓', 'Pagadas', infractions.filter((i) => i.status === 'Pagada').length],
            ['nd', '–', 'Anuladas', infractions.filter((i) => i.status === 'Anulada').length],
          ] as const
        ).map(([k, ic, label, n]) => (
          <div className="card" key={label}>
            <dt className={'kpi-mk ' + k}>
              <i aria-hidden="true">{ic}</i>
              {label}
            </dt>
            <dd className="n" style={{ margin: '6px 0 0' }}>
              {n}
            </dd>
          </div>
        ))}
        <div className="card">
          <dt className="kpi-mk acc">
            <i aria-hidden="true">$</i>
            Multas pendientes
          </dt>
          <dd className="n" style={{ margin: '6px 0 0' }}>
            {money(fines.reduce((sum, f) => sum + (f.paid_amount ? 0 : f.amount), 0))}
          </dd>
        </div>
      </dl>
      <div className="bar">
        <span className="sp" />
        <button className="b1" onClick={() => router.push('/infracciones')}>
          Ver todas las infracciones ›
        </button>
      </div>
      {infractions.slice(0, 5).length ? (
        <div className="tw">
          <table>
            <caption className="sr-only">Últimas 5 infracciones</caption>
            <thead>
              <tr>
                <th scope="col">Conductor</th>
                <th scope="col">Vehículo</th>
                <th scope="col">Fecha</th>
                <th scope="col">Tipo</th>
                <th scope="col" className="r">
                  Multa
                </th>
                <th scope="col">Estado</th>
              </tr>
            </thead>
            <tbody>
              {infractions
                .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                .slice(0, 5)
                .map((i) => {
                  const driver = drivers.find((d) => d.id === i.driver_id);
                  const vehicle = vehicles.find((v) => v.id === i.vehicle_id);
                  const statusClass: Record<string, string> = {
                    Registrada: 'urgente',
                    Pagada: 'ok',
                    Anulada: 'nd',
                  };
                  return (
                    <tr key={i.id} className="cl" onClick={() => router.push(`/infracciones/${i.id}`)}>
                      <td>
                        <b>{driver?.name || '—'}</b>
                      </td>
                      <td>{vehicle?.plate || '—'}</td>
                      <td>{i.date}</td>
                      <td>{i.type}</td>
                      <td className="r">{i.fine_amount ? money(i.fine_amount) : '—'}</td>
                      <td>
                        <span className={'bd ' + (statusClass[i.status] ?? 'nd')}>{i.status}</span>
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="empty">Sin infracciones registradas. Se cargan desde la pestaña Infracciones.</div>
      )}
    </>
  );
}
