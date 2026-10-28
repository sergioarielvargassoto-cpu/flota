'use client';
import { useData } from '@/lib/data';
import { daysText, statusOf } from '@/lib/alerts';
import { daysTo, fd, guard, money, num } from '@/lib/util';
import type { Maint, Repair } from '@/lib/types';
import { Badge } from './Badge';
import { AttachmentList, attachmentsOf, removeStoredFiles } from './Attachments';
import { DocForm, MaintForm, RepairForm } from './forms';
import { useModal } from './useModal';

export function DocsTable({ owner }: { owner: { type: 'vehicle' | 'driver'; id: string } }) {
  const { documents, attachments, settings, update, remove } = useData();
  const { el, open } = useModal();
  const list = documents
    .filter((d) => (owner.type === 'vehicle' ? d.vehicle_id : d.driver_id) === owner.id)
    .sort((a, b) => (a.expires_on ?? '9999').localeCompare(b.expires_on ?? '9999'));
  return (
    <>
      <div className="bar" style={{ marginTop: 20 }}>
        <h3 style={{ margin: 0 }}>{owner.type === 'vehicle' ? 'Vencimientos' : 'Documentación del chofer'}</h3><span className="sp" />
        <button className="b1" onClick={() => open((c) => <DocForm owner={owner} onClose={c} />)}>
          {owner.type === 'vehicle' ? '+ Vencimiento' : '+ Vencimiento (LINTI, licencia…)'}
        </button>
      </div>
      {list.length === 0 ? <div className="empty">Sin vencimientos cargados.</div> : (
        <div className="tw"><table>
          <thead><tr><th>Documento</th><th>Vence</th><th>Estado</th><th>Ref.</th><th>Copias</th><th></th></tr></thead>
          <tbody>{list.map((d) => {
            const days = daysTo(d.expires_on);
            return (
              <tr key={d.id}>
                <td>{d.doc_type}</td><td>{fd(d.expires_on)}</td>
                <td><Badge status={statusOf(days, settings)}>{daysText(days)}</Badge></td>
                <td>{d.reference}</td><td><AttachmentList kind="document" id={d.id} /></td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  <button className="b2 sm" onClick={() => {
                    const n = prompt(`Nueva fecha de vencimiento de "${d.doc_type}" (AAAA-MM-DD):`, d.expires_on ?? '');
                    if (n === null) return;
                    if (!/^\d{4}-\d{2}-\d{2}$/.test(n)) return alert('Formato: AAAA-MM-DD');
                    guard(() => update('documents', d.id, { expires_on: n }));
                  }}>Renovar</button>{' '}
                  <button className="b2 sm" onClick={() => open((c) => <DocForm owner={owner} docId={d.id} onClose={c} />)}>Editar</button>{' '}
                  <button className="b3 sm" onClick={() => {
                    if (!confirm('¿Eliminar este vencimiento?')) return;
                    guard(async () => { await removeStoredFiles(attachmentsOf(attachments, 'document', d.id)); await remove('documents', d.id); });
                  }}>✕</button>
                </td>
              </tr>
            );
          })}</tbody>
        </table></div>
      )}
      {el}
    </>
  );
}

export function RepairsTable({ list, showVehicle }: { list: Repair[]; showVehicle: boolean }) {
  const { vehicles, workshops, attachments, remove } = useData();
  const { el, open } = useModal();
  if (!list.length) return <div className="empty">Sin reparaciones registradas.</div>;
  const sc = { Pendiente: 'critico', 'En curso': 'urgente', Finalizada: 'ok' } as const;
  return (
    <>
      <div className="tw"><table>
        <thead><tr>{showVehicle && <th>Vehículo</th>}<th>Fecha</th><th>Descripción</th><th>Taller</th><th>Km</th><th>Costo</th><th>Estado</th><th></th></tr></thead>
        <tbody>{[...list].sort((a, b) => b.date.localeCompare(a.date)).map((r) => (
          <tr key={r.id}>
            {showVehicle && <td>{vehicles.find((v) => v.id === r.vehicle_id)?.plate ?? '—'}</td>}
            <td>{fd(r.date)}</td>
            <td>{r.description} <AttachmentList kind="repair" id={r.id} />{r.invoice && <div className="muted">Fact. {r.invoice}</div>}</td>
            <td>{workshops.find((w) => w.id === r.workshop_id)?.name ?? '—'}</td><td>{num(r.km)}</td><td>{money(r.cost)}</td>
            <td><Badge status={sc[r.status]}>{r.status}</Badge></td>
            <td style={{ whiteSpace: 'nowrap' }}>
              <button className="b2 sm" onClick={() => open((c) => <RepairForm id={r.id} onClose={c} />)}>Editar</button>{' '}
              <button className="b3 sm" onClick={() => {
                if (!confirm('¿Eliminar reparación?')) return;
                guard(async () => { await removeStoredFiles(attachmentsOf(attachments, 'repair', r.id)); await remove('repairs', r.id); });
              }}>✕</button>
            </td>
          </tr>
        ))}</tbody>
      </table></div>
      {el}
    </>
  );
}

export function MaintTable({ list, showVehicle }: { list: Maint[]; showVehicle: boolean }) {
  const { vehicles, workshops, attachments, remove } = useData();
  const { el, open } = useModal();
  if (!list.length) return <div className="empty">Sin mantenimientos registrados.</div>;
  return (
    <>
      <div className="tw"><table>
        <thead><tr>{showVehicle && <th>Vehículo</th>}<th>Tipo</th><th>Realizado</th><th>Km</th><th>Taller</th><th>Costo</th><th>Próximo</th><th></th></tr></thead>
        <tbody>{[...list].sort((a, b) => b.date.localeCompare(a.date)).map((m) => {
          const next = [m.next_date ? fd(m.next_date) : '', m.next_km !== null ? num(m.next_km) + ' km' : ''].filter(Boolean).join(' / ') || '—';
          return (
            <tr key={m.id}>
              {showVehicle && <td>{vehicles.find((v) => v.id === m.vehicle_id)?.plate ?? '—'}</td>}
              <td>{m.type} <AttachmentList kind="maintenance" id={m.id} /></td><td>{fd(m.date)}</td><td>{num(m.km)}</td>
              <td>{workshops.find((w) => w.id === m.workshop_id)?.name ?? '—'}</td><td>{money(m.cost)}</td><td>{next}</td>
              <td style={{ whiteSpace: 'nowrap' }}>
                <button className="b2 sm" onClick={() => open((c) => <MaintForm id={m.id} onClose={c} />)}>Editar</button>{' '}
                <button className="b3 sm" onClick={() => {
                  if (!confirm('¿Eliminar mantenimiento?')) return;
                  guard(async () => { await removeStoredFiles(attachmentsOf(attachments, 'maintenance', m.id)); await remove('maintenance', m.id); });
                }}>✕</button>
              </td>
            </tr>
          );
        })}</tbody>
      </table></div>
      {el}
    </>
  );
}
