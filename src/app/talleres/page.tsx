'use client';
import { useData } from '@/lib/data';
import { guard, money } from '@/lib/util';
import { WorkshopForm } from '@/components/forms';
import { useModal } from '@/components/useModal';

export default function Talleres() {
  const { workshops, repairs, maintenance, remove, reload } = useData();
  const { el, open } = useModal();
  return (
    <>
      <div className="bar">
        <h2 style={{ margin: 0 }}>Talleres</h2>
        <span className="sp" />
        <button className="b1" onClick={() => open((c) => <WorkshopForm onClose={c} />)}>
          + Taller
        </button>
      </div>
      {workshops.length ? (
        <div className="tw">
          <table>
            <thead>
              <tr>
                <th>Taller</th>
                <th>Contacto</th>
                <th>Especialidad</th>
                <th>Trabajos</th>
                <th>Gastado</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {workshops.map((w) => {
                const rs = repairs.filter((r) => r.workshop_id === w.id),
                  ms = maintenance.filter((m) => m.workshop_id === w.id);
                const t = [...rs, ...ms].reduce((s, r) => s + (r.cost ?? 0), 0);
                return (
                  <tr key={w.id}>
                    <td>
                      <b>{w.name}</b>
                      <div className="muted">{w.address}</div>
                    </td>
                    <td>{w.phone}</td>
                    <td>{w.specialty}</td>
                    <td>{rs.length + ms.length}</td>
                    <td>{money(t)}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <button className="b2 sm" onClick={() => open((c) => <WorkshopForm id={w.id} onClose={c} />)}>
                        Editar
                      </button>{' '}
                      <button
                        className="b3 sm"
                        onClick={() => {
                          if (confirm('¿Eliminar taller? Los registros históricos quedan sin taller.'))
                            guard(async () => {
                              await remove('workshops', w.id);
                              await reload('repairs', 'maintenance');
                            });
                        }}
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="empty">Cargá tus talleres de confianza para asociarlos a reparaciones y mantenimientos.</div>
      )}
      {el}
    </>
  );
}
