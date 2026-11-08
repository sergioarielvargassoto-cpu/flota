'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useData } from '@/lib/data';
import { STATUS_LABEL, worstStatus } from '@/lib/alerts';
import { Badge } from '@/components/Badge';
import { DriverForm } from '@/components/forms';
import { useModal } from '@/components/useModal';

export default function Choferes() {
  const { drivers, vehicles, documents, settings } = useData();
  const { el, open } = useModal();
  const [q, setQ] = useState('');
  const l = drivers.filter((d) => !q || `${d.name}${d.dni}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <>
      <div className="bar">
        <h2 style={{ margin: 0 }}>Choferes ({drivers.length})</h2>
        <span className="sp" />
        <input type="search" aria-label="Buscar chofer por nombre o DNI" placeholder="Nombre o DNI…" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="b1" onClick={() => open((c) => <DriverForm onClose={c} />)}>
          + Chofer
        </button>
      </div>
      {l.length ? (
        <div className="tw">
          <table>
            <caption className="sr-only">Choferes y estado de su documentación</caption>
            <thead>
              <tr>
                <th scope="col">Nombre</th>
                <th scope="col">DNI</th>
                <th scope="col">Teléfono</th>
                <th scope="col">Vehículo</th>
                <th scope="col">Documentación</th>
              </tr>
            </thead>
            <tbody>
              {l.map((d) => {
                const w = worstStatus(
                  documents.filter((x) => x.driver_id === d.id),
                  settings
                );
                return (
                  <tr key={d.id}>
                    <td>
                      <Link className="lk" href={`/choferes/${d.id}`}>
                        <b>{d.name}</b>
                      </Link>
                    </td>
                    <td>{d.dni}</td>
                    <td>{d.phone}</td>
                    <td>
                      {vehicles
                        .filter((v) => v.driver_id === d.id)
                        .map((v) => v.plate)
                        .join(', ') || '—'}
                    </td>
                    <td>{w ? <Badge status={w}>{STATUS_LABEL[w]}</Badge> : <Badge status="nd">Sin cargar</Badge>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="empty">
          {drivers.length
            ? 'Ningún chofer coincide con la búsqueda. Probá con otro nombre o DNI.'
            : 'Todavía no cargaste choferes. Usá «+ Chofer» para agregar el primero.'}
        </div>
      )}
      {el}
    </>
  );
}
