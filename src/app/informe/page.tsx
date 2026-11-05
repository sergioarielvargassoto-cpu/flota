'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useData } from '@/lib/data';
import { computeAlerts } from '@/lib/alerts';
import { fd, money, num } from '@/lib/util';
import {
  availableMonths,
  driverMonth,
  insights,
  monthLabel,
  prevMonth,
  provinceMonth,
  totals,
  vehicleMonth,
  monthRange,
  readingQuality,
  invalidReadings,
  gpsBias,
  type Data,
} from '@/lib/fleetStats';

/* Paleta categórica de referencia (dataviz): el color sigue a la entidad, no a su posición */
const BLUE = '#2a78d6';
const ORANGE = '#eb6834';
const AQUA = '#1baf7a';
const INK = '#0b0b0b';
const INK2 = '#52514e';
const GRID = '#e6e5e1';
const PROV_COLOR: Record<string, string> = { Corrientes: BLUE, Misiones: ORANGE };
const provColor = (p: string) => PROV_COLOR[p] ?? AQUA;
const SEV = {
  critical: { icon: '⛔', label: 'Crítico', bg: '#fde8e8', fg: '#8a1c1c' },
  warning: { icon: '⚠', label: 'Atención', bg: '#fff1d6', fg: '#7a4b00' },
  info: { icon: 'ℹ', label: 'Info', bg: '#e8f0fb', fg: '#184f95' },
  good: { icon: '✔', label: 'Bien', bg: '#e3f4e8', fg: '#0b5a1f' },
} as const;

const f1 = (n: number | null | undefined, d = 1) =>
  n === null || n === undefined ? '—' : n.toLocaleString('es-AR', { maximumFractionDigits: d });
const km0 = (n: number | null | undefined) => (n === null || n === undefined ? '—' : num(Math.round(n)));
const mon = (n: number | null | undefined) => (n === null || n === undefined ? '—' : money(Math.round(n)));

/** Variación contra el mes anterior. `up` = qué dirección es buena. Siempre con signo e ícono (no solo color). */
function Delta({ cur, prev, good }: { cur: number | null; prev: number | null; good: 'up' | 'down' | 'none' }) {
  if (cur === null || !prev) return <span className="muted">sin mes anterior</span>;
  const p = ((cur - prev) / prev) * 100;
  if (Math.abs(p) < 1) return <span className="muted">= igual que el mes anterior</span>;
  const up = p > 0;
  const bad = good === 'none' ? false : good === 'up' ? !up : up;
  const color = good === 'none' ? INK2 : bad ? '#a32424' : '#0b5a1f';
  return (
    <span style={{ color, fontWeight: 600, fontSize: 12 }}>
      {up ? '▲' : '▼'} {f1(Math.abs(p))} % <span className="muted" style={{ fontWeight: 400 }}>vs mes anterior</span>
    </span>
  );
}

function Kpi({ label, value, sub }: { label: string; value: string; sub?: React.ReactNode }) {
  return (
    <div className="card">
      <div className="n" style={{ fontSize: 26 }}>
        {value}
      </div>
      <div className="l">{label}</div>
      <div style={{ marginTop: 6, minHeight: 16 }}>{sub}</div>
    </div>
  );
}

const Section = ({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) => (
  <section style={{ marginBottom: 28 }}>
    <h3 style={{ margin: '0 0 4px' }}>{title}</h3>
    {hint && (
      <p className="muted" style={{ margin: '0 0 10px' }}>
        {hint}
      </p>
    )}
    {children}
  </section>
);

const ChartBox = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div style={{ background: '#fff', border: '1px solid var(--b)', borderRadius: 10, padding: 14 }}>
    <div style={{ fontSize: 13, fontWeight: 600, color: INK, marginBottom: 6 }}>{title}</div>
    <div style={{ width: '100%', height: 230 }}>{children}</div>
  </div>
);
const axis = { fontSize: 11, fill: INK2 };

