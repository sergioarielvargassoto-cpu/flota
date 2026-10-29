'use client';
import { useState } from 'react';
import { useData } from '@/lib/data';
import { fd, num } from '@/lib/util';
import { guard } from '@/lib/util';
import { calcularAnalisisConductores } from '@/lib/analisisHelpers';
import { BarChart, Bar, ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell } from 'recharts';

const COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

export default function ReportesConductores() {
  const { drivers, infractions, trips, vehicles, fuel_loads, km_reports } = useData();
  const [selectedMonth, setSelectedMonth] = useState('');
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedBranch, setSelectedBranch] = useState<string | null>(null);

  // Obtener meses únicos
  const months = [...new Set(infractions.map((i) => `${i.date.split('-')[0]}-${i.date.split('-')[1]}`))].sort().reverse();
  const month = months.includes(selectedMonth) ? selectedMonth : months[0] ?? '';
  const [year, m] = (month || `${selectedYear}-01`).split('-').map(Number);

  // Calcular análisis
  const analisis = calcularAnalisisConductores(drivers, infractions, trips, vehicles, fuel_loads, m, year, selectedBranch || undefined);
  const branches = [...new Set(vehicles.map((v) => v.branch))];
  const branch = selectedBranch && branches.includes(selectedBranch) ? selectedBranch : (branches[0] ?? null);

  // Datos para gráficos
  const infraccionesData = analisis.slice(0, 10).map((a) => ({
    name: a.name.split(' ')[0],
    infracciones: a.totalInfracciones,
    pendientes: a.infraccionesPendientes,
  }));

  const ratingData = analisis.map((a) => ({
    name: a.name.split(' ')[0],
    rating: a.ratingSeguridad,
    infracciones: a.totalInfracciones,
    excesos: a.diasConExceso,
    size: a.kmTotal || 100,
  }));

  const eficienciaData = analisis.slice(0, 10).map((a) => ({
    name: a.name.split(' ')[0],
    eficiencia: a.eficiencia,
  }));

  // KPIs
  const ratingPromedio = analisis.length > 0 ? Math.round(analisis.reduce((s, a) => s + a.ratingSeguridad, 0) / analisis.length) : 0;
  const infraccionesTotal = analisis.reduce((s, a) => s + a.totalInfracciones, 0);
  const multasTotal = analisis.reduce((s, a) => s + a.multasAcumuladas, 0);

  return (
    <>
      <div className="bar">
        <h2 style={{ margin: 0 }}>👥 Análisis de Conductores</h2>
        <span className="sp" />
        {months.length > 0 && (
          <>
            <select value={month} onChange={(e) => setSelectedMonth(e.target.value)}>
              {months.map((m) => <option key={m} value={m}>{m.split('-').reverse().join('/')}</option>)}
            </select>
            {branches.length > 0 && (
              <select value={branch || ''} onChange={(e) => setSelectedBranch(e.target.value || null)}>
                <option value="">Todas las sucursales</option>
                {branches.map((b) => <option key={b} value={b}>{b}</option>)}
              </select>
            )}
          </>
        )}
        {month && (
          <button className="b1" onClick={() => guard(async () => {
            const pdf = await import('@/lib/conductorPdf').then((m) => m.generateConductorPdf);
            pdf(analisis, month.split('-'), branch);
          })}>📄 PDF</button>
        )}
      </div>

      {analisis.length > 0 ? (
        <>
          <div className="cards">
            <div className="card">
              <div className="n">{ratingPromedio}</div>
              <div className="l">Rating Seguridad Promedio</div>
            </div>
            <div className="card">
              <div className="n">{infraccionesTotal}</div>
              <div className="l">Infracciones Totales</div>
            </div>
            <div className="card">
              <div className="n">{num(Math.round(multasTotal))}</div>
              <div className="l">Multas Acumuladas</div>
            </div>
            <div className="card">
              <div className="n">{analisis.length}</div>
              <div className="l">Conductores</div>
            </div>
          </div>

          <div style={{ marginTop: '30px' }}>
            <h3>Ranking: Infracciones por Conductor</h3>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={infraccionesData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="infracciones" fill="#ef4444" name="Total" />
                <Bar dataKey="pendientes" fill="#f59e0b" name="Pendientes" />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div style={{ marginTop: '30px' }}>
            <h3>Rating de Seguridad vs Infracciones</h3>
            <ResponsiveContainer width="100%" height={300}>
              <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" dataKey="infracciones" name="Infracciones" />
                <YAxis type="number" dataKey="rating" name="Rating" />
                <Tooltip cursor={{ strokeDasharray: '3 3' }} />
                <Scatter name="Conductores" data={ratingData} fill="#8b5cf6" />
              </ScatterChart>
            </ResponsiveContainer>
          </div>

          <div style={{ marginTop: '30px' }}>
            <h3>Eficiencia: km/litro</h3>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={eficienciaData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="eficiencia" fill="#10b981" name="km/litro" />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div style={{ marginTop: '30px' }}>
            <h3>Detalle Completo de Conductores</h3>
            <div className="tw">
              <table>
                <thead>
                  <tr>
                    <th>Conductor</th>
                    <th>Infracciones</th>
                    <th>Pendientes</th>
                    <th>Multas</th>
                    <th>Días Exceso</th>
                    <th>Eficiencia</th>
                    <th>Rating</th>
                  </tr>
                </thead>
                <tbody>
                  {analisis.map((a, idx) => (
                    <tr key={a.driver_id} style={{ backgroundColor: idx % 2 === 0 ? '#f9fafb' : '#fff' }}>
                      <td><b>{a.name}</b></td>
                      <td style={{ color: a.totalInfracciones > 0 ? '#ef4444' : '#10b981' }}>{a.totalInfracciones}</td>
                      <td style={{ color: a.infraccionesPendientes > 0 ? '#f59e0b' : '#6b7280' }}>{a.infraccionesPendientes}</td>
                      <td>{num(Math.round(a.multasAcumuladas))}</td>
                      <td>{a.diasConExceso} / {a.diasTotales}</td>
                      <td>{a.eficiencia.toFixed(1)} km/L</td>
                      <td>
                        <span style={{
                          padding: '4px 8px',
                          borderRadius: '4px',
                          backgroundColor: a.ratingSeguridad >= 80 ? '#d1fae5' : a.ratingSeguridad >= 60 ? '#fef3c7' : '#fee2e2',
                          color: a.ratingSeguridad >= 80 ? '#065f46' : a.ratingSeguridad >= 60 ? '#92400e' : '#7f1d1d',
                          fontWeight: 'bold',
                        }}>
                          {a.ratingSeguridad}
                        </span>
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
