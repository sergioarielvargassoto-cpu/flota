'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useData } from '@/lib/data';
import { num, money, guard } from '@/lib/util';
import {
  calcularAnalisisConductores,
  calcularAnalisisCostos,
  calcularComparativasSucursales,
} from '@/lib/analisisHelpers';
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
  Cell,
} from 'recharts';
import { TarjetaGrafico, TooltipAn, EJE, GRILLA, CURSOR_BARRA, CURSOR_LINEA, PALETA } from '@/components/Charts';
import { formatoMontoCorto, indiceMaximo, variacion } from '@/lib/graficos';

const pct = (v: number) => Math.round(v * 100).toLocaleString('es-AR') + ' %';
const kmL = (v: number) => v.toLocaleString('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' km/L';
const pesosKm = (v: number) =>
  '$ ' + v.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 2 }) + '/km';

type PuntoSuc = { branch: string; rating: number; infracciones: number; km: number };

function TooltipSucursal({ active, payload }: { active?: boolean; payload?: readonly { payload?: PuntoSuc }[] }) {
  const d = active ? payload?.[0]?.payload : undefined;
  if (!d) return null;
  return (
    <div className="an-tooltip">
      <div className="t">{d.branch}</div>
      <div className="row">
        <span>Infracciones</span>
        <b>{d.infracciones}</b>
      </div>
      <div className="row">
        <span>Rating promedio</span>
        <b>{d.rating}</b>
      </div>
      <div className="row">
        <span>Km</span>
        <b>{num(d.km)}</b>
      </div>
    </div>
  );
}

function nivelRating(r: number): { cls: string; txt: string } {
  if (r >= 80) return { cls: 'ok', txt: 'alto' };
  if (r >= 60) return { cls: 'urgente', txt: 'medio' };
  return { cls: 'vencido', txt: 'bajo' };
}

