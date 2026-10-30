'use client';
import { useState } from 'react';
import { useData } from '@/lib/data';
import { money, num } from '@/lib/util';
import { guard } from '@/lib/util';
import { calcularAnalisisCostos } from '@/lib/analisisHelpers';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444'];

export default function ReportesCostos() {
  const { vehicles, fuel_loads, repairs, maintenance, infractions, km_reports } = useData();
  const [selectedMonth, setSelectedMonth] = useState('');
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedBranch, setSelectedBranch] = useState<string | null>(null);
  const [tipoGasto, setTipoGasto] = useState<'todos' | 'combustible' | 'reparaciones' | 'mantenimiento' | 'multas'>(
    'todos'
  );

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
    { name: 'Combustible', value: dataFiltrada.reduce((s, a) => s + a.combustible, 0), fill: '#3b82f6' },
    { name: 'Reparaciones', value: dataFiltrada.reduce((s, a) => s + a.reparaciones, 0), fill: '#10b981' },
    { name: 'Mantenimiento', value: dataFiltrada.reduce((s, a) => s + a.mantenimiento, 0), fill: '#f59e0b' },
    { name: 'Multas', value: dataFiltrada.reduce((s, a) => s + a.multas, 0), fill: '#ef4444' },
  ].filter((g) => g.value > 0);

  // KPIs
  const totalCostos = dataFiltrada.reduce((s, a) => s + a.totalCostos, 0);
  const costoPorKmPromedio =
    dataFiltrada.length > 0
      ? Math.round((dataFiltrada.reduce((s, a) => s + a.costoPorKm, 0) / dataFiltrada.length) * 100) / 100
      : 0;
  const kmTotales = dataFiltrada.reduce((s, a) => s + a.kmRecorridos, 0);

  return (
    <>
      <div className="bar">
        <h2 style={{ margin: 0 }}>💰 Análisis de Costos</h2>
        <span className="sp" />
        {months.length > 0 && (
          <>
            <select value={month} onChange={(e) => setSelectedMonth(e.target.value)}>
              {months.map((m) => (
                <option key={m} value={m}>
                  {m.split('-').reverse().join('/')}
                </option>
              ))}
            </select>
            {branches.length > 0 && (
              <select value={branch || ''} onChange={(e) => setSelectedBranch(e.target.value || null)}>
                <option value="">Todas las sucursales</option>
                {branches.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
            )}
            <select value={tipoGasto} onChange={(e) => setTipoGasto(e.target.value as any)}>
              <option value="todos">Todos los gastos</option>
              <option value="combustible">Solo combustible</option>
              <option value="reparaciones">Solo reparaciones</option>
              <option value="mantenimiento">Solo mantenimiento</option>
              <option value="multas">Solo multas</option>
            </select>
          </>
        )}
        {month && (
          <>
            <button
              className="b1"
              onClick={() =>
                guard(async () => {
                  const pdf = await import('@/lib/costosPdf').then((m) => m.generateCostosPdf);
                  pdf(dataFiltrada, month.split('-'), branch);
                })
              }
            >
              📄 PDF
            </button>
            <button
              className="b1"
              onClick={() =>
                guard(async () => {
                  const excel = await import('@/lib/excelExports').then((m) => m.exportarCostosExcel);
                  excel(dataFiltrada, month.split('-'), branch);
                })
              }
            >
              📊 Excel
            </button>
          </>
        )}
      </div>

      {dataFiltrada.length > 0 ? (
        <>
          <div className="cards">
            <div className="card">
              <div className="n">{money(Math.round(totalCostos))}</div>
              <div className="l">Costo Total</div>
            </div>
            <div className="card">
              <div className="n">{money(costoPorKmPromedio)}</div>
              <div className="l">Costo Promedio/km</div>
            </div>
            <div className="card">
              <div className="n">{num(kmTotales)}</div>
              <div className="l">Km Recorridos</div>
            </div>
            <div className="card">
              <div className="n">{dataFiltrada.length}</div>
              <div className="l">Vehículos</div>
            </div>
          </div>

          {costosPorVehiculo.length > 0 && (
            <div style={{ marginTop: '30px' }}>
              <h3>Desglose de Gastos por Vehículo</h3>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={costosPorVehiculo}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="patente" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="combustible" fill="#3b82f6" name="Combustible" />
                  <Bar dataKey="reparaciones" fill="#10b981" name="Reparaciones" />
                  <Bar dataKey="mantenimiento" fill="#f59e0b" name="Mantenimiento" />
                  <Bar dataKey="multas" fill="#ef4444" name="Multas" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {evolucionData.length > 1 && (
            <div style={{ marginTop: '30px' }}>
              <h3>Evolución: Costo por km (últimos 12 meses)</h3>
              <ResponsiveContainer width="100%" height={250}>
                <LineChart data={evolucionData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="mes" />
                  <YAxis />
                  <Tooltip />
                  <Line
                    type="monotone"
                    dataKey="costoPorKm"
                    stroke="#3b82f6"
                    strokeWidth={2}
                    dot={{ r: 4 }}
                    name="Costo/km"
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          {gastosPorTipo.length > 0 && (
            <div style={{ marginTop: '30px' }}>
              <h3>Distribución de Gastos</h3>
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie
                    data={gastosPorTipo}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}
                    outerRadius={80}
                    dataKey="value"
                  >
                    {gastosPorTipo.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.fill} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}

          <div style={{ marginTop: '30px' }}>
            <h3>Detalle Completo de Costos</h3>
            <div className="tw">
              <table>
                <thead>
                  <tr>
                    <th>Patente</th>
                    <th>Combustible</th>
                    <th>Reparaciones</th>
                    <th>Mantenimiento</th>
                    <th>Multas</th>
                    <th>Total</th>
                    <th>Costo/km</th>
                    <th>Variación</th>
                  </tr>
                </thead>
                <tbody>
                  {dataFiltrada.map((a, idx) => (
                    <tr key={a.vehicle_id} style={{ backgroundColor: idx % 2 === 0 ? '#f9fafb' : '#fff' }}>
                      <td>
                        <b>{a.plate}</b>
                      </td>
                      <td>{money(a.combustible)}</td>
                      <td>{money(a.reparaciones)}</td>
                      <td>{money(a.mantenimiento)}</td>
                      <td>{money(a.multas)}</td>
                      <td>
                        <b>{money(a.totalCostos)}</b>
                      </td>
                      <td>{money(a.costoPorKm)}</td>
                      <td
                        style={{ color: a.variacionMesAnterior && a.variacionMesAnterior > 0 ? '#ef4444' : '#10b981' }}
                      >
                        {a.variacionMesAnterior
                          ? `${a.variacionMesAnterior > 0 ? '+' : ''}${a.variacionMesAnterior}%`
                          : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : (
        <div className="empty">Sin datos para {month || 'este período'}.</div>
      )}
    </>
  );
}
