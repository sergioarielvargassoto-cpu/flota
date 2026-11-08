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
  if (!maint)
    return (
      <div className="empty">
        Mantenimiento no encontrado.{' '}
        <Link className="lk" href="/mantenimientos">
          Volver a Mantenimientos
        </Link>
      </div>
    );
  const vehicle = vehicles.find((v) => v.id === maint.vehicle_id);
  const workshop = workshops.find((w) => w.id === maint.workshop_id);
  const history = maintenance_history.filter((h) => h.maintenance_id === maint.id);

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
        <h2 style={{ margin: 0 }}>
          {maint.type} {fd(maint.date)}
        </h2>
        <span className="sp" />
        <button className="b1" onClick={() => open((c) => <MaintForm id={maint.id} onClose={c} />)}>
          Editar
        </button>
        <button
          className="b3"
          onClick={() => {
            if (confirm('¿Eliminar este mantenimiento?'))
              guard(async () => {
                await remove('maintenance', maint.id);
                router.push(`/vehiculos/${vehicle?.id}`);
              });
          }}
        >
          Eliminar
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
        <section className="card" aria-labelledby="mnt-info">
          <h3 id="mnt-info" style={{ marginTop: 0 }}>
            Información
          </h3>
          <p>
            <b>Vehículo:</b> {vehicle?.plate || '—'}
          </p>
          <p>
            <b>Tipo:</b> {maint.type}
          </p>
          <p>
            <b>Fecha realizado:</b> {fd(maint.date)}
          </p>
          <p>
            <b>Taller:</b> {workshop?.name || '—'}
          </p>
          <p>
            <b>Km realizado:</b> <span className="num">{num(maint.km)}</span>
          </p>
          <p>
            <b>Costo:</b> <span className="num">{money(maint.cost)}</span>
          </p>
          <p>
            <b>Próxima fecha:</b> {maint.next_date ? fd(maint.next_date) : '—'}
          </p>
          <p>
            <b>Próximo a los:</b> {maint.next_km ? num(maint.next_km) + ' km' : '—'}
          </p>
          {maint.notes && (
            <p>
              <b>Notas:</b> {maint.notes}
            </p>
          )}
        </section>
      </div>

      <MaintenanceHistoryTimeline history={history} />
      {el}
    </>
  );
}
