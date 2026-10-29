'use client';
import { useState } from 'react';
import { useData } from '@/lib/data';
import { num, money, guard } from '@/lib/util';
import { calcularAnalisisConductores, calcularAnalisisCostos, calcularComparativasSucursales } from '@/lib/analisisHelpers';
import { BarChart, Bar, ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell } from 'recharts';

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

export default function ReportesSucursales() {
  const { drivers, infractions, trips, vehicles, fuel_loads, repairs, maintenance, km_reports } = useData();
  const [selectedMonth, setSelectedMonth] = useState('');
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());

  // Obtener meses únicos
  const months = [...new Set(fuel_loads.map((f) => `${f.date.split('-')[0]}-${f.date.split('-')[1]}`))].sort().reverse();
  const month = months.includes(selectedMonth) ? selectedMonth : months[0] ?? '';
  const [year, m] = (month || `${selectedYear}-01`).split('-').map(Number);

  // Calcular análisis
  const conductores = calcularAnalisisConductores(drivers, infractions, trips, vehicles, fuel_loads, m, year);
  const costos = calcularAnalisisCostos(vehicles, fuel_loads, repairs, maintenance, infractions, km_reports, m, year);
  const comparativas = calcularComparativasSucursales(conductores, costos, drivers, vehicles);

  // Datos para gráficos
  const costoPorKmData = comparativas.map((c, i) => ({
    branch: c.branch,
    costo: c.costPromedioKm,
    fill: COLORS[i % COLORS.length],
  }));

  const benchmarkData = comparativas.map((c) => ({
    branch: c.branch,
    rating: c.ratingSeguridadPromedio,
    infracciones: c.totalInfracciones,
    km: c.totalKm,
  }));

  const eficienciaData = comparativas.map((c) => ({
    branch: c.branch,
    eficiencia: c.eficienciaPromedio,
  }));

  return (
    <>
      <div className="bar">
        <h2 style={{ margin: 0 }}>🏢 Comparativas por Sucursal</h2>
        <span className="sp" />
        {months.length > 0 && (
          <>
            <select value={month} onChange={(e) => setSelectedMonth(e.target.value)}>
              {months.map((m) => <option key={m} value={m}>{m.split('-').reverse().join('/')}</option>)}
            </select>
            <button className="b1" onClick={() => guard(async () => {
              const excel = await import('@/lib/excelExports').then((m) => m.exportarSucursalesExcel);
              excel(comparativas, month.split('-'));
            })}>📊 Excel</button>
          </>
        )}
      </div>

      {comparativas.length > 0 ? (
        <>
          <div className="cards">
            <div className="card">
              <div className="n">{comparativas.length}</div>
              <div className="l">Sucursales</div>
            </div>
            <div className="card">
              <div className="n">{num(comparativas.reduce((s, c) => s + c.totalKm, 0))}</div>
              <div className="l">Km Totales</div>
            </div>
            <div className="card">
              <div className="n">{comparativas.reduce((s, c) => s + c.totalInfracciones, 0)}</div>
              <div className="l">Infracciones</div>
            </div>
            <div className="card">
              <div className="n">{comparativas.reduce((s, c) => s + c.cantidadVehiculos, 0)}</div>
              <div className="l">Vehículos Totales</div>
            </div>
          </div>

          {costoPorKmData.length > 0 && (
            <div style={{ marginTop: '30px' }}>
              <h3>Costo Promedio por km (Benchmark)</h3>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={costoPorKmData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="branch" />
                  <YAxis />
                  <Tooltip formatter={(v) => `$${v}`} />
                  <Bar dataKey="costo" name="Costo/km" radius={[8, 8, 0, 0]}>
                    {costoPorKmData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {benchmarkData.length > 0 && (
            <div style={{ marginTop: '30px' }}>
              <h3>Rating de Seguridad vs Infracciones</h3>
              <ResponsiveContainer width="100%" height={300}>
                <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" dataKey="infracciones" name="Infracciones" />
                  <YAxis type="number" dataKey="rating" name="Rating" />
                  <Tooltip cursor={{ strokeDasharray: '3 3' }} />
                  <Scatter name="Sucursales" data={benchmarkData} fill="#8b5cf6" />
                </ScatterChart>
              </ResponsiveContainer>
            </div>
          )}

          {eficienciaData.length > 0 && (
            <div style={{ marginTop: '30px' }}>
              <h3>Eficiencia Promedio: km/litro</h3>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={eficienciaData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="branch" />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="eficiencia" fill="#10b981" name="km/litro" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          <div style={{ marginTop: '30px' }}>
            <h3>Comparativa Completa de Sucursales</h3>
            <div className="tw">
              <table>
                <thead>
                  <tr>
                    <th>Sucursal</th>
                    <th>Km</th>
                    <th>Combustible</th>
                    <th>Costo/km</th>
                    <th>Infracciones</th>
                    <th>Conductores</th>
                    <th>Vehículos</th>
                    <th>Rating Seg.</th>
                    <th>Eficiencia</th>
                  </tr>
                </thead>
                <tbody>
                  {comparativas.map((c, idx) => (
                    <tr key={c.branch} style={{ backgroundColor: idx % 2 === 0 ? '#f9fafb' : '#fff' }}>
                      <td><b>{c.branch}</b></td>
                      <td>{num(c.totalKm)}</td>
                      <td>{num(Math.round(c.totalCombustible))} L</td>
                      <td style={{ color: c.costPromedioKm > 1.5 ? '#ef4444' : '#10b981' }}><b>{money(c.costPromedioKm)}</b></td>
                      <td>{c.totalInfracciones}</td>
                      <td>{c.cantidadConductores}</td>
                      <td>{c.cantidadVehiculos}</td>
                      <td>
                        <span style={{
                          padding: '4px 8px',
                          borderRadius: '4px',
                          backgroundColor: c.ratingSeguridadPromedio >= 80 ? '#d1fae5' : c.ratingSeguridadPromedio >= 60 ? '#fef3c7' : '#fee2e2',
                          color: c.ratingSeguridadPromedio >= 80 ? '#065f46' : c.ratingSeguridadPromedio >= 60 ? '#92400e' : '#7f1d1d',
                          fontWeight: 'bold',
                        }}>
                          {c.ratingSeguridadPromedio}
                        </span>
                      </td>
                      <td>{c.eficienciaPromedio.toFixed(1)} km/L</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div style={{ marginTop: '30px', padding: '20px', backgroundColor: '#f0f9ff', borderRadius: '8px', border: '1px solid #bfdbfe' }}>
            <h3 style={{ marginTop: 0 }}>📊 Resumen Ejecutivo</h3>
            <ul style={{ margin: '10px 0', paddingLeft: '20px' }}>
              <li><b>Sucursal más eficiente (costo/km):</b> {comparativas.reduce((a, b) => a.costPromedioKm < b.costPromedioKm ? a : b).branch}</li>
              <li><b>Sucursal más segura (rating):</b> {comparativas.reduce((a, b) => a.ratingSeguridadPromedio > b.ratingSeguridadPromedio ? a : b).branch}</li>
              <li><b>Sucursal con mejor eficiencia (km/litro):</b> {comparativas.reduce((a, b) => a.eficienciaPromedio > b.eficienciaPromedio ? a : b).branch}</li>
              <li><b>Total de km en flota:</b> {num(comparativas.reduce((s, c) => s + c.totalKm, 0))}</li>
              <li><b>Infracciones totales:</b> {comparativas.reduce((s, c) => s + c.totalInfracciones, 0)}</li>
            </ul>
          </div>
        </>
      ) : (
        <div className="empty">Sin datos para {month || 'este período'}.</div>
      )}
    </>
  );
}
