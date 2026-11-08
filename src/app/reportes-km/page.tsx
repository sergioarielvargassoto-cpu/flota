'use client';
import { useState } from 'react';
import { useData } from '@/lib/data';
import { fd, num } from '@/lib/util';
import { guard } from '@/lib/util';
import { pickSheet } from '@/lib/excel';
import { TRIP_SPEC, useImporters } from '@/lib/importers';
import { ImportDialog } from '@/components/ImportDialog';
import { TarjetaGrafico, TooltipAn, EJE, GRILLA, CURSOR_BARRA, CURSOR_LINEA, PALETA } from '@/components/Charts';
import { formatoMontoCorto, indiceMaximo, variacion } from '@/lib/graficos';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';

/** "2026-10" → "10/2026" (mismo formato que el selector de mes). */
const mesLabel = (ym: string) => ym.split('-').reverse().join('/');
const pct = (x: number) => `${Math.abs(Math.round(x * 100))} %`;

export default function ReportesKm() {
  const { km_reports, vehicles, trips } = useData();
  const { importGestya } = useImporters();
  const [rows, setRows] = useState<unknown[][] | null>(null);
  const [selectedMonth, setSelectedMonth] = useState('');
  const [selectedYear] = useState(new Date().getFullYear());
  const [selectedBranch, setSelectedBranch] = useState<string | null>(null);
  const [showExcluded, setShowExcluded] = useState(false);

  // Obtener meses únicos del histórico
  const months = [...new Set(km_reports.map((r) => `${r.year}-${String(r.month).padStart(2, '0')}`))].sort().reverse();
  const month = months.includes(selectedMonth) ? selectedMonth : (months[0] ?? '');
  const [year, m] = (month || `${selectedYear}-01`).split('-').map(Number);

  // Filtrar reportes del mes seleccionado
  const reports = km_reports.filter((r) => r.year === year && r.month === m);
  const branches = [...new Set(reports.map((r) => r.branch).filter(Boolean))] as string[];
  // "Todas las sucursales" (valor vacío) = null: antes caía en la primera sucursal y no se podía ver el total.
  const branch = selectedBranch && branches.includes(selectedBranch) ? selectedBranch : null;

  // Datos para tabla
  const data = reports
    .filter((r) => !branch || r.branch === branch)
    .map((r) => {
      const v = vehicles.find((x) => x.id === r.vehicle_id);
      const variation = r.km_previous ? Math.round(((r.km_total - r.km_previous) / r.km_previous) * 100) : null;
      return {
        r,
        v,
        kmTotal: r.km_total,
        kmPrev: r.km_previous || 0,
        variation,
        excluded: v?.exclude_from_reports || false,
      };
    })
    .sort((a, b) => b.kmTotal - a.kmTotal);

  const filtered = showExcluded ? data : data.filter((x) => !x.excluded);
  const totalKm = filtered.reduce((s, d) => s + d.kmTotal, 0);
  const avgKm = filtered.length > 0 ? Math.round(totalKm / filtered.length) : 0;

  // Velocidad: días que excedieron límite + máximo en esos días
  const SPEED_LIMIT = 120;
  const tripsInMonth = trips.filter((t) => {
    const [ty, tm] = t.date.split('-').map(Number);
    return ty === year && tm === m && (!branch || filtered.some((f) => f.r.vehicle_id === t.vehicle_id));
  });
  const excessDays = tripsInMonth.filter((t) => (t.max_speed ?? 0) > SPEED_LIMIT);
  const maxExcessSpeed = excessDays.length > 0 ? Math.max(...excessDays.map((t) => t.max_speed ?? 0)) : 0;

  // Datos para gráficos
  const barData = filtered.map((d) => ({
    patente: d.v?.plate || '???',
    km: d.kmTotal,
    branch: d.v?.branch || 'Corrientes',
  }));

  // Evolución mensual (últimos 6 meses)
  const allReports = km_reports.filter((r) => r.vehicle_id === (filtered[0]?.r.vehicle_id || ''));
  const evolutionData = [...new Set(allReports.map((r) => `${r.year}-${String(r.month).padStart(2, '0')}`))]
    .sort()
    .slice(-6)
    .map((ym) => {
      const [y, m] = ym.split('-').map(Number);
      const total = km_reports
        .filter((r) => r.year === y && r.month === m && (!branch || r.branch === branch))
        .reduce((s, r) => s + r.km_total, 0);
      return { mes: ym, km: total };
    });

  // Hallazgos para los títulos (sólo presentación)
  const iMaxBar = indiceMaximo(barData.map((d) => d.km));
  const tituloBarras =
    iMaxBar >= 0
      ? `${barData[iMaxBar].patente} es el vehículo con más km del mes: ${num(Math.round(barData[iMaxBar].km))} km`
      : 'Km por vehículo';
  const ultimo = evolutionData[evolutionData.length - 1];
  const previo = evolutionData[evolutionData.length - 2];
  const varEvol = ultimo && previo ? variacion(ultimo.km, previo.km) : null;
  const iMaxEvol = indiceMaximo(evolutionData.map((d) => d.km));
  const tituloEvol =
    varEvol !== null && ultimo && previo
      ? varEvol === 0
        ? `En ${mesLabel(ultimo.mes)} se recorrieron los mismos km que en ${mesLabel(previo.mes)}`
        : `En ${mesLabel(ultimo.mes)} se recorrieron ${pct(varEvol)} ${varEvol > 0 ? 'más' : 'menos'} km que en ${mesLabel(previo.mes)}`
      : iMaxEvol >= 0
        ? `${mesLabel(evolutionData[iMaxEvol].mes)} fue el mes con más km`
        : 'Evolución de los km';
  const alcance = `${mesLabel(month)}${branch ? ` · ${branch}` : ''}`;

  return (
    <>
      <div style={{ marginBottom: 16 }}>
        <div className="an-eyebrow">Reportes</div>
        <h2 style={{ margin: '4px 0 0' }}>Reporte mensual de kilómetros</h2>
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <div className="bar" style={{ marginBottom: 0 }}>
          {months.length > 0 && (
            <>
              <label htmlFor="rk-mes">Mes</label>
              <select id="rk-mes" value={month} onChange={(e) => setSelectedMonth(e.target.value)}>
                {months.map((m) => (
                  <option key={m} value={m}>
                    {mesLabel(m)}
                  </option>
                ))}
              </select>
              {branches.length > 0 && (
                <>
                  <label htmlFor="rk-sucursal">Sucursal</label>
                  <select
                    id="rk-sucursal"
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
            </>
          )}
          <span className="sp" />
          <button className="b2" onClick={async () => setRows(await pickSheet())}>
            <span aria-hidden="true">⬆ </span>Importar Gestya
          </button>
          {month && (
            <button
              className="b1"
              onClick={() =>
                guard(async () => {
                  const pdf = await import('@/lib/kmReportPdf').then((m) => m.generateKmReportPdf);
                  pdf(filtered, month.split('-') as [string, string], branch);
                })
              }
            >
              Descargar PDF
            </button>
          )}
        </div>
      </div>

      {filtered.length > 0 ? (
        <>
          <div className="cards">
            <div className="card">
              <div className="n">{num(Math.round(totalKm))}</div>
              <div className="l">Km totales</div>
            </div>
            <div className="card">
              <div className="n">{num(avgKm)}</div>
              <div className="l">Km promedio por vehículo</div>
            </div>
            <div className="card">
              <div className="n">{filtered.length}</div>
              <div className="l">Vehículos reportados</div>
            </div>
            <div className="card">
              <div className="n">{excessDays.length}</div>
              <div className="l">Días que excedieron {SPEED_LIMIT} km/h</div>
              <div style={{ marginTop: 8 }}>
                {excessDays.length > 0 ? (
                  <span className="kpi-mk vencido">
                    <i aria-hidden="true">!</i>Hubo excesos de velocidad
                  </span>
                ) : (
                  <span className="kpi-mk ok">
                    <i aria-hidden="true">✓</i>Sin excesos
                  </span>
                )}
              </div>
            </div>
            <div className="card">
              <div className="n">{maxExcessSpeed ? `${maxExcessSpeed} km/h` : '—'}</div>
              <div className="l">Máx. velocidad excedida</div>
            </div>
          </div>

          {barData.length > 0 && (
            <TarjetaGrafico
              titulo={tituloBarras}
              subtitulo={`Km recorridos por vehículo en ${alcance}, de mayor a menor.`}
              tabla={() => (
                <table>
                  <caption className="sr-only">Km recorridos por vehículo en {alcance}</caption>
                  <thead>
                    <tr>
                      <th scope="col">Patente</th>
                      <th scope="col" className="r">
                        Km del mes
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {barData.map((d, i) => (
                      <tr key={d.patente + i}>
                        <th scope="row">{d.patente}</th>
                        <td className="r num">{num(Math.round(d.km))}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <th scope="row">Total</th>
                      <td className="r num">{num(Math.round(totalKm))}</td>
                    </tr>
                  </tfoot>
                </table>
              )}
            >
              <ResponsiveContainer width="100%" height={320}>
                <BarChart data={barData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid {...GRILLA} />
                  <XAxis
                    dataKey="patente"
                    {...EJE}
                    interval={0}
                    angle={-40}
                    textAnchor="end"
                    height={62}
                  />
                  <YAxis {...EJE} domain={[0, 'auto']} tickFormatter={formatoMontoCorto} width={48} />
                  <Tooltip
                    cursor={CURSOR_BARRA}
                    content={<TooltipAn formato={(v) => `${num(Math.round(v))} km`} />}
                  />
                  <Bar dataKey="km" name="Km del mes" radius={[4, 4, 0, 0]} maxBarSize={48}>
                    {barData.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={index === iMaxBar ? PALETA.barStrong : PALETA.bar} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </TarjetaGrafico>
          )}

          {evolutionData.length > 1 && (
            <TarjetaGrafico
              titulo={tituloEvol}
              subtitulo={`Km totales por mes${branch ? ` en ${branch}` : ''}, últimos ${evolutionData.length} meses con reporte.`}
              tabla={() => (
                <table>
                  <caption className="sr-only">Km totales por mes{branch ? ` en ${branch}` : ''}</caption>
                  <thead>
                    <tr>
                      <th scope="col">Mes</th>
                      <th scope="col" className="r">
                        Km totales
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {evolutionData.map((d) => (
                      <tr key={d.mes}>
                        <th scope="row">{mesLabel(d.mes)}</th>
                        <td className="r num">{num(Math.round(d.km))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            >
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={evolutionData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                  <CartesianGrid {...GRILLA} />
                  <XAxis dataKey="mes" {...EJE} tickFormatter={mesLabel} />
                  <YAxis {...EJE} domain={[0, 'auto']} tickFormatter={formatoMontoCorto} width={48} />
                  <Tooltip
                    cursor={CURSOR_LINEA}
                    content={
                      <TooltipAn
                        formato={(v) => `${num(Math.round(v))} km`}
                        titulo={(l) => mesLabel(String(l ?? ''))}
                      />
                    }
                  />
                  <Line
                    type="monotone"
                    dataKey="km"
                    name="Km totales"
                    stroke={PALETA.line}
                    strokeWidth={2.5}
                    dot={{ r: 3, fill: PALETA.line, strokeWidth: 0 }}
                    activeDot={{ r: 5 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </TarjetaGrafico>
          )}

          {excessDays.length > 0 && (
            <section style={{ marginTop: 8, marginBottom: 20 }}>
              <h3>Días con exceso de velocidad (límite: {SPEED_LIMIT} km/h)</h3>
              <div className="tw">
                <table>
                  <caption className="sr-only">
                    Días con velocidad máxima mayor a {SPEED_LIMIT} km/h en {alcance}, de mayor a menor
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">Día</th>
                      <th scope="col">Vehículo</th>
                      <th scope="col">Marca</th>
                      <th scope="col" className="r">
                        Velocidad máxima
                      </th>
                      <th scope="col" className="r">
                        Exceso
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {excessDays
                      .sort((a, b) => b.max_speed! - a.max_speed!)
                      .map((t) => {
                        const v = vehicles.find((x) => x.id === t.vehicle_id);
                        const excess = (t.max_speed ?? 0) - SPEED_LIMIT;
                        return (
                          <tr key={t.id}>
                            <th scope="row" className="num">
                              {fd(t.date)}
                            </th>
                            <td>{v?.plate || '?'}</td>
                            <td className="muted">{v?.brand || '—'}</td>
                            <td className="r num">
                              <b>{t.max_speed} km/h</b>
                            </td>
                            <td className="r num" style={{ color: '#b91c1c', fontWeight: 600 }}>
                              +{excess} km/h
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          <section style={{ marginTop: 8 }}>
            <div className="bar" style={{ marginBottom: 10 }}>
              <h3 style={{ margin: 0 }}>Detalle por vehículo</h3>
              <span className="sp" />
              <label htmlFor="rk-excluidos" style={{ fontSize: 13 }}>
                <input
                  id="rk-excluidos"
                  type="checkbox"
                  checked={showExcluded}
                  onChange={(e) => setShowExcluded(e.target.checked)}
                />
                Mostrar excluidos
              </label>
            </div>
            <div className="tw">
              <table>
                <caption className="sr-only">Detalle de km por vehículo en {alcance}</caption>
                <thead>
                  <tr>
                    <th scope="col">Patente</th>
                    <th scope="col">Marca / Modelo</th>
                    <th scope="col" className="r">
                      Km mes
                    </th>
                    <th scope="col" className="r">
                      Km anterior
                    </th>
                    <th scope="col" className="r">
                      Variación
                    </th>
                    <th scope="col">Sucursal</th>
                  </tr>
                </thead>
                <tbody>
                  {(showExcluded ? data : filtered).map((d) => (
                    <tr key={d.r.id}>
                      <th scope="row">
                        {d.v?.plate || '???'}
                        {d.excluded && (
                          <>
                            {' '}
                            <span className="bd nd">Excluido</span>
                          </>
                        )}
                      </th>
                      <td className="muted">
                        {d.v?.brand && d.v?.model ? `${d.v.brand} ${d.v.model}` : d.v?.brand || '—'}
                      </td>
                      <td className="r num">
                        <b>{num(Math.round(d.kmTotal))}</b>
                      </td>
                      <td className="r num">{d.kmPrev > 0 ? num(Math.round(d.kmPrev)) : '—'}</td>
                      <td className="r num">
                        {d.variation !== null ? (
                          <>
                            {d.variation !== 0 && <span aria-hidden="true">{d.variation > 0 ? '▲ ' : '▼ '}</span>}
                            {d.variation > 0 ? '+' : ''}
                            {d.variation} %
                          </>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="muted">{d.v?.branch || '—'}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <th scope="row" colSpan={2}>
                      Total
                    </th>
                    <td className="r num">{num(Math.round(totalKm))}</td>
                    <td colSpan={3} />
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
              No hay reportes de km cargados. Importá el Excel “Distancias Diarias” de Gestya con el botón{' '}
              <b>Importar Gestya</b> de arriba: el reporte de cada mes se arma solo a partir del archivo.
            </>
          ) : (
            <>
              No hay reportes de km para {mesLabel(month)}
              {branch ? ` en ${branch}` : ''}
              {data.length > 0 && !showExcluded
                ? ': todos los vehículos de este mes están excluidos de los reportes.'
                : '. Elegí otro mes o importá el archivo de Gestya de ese mes.'}
            </>
          )}
        </div>
      )}

      {rows && (
        <ImportDialog
          title="Importar Distancias Diarias de Gestya"
          rows={rows}
          spec={TRIP_SPEC}
          onClose={() => setRows(null)}
          onConfirm={async (d, map) => {
            await guard(() => importGestya(d, map));
          }}
        />
      )}
    </>
  );
}