export default function Informe() {
  const raw = useData();
  const { vehicles, drivers, fuel_loads, trips, repairs, maintenance, infractions, documents, settings } = raw;
  const data: Data = useMemo(
    () => ({ vehicles, drivers, fuel_loads, trips, repairs, maintenance, infractions }),
    [vehicles, drivers, fuel_loads, trips, repairs, maintenance, infractions]
  );
  const months = useMemo(() => availableMonths(data), [data]);
  const [sel, setSel] = useState('');
  const key = months.includes(sel) ? sel : (months[0] ?? '');
  const [provFilter, setProvFilter] = useState('');

  const calc = useMemo(() => {
    if (!key) return null;
    const vm = vehicleMonth(data, key);
    const pm = vehicleMonth(data, prevMonth(key), false);
    const t = totals(vm);
    const pt = totals(pm);
    const dm = driverMonth(data, key);
    const prov = provinceMonth(vm);
    const servicesOverdue = vehicles.filter(
      (v) => v.status !== 'Baja' && v.last_service_km !== null && v.km !== null && v.last_service_km + settings.service_km - v.km <= 0
    ).length;
    const alerts = computeAlerts({ vehicles, drivers, documents, maintenance, settings });
    const docsOverdue = alerts.filter((a) => a.kind !== 'Mantenimiento' && a.status === 'vencido').length;
    const docsSoon = alerts.filter((a) => a.kind !== 'Mantenimiento' && (a.status === 'critico' || a.status === 'urgente' || a.status === 'proximo')).length;
    const { from, to } = monthRange(key);
    const quality = readingQuality(data, from, to);
    const invalid = invalidReadings(data, from, to);
    const bias = gpsBias(vm);
    const finesLoaded = infractions.filter((i) => i.date >= from && i.date < to).length;
    const lastGpsM = trips.filter((tr) => tr.date >= from && tr.date < to).reduce<string>((m, tr) => (tr.date > m ? tr.date : m), '');
    const monthEnd = new Date(new Date(to + 'T00:00:00').getTime() - 864e5).toLocaleDateString('en-CA');
    const partial = key === new Date().toLocaleDateString('en-CA').slice(0, 7) || (!!lastGpsM && lastGpsM < new Date(new Date(monthEnd + 'T00:00:00').getTime() - 2 * 864e5).toLocaleDateString('en-CA'));
    const ins = insights(vm, pm, dm, t, pt, { servicesOverdue, docsOverdue, finesLoaded, key, partial });
    // Tendencia (hasta 6 meses con datos)
    const trend = months
      .filter((m) => m <= key)
      .slice(0, 6)
      .reverse()
      .map((m) => {
        const x = totals(vehicleMonth(data, m, false));
        return { m: monthLabel(m).slice(0, 3) + ' ' + m.slice(2, 4), km: Math.round(x.opKm), gasto: Math.round(x.fuelCost), l100: x.l100 ? +x.l100.toFixed(1) : null, pk: x.fuelPerKm ? Math.round(x.fuelPerKm) : null };
      });
    // Cobertura de datos del mes
    const lastFuel = fuel_loads.filter((f) => f.date >= from && f.date < to).reduce<string>((m, f) => (f.date > m ? f.date : m), '');
    const lastGps = trips.filter((tr) => tr.date >= from && tr.date < to).reduce<string>((m, tr) => (tr.date > m ? tr.date : m), '');
    const fuelCount = fuel_loads.filter((f) => f.date >= from && f.date < to).length;
    return { partial, quality, invalid, bias, vm, pm, t, pt, dm, prov, ins, trend, servicesOverdue, docsOverdue, docsSoon, finesLoaded, lastFuel, lastGps, fuelCount };
  }, [key, data, months, vehicles, drivers, documents, maintenance, settings, infractions, fuel_loads, trips]);

  if (!key || !calc)
    return (
      <div className="empty">
        Todavía no hay datos de combustible ni de GPS cargados. Importalos en <Link href="/combustible">Combustible</Link> y{' '}
        <Link href="/reportes-km">Reportes KM</Link>.
      </div>
    );
  const { partial, quality, invalid, bias, vm, t, pt, dm, prov, ins, trend, servicesOverdue, docsOverdue, docsSoon, finesLoaded, lastFuel, lastGps, fuelCount } = calc;
  const D = (p: { cur: number | null; prev: number | null; good: 'up' | 'down' | 'none' }) =>
    partial ? <span className="muted">mes parcial · no comparable</span> : <Delta {...p} />;
  const vmF = provFilter ? vm.filter((r) => r.prov === provFilter) : vm;
  const dmF = provFilter ? dm.filter((r) => r.prov === provFilter) : dm;
  const provList = [...new Set(vm.map((r) => r.prov))];
  const gpsCount = vm.filter((r) => r.hasGps).length;

  async function exportXlsx() {
    const XLSX = await import('xlsx');
    const wb = XLSX.utils.book_new();
    const add = (name: string, rows: Record<string, unknown>[]) =>
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), name);
    add('Resumen', [
      { Indicador: 'Km operativos', Valor: Math.round(t.opKm) },
      { Indicador: 'Litros', Valor: Math.round(t.liters) },
      { Indicador: 'Gasto combustible', Valor: Math.round(t.fuelCost) },
      { Indicador: 'Cargas', Valor: t.fills },
      { Indicador: 'L/100 km', Valor: t.l100 ? +t.l100.toFixed(2) : '' },
      { Indicador: 'Combustible $/km', Valor: t.fuelPerKm ? Math.round(t.fuelPerKm) : '' },
      { Indicador: 'Mantenimiento + reparaciones', Valor: Math.round(t.upkeep) },
      { Indicador: 'Costo total $/km', Valor: t.costPerKm ? Math.round(t.costPerKm) : '' },
    ]);
    add('Provincias', prov.map((p) => ({ Provincia: p.prov, Vehiculos: p.vehicles, Km: Math.round(p.opKm), Litros: Math.round(p.liters), Gasto: Math.round(p.fuelCost), 'L/100km': p.l100 ? +p.l100.toFixed(2) : '', '$ comb/km': p.fuelPerKm ? Math.round(p.fuelPerKm) : '', 'Costo total $/km': p.costPerKm ? Math.round(p.costPerKm) : '' })));
    add('Choferes', dm.map((x) => ({ Chofer: x.name, Provincia: x.prov, Cargas: x.fills, 'Dias con carga': x.fillDays, Litros: Math.round(x.liters), Gasto: Math.round(x.amount), 'Km (odometro)': Math.round(x.km), 'L/100km': x.l100 ? +x.l100.toFixed(2) : '', Vehiculos: x.vehicles, Estaciones: x.stations, 'Cargas en vehiculo no asignado': x.notAssigned, 'Lecturas descartadas': x.rejected, Multas: x.finesCount, 'Monto multas': Math.round(x.finesAmount) })));
    add('Vehiculos', vm.map((r) => ({ Patente: r.v.plate, Tipo: r.v.type, Provincia: r.prov, 'Chofer asignado': r.driverName, 'Km GPS': r.gpsKm === null ? '' : Math.round(r.gpsKm), 'Km odometro': r.odoKm ?? '', Cargas: r.fills, Litros: Math.round(r.liters), 'L/100km': r.l100 ? +r.l100.toFixed(2) : '', 'Gasto comb.': Math.round(r.fuelCost), 'Mant.+Rep.': Math.round(r.maintCost + r.repairCost), 'Costo $/km': r.costPerKm ? Math.round(r.costPerKm) : '' })));
    add('Km invalidos', invalid.map((r) => ({ Fecha: r.load.date, Vehiculo: r.plate, Chofer: r.driver, Estacion: r.station, 'Km declarado': r.declared, 'Km esperable': r.expected ?? '', Motivo: r.why })));
    add('Hallazgos', ins.map((i) => ({ Severidad: SEV[i.sev].label, Area: i.area, Hallazgo: i.title, Detalle: i.detail })));
    XLSX.writeFile(wb, `Informe_flota_${key}.xlsx`);
  }

  return (
    <>
      <div className="bar">
        <b style={{ fontSize: 18 }}>
          <span aria-hidden="true">📋</span> Informe de gestión · {monthLabel(key)}
          <span className="muted" style={{ fontSize: 12, fontWeight: 400, marginLeft: 8 }}>
            emitido el {new Date().toLocaleDateString('es-AR')}
          </span>
        </b>
        <span className="sp" />
        <select value={key} onChange={(e) => setSel(e.target.value)} aria-label="Mes">
          {months.map((m) => (
            <option key={m} value={m}>
              {monthLabel(m)}
            </option>
          ))}
        </select>
        <select value={provFilter} onChange={(e) => setProvFilter(e.target.value)} aria-label="Provincia">
          <option value="">Todas las provincias</option>
          {provList.map((p) => (
            <option key={p}>{p}</option>
          ))}
        </select>
        <button className="b2" onClick={exportXlsx}>
          ⬇ Excel
        </button>
        <button className="b2" onClick={() => window.print()}>
          🖨 Imprimir / PDF
        </button>
      </div>

      {partial && (
        <div role="status" style={{ padding: 10, borderRadius: 8, background: '#fff1d6', color: '#7a4b00', fontSize: 13, marginBottom: 12 }}>
          <b>⚠ Mes en curso / datos incompletos:</b> los totales cubren solo hasta la última fecha cargada y no son comparables con el mes anterior.
        </div>
      )}
      {/* Cobertura de datos: qué tan completo está el mes */}
      <div style={{ padding: 10, borderRadius: 8, background: '#f4f3ef', fontSize: 13, marginBottom: 16, color: INK2 }}>
        <b>Datos del período:</b> GPS hasta {lastGps ? fd(lastGps) : 'sin datos'} ({gpsCount} de {vm.length} vehículos con GPS) · Combustible hasta{' '}
        {lastFuel ? fd(lastFuel) : 'sin datos'} ({fuelCount} cargas).{' '}
        {fuelCount === 0 && (
          <b style={{ color: '#7a4b00' }}>⚠ Falta cargar el archivo de combustible (YPF) de este mes: consumo y gasto aparecen vacíos.</b>
        )}{' '}
        Los km de cada vehículo se miden por GPS cuando tiene; si no tiene (o no registró), por el odómetro de las estaciones, interpolado al inicio y fin del mes. Cada vehículo se cuenta una sola vez.
      </div>

      <div className="cards">
        <Kpi
          label="Km recorridos"
          value={km0(t.opKm)}
          sub={
            <>
              <div className="muted" style={{ fontSize: 11 }}>
                GPS {km0(t.gpsKm)} + odómetro {km0(t.odoOnlyKm)}
              </div>
              <D cur={t.opKm} prev={pt.opKm} good="none" />
            </>
          }
        />
        <Kpi label="Litros cargados" value={km0(t.liters)} sub={<D cur={t.liters} prev={pt.liters} good="none" />} />
        <Kpi label="Gasto combustible + AdBlue" value={mon(t.fuelCost)} sub={<D cur={t.fuelCost} prev={pt.fuelCost} good="down" />} />
        <Kpi label="Consumo L/100 km" value={f1(t.l100)} sub={<D cur={t.l100} prev={pt.l100} good="down" />} />
        <Kpi label="Combustible $/km" value={mon(t.fuelPerKm)} sub={<D cur={t.fuelPerKm} prev={pt.fuelPerKm} good="down" />} />
        <Kpi label="Mantenim. + reparaciones" value={mon(t.upkeep)} sub={<D cur={t.upkeep} prev={pt.upkeep} good="down" />} />
        <Kpi label="Costo total por km" value={mon(t.costPerKm)} sub={<D cur={t.costPerKm} prev={pt.costPerKm} good="down" />} />
        <Kpi label="Cargas de combustible" value={num(t.fills)} sub={<D cur={t.fills} prev={pt.fills} good="none" />} />
        <Kpi
          label="Km mal cargados en estaciones"
          value={`${quality.invalid} de ${quality.total}`}
          sub={<span style={{ color: quality.pct > 10 ? '#a32424' : INK2, fontSize: 12, fontWeight: 600 }}>{quality.pct > 10 ? '⚠ ' : ''}{f1(quality.pct)} % de las cargas</span>}
        />
      </div>

      <Section title="🎯 Hallazgos y decisiones" hint="Reglas automáticas sobre los datos del mes, ordenadas por gravedad.">
        <div style={{ display: 'grid', gap: 8 }}>
          {ins.map((i, n) => (
            <div key={n} style={{ background: SEV[i.sev].bg, borderRadius: 8, padding: '10px 12px', color: INK }}>
              <div style={{ fontWeight: 600, color: SEV[i.sev].fg }}>
                {SEV[i.sev].icon} {SEV[i.sev].label} · {i.area}
              </div>
              <div style={{ fontWeight: 600 }}>{i.title}</div>
              <div style={{ fontSize: 13, color: INK2 }}>{i.detail}</div>
            </div>
          ))}
        </div>
      </Section>

      <Section title="📈 Tendencia" hint="Últimos meses con datos. Un gráfico por magnitud (sin doble eje).">
        <div className="cards" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))' }}>
          <ChartBox title="Km recorridos por mes">
            <ResponsiveContainer>
              <LineChart data={trend} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid stroke={GRID} vertical={false} />
                <XAxis dataKey="m" tick={axis} axisLine={false} tickLine={false} />
                <YAxis tick={axis} axisLine={false} tickLine={false} width={48} tickFormatter={(v) => num(v)} />
                <Tooltip formatter={(v) => [num(Number(v)) + ' km', 'Km']} />
                <Line type="monotone" dataKey="km" name="Km" stroke={BLUE} strokeWidth={2} dot={{ r: 4, stroke: '#fff', strokeWidth: 2 }} />
              </LineChart>
            </ResponsiveContainer>
          </ChartBox>
          <ChartBox title="Gasto en combustible por mes ($)">
            <ResponsiveContainer>
              <BarChart data={trend} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid stroke={GRID} vertical={false} />
                <XAxis dataKey="m" tick={axis} axisLine={false} tickLine={false} />
                <YAxis tick={axis} axisLine={false} tickLine={false} width={60} tickFormatter={(v) => num(Math.round(v / 1000)) + ' mil'} />
                <Tooltip formatter={(v) => [money(Number(v)), 'Gasto']} />
                <Bar dataKey="gasto" name="Gasto" fill={BLUE} radius={[4, 4, 0, 0]} maxBarSize={44} />
              </BarChart>
            </ResponsiveContainer>
          </ChartBox>
          <ChartBox title="Combustible $ por km">
            <ResponsiveContainer>
              <LineChart data={trend} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid stroke={GRID} vertical={false} />
                <XAxis dataKey="m" tick={axis} axisLine={false} tickLine={false} />
                <YAxis tick={axis} axisLine={false} tickLine={false} width={48} />
                <Tooltip formatter={(v) => [money(Number(v)) + '/km', '$/km']} />
                <Line type="monotone" dataKey="pk" name="$/km" stroke={BLUE} strokeWidth={2} connectNulls dot={{ r: 4, stroke: '#fff', strokeWidth: 2 }} />
              </LineChart>
            </ResponsiveContainer>
          </ChartBox>
        </div>
      </Section>

      <Section title="🗺 Por provincia" hint="Misiones y Corrientes mantienen siempre su color.">
        <div className="cards" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))' }}>
          <ChartBox title="Km recorridos">
            <ResponsiveContainer>
              <BarChart data={prov} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid stroke={GRID} vertical={false} />
                <XAxis dataKey="prov" tick={axis} axisLine={false} tickLine={false} />
                <YAxis tick={axis} axisLine={false} tickLine={false} width={48} tickFormatter={(v) => num(v)} />
                <Tooltip formatter={(v) => [num(Math.round(Number(v))) + ' km', 'Km']} />
                <Bar dataKey="opKm" name="Km" radius={[4, 4, 0, 0]} maxBarSize={64}>
                  {prov.map((p) => (
                    <Cell key={p.prov} fill={provColor(p.prov)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartBox>
          <ChartBox title="Consumo L/100 km">
            <ResponsiveContainer>
              <BarChart data={prov} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid stroke={GRID} vertical={false} />
                <XAxis dataKey="prov" tick={axis} axisLine={false} tickLine={false} />
                <YAxis tick={axis} axisLine={false} tickLine={false} width={40} />
                <Tooltip formatter={(v) => [f1(Number(v)) + ' L/100 km', 'Consumo']} />
                <Bar dataKey="l100" name="L/100 km" radius={[4, 4, 0, 0]} maxBarSize={64}>
                  {prov.map((p) => (
                    <Cell key={p.prov} fill={provColor(p.prov)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartBox>
        </div>
        <div className="tw" style={{ marginTop: 12 }}>
          <table>
            <thead>
              <tr>
                <th>Provincia</th>
                <th>Vehículos</th>
                <th>Km</th>
                <th>Litros</th>
                <th>Cargas</th>
                <th>Gasto comb.</th>
                <th>L/100 km</th>
                <th>Comb. $/km</th>
                <th>Costo total $/km</th>
              </tr>
            </thead>
            <tbody>
              {prov.map((p) => (
                <tr key={p.prov}>
                  <td>
                    <b>{p.prov}</b>
                  </td>
                  <td>{p.vehicles}</td>
                  <td>{km0(p.opKm)}</td>
                  <td>{km0(p.liters)}</td>
                  <td>{p.fills}</td>
                  <td>{mon(p.fuelCost)}</td>
                  <td>{f1(p.l100)}</td>
                  <td>{mon(p.fuelPerKm)}</td>
                  <td>{mon(p.costPerKm)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section
        title="🧑‍✈️ Por chofer"
        hint="Los km de cada tramo entre cargas se atribuyen al chofer que hizo la carga siguiente. La provincia sale de los vehículos que usó."
      >
        {dmF.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', gap: 14, fontSize: 12, color: INK2, marginBottom: 6 }}>
              {Object.entries(PROV_COLOR).map(([name, c]) => (
                <span key={name}>
                  <span style={{ display: 'inline-block', width: 10, height: 10, background: c, borderRadius: 2, marginRight: 5 }} />
                  {name}
                </span>
              ))}
            </div>
            <ChartBox title="Litros cargados por chofer (los 10 con más litros)">
              <ResponsiveContainer>
                <BarChart data={dmF.slice(0, 10).map((x) => ({ n: x.name.split(',')[0], litros: Math.round(x.liters), prov: x.prov }))} layout="vertical" margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke={GRID} horizontal={false} />
                  <XAxis type="number" tick={axis} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="n" tick={axis} axisLine={false} tickLine={false} width={90} />
                  <Tooltip formatter={(v) => [num(Number(v)) + ' L', 'Litros']} />
                  <Bar dataKey="litros" radius={[0, 4, 4, 0]} maxBarSize={18}>
                    {dmF.slice(0, 10).map((x) => (
                      <Cell key={x.name} fill={provColor(x.prov)} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </ChartBox>
          </div>
        )}
        <div className="tw">
          <table>
            <thead>
              <tr>
                <th>Chofer</th>
                <th>Prov.</th>
                <th>Cargas</th>
                <th>Días c/carga</th>
                <th>Litros</th>
                <th>Litros/carga</th>
                <th>Gasto</th>
                <th>Km (odóm.)</th>
                <th>L/100 km</th>
                <th>Vehíc.</th>
                <th>Estac.</th>
                <th>Carga en vehíc. ajeno</th>
                <th>Lecturas descart.</th>
                <th>Multas</th>
              </tr>
            </thead>
            <tbody>
              {dmF.map((x) => (
                <tr key={x.name}>
                  <td>
                    <b>{x.name}</b>
                  </td>
                  <td>{x.prov}</td>
                  <td>{x.fills}</td>
                  <td>{x.fillDays}</td>
                  <td>{km0(x.liters)}</td>
                  <td>{f1(x.avgLiters)}</td>
                  <td>{mon(x.amount)}</td>
                  <td>{x.km ? km0(x.km) : '—'}</td>
                  <td>{f1(x.l100)}</td>
                  <td>{x.vehicles}</td>
                  <td>{x.stations}</td>
                  <td>{x.notAssigned || '—'}</td>
                  <td>{x.rejected ? <b style={{ color: '#a32424' }}>⚠ {x.rejected}</b> : '—'}</td>
                  <td>{x.finesCount ? `${x.finesCount} (${mon(x.finesAmount)})` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!finesLoaded && <p className="muted">Multas: todavía no hay infracciones cargadas en este período.</p>}
      </Section>

      <Section
        title="🧾 Calidad de los km declarados en las estaciones"
        hint="En el surtidor el playero digita el km del tablero que le informa el chofer. Cuando el km no se informa o se tipea mal (número inventado, incompleto), ese dato se descarta y no sirve para controlar consumo ni mantenimiento. El error puede ser del playero o de la falta de aviso: no implica culpa del chofer."
      >
        <div style={{ background: '#fff8e1', border: '1px solid #f1d98a', borderRadius: 8, padding: 12, marginBottom: 12, color: INK }}>
          <b>📢 Aviso para todos los choferes:</b> al cargar combustible, decile SIEMPRE al playero el kilometraje exacto que marca el
          tablero (mirá el odómetro, no de memoria ni un número aproximado) y <b>controlá en el ticket que figure ese km antes de
          irte</b>. Con el km correcto controlamos el consumo y no se pasa ningún service. Una carga con el km mal dicho o mal tipeado
          cuenta como dato inválido.
        </div>
        <p style={{ margin: '0 0 8px' }}>
          GPS vs odómetro: en el mes, el odómetro marca <b>{bias.pct === null ? '—' : `${bias.pct > 0 ? '+' : ''}${f1(bias.pct)} %`}</b> respecto
          del GPS ({bias.n} vehículos comparables). Es un desfasaje chico: las diferencias grandes en tramos cortos vienen de que el GPS
          cuenta días completos y de km mal digitados.
        </p>
        {invalid.length ? (
          <>
            <div className="cards" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(320px,1fr))' }}>
              <div>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>Por chofer (a nombre de quién quedó la carga)</div>
                <div className="tw">
                  <table>
                    <thead>
                      <tr>
                        <th>Chofer</th>
                        <th>Cargas</th>
                        <th>Km inválidos</th>
                        <th>%</th>
                      </tr>
                    </thead>
                    <tbody>
                      {quality.byDriver
                        .filter((r) => r.invalid > 0)
                        .map((r) => (
                          <tr key={r.name}>
                            <td>
                              <b>{r.name}</b>
                            </td>
                            <td>{r.loads}</td>
                            <td>
                              <b style={{ color: '#a32424' }}>{r.invalid}</b>
                            </td>
                            <td>{f1(r.pct, 0)} %</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>
              <div>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>Por estación de servicio</div>
                <div className="tw">
                  <table>
                    <thead>
                      <tr>
                        <th>Estación</th>
                        <th>Cargas</th>
                        <th>Km inválidos</th>
                        <th>%</th>
                      </tr>
                    </thead>
                    <tbody>
                      {quality.byStation
                        .filter((r) => r.invalid > 0)
                        .slice(0, 10)
                        .map((r) => (
                          <tr key={r.name}>
                            <td>{r.name}</td>
                            <td>{r.loads}</td>
                            <td>
                              <b style={{ color: '#a32424' }}>{r.invalid}</b>
                            </td>
                            <td>{f1(r.pct, 0)} %</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
            <div style={{ fontWeight: 600, margin: '14px 0 4px' }}>Detalle de cada carga con km inválido</div>
            <div className="tw">
              <table>
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Vehículo</th>
                    <th>Chofer</th>
                    <th>Estación</th>
                    <th>Km declarado</th>
                    <th>Km esperable</th>
                    <th>Motivo</th>
                  </tr>
                </thead>
                <tbody>
                  {invalid.map((r) => (
                    <tr key={r.load.id}>
                      <td>{fd(r.load.date)}</td>
                      <td>
                        <b>{r.plate}</b>
                      </td>
                      <td>{r.driver}</td>
                      <td>{r.station}</td>
                      <td>
                        <b style={{ color: '#a32424' }}>{num(r.declared)}</b>
                      </td>
                      <td>{r.expected === null ? '—' : `≈ ${num(r.expected)}`}</td>
                      <td className="muted">{r.why}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <div className="empty">✔ Todas las cargas del mes tienen un km coherente.</div>
        )}
      </Section>

      <Section title="🚚 Por vehículo" hint="Km por GPS cuando el vehículo lo tiene; si no, por odómetro de las estaciones. El costo suma combustible, mantenimiento y reparaciones.">
        <div className="tw">
          <table>
            <thead>
              <tr>
                <th>Vehículo</th>
                <th>Prov.</th>
                <th>Chofer asignado</th>
                <th>Km GPS</th>
                <th>Km odóm.</th>
                <th>Cargas</th>
                <th>Litros</th>
                <th>L/100 km</th>
                <th>vs ref.</th>
                <th>Gasto comb.</th>
                <th>Mant.+Rep.</th>
                <th>Costo $/km</th>
                <th>Uso</th>
              </tr>
            </thead>
            <tbody>
              {[...vmF]
                .sort((a, b) => (b.opKm ?? 0) - (a.opKm ?? 0))
                .map((r) => (
                  <tr key={r.v.id}>
                    <td>
                      <Link href={`/vehiculos/${r.v.id}`}>
                        <b>{r.v.plate}</b>
                      </Link>{' '}
                      <span className="muted">{r.v.type}{r.v.status === 'Baja' ? ' · de baja' : ''}</span>
                    </td>
                    <td>{r.prov}</td>
                    <td>{r.driverName}</td>
                    <td>{r.hasGps ? km0(r.gpsKm) : <span className="muted">sin GPS</span>}</td>
                    <td>{km0(r.odoKm)}</td>
                    <td>{r.fills}</td>
                    <td>{km0(r.liters)}</td>
                    <td>{f1(r.l100)}</td>
                    <td>
                      {r.l100Dev === null ? (
                        '—'
                      ) : (
                        <b style={{ color: r.l100Signif ? '#a32424' : INK2 }}>
                          {r.l100Dev > 0 ? '+' : ''}
                          {f1(r.l100Dev, 0)} %{r.l100Signif ? ' ⚠' : ''}
                        </b>
                      )}
                    </td>
                    <td>{mon(r.fuelCost)}</td>
                    <td>{mon(r.maintCost + r.repairCost)}</td>
                    <td>{mon(r.costPerKm)}</td>
                    <td>{r.utilization === null ? '—' : `${Math.round(r.utilization * 100)} % de los días`}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="🛡 Cumplimiento y riesgo">
        <div className="cards">
          <Kpi label="Services vencidos" value={String(servicesOverdue)} sub={<Link href="/auditoria-km">ver detalle</Link>} />
          <Kpi label="Documentos vencidos" value={String(docsOverdue)} sub={<Link href="/">ver vencimientos</Link>} />
          <Kpi label="Documentos por vencer" value={String(docsSoon)} />
          <Kpi label="Multas del mes" value={String(finesLoaded)} sub={<Link href="/infracciones">ver infracciones</Link>} />
        </div>
      </Section>

      <p className="muted">
        Cómo se calcula: el consumo usa el método tanque a tanque (litros de las cargas del mes, sin la primera, ÷ km del odómetro entre
        la última carga anterior al mes y la última del mes), por lo que no depende del nivel con que salió el vehículo. Las lecturas de
        odómetro descartadas al importar no se usan. Los hallazgos son para revisar, no prueban un fraude.
      </p>
    </>
  );
}
