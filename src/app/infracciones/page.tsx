'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useData } from '@/lib/data';
import { InfractionForm } from '@/components/forms';
import { useModal } from '@/components/useModal';

export default function Infracciones() {
  const { infractions, drivers, vehicles } = useData();
  const { el, open } = useModal();
  const [q, setQ] = useState('');

  const getDriver = (id: string) => drivers.find((d) => d.id === id);
  const getVehicle = (id: string) => vehicles.find((v) => v.id === id);

  const filtered = infractions.filter((i) => {
    const d = getDriver(i.driver_id);
    const v = getVehicle(i.vehicle_id);
    const text = `${d?.name || ''} ${v?.plate || ''} ${i.type} ${i.infraction_number || ''}`.toLowerCase();
    return !q || text.includes(q.toLowerCase());
  });

  // Estado → insignia de la paleta (siempre con texto)
  const statusBadge: Record<string, string> = {
    Registrada: 'urgente',
    Pagada: 'ok',
    Anulada: 'nd',
  };

  return (
    <>
      <div className="bar">
        <h2 style={{ margin: 0 }}>Infracciones ({infractions.length})</h2>
        <span className="sp" />
        <input
          type="search"
          aria-label="Buscar infracción por conductor, patente, tipo o número"
          placeholder="Conductor, patente, tipo o N°…"
          value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="b1" onClick={() => open((c) => <InfractionForm onClose={c} />)}>
          + Infracción
        </button>
      </div>
      {filtered.length ? (
        <div className="tw">
          <table>
            <caption className="sr-only">Infracciones registradas</caption>
            <thead>
              <tr>
                <th scope="col">Conductor</th>
                <th scope="col">Vehículo</th>
                <th scope="col">Fecha</th>
                <th scope="col">Tipo</th>
                <th scope="col">N° Infracción</th>
                <th scope="col" className="r">
                  Multa ($)
                </th>
                <th scope="col">Estado</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((i) => {
                const d = getDriver(i.driver_id);
                const v = getVehicle(i.vehicle_id);
                return (
                  <tr key={i.id}>
                    <td>
                      <Link className="lk" href={`/infracciones/${i.id}`}>
                        <b>{d?.name || '—'}</b>
                      </Link>
                    </td>
                    <td>
                      <Link className="lk" href={`/infracciones/${i.id}`}>
                        {v?.plate || '—'}
                      </Link>
                    </td>
                    <td>{i.date}</td>
                    <td>{i.type}</td>
                    <td>{i.infraction_number || '—'}</td>
                    <td className="r">{i.fine_amount ? `$${i.fine_amount.toFixed(2)}` : '—'}</td>
                    <td>
                      <span className={'bd ' + (statusBadge[i.status] ?? 'nd')}>{i.status}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="empty">
          {infractions.length
            ? 'Ninguna infracción coincide con la búsqueda. Probá con otro conductor, patente o número.'
            : 'Todavía no cargaste infracciones. Usá «+ Infracción» para registrar la primera.'}
        </div>
      )}
      {el}
    </>
  );
}
