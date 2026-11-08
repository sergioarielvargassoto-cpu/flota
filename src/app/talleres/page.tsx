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
            <caption className="sr-only">Talleres, trabajos realizados y gasto total en cada uno</caption>
            <thead>
              <tr>
                <th scope="col">Taller</th>
                <th scope="col">Contacto</th>
                <th scope="col">Especialidad</th>
                <th scope="col" className="r">
                  Trabajos
                </th>
                <th scope="col" className="r">
                  Gastado
                </th>
                <th scope="col">
                  <span className="sr-only">Acciones</span>
                </th>
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
                    <td className="r">{rs.length + ms.length}</td>
                    <td className="r">{money(t)}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <button className="b2 sm" onClick={() => open((c) => <WorkshopForm id={w.id} onClose={c} />)}>
                        Editar
                      </button>{' '}
                      <button
                        className="b3 sm"
                        aria-label={`Eliminar taller ${w.name}`}
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
        <div className="empty">
          Todavía no cargaste talleres. Usá «+ Taller» para agregar los de confianza y asociarlos a reparaciones y
          mantenimientos.
        </div>
      )}
      {el}
    </>
  );
}
