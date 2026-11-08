'use client';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useData } from '@/lib/data';
import { InfractionForm } from '@/components/forms';
import { useModal } from '@/components/useModal';
import { AttachmentList } from '@/components/Attachments';

/** Estado de la infracción → insignia de la paleta (siempre con texto). */
const STATUS_BADGE: Record<string, string> = {
  Registrada: 'urgente',
  Pagada: 'ok',
  Anulada: 'nd',
};

export default function InfractionDetail() {
  // En Next 16 los params de página son una promesa: en un componente cliente se leen con useParams
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { infractions, fines, drivers, vehicles, remove } = useData();
  const { el, open } = useModal();
  const infraction = infractions.find((i) => i.id === id);

  if (!infraction)
    return (
      <div className="empty">
        Infracción no encontrada.{' '}
        <Link className="lk" href="/infracciones">
          Volver
        </Link>
      </div>
    );

  const driver = drivers.find((d) => d.id === infraction.driver_id);
  const vehicle = vehicles.find((v) => v.id === infraction.vehicle_id);
  const associatedFines = fines.filter((f) => f.infraction_id === infraction.id);

  const handleDelete = async () => {
    if (confirm('¿Eliminar esta infracción?')) {
      try {
        await remove('infractions', infraction.id);
        router.push('/infracciones');
      } catch (e) {
        alert(`Error: ${e instanceof Error ? e.message : 'Error al eliminar'}`);
      }
    }
  };

  return (
    <>
      <div className="bar">
        <Link
          className="b2 sm"
          href="/infracciones"
          style={{ display: 'inline-flex', alignItems: 'center', textDecoration: 'none' }}
        >
          <span aria-hidden="true">‹</span> Infracciones
        </Link>
        <h2 style={{ margin: 0 }}>Infracción {infraction.infraction_number && `#${infraction.infraction_number}`}</h2>
        <span className="sp" />
        <button className="b1" onClick={() => open((c) => <InfractionForm id={infraction.id} onClose={c} />)}>
          Editar
        </button>
        <button className="b3" onClick={handleDelete}>
          Eliminar
        </button>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: 16,
        }}
      >
        <section className="card" aria-labelledby="inf-gral">
          <h3 id="inf-gral" style={{ marginTop: 0 }}>
            Información general
          </h3>
          <p>
            <b>Conductor:</b> {driver?.name || '—'}
          </p>
          <p>
            <b>Vehículo:</b> {vehicle?.plate || '—'}
          </p>
          <p>
            <b>Fecha:</b> {infraction.date}
          </p>
          <p>
            <b>Tipo:</b> {infraction.type}
          </p>
          <p>
            <b>Lugar:</b> {infraction.location || '—'}
          </p>
          <p>
            <b>N° Infracción:</b> {infraction.infraction_number || '—'}
          </p>
          <p>
            <b>Estado:</b> <span className={'bd ' + (STATUS_BADGE[infraction.status] ?? 'nd')}>{infraction.status}</span>
          </p>
          <AttachmentList kind="infraction" id={infraction.id} editable={true} />
        </section>

        <section className="card" aria-labelledby="inf-multa">
          <h3 id="inf-multa" style={{ marginTop: 0 }}>
            Multa
          </h3>
          <p>
            <b>Monto:</b> <span className="num">{infraction.fine_amount ? `$${infraction.fine_amount.toFixed(2)}` : '—'}</span>
          </p>
          <h4>Detalles de pago</h4>
          {associatedFines.length ? (
            <div className="tw">
              <table>
                <caption className="sr-only">Pagos de la multa</caption>
                <thead>
                  <tr>
                    <th scope="col" className="r">
                      Monto
                    </th>
                    <th scope="col" className="r">
                      Pagado
                    </th>
                    <th scope="col">Fecha de pago</th>
                  </tr>
                </thead>
                <tbody>
                  {associatedFines.map((fine) => (
                    <tr key={fine.id}>
                      <td className="r">${fine.amount.toFixed(2)}</td>
                      <td className="r">{fine.paid_amount ? `$${fine.paid_amount.toFixed(2)}` : '—'}</td>
                      <td>{fine.paid_date || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="muted">Todavía no hay pagos registrados para esta multa.</p>
          )}
        </section>
      </div>

      {infraction.description && (
        <section className="card" style={{ marginTop: 16 }}>
          <h3 style={{ marginTop: 0 }}>Descripción</h3>
          <p style={{ marginBottom: 0 }}>{infraction.description}</p>
        </section>
      )}

      {infraction.notes && (
        <section className="card" style={{ marginTop: 16 }}>
          <h3 style={{ marginTop: 0 }}>Notas</h3>
          <p style={{ marginBottom: 0 }}>{infraction.notes}</p>
        </section>
      )}

      {el}
    </>
  );
}
