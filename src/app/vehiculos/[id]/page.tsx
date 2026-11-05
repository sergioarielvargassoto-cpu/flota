'use client';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useData } from '@/lib/data';
import { fd, guard, money, num, todayStr } from '@/lib/util';
import { DocsTable, MaintTable, RepairsTable } from '@/components/Tables';
import { DocForm, MaintForm, RepairForm, VehicleForm, KmUpdateForm } from '@/components/forms';
import { FormModal } from '@/components/FormModal';
import { uploadFiles } from '@/components/Attachments';
import type { Doc } from '@/lib/types';
import { bajaLine, exportLegajo, parseBaja, vehicleHistory, withBaja, withoutBaja } from '@/lib/archive';
import { useModal } from '@/components/useModal';
import { KmTimeline } from '@/components/HistoryTimeline';

/** Documento del vehículo donde se guardan las fotos y el formulario 08 de la baja (uno por vehículo). */
const BAJA_DOC = 'Baja / Formulario 08 y fotos';

export default function VehiculoDetalle() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const {
    vehicles,
    drivers,
    repairs,
    maintenance,
    documents,
    attachments,
    km_history,
    km_reports,
    fuel_loads,
    trips,
    infractions,
    fines,
    workshops,
    settings,
    update,
    insert,
    remove,
    reload,
  } = useData();
  const { el, open } = useModal();
  const v = vehicles.find((x) => x.id === id);
  if (!v)
    return (
      <div className="empty">
        Vehículo no encontrado.{' '}
        <Link className="lk" href="/vehiculos">
          Volver
        </Link>
      </div>
    );
  const d = drivers.find((x) => x.id === v.driver_id);
  const rs = repairs.filter((r) => r.vehicle_id === v.id);
  const ms = maintenance.filter((m) => m.vehicle_id === v.id);
  const hist = vehicleHistory(v.id, { drivers, documents, repairs, maintenance, fuel_loads, trips, km_history, km_reports, infractions, fines, attachments, workshops });
  const baja = parseBaja(v.notes);
  const bajaDoc = documents.find((x) => x.vehicle_id === v.id && (x.doc_type as string) === BAJA_DOC);
  const total = rs.reduce((s, r) => s + (r.cost ?? 0), 0) + ms.reduce((s, m) => s + (m.cost ?? 0), 0);

  return (
    <>
      <div className="bar">
        <Link
          className="b2 sm"
          href="/vehiculos"
          style={{ padding: '8px 14px', borderRadius: 8, textDecoration: 'none', color: 'inherit' }}
        >
          ‹ Vehículos
        </Link>
        <h2 style={{ margin: 0 }}>
          {v.plate}{' '}
          <span className="muted" style={{ fontSize: 14 }}>
            {v.brand} {v.model}
          </span>
        </h2>
        <span className="sp" />
        <button className="b2" onClick={() => open((c) => <VehicleForm id={v.id} onClose={c} />)}>
          Editar
        </button>
        <button
          className="b2"
          onClick={() =>
            exportLegajo(v, { drivers, documents, repairs, maintenance, fuel_loads, trips, km_history, km_reports, infractions, fines, attachments, workshops })
          }
        >
          📄 Exportar legajo (Excel)
        </button>
        {v.status === 'Baja' ? (
          <button
            className="b2"
            onClick={() =>
              guard(async () => {
                if (!confirm(`¿Reactivar ${v.plate}? Volverá a aparecer en el listado y en los controles.`)) return;
                await update('vehicles', v.id, { status: 'Activo', notes: withoutBaja(v.notes, todayStr()) });
              })
            }
          >
            Reactivar
          </button>
        ) : (
          <button
            className="b3"
            onClick={() =>
              open((c) => (
                <FormModal
                  title={`Dar de baja ${v.plate}`}
                  onClose={c}
                  initial={{ date: todayStr(), reason: 'Venta' }}
                  files={{ kind: 'document', id: bajaDoc?.id }}
                  fields={[
                    { k: 'date', l: 'Fecha de baja', t: 'date', req: true, half: true },
                    { k: 'reason', l: 'Motivo', t: 'combo', req: true, half: true, options: ['Venta', 'Siniestro / destrucción total', 'Robo', 'Fin de contrato / devolución', 'Otro'] },
                    { k: 'detail', l: 'Detalle (comprador, n° de denuncia, etc.)', t: 'textarea' },
                  ]}
                  onSave={async (vals, files) => {
                    await update('vehicles', v.id, {
                      status: 'Baja',
                      notes: withBaja(v.notes, bajaLine(String(vals.date), String(vals.reason), String(vals.detail ?? ''))),
                    });
                    // Fotos / Formulario 08 / denuncia: se guardan como documento del vehículo con sus archivos adjuntos
                    const payload = { reference: `Baja ${fd(String(vals.date))} · ${vals.reason}`, notes: vals.detail ? String(vals.detail) : null };
                    let docId = bajaDoc?.id;
                    if (docId) await update('documents', docId, payload);
                    else docId = (await insert<Doc>('documents', { vehicle_id: v.id, doc_type: BAJA_DOC, expires_on: null, ...payload })).id;
                    if (files.length) {
                      await uploadFiles('document', docId, files);
                      await reload('attachments');
                    }
                  }}
                />
              ))
            }
          >
            Dar de baja
          </button>
        )}
        {hist.total === 0 && (
          <button
            className="b3"
            title="Solo disponible si el vehículo no tiene ningún registro (por ejemplo, se creó por error)"
            onClick={() => {
              if (!confirm(`¿Eliminar definitivamente ${v.plate}? No tiene ningún registro asociado.`)) return;
              guard(async () => {
                await remove('vehicles', v.id);
                await reload();
                router.push('/vehiculos');
              });
            }}
          >
            Eliminar (creado por error)
          </button>
        )}
      </div>
      {v.status === 'Baja' && (
        <div role="status" style={{ background: '#f4f3ef', border: '1px solid #d9d6cc', borderRadius: 8, padding: 12, margin: '0 0 12px', fontSize: 14 }}>
          <b>🗄 Vehículo dado de baja{baja ? ` el ${fd(baja.date)}` : ''}.</b> {baja?.text}
          <br />
          <span className="muted">
            Su historial completo (documentos, mantenimientos, reparaciones, combustible, recorridos, multas y archivos adjuntos) se conserva para
            estadísticas y respaldo legal. Podés bajarlo con “Exportar legajo”.
          </span>
          <div style={{ marginTop: 8 }}>
            <button
              className="b2 sm"
              onClick={() => open((c) => <DocForm owner={{ type: 'vehicle', id: v.id }} docId={bajaDoc?.id} onClose={c} />)}
            >
              📎 {bajaDoc ? 'Agregar fotos / Formulario 08' : 'Cargar fotos / Formulario 08'}
            </button>
          </div>
        </div>
      )}
      <div className="info">
        <div>
          <span>Tipo</span>
          {v.type || '—'}
        </div>
        <div>
          <span>Año</span>
          {v.year || '—'}
        </div>
        <div>
          <span>Kilometraje{v.km_date ? ` (al ${fd(v.km_date)})` : ''}</span>
          {num(v.km)} km{' '}
          <button className="b2 sm" onClick={() => open((c) => <KmUpdateForm vehicle={v} onClose={c} />)}>
            actualizar
          </button>
        </div>
        <div>
          <span>Chofer</span>
          {d ? (
            <Link className="lk" href={`/choferes/${d.id}`}>
              {d.name}
            </Link>
          ) : (
            '—'
          )}
        </div>
        <div>
          <span>Estado</span>
          {v.status}
        </div>
        <div>
          <span>Chasis/motor</span>
          {v.chassis || '—'}
        </div>
        <div>
          <span>Tarjeta YPF en Ruta</span>
          {v.fuel_card || '—'}
        </div>
        <div>
          <span>Próximo service</span>
          {v.last_service_km !== null
            ? num(v.last_service_km + settings.service_km) + ' km'
            : 'cargar km del último service'}
          {v.last_service_km !== null && v.km !== null && v.km > v.last_service_km + settings.service_km && (
            <small className="muted" style={{ display: 'block' }}>
              Vencido: se da por hecho recién al cargar el service en Mantenimientos.
            </small>
          )}
        </div>
        <div>
          <span>Gasto total registrado</span>
          {money(total)}
        </div>
      </div>
      {v.notes && <p className="muted">{v.notes}</p>}
      <KmTimeline history={km_history.filter((k) => k.vehicle_id === v.id)} />

      <DocsTable owner={{ type: 'vehicle', id: v.id }} />
      <div className="bar" style={{ marginTop: 20 }}>
        <h3 style={{ margin: 0 }}>Mantenimientos</h3>
        <span className="sp" />
        <button className="b1" onClick={() => open((c) => <MaintForm vehicleId={v.id} onClose={c} />)}>
          + Mantenimiento
        </button>
      </div>
      <MaintTable list={ms} showVehicle={false} />
      <div className="bar" style={{ marginTop: 20 }}>
        <h3 style={{ margin: 0 }}>Reparaciones</h3>
        <span className="sp" />
        <button className="b1" onClick={() => open((c) => <RepairForm vehicleId={v.id} onClose={c} />)}>
          + Reparación
        </button>
      </div>
      <RepairsTable list={rs} showVehicle={false} />
      {el}
    </>
  );
}
