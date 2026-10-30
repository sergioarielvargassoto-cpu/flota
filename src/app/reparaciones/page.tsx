'use client';
import { useState } from 'react';
import { useData } from '@/lib/data';
import { money } from '@/lib/util';
import { RepairsTable } from '@/components/Tables';
import { RepairForm } from '@/components/forms';
import { useModal } from '@/components/useModal';

export default function Reparaciones() {
  const { repairs, vehicles } = useData();
  const { el, open } = useModal();
  const [fv, setFv] = useState('');
  const l = repairs.filter((r) => !fv || r.vehicle_id === fv);
  const total = l.reduce((s, r) => s + (r.cost ?? 0), 0);
  return (
    <>
      <div className="bar">
        <h2 style={{ margin: 0 }}>Reparaciones</h2>
        <span className="sp" />
        <select value={fv} onChange={(e) => setFv(e.target.value)}>
          <option value="">Todos los vehículos</option>
          {vehicles.map((v) => (
            <option key={v.id} value={v.id}>
              {v.plate}
            </option>
          ))}
        </select>
        <span className="muted">
          Total: <b>{money(total)}</b>
        </span>
        <button className="b1" onClick={() => open((c) => <RepairForm onClose={c} />)}>
          + Reparación
        </button>
      </div>
      <RepairsTable list={l} showVehicle />
      {el}
    </>
  );
}
