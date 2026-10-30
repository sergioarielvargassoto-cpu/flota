'use client';
import { useState } from 'react';
import { useData } from '@/lib/data';
import { fd, isFuel, money, num } from '@/lib/util';
import { guard } from '@/lib/util';
import { pickSheet } from '@/lib/excel';
import { TRIP_SPEC, useImporters } from '@/lib/importers';
import { Badge } from '@/components/Badge';
import { ImportDialog } from '@/components/ImportDialog';

export default function Recorridos() {
  const { trips, fuel_loads, vehicles } = useData();
  const { importTrips } = useImporters();
  const [rows, setRows] = useState<unknown[][] | null>(null);
  const [tm, setTm] = useState('');
  const [tp, setTp] = useState('');
  const [tv, setTv] = useState('');

  const months = [...new Set(trips.map((t) => t.date.slice(0, 7)))].sort().reverse();
  const month = months.includes(tm) ? tm : (months[0] ?? '');
  const T = trips.filter((t) => t.date.startsWith(month));
  const F = fuel_loads.filter((f) => f.date.startsWith(month));
  const by = new Map<string, typeof T>();
  T.forEach((t) => by.set(t.vehicle_id, [...(by.get(t.vehicle_id) ?? []), t]));

  const data = vehicles
    .filter((v) => (tp ? v.provincia === tp : true) && (by.has(v.id) || F.some((f) => f.vehicle_id === v.id)))
    .map((v) => {
      const a = by.get(v.id) ?? [],
        ff = F.filter((f) => f.vehicle_id === v.id);
      return {
        v,
        has: a.length > 0,
        km: a.reduce((s, t) => s + t.km_calc, 0),
        kr: a.reduce((s, t) => s + (t.km_reported ?? 0), 0),
        days: a.filter((t) => t.km_calc > 0).length,
        vmax: Math.max(0, ...a.map((t) => t.max_speed ?? 0)),
        lit: ff.filter((f) => isFuel(f.product)).reduce((s, f) => s + f.liters, 0),
        imp: ff.reduce((s, f) => s + (f.amount ?? 0), 0),
      };
    })
    .sort((a, b) => b.km - a.km);
  const good = data.filter((r) => r.km > 50 && r.lit > 0);
  const GK = good.reduce((s, r) => s + r.km, 0),
    GL = good.reduce((s, r) => s + r.lit, 0),
    GI = good.reduce((s, r) => s + r.imp, 0);
  const sel = vehicles.find((v) => v.id === tv);

  return (
    <>
      <div className="bar">
        <h2 style={{ margin: 0 }}>Recorridos (Gestya)</h2>
        <span className="sp" />
        {months.length > 0 && (
          <select
            value={month}
            onChange={(e) => {
              setTm(e.target.value);
              setTv('');
            }}
          >
            {months.map((m) => (
              <option key={m} value={m}>
                {m.split('-').reverse().join('/')}
              </option>
            ))}
          </select>
        )}
        <select
          value={tp}
          onChange={(e) => {
            setTp(e.target.value);
            setTv('');
          }}
        >
          <option value="">Todas las provincias</option>
          <option value="Corrientes">Corrientes</option>
          <option value="Formosa">Formosa</option>
          <option value="Misiones">Misiones</option>
          <option value="Chaco">Chaco</option>
        </select>
        <button className="b2" onClick={async () => setRows(await pickSheet())}>
          ⬆ Importar Excel Gestya
        </button>
      </div>
      {data.length ? (
        <>
          <div className="cards">
            <div className="card">
              <div className="n">{num(Math.round(data.reduce((s, r) => s + r.km, 0)))}</div>
              <div className="l">Km recorridos (GPS)</div>
            </div>
            <div className="card">
              <div className="n">{GK ? ((GL / GK) * 100).toFixed(1) : '—'}</div>
              <div className="l">L/100 km flota (con GPS y carga)</div>
            </div>
            <div className="card">
              <div className="n">{GK ? money(Math.round(GI / GK)) : '—'}</div>
              <div className="l">$ combustible por km</div>
            </div>
            <div className="card">
              <div className="n">
                {data.filter((r) => r.has).length}/{data.length}
              </div>
              <div className="l">Vehículos con datos GPS</div>
            </div>
          </div>
          <div className="tw">
            <table>
              <thead>
                <tr>
                  <th>Vehículo</th>
                  <th>Días con movimiento</th>
                  <th>Km calculados</th>
                  <th>Km reportados</th>
                  <th>Vel. máx.</th>
                  <th>Litros YPF</th>
                  <th>L/100 km</th>
                  <th>$ comb./km</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {data.map((r) => {
                  const ok = r.km > 50 && r.lit > 0;
                  return (
                    <tr key={r.v.id} className="cl" onClick={() => setTv(r.v.id)}>
                      <td>
                        <b>{r.v.plate}</b> <span className="muted">{r.v.brand}</span>
                      </td>
                      <td>{r.days}</td>
                      <td>{num(Math.round(r.km))}</td>
                      <td>{num(Math.round(r.kr))}</td>
                      <td>{r.vmax || '—'}</td>
                      <td>{num(Math.round(r.lit))}</td>
                      <td>{ok ? ((r.lit / r.km) * 100).toFixed(1) : '—'}</td>
                      <td>{ok ? money(Math.round(r.imp / r.km)) : '—'}</td>
                      <td>
                        {!r.has ? (
                          <Badge status="nd">Sin datos GPS</Badge>
                        ) : r.km <= 50 && r.lit > 0 ? (
                          <Badge status="vencido">⚠ GPS sin km pero cargó combustible</Badge>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="muted">
            L/100 km = litros cargados en el mes (YPF) ÷ km del GPS (Gestya). Es una referencia: el tanque no
            necesariamente se llena y se vacía dentro del mes. Un vehículo con carga de combustible pero 0 km en el GPS
            suele indicar un equipo GPS sin señal o desconectado.
          </p>
          {sel ? (
            <>
              <h3>Detalle diario · {sel.plate}</h3>
              <div className="tw">
                <table>
                  <thead>
                    <tr>
                      <th>Día</th>
                      <th>Km calculados</th>
                      <th>Km reportados</th>
                      <th>Vel. máx.</th>
                      <th>En movimiento</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(by.get(sel.id) ?? [])
                      .sort((a, b) => a.date.localeCompare(b.date))
                      .map((t) => (
                        <tr key={t.id}>
                          <td>{fd(t.date)}</td>
                          <td>{num(t.km_calc)}</td>
                          <td>{num(t.km_reported)}</td>
                          <td>{t.max_speed ?? '—'}</td>
                          <td>{t.moving_time}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <p className="muted">Tocá un vehículo para ver el detalle diario.</p>
          )}
        </>
      ) : (
        <div className="empty">
          Todavía no hay recorridos. Importá el Excel “Distancias Diarias” de Gestya (hoja “Grilla por Vehículos y
          Días”).
        </div>
      )}
      {rows && (
        <ImportDialog
          title="Importar recorridos de Gestya"
          rows={rows}
          spec={TRIP_SPEC}
          onClose={() => setRows(null)}
          onConfirm={async (d, map) => {
            await guard(() => importTrips(d, map));
          }}
        />
      )}
    </>
  );
}
