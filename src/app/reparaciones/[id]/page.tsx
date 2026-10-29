'use client';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useData } from '@/lib/data';
import { fd, guard, money, num, todayStr } from '@/lib/util';
import { RepairForm } from '@/components/forms';
import { useModal } from '@/components/useModal';
import { RepairHistoryTimeline } from '@/components/HistoryTimeline';

export default function RepairDetail() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { repairs, vehicles, workshops, repair_history, remove, reload } = useData();
  const { el, open } = useModal();
  const repair = repairs.find((r) => r.id === id);
  if (!repair) return <div style={{ padding: '20px' }}>Reparación no encontrada</div>;
  const vehicle = vehicles.find((v) => v.id === repair.vehicle_id);
  const workshop = workshops.find((w) => w.id === repair.workshop_id);
  const history = repair_history.filter((h) => h.repair_id === repair.id);

  const statusColor: Record<string, string> = { 'Pendiente': '#ff9800', 'En curso': '#2196f3', 'Finalizada': '#4caf50' };

  return (
    <>
      <div className="bar">
        <Link className="b2 sm" href={`/vehiculos/${vehicle?.id}`} style={{ padding: '8px 14px', borderRadius: 8, textDecoration: 'none', color: 'inherit' }}>‹ {vehicle?.plate}</Link>
        <h2 style={{ margin: 0 }}>Reparación {fd(repair.date)}</h2><span className="sp" />
        <button className="b1" onClick={() => open((c) => <RepairForm id={repair.id} onClose={c} />)}>Editar</button>
        <button onClick={() => { if (confirm('¿Eliminar esta reparación?')) guard(async () => { await remove('repairs', repair.id); router.push(`/vehiculos/${vehicle?.id}`); }); }} style={{ padding: '8px 16px', backgroundColor: '#f44336', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Eliminar</button>
      </div>

      <div style={{ padding: '20px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
        <div style={{ padding: '16px', backgroundColor: '#f5f5f5', borderRadius: '8px' }}>
          <h3>Información</h3>
          <p><b>Vehículo:</b> {vehicle?.plate || '—'}</p>
          <p><b>Fecha:</b> {fd(repair.date)}</p>
          <p><b>Taller:</b> {workshop?.name || '—'}</p>
          <p><b>Descripción:</b> {repair.description}</p>
          <p><b>Km:</b> {num(repair.km)}</p>
          <p><b>Costo:</b> {money(repair.cost)}</p>
          <p><b>Factura/Remito:</b> {repair.invoice || '—'}</p>
          <p><b>Estado:</b> <span style={{ padding: '4px 8px', borderRadius: '4px', backgroundColor: statusColor[repair.status], color: '#fff' }}>{repair.status}</span></p>
        </div>
      </div>

      <RepairHistoryTimeline history={history} />
      {el}
    </>
  );
}
