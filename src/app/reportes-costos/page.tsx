'use client';
import { useId, useState } from 'react';
import Link from 'next/link';
import { useData } from '@/lib/data';
import { money, num } from '@/lib/util';
import { guard } from '@/lib/util';
import { calcularAnalisisCostos } from '@/lib/analisisHelpers';
import { TarjetaGrafico, TooltipAn, EJE, GRILLA, CURSOR_BARRA, CURSOR_LINEA, PALETA, SERIES } from '@/components/Charts';
import { formatoMontoCorto, indiceMaximo, variacion } from '@/lib/graficos';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  Cell,
  LabelList,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

/** "2026-10" → "10/2026" (mismo formato que el selector de mes). */
const mesLabel = (ym: string) => ym.split('-').reverse().join('/');
const montoEje = (v: number) => '$ ' + formatoMontoCorto(v);
const pctTexto = (x: number) => `${Math.round(x * 100)} %`;

const TIPOS_LABEL: Record<string, string> = {
  combustible: 'combustible',
  reparaciones: 'reparaciones',
  mantenimiento: 'mantenimiento',
  multas: 'multas',
};

export default function ReportesCostos() {
  const { vehicles, fuel_loads, repairs, maintenance, infractions, km_reports } = useData();
  const [selectedMonth, setSelectedMonth] = useState('');
  const [selectedYear] = useState(new Date().getFullYear());
  const [selectedBranch, setSelectedBranch] = useState<string | null>(null);
  const [tipoGasto, setTipoGasto] = useState<'todos' | 'combustible' | 'reparaciones' | 'mantenimiento' | 'multas'>(
    'todos'
  );
  // Ids únicos para los patrones SVG (useId puede traer caracteres no válidos en url(#…)).
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const patRayado = `rc-rayado-${uid}`;
  const patPuntos = `rc-puntos-${uid}`;

  // Obtener meses únicos
  const months = [...new Set(fuel_loads.map((f) => `${f.date.split('-')[0]}-${f.date.split('-')[1]}`))]
    .sort()
    .reverse();
  const month = months.includes(selectedMonth) ? selectedMonth : (months[0] ?? '');
  const [year, m] = (month || `${selectedYear}-01`).split('-').map(Number);

  // Calcular análisis
  const analisis = calcularAnalisisCostos(
    vehicles,
    fuel_loads,
    repairs,
    maintenance,
    infractions,
    km_reports,
    m,
    year,
    selectedBranch || undefined
  );
  const branches = [...new Set(vehicles.map((v) => v.branch))];
  const branch = selectedBranch && branches.includes(selectedBranch) ? selectedBranch : (branches[0] ?? null);

  // Filtrar por tipo gasto
  let dataFiltrada = analisis;
  if (tipoGasto !== 'todos') {
    dataFiltrada = analisis.filter((a) => {
      if (tipoGasto === 'combustible') return a.combustible > 0;
      if (tipoGasto === 'reparaciones') return a.reparaciones > 0;
      if (tipoGasto === 'mantenimiento') return a.mantenimiento > 0;
      if (tipoGasto === 'multas') return a.multas > 0;
      return true;
    });
  }

  // Datos para gráficos
  const costosPorVehiculo = dataFiltrada.slice(0, 12).map((a) => ({
    patente: a.plate,
    combustible: a.combustible,
    reparaciones: a.reparaciones,
    mantenimiento: a.mantenimiento,
    multas: a.multas,
  }));

  const evolucionData = [...new Set(fuel_loads.map((f) => `${f.date.split('-')[0]}-${f.date.split('-')[1]}`))]
    .sort()
    .slice(-12)
    .map((ym) => {
      const [y, m] = ym.split('-').map(Number);
      const costos = calcularAnalisisCostos(
        vehicles,
        fuel_loads,
        repairs,
        maintenance,
        infractions,
        km_reports,
        m,
        y,
        branch || undefined
      );
      const costo = costos.length > 0 ? costos.reduce((s, c) => s + c.costoPorKm, 0) / costos.length : 0;
      return { mes: ym, costoPorKm: Math.round(costo * 100) / 100 };
    });

  const gastosPorTipo = [
    { name: 'Combustible', value: dataFiltrada.reduce((s, a) => s + a.combustible, 0) },
    { name: 'Reparaciones', value: dataFiltrada.reduce((s, a) => s + a.reparaciones, 0) },
    { name: 'Mantenimiento', value: dataFiltrada.reduce((s, a) => s + a.mantenimiento, 0) },
    { name: 'Multas', value: dataFiltrada.reduce((s, a) => s + a.multas, 0) },
  ].filter((g) => g.value > 0);

  // KPIs
  const totalCostos = dataFiltrada.reduce((s, a) => s + a.totalCostos, 0);
  const costoPorKmPromedio =
    dataFiltrada.length > 0
      ? Math.round((dataFiltrada.reduce((s, a) => s + a.costoPorKm, 0) / dataFiltrada.length) * 100) / 100
      : 0;
  const kmTotales = dataFiltrada.reduce((s, a) => s + a.kmRecorridos, 0);

  // ---- Presentación: hallazgos, series y tablas equivalentes ----
  const alcance = `${mesLabel(month)}${branch ? ` · ${branch}` : ''}`;

  // 4 categorías: colores de SERIES + trama (rayado a 45° y puntos) en dos de ellas.
  const categorias = [
    { key: 'combustible', label: 'Combustible', fill: SERIES[0].color },
    { key: 'reparaciones', label: 'Reparaciones', fill: `url(#${patRayado})` },
    { key: 'mantenimiento', label: 'Mantenimiento', fill: `url(#${patPuntos})` },
    { key: 'multas', label: 'Multas', fill: SERIES[3].color },
  ] as const;

  const totalesVehiculo = costosPorVehiculo.map(
    (d) => d.combustible + d.reparaciones + d.mantenimiento + d.multas
  );
  const iMaxVeh = indiceMaximo(totalesVehiculo);
  const tituloVehiculos =
    iMaxVeh >= 0 && totalesVehiculo[iMaxVeh] > 0
      ? `${costosPorVehiculo[iMaxVeh].patente} es el vehículo con más gasto: ${money(Math.round(totalesVehiculo[iMaxVeh]))}`
      : 'Ningún vehículo registró gastos en el período';
  const totalGrafico = totalesVehiculo.reduce((s, v) => s + v, 0);

  const ultimo = evolucionData[evolucionData.length - 1];
  const previo = evolucionData[evolucionData.length - 2];
  const varEvol = ultimo && previo ? variacion(ultimo.costoPorKm, previo.costoPorKm) : null;
  const iMaxEvol = indiceMaximo(evolucionData.map((d) => d.costoPorKm));
  const tituloEvol =
    varEvol !== null && ultimo && previo
      ? varEvol === 0
        ? `En ${mesLabel(ultimo.mes)} el costo por km se mantuvo igual que en ${mesLabel(previo.mes)}`
        : `En ${mesLabel(ultimo.mes)} el costo por km ${varEvol > 0 ? 'subió' : 'bajó'} ${pctTexto(Math.abs(varEvol))} respecto de ${mesLabel(previo.mes)}`
      : iMaxEvol >= 0
        ? `${mesLabel(evolucionData[iMaxEvol].mes)} tuvo el costo por km más alto: ${money(evolucionData[iMaxEvol].costoPorKm)}`
        : 'Evolución del costo por km';

  const totalTipos = gastosPorTipo.reduce((s, g) => s + g.value, 0);
  const tiposOrdenados = [...gastosPorTipo]
    .sort((a, b) => b.value - a.value)
    .map((g) => ({
      ...g,
      share: totalTipos > 0 ? g.value / totalTipos : 0,
      etiqueta: `${money(Math.round(g.value))} · ${totalTipos > 0 ? pctTexto(g.value / totalTipos) : '—'}`,
    }));
  const iMaxTipo = indiceMaximo(tiposOrdenados.map((g) => g.value));
  const tituloTipos =
    iMaxTipo >= 0
      ? `${tiposOrdenados[iMaxTipo].name} ${tiposOrdenados[iMaxTipo].share >= 0.995 ? 'es todo' : `es el ${pctTexto(tiposOrdenados[iMaxTipo].share)} del`} gasto`
      : 'Distribución del gasto';

  return (
    <>
      <div style={{ marginBottom: 16 }}>
        <div className="an-eyebrow">Reportes</div>
        <h2 style={{ margin: '4px 0 0' }}>Análisis de costos</h2>
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <div className="bar" style={{ marginBottom: 0 }}>
          {months.length > 0 && (
            <>
              <label htmlFor="rc-mes">Mes</label>
              <select id="rc-mes" value={month} onChange={(e) => setSelectedMonth(e.target.value)}>
                {months.map((m) => (
                  <option key={m} value={m}>
                    {mesLabel(m)}
                  </option>
                ))}
              </select>
              {branches.length > 0 && (
                <>
                  <label htmlFor="rc-sucursal">Sucursal</label>
                  <select
                    id="rc-sucursal"
                    value={branch || ''}
                    onChange={(e) => setSelectedBranch(e.target.value || null)}
                  >
                    <option value="">Todas las sucursales</option>
                    {branches.map((b) => (
                      <option key={b} value={b}>
                        {b}
                      </option>
                    ))}
                  </select>
                </>
              )}
              <label htmlFor="rc-tipo">Tipo de gasto</label>
              <select id="rc-tipo" value={tipoGasto} onChange={(e) => setTipoGasto(e.target.value as any)}>
                <option value="todos">Todos los gastos</option>
                <option value="combustible">Solo combustible</option>
                <option value="reparaciones">Solo reparaciones</option>
                <option value="mantenimiento">Solo mantenimiento</option>
                <option value="multas">Solo multas</option>
              </select>
            </>
          )}
          <span className="sp" />
          {month && (
            <>
              <button
                className="b2"
                onClick={() =>
                  guard(async () => {
                    const excel = await import('@/lib/excelExports').then((m) => m.exportarCostosExcel);
                    excel(dataFiltrada, month.split('-'), branch);
                  })
                }
              >
                Descargar Excel
              </button>
              <button
                className="b1"
                onClick={() =>
                  guard(async () => {
                    const pdf = await import('@/lib/costosPdf').then((m) => m.generateCostosPdf);
                    pdf(dataFiltrada, month.split('-'), branch);
                  })
                }
              >
                Descargar PDF
              </button>
            </>
          )}
        </div>
      </div>

      {dataFiltrada.length > 0 ? (
        <>
          <div className="cards">
            <div className="card">
              <div className="n">{money(Math.round(totalCostos))}</div>
              <div className="l">Costo total</div>
            </div>
            <div className="card">
              <div className="n">{money(costoPorKmPromedio)}</div>
              <div className="l">Costo promedio por km</div>
            </div>
            <div className="card">
              <div className="n">{num(kmTotales)}</div>
              <div className="l">Km recorridos</div>
            </div>
            <div className="card">
              <div className="n">{dataFiltrada.length}</div>
              <div className="l">Vehículos</div>
            </div>
          </div>

          {costosPorVehiculo.length > 0 && (
            <TarjetaGrafico
              titulo={tituloVehiculos}
              subtitulo={`Gasto de ${alcance} por tipo, en los ${costosPorVehiculo.length} vehículos con mayor costo por km.`}
              leyenda={categorias.map((c) => ({ label: c.label, color: c.fill }))}
              tabla={() => (
                <table>
                  <caption className="sr-only">
                    Gasto por tipo de los {costosPorVehiculo.length} vehículos con mayor costo por km, {alcance}
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">Patente</th>
                      {categorias.map((c) => (
                        <th key={c.key} scope="col" className="r">
                          {c.label}
                        </th>
                      ))}
                      <th scope="col" className="r">
                        Total
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {costosPorVehiculo.map((d, i) => (
                      <tr key={d.patente + i}>
                        <th scope="row">{d.patente}</th>
                        {categorias.map((c) => (
                          <td key={c.key} className="r num">
                            {money(d[c.key])}
                          </td>
                        ))}
                        <td className="r num">
                          <b>{money(Math.round(totalesVehiculo[i] * 100) / 100)}</b>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <th scope="row">Total</th>
                      {categorias.map((c) => (
                        <td key={c.key} className="r num">
                          {money(Math.round(costosPorVehiculo.reduce((s, d) => s + d[c.key], 0) * 100) / 100)}
                        </td>
                      ))}
                      <td className="r num">{money(Math.round(totalGrafico * 100) / 100)}</td>
                    </tr>
                  </tfoot>
                </table>
              )}
            >
              <ResponsiveContainer width="100%" height={320}>
                <BarChart data={costosPorVehiculo} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <defs>
                    <pattern
                      id={patRayado}
                      width="6"
                      height="6"
                      patternUnits="userSpaceOnUse"
                      patternTransform="rotate(45)"
                    >
                      <rect width="6" height="6" fill={SERIES[1].color} />
                      <line x1="0" y1="0" x2="0" y2="6" stroke="#ffffff" strokeWidth="1.6" />
                    </pattern>
                    <pattern id={patPuntos} width="5" height="5" patternUnits="userSpaceOnUse">
                      <rect width="5" height="5" fill={SERIES[2].color} />
                      <circle cx="2.5" cy="2.5" r="1" fill="#ffffff" />
                    </pattern>
                  </defs>
                  <CartesianGrid {...GRILLA} />
                  <XAxis
                    dataKey="patente"
                    {...EJE}
                    interval={0}
                    angle={-40}
                    textAnchor="end"
                    height={62}
                  />
                  <YAxis {...EJE} domain={[0, 'auto']} tickFormatter={montoEje} width={60} />
                  <Tooltip cursor={CURSOR_BARRA} content={<TooltipAn formato={(v) => money(v)} />} />
                  {categorias.map((c) => (
                    <Bar
                      key={c.key}
                      dataKey={c.key}
                      name={c.label}
                      stackId="gasto"
                      fill={c.fill}
                      stroke="#ffffff"
                      strokeWidth={1}
                      maxBarSize={48}
                    />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </TarjetaGrafico>
          )}

          {evolucionData.length > 1 && (
            <TarjetaGrafico
              titulo={tituloEvol}
              subtitulo={`Promedio del costo por km de los vehículos${branch ? ` de ${branch}` : ''}, últimos ${evolucionData.length} meses con cargas de combustible.`}
              tabla={() => (
                <table>
                  <caption className="sr-only">Costo por km promedio por mes{branch ? ` en ${branch}` : ''}</caption>
                  <thead>
                    <tr>
                      <th scope="col">Mes</th>
                      <th scope="col" className="r">
                        Costo por km
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {evolucionData.map((d) => (
                      <tr key={d.mes}>
                        <th scope="row">{mesLabel(d.mes)}</th>
                        <td className="r num">{money(d.costoPorKm)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            >
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={evolucionData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                  <CartesianGrid {...GRILLA} />
                  <XAxis dataKey="mes" {...EJE} tickFormatter={mesLabel} />
                  <YAxis {...EJE} domain={[0, 'auto']} tickFormatter={montoEje} width={60} />
                  <Tooltip
                    cursor={CURSOR_LINEA}
                    content={<TooltipAn formato={(v) => money(v)} titulo={(l) => mesLabel(String(l ?? ''))} />}
                  />
                  <Line
                    type="monotone"
                    dataKey="costoPorKm"
                    name="Costo por km"
                    stroke={PALETA.line}
                    strokeWidth={2.5}
                    dot={{ r: 3, fill: PALETA.line, strokeWidth: 0 }}
                    activeDot={{ r: 5 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </TarjetaGrafico>
          )}

          {tiposOrdenados.length > 0 && (
            <TarjetaGrafico
              titulo={tituloTipos}
              subtitulo={`Gasto total de ${alcance} por tipo, de mayor a menor, con su parte del total.`}
              tabla={() => (
                <table>
                  <caption className="sr-only">Gasto por tipo, {alcance}</caption>
                  <thead>
                    <tr>
                      <th scope="col">Tipo</th>
                      <th scope="col" className="r">
                        Monto
                      </th>
                      <th scope="col" className="r">
                        % del total
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {tiposOrdenados.map((g) => (
                      <tr key={g.name}>
                        <th scope="row">{g.name}</th>
                        <td className="r num">{money(Math.round(g.value * 100) / 100)}</td>
                        <td className="r num">{pctTexto(g.share)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <th scope="row">Total</th>
                      <td className="r num">{money(Math.round(totalTipos * 100) / 100)}</td>
                      <td className="r num">100 %</td>
                    </tr>
                  </tfoot>
                </table>
              )}
            >
              <ResponsiveContainer width="100%" height={Math.max(140, tiposOrdenados.length * 52 + 30)}>
                <BarChart
                  data={tiposOrdenados}
                  layout="vertical"
                  margin={{ top: 4, right: 150, left: 8, bottom: 4 }}
                >
                  <CartesianGrid {...GRILLA} vertical horizontal={false} />
                  <XAxis type="number" {...EJE} domain={[0, 'auto']} tickFormatter={montoEje} />
                  <YAxis type="category" dataKey="name" {...EJE} width={104} />
                  <Tooltip cursor={CURSOR_BARRA} content={<TooltipAn formato={(v) => money(v)} />} />
                  <Bar dataKey="value" name="Gasto" radius={[0, 4, 4, 0]} maxBarSize={32}>
                    {tiposOrdenados.map((_, i) => (
                      <Cell key={i} fill={i === iMaxTipo ? PALETA.barStrong : PALETA.bar} />
                    ))}
                    <LabelList
                      dataKey="etiqueta"
                      position="right"
                      style={{ fill: PALETA.ink, fontSize: 12, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}
                    />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </TarjetaGrafico>
          )}

          <section style={{ marginTop: 8 }}>
            <h3>Detalle completo de costos</h3>
            <div className="tw">
              <table>
                <caption className="sr-only">
                  Detalle de costos por vehículo, {alcance}, ordenado por costo por km
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Patente</th>
                    <th scope="col" className="r">
                      Combustible
                    </th>
                    <th scope="col" className="r">
                      Reparaciones
                    </th>
                    <th scope="col" className="r">
                      Mantenimiento
                    </th>
                    <th scope="col" className="r">
                      Multas
                    </th>
                    <th scope="col" className="r">
                      Total
                    </th>
                    <th scope="col" className="r">
                      Costo/km
                    </th>
                    <th scope="col" className="r">
                      Variación
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {dataFiltrada.map((a) => (
                    <tr key={a.vehicle_id}>
                      <th scope="row">{a.plate}</th>
                      <td className="r num">{money(a.combustible)}</td>
                      <td className="r num">{money(a.reparaciones)}</td>
                      <td className="r num">{money(a.mantenimiento)}</td>
                      <td className="r num">{money(a.multas)}</td>
                      <td className="r num">
                        <b>{money(a.totalCostos)}</b>
                      </td>
                      <td className="r num">{money(a.costoPorKm)}</td>
                      <td
                        className="r num"
                        style={{
                          color: a.variacionMesAnterior
                            ? a.variacionMesAnterior > 0
                              ? '#b91c1c'
                              : '#166534'
                            : undefined,
                        }}
                      >
                        {a.variacionMesAnterior ? (
                          <>
                            <span aria-hidden="true">{a.variacionMesAnterior > 0 ? '▲ ' : '▼ '}</span>
                            {`${a.variacionMesAnterior > 0 ? '+' : ''}${a.variacionMesAnterior} %`}
                            <span className="sr-only">
                              {a.variacionMesAnterior > 0 ? ' (más caro por km)' : ' (más barato por km)'}
                            </span>
                          </>
                        ) : (
                          '—'
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <th scope="row">Total</th>
                    <td className="r num">
                      {money(Math.round(dataFiltrada.reduce((s, a) => s + a.combustible, 0) * 100) / 100)}
                    </td>
                    <td className="r num">
                      {money(Math.round(dataFiltrada.reduce((s, a) => s + a.reparaciones, 0) * 100) / 100)}
                    </td>
                    <td className="r num">
                      {money(Math.round(dataFiltrada.reduce((s, a) => s + a.mantenimiento, 0) * 100) / 100)}
                    </td>
                    <td className="r num">
                      {money(Math.round(dataFiltrada.reduce((s, a) => s + a.multas, 0) * 100) / 100)}
                    </td>
                    <td className="r num">{money(Math.round(totalCostos * 100) / 100)}</td>
                    <td colSpan={2} />
                  </tr>
                </tfoot>
              </table>
            </div>
          </section>
        </>
      ) : (
        <div className="empty">
          {months.length === 0 ? (
            <>
              No hay cargas de combustible registradas, y los meses de este análisis salen de ellas. Cargalas o
              importalas en <Link className="lk" href="/combustible">Combustible</Link>.
            </>
          ) : tipoGasto !== 'todos' ? (
            <>
              Ningún vehículo tiene gastos de {TIPOS_LABEL[tipoGasto]} en {mesLabel(month)}
              {branch ? ` en ${branch}` : ''}. Elegí «Todos los gastos» u otro mes.
            </>
          ) : (
            <>
              No hay vehículos {branch ? `en ${branch} ` : ''}para analizar en {mesLabel(month)}. Revisá la sucursal
              en <Link className="lk" href="/vehiculos">Vehículos</Link> o elegí otro mes.
            </>
          )}
        </div>
      )}
    </>
  );
}
