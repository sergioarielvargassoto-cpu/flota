'use client';
import { useState } from 'react';
import { useData } from '@/lib/data';
import { fd, isFuel, money, num } from '@/lib/util';
import { guard } from '@/lib/util';
import { pickSheet } from '@/lib/excel';
import { TRIP_SPEC, useImporters } from '@/lib/importers';
import { Badge } from '@/components/Badge';
import { vehicleMonth, totals } from '@/lib/fleetStats';
import { ImportDialog } from '@/components/ImportDialog';

export default function Recorridos() {
  const { trips, fuel_loads, vehicles, drivers, repairs, maintenance, infractions } = useData();
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
  // Consumo con el MISMO criterio que el Informe de gestión (tanque a tanque acumulado)
  const vmMonth = month ? vehicleMonth({ vehicles, drivers, fuel_loads, trips, repairs, maintenance, infractions }, month) : [];
  const l100By = new Map(vmMonth.map((r) => [r.v.id, r.l100]));
  const fleetL100 = totals(vmMonth.filter((r) => r.hasGps)).l100;

  return (
    <>
      <div className="bar">
        <h2 style={{ margin: 0 }}>Recorridos (Gestya)</h2>
        <span className="sp" />
        {months.length > 0 && (
          <select
            aria-label="Mes"
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
          aria-label="Filtrar por provincia"
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
        <button className="b1" onClick={async () => setRows(await pickSheet())}>
          <span aria-hidden="true">⬆</span> Importar Excel Gestya
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
              <div className="n">{fleetL100 ? fleetL100.toFixed(1) : '—'}</div>
              <div className="l">L/100 km flota con GPS (tanque a tanque)</div>
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
              <caption className="sr-only">
                Recorridos por vehículo del mes, de mayor a menor km. Elegí una fila para ver el detalle diario.
              </caption>
              <thead>
                <tr>
                  <th scope="col">Vehículo</th>
                  <th scope="col" className="r">
                    Días con movimiento
                  </th>
                  <th scope="col" className="r">
                    Km calculados
                  </th>
                  <th scope="col" className="r">
                    Km reportados
                  </th>
                  <th scope="col" className="r">
                    Vel. máx.
                  </th>
                  <th scope="col" className="r">
                    Litros YPF
                  </th>
                  <th scope="col" className="r">
                    L/100 km
                  </th>
                  <th scope="col" className="r">
                    $ comb./km
                  </th>
                  <th scope="col">
                    <span className="sr-only">Observaciones</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.map((r) => {
                  const ok = r.km > 50 && r.lit > 0;
                  return (
                    <tr
                      key={r.v.id}
                      className="cl"
                      tabIndex={0}
                      aria-selected={tv === r.v.id}
                      onClick={() => setTv(r.v.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setTv(r.v.id);
                        }
                      }}
                    >
                      <th scope="row">
                        {r.v.plate} <span className="muted" style={{ fontWeight: 400 }}>{r.v.brand}</span>
                      </th>
                      <td className="r">{r.days}</td>
                      <td className="r">{num(Math.round(r.km))}</td>
                      <td className="r">{num(Math.round(r.kr))}</td>
                      <td className="r">{r.vmax || '—'}</td>
                      <td className="r">{num(Math.round(r.lit))}</td>
                      <td className="r">{l100By.get(r.v.id) ? (l100By.get(r.v.id) as number).toFixed(1) : '—'}</td>
                      <td className="r">{ok ? money(Math.round(r.imp / r.km)) : '—'}</td>
                      <td>
                        {!r.has ? (
                          <Badge status="nd">Sin datos GPS</Badge>
                        ) : r.km <= 50 && r.lit > 0 ? (
                          <Badge status="vencido">
                            <span aria-hidden="true">⚠</span> GPS sin km pero cargó combustible
                          </Badge>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="muted">
            Esta pantalla muestra solo los vehículos con GPS (Gestya). El total de la flota, que suma además los vehículos
            sin GPS por odómetro, está en <b>Informe de gestión</b>. L/100 km = método tanque a tanque (litros de las
            cargas del mes sin la primera ÷ km del odómetro entre cargas), igual que en el Informe. Un vehículo con
            carga de combustible pero 0 km en el GPS suele indicar un equipo GPS sin señal o desconectado.
          </p>
          {sel ? (
            <>
              <h3>Detalle diario · {sel.plate}</h3>
              <div className="tw">
                <table>
                  <caption className="sr-only">Detalle diario de recorridos de {sel.plate}</caption>
                  <thead>
                    <tr>
                      <th scope="col">Día</th>
                      <th scope="col" className="r">
                        Km calculados
                      </th>
                      <th scope="col" className="r">
                        Km reportados
                      </th>
                      <th scope="col" className="r">
                        Vel. máx.
                      </th>
                      <th scope="col">En movimiento</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(by.get(sel.id) ?? [])
                      .sort((a, b) => a.date.localeCompare(b.date))
                      .map((t) => (
                        <tr key={t.id}>
                          <td>{fd(t.date)}</td>
                          <td className="r">{num(t.km_calc)}</td>
                          <td className="r">{num(t.km_reported)}</td>
                          <td className="r">{t.max_speed ?? '—'}</td>
                          <td>{t.moving_time}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <p className="muted">Tocá un vehículo (o elegilo con Tab y Enter) para ver el detalle diario.</p>
          )}
        </>
      ) : (
        <div className="empty">
          {trips.length
            ? 'No hay vehículos con recorridos o cargas en este mes para la provincia elegida. Probá con «Todas las provincias» u otro mes.'
            : 'Todavía no hay recorridos. Usá «Importar Excel Gestya» y elegí el Excel “Distancias Diarias” (hoja “Grilla por Vehículos y Días”).'}
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
