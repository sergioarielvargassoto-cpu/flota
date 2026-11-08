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

import { TarjetaGrafico, TooltipAn, EJE, GRILLA, CURSOR_BARRA, CURSOR_LINEA, PALETA, type ClaveLeyenda } from '@/components/Charts';
import { formatoMontoCorto, indiceMaximo } from '@/lib/graficos';

/* Diseño "Análisis": una sola familia violeta + negro/grises. */
const INK = PALETA.ink;
const INK2 = PALETA.ink2;
const ROJO = '#b91c1c';
const AMBAR = '#92400e';
const VERDE = '#166534';
/**
 * Provincias: dos tonos del violeta y, para no depender del color, Misiones lleva además una trama a 45°
 * (patrón SVG definido dentro de cada gráfico). La provincia también figura en el eje o en la tabla.
 */
const TRAMA_PROV = 'Misiones';
const provFill = (p: string, tramaId: string) =>
  p === TRAMA_PROV ? `url(#${tramaId})` : p === 'Corrientes' ? PALETA.bar : PALETA.muted;
const provLeyenda = (provs: string[]): ClaveLeyenda[] =>
  [...new Set(provs)].map((p) => ({
    label: p === TRAMA_PROV ? `${p} (con trama)` : p === 'Corrientes' ? `${p} (liso)` : `${p} (gris)`,
    color: p === TRAMA_PROV ? PALETA.barStrong : p === 'Corrientes' ? PALETA.bar : PALETA.muted,
  }));
