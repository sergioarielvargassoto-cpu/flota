'use client';
import { useState } from 'react';
import { useData } from '@/lib/data';
import { fd, money, num } from '@/lib/util';
import { guard } from '@/lib/util';
import { pickSheet } from '@/lib/excel';
import { KM_SPEC, useImporters } from '@/lib/importers';
import { ImportDialog } from '@/components/ImportDialog';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell } from 'recharts';

export default function ReportesKm() {
  const { km_reports, vehicles, trips } = useData();
  const { importKmReport } = useImporters();
  const [rows, setRows] = useState<unknown[][] | null>(null);
  const [selectedMonth, setSelectedMonth] = useState('');
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedBranch, setSelectedBranch] = useState<string | null>(null);
  const [showExcluded, setShowExcluded] = useState(false);

  // Obtener meses únicos del histórico
  const months = [...new Set(km_reports.map((r) => `${r.year}-${String(r.month).padStart(2, '0')}`))].sort().reverse();
  const month = months.includes(selectedMonth) ? selectedMonth : months[0] ?? '';
  const [year, m] = (month || `${selectedYear}-01`).split('-').map(Number);

  // Filtrar reportes del mes seleccionado
  const reports = km_reports.filter((r) => r.year === year && r.month === m);
  const branches = [...new Set(reports.map((r) => r.branch).filter(Boolean))] as string[];
  const branch = selectedBranch && branches.includes(selectedBranch) ? selectedBranch : (branches[0] ?? null);

  // Datos para tabla
  const data = reports
    .filter((r) => !branch || r.branch === branch)
    .map((r) => {
      const v = vehicles.find((x) => x.id === r.vehicle_id);
      const variation = r.km_previous ? Math.round(((r.km_total - r.km_previous) / r.km_previous) * 100) : null;
      return {
        r, v,
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

  const colors = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6'];
  const branchColors: Record<string, string> = {};
  branches.forEach((b, i) => {
    branchColors[b] = colors[i % colors.length];
  });

  // Evolución mensual (últimos 6 meses)
  const allReports = km_reports.filter((r) => r.vehicle_id === (filtered[0]?.r.vehicle_id || ''));
  const evolutionData = [...new Set(allReports.map((r) => `${r.year}-${String(r.month).padStart(2, '0')}`))].sort()
    .slice(-6)
    .map((ym) => {
      const [y, m] = ym.split('-').map(Number);
      const total = km_reports
        .filter((r) => r.year === y && r.month === m && (!branch || r.branch === branch))
        .reduce((s, r) => s + r.km_total, 0);
      return { mes: ym, km: total };
    });

  return (
    <>
      <div className="bar">
        <h2 style={{ margin: 0 }}>📊 Reporte Mensual de Kilómetros</h2>
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
        <button className="b2" onClick={async () => setRows(await pickSheet())}>⬆ Importar Gestya</button>
        {month && (
          <button className="b1" onClick={() => guard(async () => {
            const pdf = await import('@/lib/kmReportPdf').then((m) => m.generateKmReportPdf);
            pdf(filtered, month.split('-') as [string, string], branch);
          })}>📄 PDF</button>
        )}
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
            <div className="card" style={{ borderLeft: excessDays.length > 0 ? '4px solid #ef4444' : '4px solid #10b981' }}>
              <div className="n" style={{ color: excessDays.length > 0 ? '#ef4444' : '#10b981' }}>{excessDays.length}</div>
              <div className="l">Días que excedieron {SPEED_LIMIT} km/h</div>
            </div>
            <div className="card" style={{ borderLeft: maxExcessSpeed > 0 ? '4px solid #f59e0b' : '4px solid #6b7280' }}>
              <div className="n" style={{ color: maxExcessSpeed > 0 ? '#f59e0b' : '#6b7280' }}>{maxExcessSpeed || '—'}</div>
              <div className="l">Máx. velocidad excedida</div>
            </div>
          </div>

          {barData.length > 0 && (
            <div style={{ marginTop: '30px' }}>
              <h3>Km por Vehículo</h3>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={barData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="patente" />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="km" radius={[8, 8, 0, 0]}>
                    {barData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={branchColors[entry.branch]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {evolutionData.length > 1 && (
            <div style={{ marginTop: '30px' }}>
              <h3>Evolución Últimos Meses</h3>
              <ResponsiveContainer width="100%" height={250}>
                <LineChart data={evolutionData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="mes" />
                  <YAxis />
                  <Tooltip />
                  <Line type="monotone" dataKey="km" stroke="#3b82f6" strokeWidth={2} dot={{ r: 4 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          {excessDays.length > 0 && (
            <div style={{ marginTop: '30px' }}>
              <h3>⚠️ Días con Exceso de Velocidad (límite: {SPEED_LIMIT} km/h)</h3>
              <div className="tw">
                <table>
                  <thead>
                    <tr>
                      <th>Día</th>
                      <th>Vehículo</th>
                      <th>Marca</th>
                      <th>Velocidad Máxima</th>
                      <th>Exceso</th>
                    </tr>
                  </thead>
                  <tbody>
                    {excessDays.sort((a, b) => b.max_speed! - a.max_speed!).map((t) => {
                      const v = vehicles.find((x) => x.id === t.vehicle_id);
                      const excess = (t.max_speed ?? 0) - SPEED_LIMIT;
                      return (
                        <tr key={t.id} style={{ backgroundColor: '#fff3cd' }}>
                          <td><b>{fd(t.date)}</b></td>
                          <td>{v?.plate || '?'}</td>
                          <td className="muted">{v?.brand || '—'}</td>
                          <td><b style={{ color: '#ef4444' }}>{t.max_speed} km/h</b></td>
                          <td style={{ color: '#ef4444' }}>+{excess} km/h</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div style={{ marginTop: '30px' }}>
            <div style={{ marginBottom: '10px', display: 'flex', gap: '10px', alignItems: 'center' }}>
              <h3 style={{ margin: 0 }}>Detalle por Vehículo</h3>
              <label style={{ fontSize: '12px', marginLeft: 'auto' }}>
                <input type="checkbox" checked={showExcluded} onChange={(e) => setShowExcluded(e.target.checked)} />
                {' '}Mostrar excluidos
              </label>
            </div>
            <div className="tw">
              <table>
                <thead>
                  <tr>
                    <th>Patente</th>
                    <th>Marca / Modelo</th>
                    <th>Km Mes</th>
                    <th>Km Anterior</th>
                    <th>Variación</th>
                    <th>Sucursal</th>
                  </tr>
                </thead>
                <tbody>
                  {(showExcluded ? data : filtered).map((d) => (
                    <tr key={d.r.id} style={{ opacity: d.excluded ? 0.5 : 1 }}>
                      <td><b>{d.v?.plate || '???'}</b></td>
                      <td className="muted">{d.v?.brand && d.v?.model ? `${d.v.brand} ${d.v.model}` : d.v?.brand || '—'}</td>
                      <td><b>{num(Math.round(d.kmTotal))}</b></td>
                      <td>{d.kmPrev > 0 ? num(Math.round(d.kmPrev)) : '—'}</td>
                      <td>
                        {d.variation !== null ? (
                          <span style={{ color: d.variation > 0 ? '#10b981' : d.variation < 0 ? '#ef4444' : '#6b7280' }}>
                            {d.variation > 0 ? '+' : ''}{d.variation}%
                          </span>
                        ) : '—'}
                      </td>
                      <td className="muted">{d.v?.branch || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : (
        <div className="empty">
          {months.length === 0
            ? 'No hay datos. Importá un archivo "Distancias Diarias" de Gestya.'
            : `No hay reportes para ${month}${branch ? ` en ${branch}` : ''}.`}
        </div>
      )}

      {rows && (
        <ImportDialog
          title="Importar Distancias Diarias de Gestya"
          rows={rows}
          spec={KM_SPEC}
          onClose={() => setRows(null)}
          onConfirm={async (d, map) => {
            const m = parseInt(prompt('Mes (1-12):', String(new Date().getMonth() + 1)) || '');
            const y = parseInt(prompt('Año:', String(new Date().getFullYear())) || '');
            if (!m || !y || m < 1 || m > 12) return alert('Mes/año inválido');
            await guard(() => importKmReport(d, map, m, y, rows[0]?.[0]?.toString().slice(0, 50) || 'import'));
          }}
        />
      )}
    </>
  );
}
