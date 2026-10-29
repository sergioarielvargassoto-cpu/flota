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

  const statusColor: Record<string, string> = {
    'Registrada': '#ff9800',
    'Pagada': '#4caf50',
    'Anulada': '#999',
  };

  return (
    <>
      <div className="bar">
        <h2 style={{ margin: 0 }}>Infracciones ({infractions.length})</h2><span className="sp" />
        <input placeholder="Buscar…" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="b1" onClick={() => open((c) => <InfractionForm onClose={c} />)}>+ Infracción</button>
      </div>
      {filtered.length ? (
        <div className="tw"><table>
          <thead>
            <tr>
              <th>Conductor</th><th>Vehículo</th><th>Fecha</th><th>Tipo</th><th>N° Infracción</th><th>Multa ($)</th><th>Estado</th>
            </tr>
          </thead>
          <tbody>{filtered.map((i) => {
            const d = getDriver(i.driver_id);
            const v = getVehicle(i.vehicle_id);
            return (
              <tr key={i.id}>
                <td><Link className="lk" href={`/infracciones/${i.id}`}><b>{d?.name || '—'}</b></Link></td>
                <td><Link className="lk" href={`/infracciones/${i.id}`}>{v?.plate || '—'}</Link></td>
                <td>{i.date}</td>
                <td>{i.type}</td>
                <td>{i.infraction_number || '—'}</td>
                <td>{i.fine_amount ? `$${i.fine_amount.toFixed(2)}` : '—'}</td>
                <td><span style={{ padding: '4px 8px', borderRadius: '4px', backgroundColor: statusColor[i.status], color: '#fff', fontSize: '12px' }}>{i.status}</span></td>
              </tr>
            );
          })}</tbody>
        </table></div>
      ) : <div className="empty">Todavía no hay infracciones. Tocá "+ Infracción".</div>}
      {el}
    </>
  );
}
