'use client';
import { useState } from 'react';
import { useData } from '@/lib/data';
import { guard, isFuel, money, num, fd } from '@/lib/util';
import { pickSheet } from '@/lib/excel';
import { FUEL_SPEC, useImporters } from '@/lib/importers';
import { FuelForm } from '@/components/forms';
import { ImportDialog } from '@/components/ImportDialog';
import { useModal } from '@/components/useModal';

export default function Combustible() {
  const { fuel_loads, vehicles, remove } = useData();
  const { importFuel } = useImporters();
  const { el, open } = useModal();
  const [fv, setFv] = useState('');
  const [fm, setFm] = useState('');
  const [fp, setFp] = useState('');
  const [rows, setRows] = useState<unknown[][] | null>(null);

  const l = fuel_loads.filter((f) => (!fv || f.vehicle_id === fv) && (!fm || f.date.startsWith(fm)) && (!fp || vehicles.find((v) => v.id === f.vehicle_id)?.provincia === fp));
  const by = new Map<string, typeof l>();
  l.forEach((f) => by.set(f.vehicle_id, [...(by.get(f.vehicle_id) ?? []), f]));

  const sum = [...by.entries()].map(([vid, arr]) => {
    const a = [...arr].sort((x, y) => x.date.localeCompare(y.date) || (x.km ?? 0) - (y.km ?? 0));
    const lit = a.filter((x) => isFuel(x.product)).reduce((s, x) => s + x.liters, 0);
    const imp = a.reduce((s, x) => s + (x.amount ?? 0), 0);
    const kms = a.filter((x) => isFuel(x.product) && x.km !== null);
    let cons = '—';
    if (kms.length >= 2) {
      const i0 = a.indexOf(kms[0]), i1 = a.indexOf(kms[kms.length - 1]);
      const d = kms[kms.length - 1].km! - kms[0].km!;
      const l2 = a.slice(i0 + 1, i1 + 1).filter((x) => isFuel(x.product)).reduce((s, x) => s + x.liters, 0);
      if (d > 0 && l2 > 0) cons = ((l2 / d) * 100).toFixed(1) + ' L/100 km';
    }
    return { v: vehicles.find((x) => x.id === vid), n: a.length, lit, imp, cons };
  }).sort((a, b) => b.imp - a.imp);
  const TL = sum.reduce((s, x) => s + x.lit, 0), TI = sum.reduce((s, x) => s + x.imp, 0);

  return (
    <>
      <div className="bar">
        <h2 style={{ margin: 0 }}>Combustible (YPF en Ruta)</h2><span className="sp" />
        <select value={fv} onChange={(e) => setFv(e.target.value)}><option value="">Todos los vehículos</option>{vehicles.map((v) => <option key={v.id} value={v.id}>{v.plate}</option>)}</select>
        <select value={fp} onChange={(e) => setFp(e.target.value)}>
          <option value="">Todas las provincias</option>
          <option value="Corrientes">Corrientes</option>
          <option value="Formosa">Formosa</option>
          <option value="Misiones">Misiones</option>
          <option value="Chaco">Chaco</option>
        </select>
        <input type="month" value={fm} onChange={(e) => setFm(e.target.value)} title="Filtrar por mes" />
        <button className="b2" onClick={async () => setRows(await pickSheet())}>⬆ Importar Excel YPF</button>
        <button className="b1" onClick={() => open((c) => <FuelForm onClose={c} />)}>+ Carga</button>
      </div>
      <div className="cards">
        <div className="card"><div className="n">{num(Math.round(TL))}</div><div className="l">Litros de combustible</div></div>
        <div className="card"><div className="n">{money(Math.round(TI))}</div><div className="l">Gasto total (sin IVA)</div></div>
        <div className="card"><div className="n">{TL ? money(Math.round(TI / TL)) : '—'}</div><div className="l">$ por litro promedio</div></div>
        <div className="card"><div className="n">{l.length}</div><div className="l">Cargas</div></div>
      </div>
      {sum.length ? (
        <>
          <h3>Resumen por vehículo</h3>
          <div className="tw"><table>
            <thead><tr><th>Vehículo</th><th>Cargas</th><th>Litros</th><th>Importe s/IVA</th><th>$/litro</th><th>Consumo (por odómetro)</th></tr></thead>
            <tbody>{sum.map((x) => (
              <tr key={x.v?.id ?? 'unknown'} className="cl" onClick={() => x.v && setFv(x.v.id)}>
                <td><b>{x.v?.plate ?? '—'}</b></td><td>{x.n}</td><td>{num(Math.round(x.lit))}</td><td>{money(Math.round(x.imp))}</td>
                <td>{x.lit ? money(Math.round(x.imp / x.lit)) : '—'}</td><td>{x.cons}</td>
              </tr>
            ))}</tbody>
          </table></div>
          <p className="muted">Consumo por odómetro: litros cargados entre la primera y la última carga con km válido ÷ km recorridos. Los odómetros inconsistentes (errores de tipeo del chofer) se descartan y se marcan con ⚠. Para un consumo más confiable mirá Recorridos, que usa los km del GPS de Gestya. El AdBlue (Azul 32) no cuenta como litros de combustible.</p>
          <h3>Detalle de cargas</h3>
          <div className="tw"><table>
            <thead><tr><th>Fecha</th><th>Vehículo</th><th>Conductor</th><th>Producto</th><th>Litros</th><th>Importe s/IVA</th><th>Km</th><th>Establecimiento</th><th></th></tr></thead>
            <tbody>{[...l].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 400).map((f) => (
              <tr key={f.id}>
                <td>{fd(f.date)}</td><td>{vehicles.find((v) => v.id === f.vehicle_id)?.plate ?? '—'}</td><td>{f.driver_name}</td><td>{f.product}</td>
                <td>{num(f.liters)}</td><td>{money(f.amount)}</td>
                <td>{f.km !== null ? num(f.km) : f.km_raw !== null && isFuel(f.product)
                  ? <span title="Odómetro informado y descartado por inconsistente" style={{ color: 'var(--o)' }}>⚠ {num(f.km_raw)}</span> : '—'}</td>
                <td>{f.station}</td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  <button className="b2 sm" onClick={() => open((c) => <FuelForm id={f.id} onClose={c} />)}>Editar</button>{' '}
                  <button className="b3 sm" onClick={() => { if (confirm('¿Eliminar carga?')) guard(() => remove('fuel_loads', f.id)); }}>✕</button>
                </td>
              </tr>
            ))}</tbody>
          </table></div>
        </>
      ) : <div className="empty">Sin cargas. Importá el Excel de YPF en Ruta o cargá una a mano.</div>}
      {rows && <ImportDialog title="Importar cargas de YPF en Ruta" rows={rows} spec={FUEL_SPEC} onClose={() => setRows(null)}
        onConfirm={async (data, map) => { await guard(() => importFuel(data, map)); }} />}
      {el}
    </>
  );
}