export default function ReportesSucursales() {
  const { drivers, infractions, trips, vehicles, fuel_loads, repairs, maintenance, km_reports } = useData();
  const [selectedMonth, setSelectedMonth] = useState('');
  const [selectedYear] = useState(new Date().getFullYear());

  // Obtener meses únicos
  const months = [...new Set(fuel_loads.map((f) => `${f.date.split('-')[0]}-${f.date.split('-')[1]}`))]
    .sort()
    .reverse();
  const month = months.includes(selectedMonth) ? selectedMonth : (months[0] ?? '');
  const [year, m] = (month || `${selectedYear}-01`).split('-').map(Number);
  const mesTxt = `${String(m).padStart(2, '0')}/${year}`;

  // Calcular análisis
  const conductores = calcularAnalisisConductores(drivers, infractions, trips, vehicles, fuel_loads, m, year);
  const costos = calcularAnalisisCostos(vehicles, fuel_loads, repairs, maintenance, infractions, km_reports, m, year);
  const comparativas = calcularComparativasSucursales(conductores, costos, drivers, vehicles);

  const totalKm = comparativas.reduce((s, c) => s + c.totalKm, 0);
  const totalInf = comparativas.reduce((s, c) => s + c.totalInfracciones, 0);
  const totalVeh = comparativas.reduce((s, c) => s + c.cantidadVehiculos, 0);
  const totalComb = comparativas.reduce((s, c) => s + c.totalCombustible, 0);
  const totalCond = comparativas.reduce((s, c) => s + c.cantidadConductores, 0);

  // ---- Costo por km (orden de mayor a menor para leer el ranking) ----
  const costoPorKmData = [...comparativas]
    .sort((a, b) => b.costPromedioKm - a.costPromedioKm)
    .map((c) => ({ branch: c.branch, costo: c.costPromedioKm }));
  const iMaxCosto = indiceMaximo(costoPorKmData.map((d) => d.costo));
  const conCosto = costoPorKmData.filter((d) => d.costo > 0);
  const caro = conCosto[0];
  const barato = conCosto[conCosto.length - 1];
  const varCosto = conCosto.length > 1 ? variacion(caro.costo, barato.costo) : null;
  const tituloCosto = !caro
    ? `Ninguna sucursal tiene costo por km calculable en ${mesTxt}`
    : varCosto !== null && varCosto > 0
      ? `${caro.branch} gasta ${pct(varCosto)} más por km que ${barato.branch}`
      : `${caro.branch} gasta ${pesosKm(caro.costo)}`;

  // ---- Rating vs infracciones ----
  const benchmarkData: PuntoSuc[] = comparativas.map((c) => ({
    branch: c.branch,
    rating: c.ratingSeguridadPromedio,
    infracciones: c.totalInfracciones,
    km: c.totalKm,
  }));
  const iMaxInf = indiceMaximo(benchmarkData.map((d) => d.infracciones));
  const iMinRating = indiceMaximo(benchmarkData.map((d) => -d.rating));
  const etiquetarTodas = benchmarkData.length <= 6;
  const tituloRating =
    totalInf === 0 || iMaxInf < 0
      ? `Ninguna sucursal registra infracciones en ${mesTxt}`
      : `${benchmarkData[iMaxInf].branch} concentra ${benchmarkData[iMaxInf].infracciones} de las ${totalInf} infracciones`;

  // ---- Eficiencia ----
  const eficienciaData = [...comparativas]
    .sort((a, b) => b.eficienciaPromedio - a.eficienciaPromedio)
    .map((c) => ({ branch: c.branch, eficiencia: c.eficienciaPromedio }));
  const conEf = eficienciaData.filter((d) => d.eficiencia > 0);
  const mejorEf = conEf[0];
  const peorEf = conEf[conEf.length - 1];
  const varEf = conEf.length > 1 ? variacion(mejorEf.eficiencia, peorEf.eficiencia) : null;
  const tituloEf = !mejorEf
    ? `Ninguna sucursal tiene rendimiento calculable en ${mesTxt}`
    : varEf !== null && varEf > 0
      ? `${mejorEf.branch} rinde ${pct(varEf)} más que ${peorEf.branch} (${kmL(mejorEf.eficiencia)})`
      : `${mejorEf.branch} rinde ${kmL(mejorEf.eficiencia)}`;

  const altoBarras = (n: number) => Math.max(140, n * 40 + 40);

  return (
    <>
      <div className="bar">
        <div>
          <p className="an-eyebrow" style={{ margin: 0 }}>
            Reportes
          </p>
          <h2 style={{ margin: 0 }}>Comparativas por sucursal</h2>
        </div>
      </div>

      {months.length > 0 && (
        <div className="card no-print" style={{ marginBottom: 20 }}>
          <div className="bar" style={{ margin: 0, alignItems: 'flex-end' }}>
            <div className="fg" style={{ margin: 0 }}>
              <label htmlFor="rs-mes">Mes</label>
              <select id="rs-mes" value={month} onChange={(e) => setSelectedMonth(e.target.value)}>
                {months.map((m) => (
                  <option key={m} value={m}>
                    {m.split('-').reverse().join('/')}
                  </option>
                ))}
              </select>
            </div>
            <span className="sp" />
            <button
              className="b1"
              onClick={() =>
                guard(async () => {
                  const excel = await import('@/lib/excelExports').then((m) => m.exportarSucursalesExcel);
                  excel(comparativas, month.split('-'));
                })
              }
            >
              Exportar Excel
            </button>
          </div>
        </div>
      )}

      {months.length === 0 && comparativas.length > 0 && (
        <div className="warn" role="status">
          <span aria-hidden="true">⚠ </span>
          Todavía no hay cargas de combustible. El mes del reporte se elige entre los meses que tienen cargas, así que
          por ahora se muestra {mesTxt} y no se puede exportar. Registralas en{' '}
          <Link className="lk" href="/combustible">
            Combustible
          </Link>
          .
        </div>
      )}

      {comparativas.length > 0 ? (
        <>
          <div className="cards">
            <div className="card">
              <div className="n">{comparativas.length}</div>
              <div className="l">Sucursales</div>
            </div>
            <div className="card">
              <div className="n">{num(totalKm)}</div>
              <div className="l">Km totales</div>
            </div>
            <div className="card">
              <div className="n">{totalInf}</div>
              <div className="l">Infracciones</div>
            </div>
            <div className="card">
              <div className="n">{totalVeh}</div>
              <div className="l">Vehículos</div>
            </div>
          </div>

          <TarjetaGrafico
            titulo={tituloCosto}
            subtitulo={`Costo promedio por km de los vehículos de cada sucursal (combustible, reparaciones, mantenimiento y multas ÷ km), ${mesTxt}.`}
            tabla={() => (
              <table>
                <caption className="sr-only">Costo promedio por km por sucursal, {mesTxt}</caption>
                <thead>
                  <tr>
                    <th scope="col">Sucursal</th>
                    <th scope="col" className="r">
                      Costo por km
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {costoPorKmData.map((d) => (
                    <tr key={d.branch}>
                      <th scope="row">{d.branch}</th>
                      <td className="r">{money(d.costo)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          >
            <ResponsiveContainer width="100%" height={altoBarras(costoPorKmData.length)}>
              <BarChart data={costoPorKmData} layout="vertical" margin={{ top: 4, right: 72, bottom: 4, left: 0 }}>
                <CartesianGrid {...GRILLA} vertical horizontal={false} />
                <XAxis type="number" domain={[0, 'auto']} tickFormatter={(v: number) => formatoMontoCorto(v)} {...EJE} />
                <YAxis type="category" dataKey="branch" {...EJE} width={120} interval={0} />
                <Tooltip cursor={CURSOR_BARRA} content={<TooltipAn formato={(v) => pesosKm(v)} />} />
                <Bar dataKey="costo" name="Costo por km" radius={[0, 4, 4, 0]} maxBarSize={24}>
                  {costoPorKmData.map((d, i) => (
                    <Cell key={d.branch} fill={i === iMaxCosto && d.costo > 0 ? PALETA.barStrong : PALETA.bar} />
                  ))}
                  <LabelList
                    dataKey="costo"
                    position="right"
                    fill={PALETA.ink}
                    fontSize={11}
                    formatter={(v) => '$ ' + formatoMontoCorto(Number(v))}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </TarjetaGrafico>

          <TarjetaGrafico
            titulo={tituloRating}
            subtitulo={`Cada punto es una sucursal: infracciones del mes contra el rating de seguridad promedio de sus conductores, ${mesTxt}.`}
            tabla={() => (
              <table>
                <caption className="sr-only">Rating de seguridad e infracciones por sucursal, {mesTxt}</caption>
                <thead>
                  <tr>
                    <th scope="col">Sucursal</th>
                    <th scope="col" className="r">
                      Infracciones
                    </th>
                    <th scope="col" className="r">
                      Rating promedio
                    </th>
                    <th scope="col" className="r">
                      Km
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {benchmarkData.map((d) => (
                    <tr key={d.branch}>
                      <th scope="row">{d.branch}</th>
                      <td className="r">{d.infracciones}</td>
                      <td className="r">{d.rating}</td>
                      <td className="r">{num(d.km)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <th scope="row">Total</th>
                    <td className="r">{totalInf}</td>
                    <td />
                    <td className="r">{num(totalKm)}</td>
                  </tr>
                </tfoot>
              </table>
            )}
          >
            <ResponsiveContainer width="100%" height={300}>
              <ScatterChart margin={{ top: 24, right: 32, bottom: 28, left: 8 }}>
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
                  label={{ value: 'Rating promedio (0 a 100)', angle: -90, position: 'insideLeft', offset: 10 }}
                />
                <Tooltip cursor={CURSOR_LINEA} content={<TooltipSucursal />} />
                <Scatter name="Sucursales" data={benchmarkData} fill={PALETA.barStrong} fillOpacity={0.85}>
                  <LabelList
                    dataKey="branch"
                    position="top"
                    content={(p) => {
                      const { x, y, width, index } = p as { x?: number; y?: number; width?: number; index?: number };
                      if (x === undefined || y === undefined || index === undefined) return null;
                      if (!etiquetarTodas && index !== iMaxInf && index !== iMinRating) return null;
                      return (
                        <text
                          x={Number(x) + Number(width ?? 0) / 2}
                          y={Number(y) - 6}
                          textAnchor="middle"
                          fill={PALETA.ink}
                          fontSize={11}
                          fontWeight={600}
                        >
                          {benchmarkData[index]?.branch}
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
            subtitulo={`Rendimiento promedio de los conductores de cada sucursal, en km por litro, ${mesTxt}.`}
            nota={
              conEf.length < eficienciaData.length
                ? 'Las sucursales en 0 no tienen conductores con km de recorridos y litros cargados en el mes.'
                : undefined
            }
            tabla={() => (
              <table>
                <caption className="sr-only">Rendimiento promedio por sucursal, {mesTxt}</caption>
                <thead>
                  <tr>
                    <th scope="col">Sucursal</th>
                    <th scope="col" className="r">
                      km/L
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {eficienciaData.map((d) => (
                    <tr key={d.branch}>
                      <th scope="row">{d.branch}</th>
                      <td className="r">{d.eficiencia.toFixed(1)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          >
            <ResponsiveContainer width="100%" height={altoBarras(eficienciaData.length)}>
              <BarChart data={eficienciaData} layout="vertical" margin={{ top: 4, right: 64, bottom: 4, left: 0 }}>
                <CartesianGrid {...GRILLA} vertical horizontal={false} />
                <XAxis type="number" domain={[0, 'auto']} {...EJE} />
                <YAxis type="category" dataKey="branch" {...EJE} width={120} interval={0} />
                <Tooltip cursor={CURSOR_BARRA} content={<TooltipAn formato={(v) => kmL(v)} />} />
                <Bar dataKey="eficiencia" fill={PALETA.bar} name="Rendimiento" radius={[0, 4, 4, 0]} maxBarSize={24}>
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
          </TarjetaGrafico>

          <h3 style={{ marginTop: 28 }}>Comparativa completa de sucursales</h3>
          <div className="tw">
            <table>
              <caption className="sr-only">Comparativa de sucursales, {mesTxt}</caption>
              <thead>
                <tr>
                  <th scope="col">Sucursal</th>
                  <th scope="col" className="r">
                    Km
                  </th>
                  <th scope="col" className="r">
                    Gasto en combustible
                  </th>
                  <th scope="col" className="r">
                    Costo por km
                  </th>
                  <th scope="col" className="r">
                    Infracciones
                  </th>
                  <th scope="col" className="r">
                    Conductores
                  </th>
                  <th scope="col" className="r">
                    Vehículos
                  </th>
                  <th scope="col">Rating seg.</th>
                  <th scope="col" className="r">
                    Rendimiento
                  </th>
                </tr>
              </thead>
              <tbody>
                {comparativas.map((c) => {
                  const nv = nivelRating(c.ratingSeguridadPromedio);
                  return (
                    <tr key={c.branch}>
                      <th scope="row">{c.branch}</th>
                      <td className="r">{num(c.totalKm)}</td>
                      <td className="r">{money(Math.round(c.totalCombustible))}</td>
                      <td className="r">{money(c.costPromedioKm)}</td>
                      <td className="r">{c.totalInfracciones}</td>
                      <td className="r">{c.cantidadConductores}</td>
                      <td className="r">{c.cantidadVehiculos}</td>
                      <td>
                        <span className={'bd ' + nv.cls}>
                          {c.ratingSeguridadPromedio} · {nv.txt}
                        </span>
                      </td>
                      <td className="r">{c.eficienciaPromedio.toFixed(1)} km/L</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <th scope="row">Total</th>
                  <td className="r">{num(totalKm)}</td>
                  <td className="r">{money(Math.round(totalComb))}</td>
                  <td />
                  <td className="r">{totalInf}</td>
                  <td className="r">{totalCond}</td>
                  <td className="r">{totalVeh}</td>
                  <td />
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>

          <section className="card" style={{ marginTop: 24 }} aria-labelledby="rs-resumen">
            <h3 id="rs-resumen" style={{ marginTop: 0 }}>
              Resumen ejecutivo
            </h3>
            <ul className="an-highlights">
              <li>
                <span>Sucursal más eficiente (costo por km)</span>
                <b>{comparativas.reduce((a, b) => (a.costPromedioKm < b.costPromedioKm ? a : b)).branch}</b>
              </li>
              <li>
                <span>Sucursal más segura (rating)</span>
                <b>
                  {comparativas.reduce((a, b) => (a.ratingSeguridadPromedio > b.ratingSeguridadPromedio ? a : b)).branch}
                </b>
              </li>
              <li>
                <span>Sucursal con mejor rendimiento (km por litro)</span>
                <b>{comparativas.reduce((a, b) => (a.eficienciaPromedio > b.eficienciaPromedio ? a : b)).branch}</b>
              </li>
              <li>
                <span>Total de km en la flota</span>
                <b>{num(totalKm)}</b>
              </li>
              <li>
                <span>Infracciones totales</span>
                <b>{totalInf}</b>
              </li>
            </ul>
          </section>
        </>
      ) : (
        <div className="empty">
          No hay sucursales para comparar: salen del campo Sucursal de cada vehículo y todavía no hay vehículos cargados.
          Cargalos en{' '}
          <Link className="lk" href="/vehiculos">
            Vehículos
          </Link>
          .
        </div>
      )}
    </>
  );
}
