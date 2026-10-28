'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useData } from '@/lib/data';
import { computeAlerts, daysText, kmText, STATUS_LABEL } from '@/lib/alerts';
import { download, fd, todayStr } from '@/lib/util';
import { Badge } from '@/components/Badge';

export default function Panel() {
  const router = useRouter();
  const data = useData();
  const { vehicles, drivers, settings: s } = data;
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
    } catch { /* sin storage */ }
    // notificación de escritorio, una vez por día (si el usuario la activó en Ajustes)
    try {
      if ('Notification' in window && Notification.permission === 'granted' && pending.length && localStorage.getItem('lastNotif') !== todayStr()) {
        localStorage.setItem('lastNotif', todayStr());
        new Notification(`Control de Flota: ${pending.length} vencimiento${pending.length > 1 ? 's' : ''} a atender`, {
          body: pending.slice(0, 4).map((x) => `${x.who} – ${x.what} (${x.kmLeft !== undefined ? 'km' : daysText(x.days)})`).join('\n'),
        });
      }
    } catch { /* ignorar */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const csv = () => {
    const rows = [['Estado', 'Tipo', 'Quién', 'Documento', 'Fecha', 'Detalle']];
    list.forEach((x) => rows.push([STATUS_LABEL[x.status], x.kind, x.who, x.what, x.date ?? '', x.kmLeft !== undefined ? kmText(x.kmLeft) : daysText(x.days)]));
    download(`vencimientos_${todayStr()}.csv`, '﻿' + rows.map((r) => r.map((c) => '"' + String(c).replace(/"/g, '""') + '"').join(';')).join('\r\n'), 'text/csv');
  };

  return (
    <>
      {backupOld && (vehicles.length > 0 || drivers.length > 0) && (
        <div className="warn">⚠️ Hace más de 30 días que no descargás un respaldo. Andá a <b>Ajustes</b> y exportá una copia.</div>
      )}
      <h2>Panel de vencimientos</h2>
      <div className="cards">
        <div className="card"><div className="n" style={{ color: 'var(--r)' }}>{c('vencido')}</div><div className="l">Vencidos</div></div>
        <div className="card"><div className="n" style={{ color: 'var(--o)' }}>{c('critico')}</div><div className="l">Críticos (≤ {s.d3} días)</div></div>
        <div className="card"><div className="n" style={{ color: 'var(--y)' }}>{c('urgente')}</div><div className="l">Urgentes (≤ {s.d2} días)</div></div>
        <div className="card"><div className="n" style={{ color: '#c5e063' }}>{c('proximo')}</div><div className="l">Próximos (≤ {s.d1} días)</div></div>
        <div className="card"><div className="n" style={{ color: 'var(--m)' }}>{c('nd')}</div><div className="l">Sin fecha cargada</div></div>
        <div className="card"><div className="n">{vehicles.filter((v) => v.status !== 'Baja').length}</div><div className="l">Vehículos activos</div></div>
        <div className="card"><div className="n">{drivers.length}</div><div className="l">Choferes</div></div>
      </div>
      <div className="bar">
        <select value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="all">Todo</option><option value="Vehículo">Vehículos</option><option value="Chofer">Choferes</option><option value="Mantenimiento">Mantenimientos</option>
        </select>
        <label className="muted"><input type="checkbox" style={{ width: 'auto' }} checked={all} onChange={(e) => setAll(e.target.checked)} /> ver también los que están al día</label>
        <span className="sp" />
        <button className="b2" onClick={csv}>⬇ Exportar CSV</button>
        <button className="b2" onClick={() => window.print()}>🖨 Imprimir</button>
      </div>
      {list.length ? (
        <div className="tw"><table>
          <thead><tr><th>Estado</th><th>Tipo</th><th>Quién</th><th>Documento / tarea</th><th>Fecha</th><th></th></tr></thead>
          <tbody>{list.map((x, i) => (
            <tr key={i} className="cl" onClick={() => router.push(`/${x.owner}/${x.ownerId}`)}>
              <td><Badge status={x.status}>{x.kmLeft !== undefined ? kmText(x.kmLeft) : daysText(x.days)}</Badge></td>
              <td>{x.kind}</td><td>{x.who}</td>
              <td>{x.what}{x.ref && <span className="muted"> · {x.ref}</span>}</td><td>{fd(x.date)}</td><td className="muted">ver ›</td>
            </tr>
          ))}</tbody>
        </table></div>
      ) : (
        <div className="empty">{vehicles.length || drivers.length ? '✅ No hay vencimientos próximos.' : 'Empezá cargando tus vehículos y choferes.'}</div>
      )}
    </>
  );
}
