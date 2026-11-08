'use client';
import Link from 'next/link';
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
        <h3 style={{ margin: 0 }}>{owner.type === 'vehicle' ? 'Vencimientos' : 'Documentación del chofer'}</h3>
        <span className="sp" />
        <button className="b1" onClick={() => open((c) => <DocForm owner={owner} onClose={c} />)}>
          {owner.type === 'vehicle' ? '+ Vencimiento' : '+ Vencimiento (LINTI, licencia…)'}
        </button>
      </div>
      {list.length === 0 ? (
        <div className="empty">
          Todavía no hay vencimientos cargados. Usá «
          {owner.type === 'vehicle' ? '+ Vencimiento' : '+ Vencimiento (LINTI, licencia…)'}» para agregar el primero.
        </div>
      ) : (
        <div className="tw">
          <table>
            <caption className="sr-only">
              {owner.type === 'vehicle' ? 'Vencimientos del vehículo' : 'Documentación del chofer'}
            </caption>
            <thead>
              <tr>
                <th scope="col">Documento</th>
                <th scope="col">Vence</th>
                <th scope="col">Estado</th>
                <th scope="col">Ref.</th>
                <th scope="col">Copias</th>
                <th scope="col">
                  <span className="sr-only">Acciones</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {list.map((d) => {
                const days = daysTo(d.expires_on);
                return (
                  <tr key={d.id}>
                    <td>{d.doc_type}</td>
                    <td>{fd(d.expires_on)}</td>
                    <td>
                      <Badge status={statusOf(days, settings)}>{daysText(days)}</Badge>
                    </td>
                    <td>{d.reference}</td>
                    <td>
                      <AttachmentList kind="document" id={d.id} />
                    </td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <button
                        className="b2 sm"
                        onClick={() => {
                          const n = prompt(
                            `Nueva fecha de vencimiento de "${d.doc_type}" (AAAA-MM-DD):`,
                            d.expires_on ?? ''
                          );
                          if (n === null) return;
                          if (!/^\d{4}-\d{2}-\d{2}$/.test(n)) return alert('Formato: AAAA-MM-DD');
                          guard(() => update('documents', d.id, { expires_on: n }));
                        }}
                      >
                        Renovar
                      </button>{' '}
                      <button
                        className="b2 sm"
                        onClick={() => open((c) => <DocForm owner={owner} docId={d.id} onClose={c} />)}
                      >
                        Editar
                      </button>{' '}
                      <button
                        className="b3 sm"
                        aria-label={`Eliminar vencimiento ${d.doc_type}`}
                        onClick={() => {
                          if (!confirm('¿Eliminar este vencimiento?')) return;
                          guard(async () => {
                            await removeStoredFiles(attachmentsOf(attachments, 'document', d.id));
                            await remove('documents', d.id);
                          });
                        }}
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {el}
    </>
  );
}

export function RepairsTable({ list, showVehicle }: { list: Repair[]; showVehicle: boolean }) {
  const { vehicles, workshops, attachments, remove } = useData();
  const { el, open } = useModal();
  if (!list.length)
    return <div className="empty">Todavía no hay reparaciones registradas. Usá «+ Reparación» para cargar la primera.</div>;
  const sc = { Pendiente: 'critico', 'En curso': 'urgente', Finalizada: 'ok' } as const;
  return (
    <>
      <div className="tw">
        <table>
          <caption className="sr-only">Reparaciones, de la más reciente a la más antigua</caption>
          <thead>
            <tr>
              {showVehicle && <th scope="col">Vehículo</th>}
              <th scope="col">Fecha</th>
              <th scope="col">Descripción</th>
              <th scope="col">Taller</th>
              <th scope="col" className="r">
                Km
              </th>
              <th scope="col" className="r">
                Costo
              </th>
              <th scope="col">Estado</th>
              <th scope="col">
                <span className="sr-only">Acciones</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {[...list]
              .sort((a, b) => b.date.localeCompare(a.date))
              .map((r) => (
                <tr key={r.id}>
                  {showVehicle && <td>{vehicles.find((v) => v.id === r.vehicle_id)?.plate ?? '—'}</td>}
                  <td>
                    <Link className="lk" href={`/reparaciones/${r.id}`}>
                      {fd(r.date)}
                    </Link>
                  </td>
                  <td>
                    <Link className="lk" href={`/reparaciones/${r.id}`}>
                      {r.description}
                    </Link>{' '}
                    <AttachmentList kind="repair" id={r.id} />
                    {r.invoice && <div className="muted">Fact. {r.invoice}</div>}
                  </td>
                  <td>{workshops.find((w) => w.id === r.workshop_id)?.name ?? '—'}</td>
                  <td className="r">{num(r.km)}</td>
                  <td className="r">{money(r.cost)}</td>
                  <td>
                    <Badge status={sc[r.status]}>{r.status}</Badge>
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <button className="b2 sm" onClick={() => open((c) => <RepairForm id={r.id} onClose={c} />)}>
                      Editar
                    </button>{' '}
                    <button
                      className="b3 sm"
                      aria-label={`Eliminar reparación del ${fd(r.date)}`}
                      onClick={() => {
                        if (!confirm('¿Eliminar reparación?')) return;
                        guard(async () => {
                          await removeStoredFiles(attachmentsOf(attachments, 'repair', r.id));
                          await remove('repairs', r.id);
                        });
                      }}
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      {el}
    </>
  );
}

export function MaintTable({ list, showVehicle }: { list: Maint[]; showVehicle: boolean }) {
  const { vehicles, workshops, attachments, remove } = useData();
  const { el, open } = useModal();
  if (!list.length)
    return (
      <div className="empty">Todavía no hay mantenimientos registrados. Usá «+ Mantenimiento» para cargar el primero.</div>
    );
  return (
    <>
      <div className="tw">
        <table>
          <caption className="sr-only">Mantenimientos, del más reciente al más antiguo</caption>
          <thead>
            <tr>
              {showVehicle && <th scope="col">Vehículo</th>}
              <th scope="col">Tipo</th>
              <th scope="col">Realizado</th>
              <th scope="col" className="r">
                Km
              </th>
              <th scope="col">Taller</th>
              <th scope="col" className="r">
                Costo
              </th>
              <th scope="col">Próximo</th>
              <th scope="col">
                <span className="sr-only">Acciones</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {[...list]
              .sort((a, b) => b.date.localeCompare(a.date))
              .map((m) => {
                const next =
                  [m.next_date ? fd(m.next_date) : '', m.next_km !== null ? num(m.next_km) + ' km' : '']
                    .filter(Boolean)
                    .join(' / ') || '—';
                return (
                  <tr key={m.id}>
                    {showVehicle && <td>{vehicles.find((v) => v.id === m.vehicle_id)?.plate ?? '—'}</td>}
                    <td>
                      <Link className="lk" href={`/mantenimientos/${m.id}`}>
                        {m.type}
                      </Link>{' '}
                      <AttachmentList kind="maintenance" id={m.id} />
                    </td>
                    <td>
                      <Link className="lk" href={`/mantenimientos/${m.id}`}>
                        {fd(m.date)}
                      </Link>
                    </td>
                    <td className="r">{num(m.km)}</td>
                    <td>{workshops.find((w) => w.id === m.workshop_id)?.name ?? '—'}</td>
                    <td className="r">{money(m.cost)}</td>
                    <td>{next}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <button className="b2 sm" onClick={() => open((c) => <MaintForm id={m.id} onClose={c} />)}>
                        Editar
                      </button>{' '}
                      <button
                        className="b3 sm"
                        aria-label={`Eliminar mantenimiento ${m.type} del ${fd(m.date)}`}
                        onClick={() => {
                          if (!confirm('¿Eliminar mantenimiento?')) return;
                          guard(async () => {
                            await removeStoredFiles(attachmentsOf(attachments, 'maintenance', m.id));
                            await remove('maintenance', m.id);
                          });
                        }}
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>
      {el}
    </>
  );
}
