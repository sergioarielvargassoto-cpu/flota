'use client';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useData } from '@/lib/data';
import { guard } from '@/lib/util';
import { DocsTable } from '@/components/Tables';
import { DriverForm } from '@/components/forms';
import { removeStoredFiles } from '@/components/Attachments';
import { useModal } from '@/components/useModal';

export default function ChoferDetalle() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { drivers, vehicles, documents, attachments, remove, reload } = useData();
  const { el, open } = useModal();
  const d = drivers.find((x) => x.id === id);
  if (!d)
    return (
      <div className="empty">
        Chofer no encontrado.{' '}
        <Link className="lk" href="/choferes">
          Volver
        </Link>
      </div>
    );
  const vs = vehicles.filter((v) => v.driver_id === d.id);
  return (
    <>
      <div className="bar">
        <Link
          className="b2 sm"
          href="/choferes"
          style={{ padding: '8px 14px', borderRadius: 8, textDecoration: 'none', color: 'inherit' }}
        >
          ‹ Choferes
        </Link>
        <h2 style={{ margin: 0 }}>{d.name}</h2>
        <span className="sp" />
        <button className="b2" onClick={() => open((c) => <DriverForm id={d.id} onClose={c} />)}>
          Editar
        </button>
        <button
          className="b3"
          onClick={() => {
            if (!confirm('¿Eliminar chofer y sus vencimientos?')) return;
            guard(async () => {
              const ids = new Set(documents.filter((x) => x.driver_id === d.id).map((x) => x.id));
              await removeStoredFiles(attachments.filter((a) => a.document_id && ids.has(a.document_id)));
              await remove('drivers', d.id);
              await reload('documents', 'vehicles', 'attachments');
              router.push('/choferes');
            });
          }}
        >
          Eliminar
        </button>
      </div>
      <div className="info">
        <div>
          <span>DNI</span>
          {d.dni || '—'}
        </div>
        <div>
          <span>Teléfono</span>
          {d.phone || '—'}
        </div>
        <div>
          <span>Vehículos asignados</span>
          {vs.map((v) => v.plate).join(', ') || '—'}
        </div>
      </div>
      {d.notes && <p className="muted">{d.notes}</p>}
      <DocsTable owner={{ type: 'driver', id: d.id }} />
      {el}
    </>
  );
}