function Trama({ id }: { id: string }) {
  return (
    <defs>
      <pattern id={id} patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)">
        <rect width="6" height="6" fill={PALETA.barStrong} />
        <line x1="0" y1="0" x2="0" y2="6" stroke="#fff" strokeWidth="2" />
      </pattern>
    </defs>
  );
}
const ALTO = 230;
const MARGEN = { top: 8, right: 12, left: 0, bottom: 0 };
const SEV = {
  critical: { icon: '✖', label: 'Crítico', bg: '#fef2f2', fg: ROJO, bd: '#fecaca' },
  warning: { icon: '⚠', label: 'Atención', bg: '#fffbeb', fg: AMBAR, bd: '#fde68a' },
  info: { icon: 'ℹ', label: 'Info', bg: PALETA.wash, fg: PALETA.accent, bd: PALETA.border },
  good: { icon: '✔', label: 'Bien', bg: '#f0fdf4', fg: VERDE, bd: '#bbf7d0' },
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
  const iconColor = good === 'none' ? INK2 : bad ? ROJO : VERDE;
  return (
    <span className="num" style={{ color: INK2, fontWeight: 600, fontSize: 12 }}>
      <span aria-hidden="true" style={{ color: iconColor }}>
        {bad ? '⚠ ' : ''}
        {up ? '▲' : '▼'}
      </span>{' '}
      {f1(Math.abs(p))} % {up ? 'mayor' : 'menor'}{' '}
      <span className="muted" style={{ fontWeight: 400 }}>
        que el mes anterior{good === 'none' ? '' : bad ? ' · desfavorable' : ' · favorable'}
      </span>
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
    <h2 style={{ margin: '0 0 4px', fontSize: '1.125rem' }}>{title}</h2>
    {hint && (
      <p className="muted" style={{ margin: '0 0 10px' }}>
        {hint}
      </p>
    )}
    {children}
  </section>
);

/** Contenedor de alto fijo para ResponsiveContainer (no mueve el diseño). */
const Lienzo = ({ alto = ALTO, children }: { alto?: number; children: React.ReactNode }) => (
  <div style={{ width: '100%', height: alto }}>{children}</div>
);
const GRID_TARJETAS = { gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))', marginBottom: 0 } as const;

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

  /* ---- Títulos-hallazgo de los gráficos (sólo presentación; no cambian cálculos) ---- */
  const trendKeys = months.filter((m) => m <= key).slice(0, 6).reverse(); // mismo orden que `trend`
  const mesDe = (i: number) => (trendKeys[i] ? monthLabel(trendKeys[i]) : trend[i]?.m ?? '');
  const iKm = indiceMaximo(trend.map((x) => x.km));
  const iGasto = indiceMaximo(trend.map((x) => x.gasto));
  const iPk = indiceMaximo(trend.map((x) => x.pk));
  const tituloKm =
    iKm >= 0 && trend[iKm].km > 0
      ? trend.length > 1
        ? `${mesDe(iKm)} fue el mes con más km: ${num(trend[iKm].km)} km`
        : `${mesDe(iKm)}: ${num(trend[iKm].km)} km recorridos`
      : 'Todavía no hay km registrados en estos meses';
  const tituloGasto =
    iGasto >= 0 && trend[iGasto].gasto > 0
      ? trend.length > 1
        ? `${mesDe(iGasto)} fue el mes de mayor gasto en combustible: ${money(trend[iGasto].gasto)}`
        : `${mesDe(iGasto)}: ${money(trend[iGasto].gasto)} de combustible`
      : 'Todavía no hay gasto de combustible cargado en estos meses';
  const tituloPk =
    iPk >= 0
      ? trend.length > 1
        ? `El km salió más caro en ${mesDe(iPk)}: ${money(trend[iPk].pk)} de combustible por km`
        : `${mesDe(iPk)}: ${money(trend[iPk].pk)} de combustible por km`
      : 'Falta combustible o km para calcular el costo por km';
  const iProvKm = indiceMaximo(prov.map((p) => p.opKm));
  const iProvL = indiceMaximo(prov.map((p) => p.l100));
  const tituloProvKm =
    iProvKm >= 0 && prov[iProvKm].opKm > 0
      ? prov.length > 1
        ? `${prov[iProvKm].prov} recorrió más km: ${km0(prov[iProvKm].opKm)} km`
        : `${prov[iProvKm].prov}: ${km0(prov[iProvKm].opKm)} km recorridos`
      : 'Sin km registrados por provincia este mes';
  const tituloProvL =
    iProvL >= 0
      ? prov.length > 1
        ? `${prov[iProvL].prov} tiene el mayor consumo: ${f1(prov[iProvL].l100)} L/100 km`
        : `${prov[iProvL].prov}: ${f1(prov[iProvL].l100)} L/100 km`
      : 'Falta odómetro o combustible para calcular el consumo por provincia';
  const top10 = dmF.slice(0, 10).map((x) => ({ n: x.name.split(',')[0], full: x.name, litros: Math.round(x.liters), prov: x.prov }));
  const iChofer = indiceMaximo(top10.map((x) => x.litros));
  const tituloChofer =
    iChofer >= 0 && top10[iChofer].litros > 0
      ? `${top10[iChofer].full} es quien más litros cargó: ${num(top10[iChofer].litros)} L`
      : 'Sin litros cargados por chofer en este período';
  const tablaTendencia = (cap: string, col: string, val: (x: (typeof trend)[number]) => string) => () => (
    <table>
      <caption className="sr-only">{cap}</caption>
      <thead>
        <tr>
          <th scope="col">Mes</th>
          <th scope="col" className="r">
            {col}
          </th>
        </tr>
      </thead>
      <tbody>
        {trend.map((x, i) => (
          <tr key={x.m}>
            <th scope="row">{mesDe(i)}</th>
            <td className="r num">{val(x)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
  const tablaProv = (cap: string, col: string, val: (p: (typeof prov)[number]) => string) => () => (
    <table>
      <caption className="sr-only">{cap}</caption>
      <thead>
        <tr>
          <th scope="col">Provincia</th>
          <th scope="col" className="r">
            {col}
          </th>
        </tr>
      </thead>
      <tbody>
        {prov.map((p) => (
          <tr key={p.prov}>
            <th scope="row">{p.prov}</th>
            <td className="r num">{val(p)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );

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
          Informe de gestión · {monthLabel(key)}
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
          <span aria-hidden="true">⬇</span> Excel
        </button>
        <button className="b2" onClick={() => window.print()}>
          Imprimir / PDF
        </button>
      </div>

      {partial && (
        <div role="status" className="warn" style={{ fontSize: 13 }}>
          <b>
            <span aria-hidden="true">⚠</span> Mes en curso / datos incompletos:
          </b>{' '}
          los totales cubren solo hasta la última fecha cargada y no son comparables con el mes anterior.
        </div>
      )}
      {/* Cobertura de datos: qué tan completo está el mes */}
      <div
        style={{ padding: '12px 16px', borderRadius: '0.75rem', background: PALETA.wash, border: `1px solid ${PALETA.border}`, fontSize: 13, marginBottom: 16, color: INK2 }}
      >
        <b style={{ color: INK }}>Datos del período:</b> GPS hasta {lastGps ? fd(lastGps) : 'sin datos'} ({gpsCount} de {vm.length} vehículos con GPS) · Combustible hasta{' '}
        {lastFuel ? fd(lastFuel) : 'sin datos'} ({fuelCount} cargas).{' '}
        {fuelCount === 0 && (
          <b style={{ color: AMBAR }}>
            <span aria-hidden="true">⚠</span> Falta cargar el archivo de combustible (YPF) de este mes: consumo y gasto aparecen vacíos.
          </b>
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
          sub={
            quality.pct > 10 ? (
              <span className="kpi-mk vencido num">
                <i aria-hidden="true">!</i>
                {f1(quality.pct)} % de las cargas · alto
              </span>
            ) : (
              <span className="num" style={{ color: INK2, fontSize: 12, fontWeight: 600 }}>
                {f1(quality.pct)} % de las cargas
              </span>
            )
          }
        />
      </div>

      <Section title="Hallazgos y decisiones" hint="Reglas automáticas sobre los datos del mes, ordenadas por gravedad.">
        <div style={{ display: 'grid', gap: 8 }}>
          {ins.map((i, n) => (
            <div
              key={n}
              style={{ background: SEV[i.sev].bg, border: `1px solid ${SEV[i.sev].bd}`, borderLeft: `4px solid ${SEV[i.sev].fg}`, borderRadius: '0.75rem', padding: '10px 14px', color: INK }}
            >
              <div style={{ fontWeight: 600, color: SEV[i.sev].fg }}>
                <span aria-hidden="true">{SEV[i.sev].icon}</span> {SEV[i.sev].label} · {i.area}
              </div>
              <div style={{ fontWeight: 600 }}>{i.title}</div>
              <div style={{ fontSize: 13, color: INK2 }}>{i.detail}</div>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Tendencia" hint="Últimos meses con datos. Un gráfico por magnitud (sin doble eje).">
        <div className="cards" style={GRID_TARJETAS}>
          <TarjetaGrafico
            titulo={tituloKm}
            subtitulo="Km recorridos por mes (GPS y, sin GPS, odómetro)."
            tabla={tablaTendencia('Km recorridos por mes', 'Km', (x) => num(x.km))}
          >
            <Lienzo>
              <ResponsiveContainer>
                <LineChart data={trend} margin={MARGEN}>
                  <CartesianGrid {...GRILLA} />
                  <XAxis dataKey="m" {...EJE} />
                  <YAxis {...EJE} width={56} tickFormatter={(v) => formatoMontoCorto(Number(v))} />
                  <Tooltip cursor={CURSOR_LINEA} content={<TooltipAn formato={(v) => num(v) + ' km'} />} />
                  <Line type="monotone" dataKey="km" name="Km" stroke={PALETA.line} strokeWidth={2} dot={{ r: 3, stroke: '#fff', strokeWidth: 2, fill: PALETA.line }} activeDot={{ r: 5, stroke: '#fff', strokeWidth: 2 }} />
                </LineChart>
              </ResponsiveContainer>
            </Lienzo>
          </TarjetaGrafico>
          <TarjetaGrafico
            titulo={tituloGasto}
            subtitulo="Gasto en combustible y AdBlue por mes, en pesos."
            tabla={tablaTendencia('Gasto en combustible por mes', 'Gasto', (x) => money(x.gasto))}
          >
            <Lienzo>
              <ResponsiveContainer>
                <BarChart data={trend} margin={MARGEN}>
                  <CartesianGrid {...GRILLA} />
                  <XAxis dataKey="m" {...EJE} />
                  <YAxis {...EJE} width={60} domain={[0, 'auto']} tickFormatter={(v) => '$ ' + formatoMontoCorto(Number(v))} />
                  <Tooltip cursor={CURSOR_BARRA} content={<TooltipAn formato={(v) => money(v)} />} />
                  <Bar dataKey="gasto" name="Gasto" fill={PALETA.bar} radius={[4, 4, 0, 0]} maxBarSize={44} />
                </BarChart>
              </ResponsiveContainer>
            </Lienzo>
          </TarjetaGrafico>
          <TarjetaGrafico
            titulo={tituloPk}
            subtitulo="Pesos de combustible por km recorrido, por mes."
            tabla={tablaTendencia('Combustible en pesos por km, por mes', '$/km', (x) => (x.pk === null ? '—' : money(x.pk)))}
            nota={trend.some((x) => x.pk === null) ? 'Los meses sin combustible o sin km no tienen punto; la línea los saltea.' : undefined}
          >
            <Lienzo>
              <ResponsiveContainer>
                <LineChart data={trend} margin={MARGEN}>
                  <CartesianGrid {...GRILLA} />
                  <XAxis dataKey="m" {...EJE} />
                  <YAxis {...EJE} width={56} tickFormatter={(v) => '$ ' + num(Number(v))} />
                  <Tooltip cursor={CURSOR_LINEA} content={<TooltipAn formato={(v) => money(v) + '/km'} />} />
                  <Line type="monotone" dataKey="pk" name="$/km" stroke={PALETA.line} strokeWidth={2} connectNulls dot={{ r: 3, stroke: '#fff', strokeWidth: 2, fill: PALETA.line }} activeDot={{ r: 5, stroke: '#fff', strokeWidth: 2 }} />
                </LineChart>
              </ResponsiveContainer>
            </Lienzo>
          </TarjetaGrafico>
        </div>
      </Section>

      <Section title="Por provincia" hint="Corrientes en violeta claro liso y Misiones en violeta oscuro con trama; la provincia figura además en el eje.">
        <div className="cards" style={GRID_TARJETAS}>
          <TarjetaGrafico
            titulo={tituloProvKm}
            subtitulo="Km recorridos en el mes, por provincia."
            leyenda={provLeyenda(prov.map((p) => p.prov))}
            tabla={tablaProv('Km recorridos por provincia', 'Km', (p) => km0(p.opKm))}
          >
            <Lienzo>
              <ResponsiveContainer>
                <BarChart data={prov} margin={MARGEN}>
                  <Trama id="inf-trama-prov-km" />
                  <CartesianGrid {...GRILLA} />
                  <XAxis dataKey="prov" {...EJE} />
                  <YAxis {...EJE} width={56} domain={[0, 'auto']} tickFormatter={(v) => formatoMontoCorto(Number(v))} />
                  <Tooltip cursor={CURSOR_BARRA} content={<TooltipAn formato={(v) => num(Math.round(v)) + ' km'} />} />
                  <Bar dataKey="opKm" name="Km" fill={PALETA.bar} radius={[4, 4, 0, 0]} maxBarSize={64}>
                    {prov.map((p) => (
                      <Cell key={p.prov} fill={provFill(p.prov, 'inf-trama-prov-km')} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </Lienzo>
          </TarjetaGrafico>
          <TarjetaGrafico
            titulo={tituloProvL}
            subtitulo="Consumo en litros cada 100 km (tanque a tanque), por provincia."
            leyenda={provLeyenda(prov.map((p) => p.prov))}
            tabla={tablaProv('Consumo L/100 km por provincia', 'L/100 km', (p) => f1(p.l100))}
          >
            <Lienzo>
              <ResponsiveContainer>
                <BarChart data={prov} margin={MARGEN}>
                  <Trama id="inf-trama-prov-l100" />
                  <CartesianGrid {...GRILLA} />
                  <XAxis dataKey="prov" {...EJE} />
                  <YAxis {...EJE} width={40} domain={[0, 'auto']} />
                  <Tooltip cursor={CURSOR_BARRA} content={<TooltipAn formato={(v) => f1(v) + ' L/100 km'} />} />
                  <Bar dataKey="l100" name="L/100 km" fill={PALETA.bar} radius={[4, 4, 0, 0]} maxBarSize={64}>
                    {prov.map((p) => (
                      <Cell key={p.prov} fill={provFill(p.prov, 'inf-trama-prov-l100')} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </Lienzo>
          </TarjetaGrafico>
        </div>
        <div className="tw" style={{ marginTop: 12 }}>
          <table>
            <caption className="sr-only">Indicadores del mes por provincia</caption>
            <thead>
              <tr>
                <th scope="col">Provincia</th>
                <th scope="col" className="r">Vehículos</th>
                <th scope="col" className="r">Km</th>
                <th scope="col" className="r">Litros</th>
                <th scope="col" className="r">Cargas</th>
                <th scope="col" className="r">Gasto comb.</th>
                <th scope="col" className="r">L/100 km</th>
                <th scope="col" className="r">Comb. $/km</th>
                <th scope="col" className="r">Costo total $/km</th>
              </tr>
            </thead>
            <tbody className="num">
              {prov.map((p) => (
                <tr key={p.prov}>
                  <th scope="row">{p.prov}</th>
                  <td className="r">{p.vehicles}</td>
                  <td className="r">{km0(p.opKm)}</td>
                  <td className="r">{km0(p.liters)}</td>
                  <td className="r">{p.fills}</td>
                  <td className="r">{mon(p.fuelCost)}</td>
                  <td className="r">{f1(p.l100)}</td>
                  <td className="r">{mon(p.fuelPerKm)}</td>
                  <td className="r">{mon(p.costPerKm)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section
        title="Por chofer"
        hint="Los km de cada tramo entre cargas se atribuyen al chofer que hizo la carga siguiente. La provincia sale de los vehículos que usó."
      >
        {dmF.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <TarjetaGrafico
              titulo={tituloChofer}
              subtitulo="Litros cargados en el mes por los 10 choferes con más litros. El tono y la trama indican la provincia."
              leyenda={provLeyenda(top10.map((x) => x.prov))}
              tabla={() => (
                <table>
                  <caption className="sr-only">Litros cargados por chofer (los 10 con más litros)</caption>
                  <thead>
                    <tr>
                      <th scope="col">Chofer</th>
                      <th scope="col">Provincia</th>
                      <th scope="col" className="r">
                        Litros
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {top10.map((x) => (
                      <tr key={x.full}>
                        <th scope="row">{x.full}</th>
                        <td>{x.prov}</td>
                        <td className="r num">{num(x.litros)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            >
              <Lienzo>
                <ResponsiveContainer>
                  <BarChart data={top10} layout="vertical" margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                    <Trama id="inf-trama-chofer" />
                    <CartesianGrid stroke={PALETA.grid} horizontal={false} />
                    <XAxis type="number" {...EJE} domain={[0, 'auto']} tickFormatter={(v) => formatoMontoCorto(Number(v))} />
                    <YAxis type="category" dataKey="n" {...EJE} width={90} />
                    <Tooltip cursor={CURSOR_BARRA} content={<TooltipAn formato={(v) => num(v) + ' L'} />} />
                    <Bar dataKey="litros" name="Litros" fill={PALETA.bar} radius={[0, 4, 4, 0]} maxBarSize={18}>
                      {top10.map((x) => (
                        <Cell key={x.full} fill={provFill(x.prov, 'inf-trama-chofer')} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </Lienzo>
            </TarjetaGrafico>
          </div>
        )}
        {dmF.length === 0 ? (
          <div className="empty">
            No hay cargas de combustible con chofer en este período{provFilter ? ` para ${provFilter}` : ''}. Importá el archivo de YPF en{' '}
            <Link href="/combustible">Combustible</Link>{provFilter ? ' o elegí «Todas las provincias»' : ''}.
          </div>
        ) : (
        <div className="tw">
          <table>
            <caption className="sr-only">Indicadores del mes por chofer</caption>
            <thead>
              <tr>
                <th scope="col">Chofer</th>
                <th scope="col">Prov.</th>
                <th scope="col" className="r">Cargas</th>
                <th scope="col" className="r">Días c/carga</th>
                <th scope="col" className="r">Litros</th>
                <th scope="col" className="r">Litros/carga</th>
                <th scope="col" className="r">Gasto</th>
                <th scope="col" className="r">Km (odóm.)</th>
                <th scope="col" className="r">L/100 km</th>
                <th scope="col" className="r">Vehíc.</th>
                <th scope="col" className="r">Estac.</th>
                <th scope="col" className="r">Carga en vehíc. ajeno</th>
                <th scope="col" className="r">Lecturas descart.</th>
                <th scope="col">Confiabilidad del km (historial)</th>
                <th scope="col" className="r">Multas</th>
              </tr>
            </thead>
            <tbody className="num">
              {dmF.map((x) => (
                <tr key={x.name}>
                  <th scope="row">{x.name}</th>
                  <td>{x.prov}</td>
                  <td className="r">{x.fills}</td>
                  <td className="r">{x.fillDays}</td>
                  <td className="r">{km0(x.liters)}</td>
                  <td className="r">{f1(x.avgLiters)}</td>
                  <td className="r">{mon(x.amount)}</td>
                  <td className="r">{x.km ? km0(x.km) : '—'}</td>
                  <td className="r">{f1(x.l100)}</td>
                  <td className="r">{x.vehicles}</td>
                  <td className="r">{x.stations}</td>
                  <td className="r">{x.notAssigned || '—'}</td>
                  <td className="r">
                    {x.rejected ? (
                      <b style={{ color: ROJO }}>
                        <span aria-hidden="true">⚠ </span>
                        {x.rejected}
                      </b>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td>
                    {x.trust.level === 'sin historial' ? (
                      <span className="muted">pocas cargas</span>
                    ) : (
                      <span title={`Intervalo de confianza 95 %: ${Math.round(x.trust.lo)}–${Math.round(x.trust.hi)} % de km válidos`}>
                        {x.trust.level === 'alta' ? (
                          <>
                            <span aria-hidden="true">✔ </span>Alta
                          </>
                        ) : x.trust.level === 'baja' ? (
                          <>
                            <span aria-hidden="true">⚠ </span>Baja
                          </>
                        ) : (
                          'Media'
                        )}{' '}
                        <span className="muted">
                          ({Math.round((x.trust.loads * x.trust.validPct) / 100)}/{x.trust.loads} · IC {Math.round(x.trust.lo)}–{Math.round(x.trust.hi)} %)
                        </span>
                      </span>
                    )}
                  </td>
                  <td className="r">{x.finesCount ? `${x.finesCount} (${mon(x.finesAmount)})` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        )}
        <p className="muted" style={{ fontSize: 12 }}>Confianza = cargas con km válido / cargas totales; IC = intervalo de confianza del 95 % del porcentaje de km válidos (con pocas cargas es muy ancho). Un km inválido puede ser error de la estación: no es una acusación al conductor.</p>
        {!finesLoaded && <p className="muted">Multas: todavía no hay infracciones cargadas en este período.</p>}
      </Section>

      <Section
        title="Calidad de los km declarados en las estaciones"
        hint="En el surtidor el playero digita el km del tablero que le informa el chofer. Cuando el km no se informa o se tipea mal (número inventado, incompleto), ese dato se descarta y no sirve para controlar consumo ni mantenimiento. El error puede ser del playero o de la falta de aviso: no implica culpa del chofer."
      >
        <div className="warn" style={{ color: INK, marginBottom: 12 }}>
          <b>Aviso para todos los choferes:</b> al cargar combustible, decile SIEMPRE al playero el kilometraje exacto que marca el
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
                <h3 style={{ fontSize: '0.9375rem', margin: '0 0 6px' }}>Por chofer (a nombre de quién quedó la carga)</h3>
                <div className="tw">
                  <table>
                    <caption className="sr-only">Cargas con km inválido por chofer</caption>
                    <thead>
                      <tr>
                        <th scope="col">Chofer</th>
                        <th scope="col" className="r">Cargas</th>
                        <th scope="col" className="r">Km inválidos</th>
                        <th scope="col" className="r">%</th>
                      </tr>
                    </thead>
                    <tbody className="num">
                      {quality.byDriver
                        .filter((r) => r.invalid > 0)
                        .map((r) => (
                          <tr key={r.name}>
                            <th scope="row">{r.name}</th>
                            <td className="r">{r.loads}</td>
                            <td className="r">
                              <b>{r.invalid}</b>
                            </td>
                            <td className="r">{f1(r.pct, 0)} %</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>
              <div>
                <h3 style={{ fontSize: '0.9375rem', margin: '0 0 6px' }}>Por estación de servicio</h3>
                <div className="tw">
                  <table>
                    <caption className="sr-only">Cargas con km inválido por estación de servicio (las 10 con más)</caption>
                    <thead>
                      <tr>
                        <th scope="col">Estación</th>
                        <th scope="col" className="r">Cargas</th>
                        <th scope="col" className="r">Km inválidos</th>
                        <th scope="col" className="r">%</th>
                      </tr>
                    </thead>
                    <tbody className="num">
                      {quality.byStation
                        .filter((r) => r.invalid > 0)
                        .slice(0, 10)
                        .map((r) => (
                          <tr key={r.name}>
                            <th scope="row" style={{ fontWeight: 400 }}>{r.name}</th>
                            <td className="r">{r.loads}</td>
                            <td className="r">
                              <b>{r.invalid}</b>
                            </td>
                            <td className="r">{f1(r.pct, 0)} %</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
            <h3 style={{ fontSize: '0.9375rem', margin: '14px 0 6px' }}>Detalle de cada carga con km inválido</h3>
            <div className="tw">
              <table>
                <caption className="sr-only">Detalle de cada carga con km inválido</caption>
                <thead>
                  <tr>
                    <th scope="col">Fecha</th>
                    <th scope="col">Vehículo</th>
                    <th scope="col">Chofer</th>
                    <th scope="col">Estación</th>
                    <th scope="col" className="r">Km declarado</th>
                    <th scope="col" className="r">Km esperable</th>
                    <th scope="col">Motivo</th>
                  </tr>
                </thead>
                <tbody className="num">
                  {invalid.map((r) => (
                    <tr key={r.load.id}>
                      <td>{fd(r.load.date)}</td>
                      <td>
                        <b>{r.plate}</b>
                      </td>
                      <td>{r.driver}</td>
                      <td>{r.station}</td>
                      <td className="r">
                        <b>{num(r.declared)}</b>
                      </td>
                      <td className="r">{r.expected === null ? '—' : `≈ ${num(r.expected)}`}</td>
                      <td className="muted">{r.why}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <div className="empty">
            <span aria-hidden="true">✔ </span>Todas las cargas del mes tienen un km coherente.
          </div>
        )}
      </Section>

      <Section title="Por vehículo" hint="Km por GPS cuando el vehículo lo tiene; si no, por odómetro de las estaciones. El costo suma combustible, mantenimiento y reparaciones.">
        <div className="tw">
          <table>
            <caption className="sr-only">Indicadores del mes por vehículo, ordenados por km</caption>
            <thead>
              <tr>
                <th scope="col">Vehículo</th>
                <th scope="col">Prov.</th>
                <th scope="col">Chofer asignado</th>
                <th scope="col" className="r">Km GPS</th>
                <th scope="col" className="r">Km odóm.</th>
                <th scope="col" className="r">Cargas</th>
                <th scope="col" className="r">Litros</th>
                <th scope="col" className="r">L/100 km</th>
                <th scope="col" className="r">vs ref.</th>
                <th scope="col" className="r">Gasto comb.</th>
                <th scope="col" className="r">Mant.+Rep.</th>
                <th scope="col" className="r">Costo $/km</th>
                <th scope="col" className="r">Uso</th>
              </tr>
            </thead>
            <tbody className="num">
              {[...vmF]
                .sort((a, b) => (b.opKm ?? 0) - (a.opKm ?? 0))
                .map((r) => (
                  <tr key={r.v.id}>
                    <th scope="row">
                      <Link href={`/vehiculos/${r.v.id}`}>
                        <b>{r.v.plate}</b>
                      </Link>{' '}
                      <span className="muted" style={{ fontWeight: 400 }}>
                        {r.v.type}
                        {r.v.status === 'Baja' ? ' · de baja' : ''}
                      </span>
                    </th>
                    <td>{r.prov}</td>
                    <td>{r.driverName}</td>
                    <td className="r">{r.hasGps ? km0(r.gpsKm) : <span className="muted">sin GPS</span>}</td>
                    <td className="r">{km0(r.odoKm)}</td>
                    <td className="r">{r.fills}</td>
                    <td className="r">{km0(r.liters)}</td>
                    <td className="r">{f1(r.l100)}</td>
                    <td className="r">
                      {r.l100Dev === null ? (
                        '—'
                      ) : (
                        <b style={{ color: r.l100Signif ? ROJO : INK2 }}>
                          {r.l100Dev > 0 ? '+' : ''}
                          {f1(r.l100Dev, 0)} %
                          {r.l100Signif && (
                            <>
                              <span aria-hidden="true"> ⚠</span>
                              <span className="sr-only"> (desvío significativo)</span>
                            </>
                          )}
                        </b>
                      )}
                    </td>
                    <td className="r">{mon(r.fuelCost)}</td>
                    <td className="r">{mon(r.maintCost + r.repairCost)}</td>
                    <td className="r">{mon(r.costPerKm)}</td>
                    <td className="r">{r.utilization === null ? '—' : `${Math.round(r.utilization * 100)} % de los días`}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="Cumplimiento y riesgo">
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
