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
  const [showBaja, setShowBaja] = useState(false);
  const bajas = vehicles.filter((v) => v.status === 'Baja').length;
  const l = vehicles
    .filter((v) => showBaja || v.status !== 'Baja')
    .filter(
    (v) => !q || `${v.plate}${v.brand}${v.model}${v.type}`.toLowerCase().includes(q.toLowerCase())
  );
  return (
    <>
      <div className="bar">
        <h2 style={{ margin: 0 }}>Vehículos ({vehicles.length - bajas})</h2>
        <span className="sp" />
        {bajas > 0 && (
          <label style={{ fontSize: 13 }}>
            <input type="checkbox" checked={showBaja} onChange={(e) => setShowBaja(e.target.checked)} /> Ver archivo de bajas ({bajas})
          </label>
        )}
        <input
          type="search"
          aria-label="Buscar vehículo"
          placeholder="Patente, marca o modelo…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <button className="b1" onClick={() => open((c) => <VehicleForm onClose={c} />)}>
          + Vehículo
        </button>
      </div>
      {l.length ? (
        <div className="tw">
          <table>
            <caption className="sr-only">Vehículos de la flota, de la patente más nueva a la más vieja</caption>
            <thead>
              <tr>
                <th scope="col">Patente</th>
                <th scope="col">Tipo</th>
                <th scope="col">Marca / modelo</th>
                <th scope="col">Chofer</th>
                <th scope="col" className="r">
                  Km
                </th>
                <th scope="col">Estado</th>
                <th scope="col">Documentación</th>
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
                    <td className="r">{num(v.km)}</td>
                    <td>{v.status}</td>
                    <td>{w ? <Badge status={w}>{STATUS_LABEL[w]}</Badge> : <Badge status="nd">Sin cargar</Badge>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="empty">
          {vehicles.length
            ? 'Ningún vehículo coincide con la búsqueda. Probá con otra patente, marca o modelo.'
            : 'Todavía no cargaste vehículos. Usá «+ Vehículo» para agregar el primero.'}
        </div>
      )}
      {el}
    </>
  );
}
