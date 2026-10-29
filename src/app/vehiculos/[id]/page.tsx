'use client';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useData } from '@/lib/data';
import { fd, guard, money, num, todayStr } from '@/lib/util';
import { DocsTable, MaintTable, RepairsTable } from '@/components/Tables';
import { MaintForm, RepairForm, VehicleForm } from '@/components/forms';
import { removeStoredFiles } from '@/components/Attachments';
import { useModal } from '@/components/useModal';
import { KmTimeline } from '@/components/HistoryTimeline';

export default function VehiculoDetalle() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { vehicles, drivers, repairs, maintenance, documents, attachments, km_history, settings, update, remove, reload } = useData();
  const { el, open } = useModal();
  const v = vehicles.find((x) => x.id === id);
  if (!v) return <div className="empty">Vehículo no encontrado. <Link className="lk" href="/vehiculos">Volver</Link></div>;
  const d = drivers.find((x) => x.id === v.driver_id);
  const rs = repairs.filter((r) => r.vehicle_id === v.id);
  const ms = maintenance.filter((m) => m.vehicle_id === v.id);
  const total = rs.reduce((s, r) => s + (r.cost ?? 0), 0) + ms.reduce((s, m) => s + (m.cost ?? 0), 0);

  return (
    <>
      <div className="bar">
        <Link className="b2 sm" href="/vehiculos" style={{ padding: '8px 14px', borderRadius: 8, textDecoration: 'none', color: 'inherit' }}>‹ Vehículos</Link>
        <h2 style={{ margin: 0 }}>{v.plate} <span className="muted" style={{ fontSize: 14 }}>{v.brand} {v.model}</span></h2><span className="sp" />
        <button className="b2" onClick={() => open((c) => <VehicleForm id={v.id} onClose={c} />)}>Editar</button>
        <button className="b3" onClick={() => {
          if (!confirm(`¿Eliminar ${v.plate} y todos sus vencimientos, reparaciones, mantenimientos, cargas y recorridos?`)) return;
          guard(async () => {
            const docIds = new Set(documents.filter((x) => x.vehicle_id === v.id).map((x) => x.id));
            const repIds = new Set(rs.map((x) => x.id)); const manIds = new Set(ms.map((x) => x.id));
            await removeStoredFiles(attachments.filter((a) => (a.document_id && docIds.has(a.document_id)) || (a.repair_id && repIds.has(a.repair_id)) || (a.maintenance_id && manIds.has(a.maintenance_id))));
            await remove('vehicles', v.id);
            await reload();
            router.push('/vehiculos');
          });
        }}>Eliminar</button>
      </div>
      <div className="info">
        <div><span>Tipo</span>{v.type || '—'}</div>
        <div><span>Año</span>{v.year || '—'}</div>
        <div><span>Kilometraje{v.km_date ? ` (al ${fd(v.km_date)})` : ''}</span>{num(v.km)} km{' '}
          <button className="b2 sm" onClick={() => {
            const n = prompt(`Kilometraje actual de ${v.plate}:`, v.km?.toString() ?? '');
            if (n === null) return;
            if (n === '' || isNaN(Number(n))) return alert('Número inválido');
            guard(() => update('vehicles', v.id, { km: Number(n), km_date: todayStr() }));
          }}>actualizar</button></div>
        <div><span>Chofer</span>{d ? <Link className="lk" href={`/choferes/${d.id}`}>{d.name}</Link> : '—'}</div>
        <div><span>Estado</span>{v.status}</div>
        <div><span>Chasis/motor</span>{v.chassis || '—'}</div>
        <div><span>Tarjeta YPF en Ruta</span>{v.fuel_card || '—'}</div>
        <div><span>Próximo service</span>{v.last_service_km !== null ? num(v.last_service_km + settings.service_km) + ' km' : 'cargar km del último service'}</div>
        <div><span>Gasto total registrado</span>{money(total)}</div>
      </div>
      {v.notes && <p className="muted">{v.notes}</p>}
      <KmTimeline history={km_history.filter((k) => k.vehicle_id === v.id)} />

      <DocsTable owner={{ type: 'vehicle', id: v.id }} />
      <div className="bar" style={{ marginTop: 20 }}><h3 style={{ margin: 0 }}>Mantenimientos</h3><span className="sp" />
        <button className="b1" onClick={() => open((c) => <MaintForm vehicleId={v.id} onClose={c} />)}>+ Mantenimiento</button></div>
      <MaintTable list={ms} showVehicle={false} />
      <div className="bar" style={{ marginTop: 20 }}><h3 style={{ margin: 0 }}>Reparaciones</h3><span className="sp" />
        <button className="b1" onClick={() => open((c) => <RepairForm vehicleId={v.id} onClose={c} />)}>+ Reparación</button></div>
      <RepairsTable list={rs} showVehicle={false} />
      {el}
    </>
  );
}
