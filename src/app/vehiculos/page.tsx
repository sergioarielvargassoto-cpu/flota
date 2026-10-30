'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useData } from '@/lib/data';
import { STATUS_LABEL, worstStatus } from '@/lib/alerts';
import { num } from '@/lib/util';
import { Badge } from '@/components/Badge';
import { VehicleForm } from '@/components/forms';
import { useModal } from '@/components/useModal';

export default function Vehiculos() {
  const { vehicles, drivers, documents, settings } = useData();
  const { el, open } = useModal();
  const [q, setQ] = useState('');
  const l = vehicles.filter(
    (v) => !q || `${v.plate}${v.brand}${v.model}${v.type}`.toLowerCase().includes(q.toLowerCase())
  );
  return (
    <>
      <div className="bar">
        <h2 style={{ margin: 0 }}>Vehículos ({vehicles.length})</h2>
        <span className="sp" />
        <input placeholder="Buscar…" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="b1" onClick={() => open((c) => <VehicleForm onClose={c} />)}>
          + Vehículo
        </button>
      </div>
      {l.length ? (
        <div className="tw">
          <table>
            <thead>
              <tr>
                <th>Patente</th>
                <th>Tipo</th>
                <th>Marca / modelo</th>
                <th>Chofer</th>
                <th>Km</th>
                <th>Estado</th>
                <th>Documentación</th>
              </tr>
            </thead>
            <tbody>
              {l.map((v) => {
                const w = worstStatus(
                  documents.filter((d) => d.vehicle_id === v.id),
                  settings
                );
                return (
                  <tr key={v.id}>
                    <td>
                      <Link className="lk" href={`/vehiculos/${v.id}`}>
                        <b>{v.plate}</b>
                      </Link>
                    </td>
                    <td>{v.type}</td>
                    <td>
                      {v.brand} {v.model} {v.year}
                    </td>
                    <td>{drivers.find((d) => d.id === v.driver_id)?.name ?? '—'}</td>
                    <td>{num(v.km)}</td>
                    <td>{v.status}</td>
                    <td>{w ? <Badge status={w}>{STATUS_LABEL[w]}</Badge> : <Badge status="nd">Sin cargar</Badge>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="empty">Todavía no hay vehículos. Tocá “+ Vehículo”.</div>
      )}
      {el}
    </>
  );
}
