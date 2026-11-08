'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useData } from '@/lib/data';
import { money, num, guard } from '@/lib/util';
import { calcularAnalisisConductores } from '@/lib/analisisHelpers';
import {
  BarChart,
  Bar,
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LabelList,
} from 'recharts';
import {
  TarjetaGrafico,
  TooltipAn,
  EJE,
  GRILLA,
  CURSOR_BARRA,
  CURSOR_LINEA,
  PALETA,
  GraficoVacio,
} from '@/components/Charts';
import { indiceMaximo, variacion } from '@/lib/graficos';

/** Trama a 45° para la serie "Pendientes" (se distingue de "Total" sin depender sólo del tono). */
const TRAMA_ID = 'an-trama-pendientes';

const pct = (v: number) => Math.round(v * 100).toLocaleString('es-AR') + ' %';
const kmL = (v: number) => v.toLocaleString('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' km/L';

type Punto = { name: string; rating: number; infracciones: number; excesos: number; size: number };

function TooltipPunto({ active, payload }: { active?: boolean; payload?: readonly { payload?: Punto }[] }) {
  const d = active ? payload?.[0]?.payload : undefined;
  if (!d) return null;
  return (
    <div className="an-tooltip">
      <div className="t">{d.name}</div>
      <div className="row">
        <span>Infracciones</span>
        <b>{d.infracciones}</b>
      </div>
      <div className="row">
        <span>Rating de seguridad</span>
        <b>{d.rating}</b>
      </div>
      <div className="row">
        <span>Días con exceso</span>
        <b>{d.excesos}</b>
      </div>
    </div>
  );
}

function nivelRating(r: number): { cls: string; txt: string } {
  if (r >= 80) return { cls: 'ok', txt: 'alto' };
  if (r >= 60) return { cls: 'urgente', txt: 'medio' };
  return { cls: 'vencido', txt: 'bajo' };
}

export default function ReportesConductores() {
  const { drivers, infractions, trips, vehicles, fuel_loads } = useData();
  const [selectedMonth, setSelectedMonth] = useState('');
  const [selectedYear] = useState(new Date().getFullYear());
  const [selectedBranch, setSelectedBranch] = useState<string | null>(null);

  // Obtener meses únicos
  const months = [...new Set(infractions.map((i) => `${i.date.split('-')[0]}-${i.date.split('-')[1]}`))]
    .sort()
    .reverse();
  const month = months.includes(selectedMonth) ? selectedMonth : (months[0] ?? '');
  const [year, m] = (month || `${selectedYear}-01`).split('-').map(Number);
  const mesTxt = `${String(m).padStart(2, '0')}/${year}`;

  // Calcular análisis
  const analisis = calcularAnalisisConductores(
    drivers,
    infractions,
    trips,
    vehicles,
    fuel_loads,
    m,
    year,
    selectedBranch || undefined
  );
  const branches = [...new Set(vehicles.map((v) => v.branch))];
  const branch = selectedBranch && branches.includes(selectedBranch) ? selectedBranch : (branches[0] ?? null);

  // KPIs
  const ratingPromedio =
    analisis.length > 0 ? Math.round(analisis.reduce((s, a) => s + a.ratingSeguridad, 0) / analisis.length) : 0;
  const infraccionesTotal = analisis.reduce((s, a) => s + a.totalInfracciones, 0);
  const pendientesTotal = analisis.reduce((s, a) => s + a.infraccionesPendientes, 0);
  const multasTotal = analisis.reduce((s, a) => s + a.multasAcumuladas, 0);

  // Datos para gráficos (sólo presentación: el gráfico de ranking ordena por infracciones)
  const infraccionesData = [...analisis]
    .sort((a, b) => b.totalInfracciones - a.totalInfracciones)
    .slice(0, 10)
    .map((a) => ({
      name: a.name.split(' ')[0],
      nombre: a.name,
      infracciones: a.totalInfracciones,
      pendientes: a.infraccionesPendientes,
    }));
  const iTopInf = indiceMaximo(infraccionesData.map((d) => d.infracciones));
  const topInf = iTopInf >= 0 ? infraccionesData[iTopInf] : null;
  const tituloInf =
    infraccionesTotal === 0 || !topInf
      ? `Ningún conductor registra infracciones en ${mesTxt}`
      : `${topInf.nombre} concentra ${topInf.infracciones} de las ${infraccionesTotal} infracciones del mes`;

  const ratingData: Punto[] = analisis.map((a) => ({
    name: a.name,
    rating: a.ratingSeguridad,
    infracciones: a.totalInfracciones,
    excesos: a.diasConExceso,
    size: a.kmTotal || 100,
  }));
  // El peor rating (y, a igualdad, más infracciones) se etiqueta en el gráfico
  const iPeor = indiceMaximo(ratingData.map((d) => 100 - d.rating + d.infracciones / 1000));
  const peor = iPeor >= 0 ? ratingData[iPeor] : null;
  const todosPerfectos = ratingData.every((d) => d.rating === 100);
  const tituloRating =
    !peor || todosPerfectos
      ? `Todos los conductores mantienen rating 100 en ${mesTxt}`
      : `${peor.name} tiene el rating de seguridad más bajo: ${peor.rating} de 100`;

  const eficienciaData = analisis
    .filter((a) => a.eficiencia > 0)
    .sort((a, b) => b.eficiencia - a.eficiencia)
    .slice(0, 10)
    .map((a) => ({ name: a.name, eficiencia: a.eficiencia }));
  const sinEficiencia = analisis.filter((a) => !(a.eficiencia > 0)).length;
  const mejorEf = eficienciaData[0];
  const peorEf = eficienciaData[eficienciaData.length - 1];
  const varEf = eficienciaData.length > 1 ? variacion(mejorEf.eficiencia, peorEf.eficiencia) : null;
  const tituloEf = !mejorEf
    ? 'No hay rendimiento calculable en el mes'
    : varEf !== null && varEf > 0
      ? `${mejorEf.name} rinde ${pct(varEf)} más que ${peorEf.name} (${kmL(mejorEf.eficiencia)})`
      : `${mejorEf.name} rinde ${kmL(mejorEf.eficiencia)}`;

  return (
    <>
      <div className="bar">
        <div>
          <p className="an-eyebrow" style={{ margin: 0 }}>
            Reportes
          </p>
          <h2 style={{ margin: 0 }}>Análisis de conductores</h2>
        </div>
      </div>

      {months.length > 0 && (
        <div className="card no-print" style={{ marginBottom: 20 }}>
          <div className="bar" style={{ margin: 0, alignItems: 'flex-end' }}>
            <div className="fg" style={{ margin: 0 }}>
              <label htmlFor="rc-mes">Mes</label>
              <select id="rc-mes" value={month} onChange={(e) => setSelectedMonth(e.target.value)}>
                {months.map((m) => (
                  <option key={m} value={m}>
                    {m.split('-').reverse().join('/')}
                  </option>
                ))}
              </select>
            </div>
            {branches.length > 0 && (
              <div className="fg" style={{ margin: 0 }}>
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
              </div>
            )}
            <span className="sp" />
            {month && (
              <>
                <button
                  className="b1"
                  onClick={() =>
                    guard(async () => {
                      const pdf = await import('@/lib/conductorPdf').then((m) => m.generateConductorPdf);
                      pdf(analisis, month.split('-'), branch);
                    })
                  }
                >
                  Descargar PDF
                </button>
                <button
                  className="b2"
                  onClick={() =>
                    guard(async () => {
                      const excel = await import('@/lib/excelExports').then((m) => m.exportarConductoresExcel);
                      excel(analisis, month.split('-'), branch);
                    })
                  }
                >
                  Exportar Excel
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {months.length === 0 && analisis.length > 0 && (
        <div className="warn" role="status">
          <span aria-hidden="true">⚠ </span>
          Todavía no hay infracciones cargadas. El mes del reporte se elige entre los meses que tienen infracciones,
          así que por ahora se muestra {mesTxt} y no se puede exportar. Cargá infracciones en{' '}
          <Link className="lk" href="/infracciones">
            Infracciones
          </Link>
          .
        </div>
      )}

      {analisis.length > 0 ? (
        <>
          <div className="cards">
            <div className="card">
              <div className="n">{ratingPromedio}</div>
              <div className="l">Rating de seguridad promedio (0 a 100)</div>
            </div>
            <div className="card">
              <div className="n">{infraccionesTotal}</div>
              <div className="l">Infracciones en el mes</div>
              {pendientesTotal > 0 && (
                <div className="kpi-mk urgente" style={{ marginTop: 6 }}>
                  <i aria-hidden="true">!</i>
                  {pendientesTotal} pendientes de pago
                </div>
              )}
            </div>
            <div className="card">
              <div className="n">{money(Math.round(multasTotal))}</div>
              <div className="l">Multas acumuladas</div>
            </div>
            <div className="card">
              <div className="n">{analisis.length}</div>
              <div className="l">Conductores</div>
            </div>
          </div>

          <TarjetaGrafico
            titulo={tituloInf}
            subtitulo={`Infracciones totales y pendientes de pago por conductor en ${mesTxt}. Los 10 con más infracciones.`}
            leyenda={[
              { label: 'Total', color: PALETA.bar },
              { label: 'Pendientes de pago', color: `url(#${TRAMA_ID})` },
            ]}
            tabla={() => (
              <table>
                <caption className="sr-only">Infracciones por conductor, {mesTxt}</caption>
                <thead>
                  <tr>
                    <th scope="col">Conductor</th>
                    <th scope="col" className="r">
                      Total
                    </th>
                    <th scope="col" className="r">
                      Pendientes
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {infraccionesData.map((d) => (
                    <tr key={d.nombre}>
                      <th scope="row">{d.nombre}</th>
                      <td className="r">{d.infracciones}</td>
                      <td className="r">{d.pendientes}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <th scope="row">Total del mes (todos los conductores)</th>
                    <td className="r">{infraccionesTotal}</td>
                    <td className="r">{pendientesTotal}</td>
                  </tr>
                </tfoot>
              </table>
            )}
          >
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={infraccionesData} margin={{ top: 16, right: 8, bottom: 0, left: 0 }}>
                {/* Trama a 45° de "Pendientes"; la muestra de la leyenda referencia este mismo patrón */}
                <defs>
                  <pattern id={TRAMA_ID} patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)">
                    <rect width="6" height="6" fill={PALETA.barStrong} />
                    <line x1="0" y1="0" x2="0" y2="6" stroke="#ffffff" strokeWidth="2" strokeOpacity="0.55" />
                  </pattern>
                </defs>
                <CartesianGrid {...GRILLA} />
                <XAxis dataKey="name" {...EJE} interval={0} />
                <YAxis {...EJE} allowDecimals={false} domain={[0, 'auto']} width={36} />
                <Tooltip
                  cursor={CURSOR_BARRA}
                  content={<TooltipAn formato={(v) => v.toLocaleString('es-AR')} />}
                />
                <Bar dataKey="infracciones" fill={PALETA.bar} name="Total" radius={[4, 4, 0, 0]} maxBarSize={36} />
                <Bar
                  dataKey="pendientes"
                  fill={`url(#${TRAMA_ID})`}
                  stroke={PALETA.barStrong}
                  name="Pendientes de pago"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={36}
                />
              </BarChart>
            </ResponsiveContainer>
          </TarjetaGrafico>

          <TarjetaGrafico
            titulo={tituloRating}
            subtitulo={`Cada punto es un conductor: infracciones del mes contra su rating de seguridad (100 = sin infracciones ni excesos), ${mesTxt}.`}
            tabla={() => (
              <table>
                <caption className="sr-only">Rating de seguridad e infracciones por conductor, {mesTxt}</caption>
                <thead>
                  <tr>
                    <th scope="col">Conductor</th>
                    <th scope="col" className="r">
                      Infracciones
                    </th>
                    <th scope="col" className="r">
                      Días con exceso
                    </th>
                    <th scope="col" className="r">
                      Rating
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {ratingData.map((d, i) => (
                    <tr key={d.name + i}>
                      <th scope="row">{d.name}</th>
                      <td className="r">{d.infracciones}</td>
                      <td className="r">{d.excesos}</td>
                      <td className="r">{d.rating}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          >
            <ResponsiveContainer width="100%" height={300}>
              <ScatterChart margin={{ top: 24, right: 24, bottom: 28, left: 8 }}>
                <CartesianGrid {...GRILLA} />
                <XAxis
                  type="number"
                  dataKey="infracciones"
                  name="Infracciones"
                  allowDecimals={false}
                  domain={[0, 'auto']}
                  {...EJE}
                  label={{ value: 'Infracciones en el mes (cantidad)', position: 'insideBottom', offset: -16 }}
                />
                <YAxis
                  type="number"
                  dataKey="rating"
                  name="Rating"
                  domain={[0, 100]}
                  {...EJE}
                  width={44}
                  label={{ value: 'Rating (0 a 100)', angle: -90, position: 'insideLeft', offset: 10 }}
                />
                <Tooltip cursor={CURSOR_LINEA} content={<TooltipPunto />} />
                <Scatter name="Conductores" data={ratingData} fill={PALETA.barStrong} fillOpacity={0.85}>
                  <LabelList
                    dataKey="name"
                    position="top"
                    content={(p) => {
                      const { x, y, width, index } = p as { x?: number; y?: number; width?: number; index?: number };
                      if (todosPerfectos || index !== iPeor || x === undefined || y === undefined) return null;
                      return (
                        <text
                          x={Number(x) + Number(width ?? 0) / 2}
                          y={Number(y) - 6}
                          textAnchor="middle"
                          fill={PALETA.ink}
                          fontSize={11}
                          fontWeight={600}
                        >
                          {peor?.name}
                        </text>
                      );
                    }}
                  />
                </Scatter>
              </ScatterChart>
            </ResponsiveContainer>
          </TarjetaGrafico>

          <TarjetaGrafico
            titulo={tituloEf}
            subtitulo={`Rendimiento en km por litro (km de recorridos ÷ litros cargados), ${mesTxt}. Los 10 de mayor rendimiento.`}
            nota={
              sinEficiencia > 0
                ? `${sinEficiencia} conductor${sinEficiencia === 1 ? '' : 'es'} sin cargas de combustible o sin km en el mes no aparece${sinEficiencia === 1 ? '' : 'n'}.`
                : undefined
            }
            tabla={
              eficienciaData.length
                ? () => (
                    <table>
                      <caption className="sr-only">Rendimiento en km por litro por conductor, {mesTxt}</caption>
                      <thead>
                        <tr>
                          <th scope="col">Conductor</th>
                          <th scope="col" className="r">
                            km/L
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {eficienciaData.map((d, i) => (
                          <tr key={d.name + i}>
                            <th scope="row">{d.name}</th>
                            <td className="r">{d.eficiencia.toFixed(1)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )
                : undefined
            }
          >
            {eficienciaData.length ? (
              <ResponsiveContainer width="100%" height={Math.max(160, eficienciaData.length * 32 + 40)}>
                <BarChart data={eficienciaData} layout="vertical" margin={{ top: 4, right: 64, bottom: 4, left: 0 }}>
                  <CartesianGrid {...GRILLA} vertical horizontal={false} />
                  <XAxis type="number" domain={[0, 'auto']} {...EJE} />
                  <YAxis type="category" dataKey="name" {...EJE} width={130} interval={0} />
                  <Tooltip cursor={CURSOR_BARRA} content={<TooltipAn formato={(v) => kmL(v)} />} />
                  <Bar dataKey="eficiencia" fill={PALETA.bar} name="Rendimiento" radius={[0, 4, 4, 0]} maxBarSize={22}>
                    <LabelList
                      dataKey="eficiencia"
                      position="right"
                      fill={PALETA.ink}
                      fontSize={11}
                      formatter={(v) => kmL(Number(v))}
                    />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <GraficoVacio alto={160}>
                Ningún conductor tiene a la vez km de recorridos y litros cargados en {mesTxt}. El rendimiento sale de
                los recorridos y de las cargas de{' '}
                <Link className="lk" href="/combustible">
                  Combustible
                </Link>{' '}
                de los vehículos asignados a cada conductor.
              </GraficoVacio>
            )}
          </TarjetaGrafico>

          <h3 style={{ marginTop: 28 }}>Detalle completo de conductores</h3>
          <div className="tw">
            <table>
              <caption className="sr-only">Detalle de conductores, {mesTxt}</caption>
              <thead>
                <tr>
                  <th scope="col">Conductor</th>
                  <th scope="col" className="r">
                    Infracciones
                  </th>
                  <th scope="col" className="r">
                    Pendientes
                  </th>
                  <th scope="col" className="r">
                    Multas
                  </th>
                  <th scope="col" className="r">
                    Días con exceso
                  </th>
                  <th scope="col" className="r">
                    Rendimiento
                  </th>
                  <th scope="col">Rating</th>
                </tr>
              </thead>
              <tbody>
                {analisis.map((a) => {
                  const nv = nivelRating(a.ratingSeguridad);
                  return (
                    <tr key={a.driver_id}>
                      <th scope="row">{a.name}</th>
                      <td className="r">{a.totalInfracciones}</td>
                      <td className="r">{a.infraccionesPendientes}</td>
                      <td className="r">{money(Math.round(a.multasAcumuladas))}</td>
                      <td className="r">
                        {a.diasConExceso} / {a.diasTotales}
                      </td>
                      <td className="r">{a.eficiencia.toFixed(1)} km/L</td>
                      <td>
                        <span className={'bd ' + nv.cls}>
                          {a.ratingSeguridad} · {nv.txt}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <th scope="row">Total</th>
                  <td className="r">{infraccionesTotal}</td>
                  <td className="r">{pendientesTotal}</td>
                  <td className="r">{money(Math.round(multasTotal))}</td>
                  <td />
                  <td />
                  <td>Promedio {num(ratingPromedio)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      ) : (
        <div className="empty">
          No hay conductores cargados, así que no hay nada que analizar. Cargalos en{' '}
          <Link className="lk" href="/choferes">
            Choferes
          </Link>{' '}
          y asignales un vehículo para que se crucen sus recorridos, cargas e infracciones.
        </div>
      )}
    </>
  );
}
