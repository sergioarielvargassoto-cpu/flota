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
  if (!repair)
    return (
      <div className="empty">
        Reparación no encontrada.{' '}
        <Link className="lk" href="/reparaciones">
          Volver a Reparaciones
        </Link>
      </div>
    );
  const vehicle = vehicles.find((v) => v.id === repair.vehicle_id);
  const workshop = workshops.find((w) => w.id === repair.workshop_id);
  const history = repair_history.filter((h) => h.repair_id === repair.id);

  // Estado → insignia de la paleta (igual que en la tabla de reparaciones)
  const statusBadge: Record<string, string> = { Pendiente: 'critico', 'En curso': 'urgente', Finalizada: 'ok' };

  return (
    <>
      <div className="bar">
        <Link
          className="b2 sm"
          href={`/vehiculos/${vehicle?.id}`}
          style={{ display: 'inline-flex', alignItems: 'center', textDecoration: 'none' }}
        >
          <span aria-hidden="true">‹</span> {vehicle?.plate}
        </Link>
        <h2 style={{ margin: 0 }}>Reparación {fd(repair.date)}</h2>
        <span className="sp" />
        <button className="b1" onClick={() => open((c) => <RepairForm id={repair.id} onClose={c} />)}>
          Editar
        </button>
        <button
          className="b3"
          onClick={() => {
            if (confirm('¿Eliminar esta reparación?'))
              guard(async () => {
                await remove('repairs', repair.id);
                router.push(`/vehiculos/${vehicle?.id}`);
              });
          }}
        >
          Eliminar
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
        <section className="card" aria-labelledby="rep-info">
          <h3 id="rep-info" style={{ marginTop: 0 }}>
            Información
          </h3>
          <p>
            <b>Vehículo:</b> {vehicle?.plate || '—'}
          </p>
          <p>
            <b>Fecha:</b> {fd(repair.date)}
          </p>
          <p>
            <b>Taller:</b> {workshop?.name || '—'}
          </p>
          <p>
            <b>Descripción:</b> {repair.description}
          </p>
          <p>
            <b>Km:</b> <span className="num">{num(repair.km)}</span>
          </p>
          <p>
            <b>Costo:</b> <span className="num">{money(repair.cost)}</span>
          </p>
          <p>
            <b>Factura/Remito:</b> {repair.invoice || '—'}
          </p>
          <p>
            <b>Estado:</b>{' '}
            <span className={'bd ' + (statusBadge[repair.status] ?? 'nd')}>{repair.status}</span>
          </p>
        </section>
      </div>

      <RepairHistoryTimeline history={history} />
      {el}
    </>
  );
}
