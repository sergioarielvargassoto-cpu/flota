'use client';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useData } from '@/lib/data';
import { fd, guard, money, num } from '@/lib/util';
import { MaintForm } from '@/components/forms';
import { useModal } from '@/components/useModal';
import { MaintenanceHistoryTimeline } from '@/components/HistoryTimeline';

export default function MaintenanceDetail() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { maintenance, vehicles, workshops, maintenance_history, remove, reload } = useData();
  const { el, open } = useModal();
  const maint = maintenance.find((m) => m.id === id);
  if (!maint) return <div style={{ padding: '20px' }}>Mantenimiento no encontrado</div>;
  const vehicle = vehicles.find((v) => v.id === maint.vehicle_id);
  const workshop = workshops.find((w) => w.id === maint.workshop_id);
  const history = maintenance_history.filter((h) => h.maintenance_id === maint.id);

  return (
    <>
      <div className="bar">
        <Link className="b2 sm" href={`/vehiculos/${vehicle?.id}`} style={{ padding: '8px 14px', borderRadius: 8, textDecoration: 'none', color: 'inherit' }}>‹ {vehicle?.plate}</Link>
        <h2 style={{ margin: 0 }}>{maint.type} {fd(maint.date)}</h2><span className="sp" />
        <button className="b1" onClick={() => open((c) => <MaintForm id={maint.id} onClose={c} />)}>Editar</button>
        <button onClick={() => { if (confirm('¿Eliminar este mantenimiento?')) guard(async () => { await remove('maintenance', maint.id); router.push(`/vehiculos/${vehicle?.id}`); }); }} style={{ padding: '8px 16px', backgroundColor: '#f44336', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Eliminar</button>
      </div>

      <div style={{ padding: '20px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
        <div style={{ padding: '16px', backgroundColor: '#f5f5f5', borderRadius: '8px' }}>
          <h3>Información</h3>
          <p><b>Vehículo:</b> {vehicle?.plate || '—'}</p>
          <p><b>Tipo:</b> {maint.type}</p>
          <p><b>Fecha realizado:</b> {fd(maint.date)}</p>
          <p><b>Taller:</b> {workshop?.name || '—'}</p>
          <p><b>Km realizado:</b> {num(maint.km)}</p>
          <p><b>Costo:</b> {money(maint.cost)}</p>
          <p><b>Próxima fecha:</b> {maint.next_date ? fd(maint.next_date) : '—'}</p>
          <p><b>Próximo a los:</b> {maint.next_km ? num(maint.next_km) + ' km' : '—'}</p>
          {maint.notes && <p><b>Notas:</b> {maint.notes}</p>}
        </div>
      </div>

      <MaintenanceHistoryTimeline history={history} />
      {el}
    </>
  );
}
