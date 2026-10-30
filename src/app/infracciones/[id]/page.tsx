'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useData } from '@/lib/data';
import { InfractionForm } from '@/components/forms';
import { useModal } from '@/components/useModal';
import { AttachmentList } from '@/components/Attachments';

export default function InfractionDetail({ params }: { params: { id: string } }) {
  const router = useRouter();
  const { infractions, fines, drivers, vehicles, remove } = useData();
  const { el, open } = useModal();
  const infraction = infractions.find((i) => i.id === params.id);

  if (!infraction) return <div style={{ padding: '20px' }}>Infracción no encontrada</div>;

  const driver = drivers.find((d) => d.id === infraction.driver_id);
  const vehicle = vehicles.find((v) => v.id === infraction.vehicle_id);
  const associatedFines = fines.filter((f) => f.infraction_id === infraction.id);

  const statusColor: Record<string, string> = {
    Registrada: '#ff9800',
    Pagada: '#4caf50',
    Anulada: '#999',
  };

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
        <h2 style={{ margin: 0 }}>Infracción {infraction.infraction_number && `#${infraction.infraction_number}`}</h2>
        <span className="sp" />
        <button className="b1" onClick={() => open((c) => <InfractionForm id={infraction.id} onClose={c} />)}>
          Editar
        </button>
        <button
          onClick={handleDelete}
          style={{
            padding: '8px 16px',
            backgroundColor: '#f44336',
            color: '#fff',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
          }}
        >
          Eliminar
        </button>
      </div>

      <div style={{ padding: '20px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
        <div style={{ padding: '16px', backgroundColor: '#f5f5f5', borderRadius: '8px' }}>
          <h3>Información General</h3>
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
            <b>Estado:</b>{' '}
            <span
              style={{
                padding: '4px 8px',
                borderRadius: '4px',
                backgroundColor: statusColor[infraction.status],
                color: '#fff',
              }}
            >
              {infraction.status}
            </span>
          </p>
          {<AttachmentList kind="infraction" id={infraction.id} editable={true} />}
        </div>

        <div style={{ padding: '16px', backgroundColor: '#f5f5f5', borderRadius: '8px' }}>
          <h3>Multa</h3>
          <p>
            <b>Monto:</b> {infraction.fine_amount ? `$${infraction.fine_amount.toFixed(2)}` : '—'}
          </p>
          <h4>Detalles de Pago</h4>
          {associatedFines.length ? (
            <table style={{ width: '100%', fontSize: '14px' }}>
              <tbody>
                {associatedFines.map((fine) => (
                  <tr key={fine.id}>
                    <td>
                      <b>Monto:</b> ${fine.amount.toFixed(2)}
                    </td>
                    <td>
                      <b>Pagado:</b> {fine.paid_amount ? `$${fine.paid_amount.toFixed(2)}` : '—'}
                    </td>
                    <td>
                      <b>Fecha pago:</b> {fine.paid_date || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p style={{ fontSize: '14px' }}>Sin detalles de multa registrados</p>
          )}
        </div>
      </div>

      {infraction.description && (
        <div style={{ padding: '20px', marginTop: '10px', backgroundColor: '#f5f5f5', borderRadius: '8px' }}>
          <h3>Descripción</h3>
          <p>{infraction.description}</p>
        </div>
      )}

      {infraction.notes && (
        <div style={{ padding: '20px', marginTop: '10px', backgroundColor: '#f5f5f5', borderRadius: '8px' }}>
          <h3>Notas</h3>
          <p>{infraction.notes}</p>
        </div>
      )}

      {el}
    </>
  );
}
