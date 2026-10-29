'use client';
import { useState, useMemo } from 'react';
import { useData } from '@/lib/data';
import { todayStr } from '@/lib/util';
import { InfractionsByTypeChart, InfractionsByDriverChart, InfractionsByMonthChart, StatusDistributionChart, FinesProgressChart } from '@/components/ReportCharts';
import { generatePDF, generateSimplePDF } from '@/lib/reportPdf';

export default function Reportes() {
  const { infractions, fines, drivers, vehicles } = useData();
  const [reportType, setReportType] = useState<'monthly' | 'weekly' | 'by_driver' | 'by_vehicle' | 'pending'>('monthly');
  const [selectedDriver, setSelectedDriver] = useState('');
  const [selectedVehicle, setSelectedVehicle] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState(todayStr());

  const filtered = useMemo(() => {
    let list = [...infractions];
    if (startDate) list = list.filter((i) => i.date >= startDate);
    if (endDate) list = list.filter((i) => i.date <= endDate);
    if (selectedDriver) list = list.filter((i) => i.driver_id === selectedDriver);
    if (selectedVehicle) list = list.filter((i) => i.vehicle_id === selectedVehicle);
    if (reportType === 'pending') list = list.filter((i) => i.status === 'Registrada');
    return list;
  }, [infractions, startDate, endDate, selectedDriver, selectedVehicle, reportType]);

  const stats = useMemo(() => {
    const totalInfractions = filtered.length;
    const totalFines = filtered.reduce((sum, i) => sum + (i.fine_amount || 0), 0);

    // Create Set for O(1) lookup instead of O(n*m) with .some()
    const filteredInfractionIds = new Set(filtered.map((i) => i.id));
    const pendingFines = fines
      .filter((f) => filteredInfractionIds.has(f.infraction_id) && f.paid_amount === null)
      .reduce((sum, f) => sum + f.amount, 0);
    const paidFines = fines
      .filter((f) => filteredInfractionIds.has(f.infraction_id) && f.paid_amount !== null)
      .reduce((sum, f) => sum + f.paid_amount, 0);

    // Create Map for O(1) driver/vehicle lookup
    const driverMap = new Map(drivers.map((d) => [d.id, d.name]));
    const vehicleMap = new Map(vehicles.map((v) => [v.id, v.plate]));

    const byType = filtered.reduce((acc, i) => {
      acc[i.type] = (acc[i.type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const byDriver = filtered.reduce((acc, i) => {
      const name = driverMap.get(i.driver_id) || 'Desconocido';
      acc[name] = (acc[name] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const byMonth = filtered.reduce((acc, i) => {
      const month = i.date.substring(0, 7);
      acc[month] = (acc[month] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return { totalInfractions, totalFines, pendingFines, paidFines, byType, byDriver, byMonth, driverMap, vehicleMap };
  }, [filtered, fines, drivers, vehicles]);

  const handlePrint = () => window.print();

  const handleDownloadCSV = () => {
    const rows = [['Conductor', 'Vehículo', 'Fecha', 'Tipo', 'N° Infracción', 'Multa ($)', 'Estado']];
    filtered.forEach((i) => {
      const driverName = stats.driverMap.get(i.driver_id) || '—';
      const vehiclePlate = stats.vehicleMap.get(i.vehicle_id) || '—';
      rows.push([
        driverName,
        vehiclePlate,
        i.date,
        i.type,
        i.infraction_number || '—',
        i.fine_amount ? String(i.fine_amount.toFixed(2)) : '—',
        i.status,
      ]);
    });
    const csv = rows.map((r) => r.map((c) => '"' + String(c).replace(/"/g, '""') + '"').join(';')).join('\r\n');
    const link = document.createElement('a');
    link.href = `data:text/csv;charset=utf-8,${encodeURIComponent(csv)}`;
    link.download = `reportes_infracciones_${todayStr()}.csv`;
    link.click();
  };

  const handleDownloadPDF = async () => {
    const pdfData = {
      title: `Reporte de Infracciones - ${todayStr()}`,
      stats: {
        'Total de Infracciones': stats.totalInfractions,
        'Multas Total': `$${stats.totalFines.toFixed(2)}`,
        'Multas Pendientes': `$${stats.pendingFines.toFixed(2)}`,
        'Multas Pagadas': `$${stats.paidFines.toFixed(2)}`,
      },
      tables: [
        {
          name: 'Infracciones por Tipo',
          headers: ['Tipo', 'Cantidad', 'Porcentaje'],
          rows: Object.entries(stats.byType).map(([type, count]) => [
            type,
            count,
            stats.totalInfractions > 0 ? `${((count / stats.totalInfractions) * 100).toFixed(1)}%` : '0%',
          ]),
        },
        {
          name: 'Detalle de Infracciones',
          headers: ['Conductor', 'Vehículo', 'Fecha', 'Tipo', 'Multa ($)', 'Estado'],
          rows: filtered.map((i) => [
            stats.driverMap.get(i.driver_id) || '—',
            stats.vehicleMap.get(i.vehicle_id) || '—',
            i.date,
            i.type,
            i.fine_amount ? i.fine_amount.toFixed(2) : '—',
            i.status,
          ]),
        },
      ],
    };
    try {
      await generateSimplePDF(pdfData);
    } catch (error) {
      console.error('Error generando PDF:', error);
      alert('Error al generar PDF');
    }
  };

  return (
    <>
      <h2>Generador de Reportes</h2>

      <div style={{ padding: '20px', backgroundColor: '#e3f2fd', borderRadius: '8px', marginBottom: '20px', border: '2px solid #2196f3' }}>
        <h3 style={{ marginTop: 0, color: '#1976d2' }}>⚙️ Filtrar Reporte</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', marginBottom: '16px' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '4px', fontWeight: 'bold' }}>Tipo de Reporte</label>
            <select
              value={reportType}
              onChange={(e) => {
                const val = e.target.value as 'monthly' | 'weekly' | 'by_driver' | 'by_vehicle' | 'pending';
                setReportType(val);
              }}
              style={{ width: '100%', padding: '8px' }}
            >
              <option value="monthly">Reporte Mensual</option>
              <option value="weekly">Reporte Semanal</option>
              <option value="by_driver">Por Conductor</option>
              <option value="by_vehicle">Por Vehículo</option>
              <option value="pending">Multas Pendientes</option>
            </select>
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '4px', fontWeight: 'bold' }}>Desde</label>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} style={{ width: '100%', padding: '8px' }} />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '4px', fontWeight: 'bold' }}>Hasta</label>
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} style={{ width: '100%', padding: '8px' }} />
          </div>
          {reportType === 'by_driver' && (
            <div>
              <label style={{ display: 'block', marginBottom: '4px', fontWeight: 'bold' }}>Seleccionar Conductor</label>
              <select value={selectedDriver} onChange={(e) => setSelectedDriver(e.target.value)} style={{ width: '100%', padding: '8px' }}>
                <option value="">— Todos —</option>
                {drivers.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </div>
          )}
          {reportType === 'by_vehicle' && (
            <div>
              <label style={{ display: 'block', marginBottom: '4px', fontWeight: 'bold' }}>Seleccionar Vehículo</label>
              <select value={selectedVehicle} onChange={(e) => setSelectedVehicle(e.target.value)} style={{ width: '100%', padding: '8px' }}>
                <option value="">— Todos —</option>
                {vehicles.map((v) => (
                  <option key={v.id} value={v.id}>{v.plate}</option>
                ))}
              </select>
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '16px' }}>
          <button
            onClick={() => {
              setStartDate('');
              setSelectedDriver('');
              setSelectedVehicle('');
            }}
            style={{ padding: '10px 20px', backgroundColor: '#f44336', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}
          >
            🔄 Limpiar Filtros
          </button>
          <button
            onClick={() => handleDownloadPDF()}
            style={{ padding: '10px 20px', backgroundColor: '#4caf50', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', fontSize: '16px' }}
          >
            📊 Generar Reporte
          </button>
        </div>
      </div>

      <div className="cards">
        <div className="card"><div className="n">{stats.totalInfractions}</div><div className="l">Total de Infracciones</div></div>
        <div className="card"><div className="n">${stats.totalFines.toFixed(2)}</div><div className="l">Multas Total</div></div>
        <div className="card"><div className="n">${stats.pendingFines.toFixed(2)}</div><div className="l">Multas Pendientes</div></div>
        <div className="card"><div className="n">${stats.paidFines.toFixed(2)}</div><div className="l">Multas Pagadas</div></div>
      </div>

      <div id="reports-content" style={{ marginBottom: '20px' }}>
        <h3>📊 Infracciones por Tipo</h3>
        <div style={{ backgroundColor: '#f5f5f5', padding: '16px', borderRadius: '8px', marginBottom: '20px' }}>
          <InfractionsByTypeChart data={stats.byType} />
        </div>

        {Object.keys(stats.byDriver).length > 0 && (
          <>
            <h3>👥 Top Conductores con Infracciones</h3>
            <div style={{ backgroundColor: '#f5f5f5', padding: '16px', borderRadius: '8px', marginBottom: '20px' }}>
              <InfractionsByDriverChart data={stats.byDriver} />
            </div>
          </>
        )}

        {Object.keys(stats.byMonth).length > 0 && (
          <>
            <h3>📈 Infracciones por Mes</h3>
            <div style={{ backgroundColor: '#f5f5f5', padding: '16px', borderRadius: '8px', marginBottom: '20px' }}>
              <InfractionsByMonthChart data={stats.byMonth} />
            </div>
          </>
        )}

        <h3>🎯 Distribución de Estados</h3>
        <div style={{ backgroundColor: '#f5f5f5', padding: '16px', borderRadius: '8px', marginBottom: '20px' }}>
          <StatusDistributionChart
            data={{
              Registrada: filtered.filter((i) => i.status === 'Registrada').length,
              Pagada: filtered.filter((i) => i.status === 'Pagada').length,
              Anulada: filtered.filter((i) => i.status === 'Anulada').length,
            }}
          />
        </div>

        <h3>💰 Multas Pagadas vs Pendientes</h3>
        <div style={{ backgroundColor: '#f5f5f5', padding: '16px', borderRadius: '8px', marginBottom: '20px' }}>
          <FinesProgressChart paid={stats.paidFines} pending={stats.pendingFines} />
        </div>
      </div>

      <h3>📋 Infracciones por Tipo (Tabla)</h3>
      <div className="tw"><table>
        <thead><tr><th>Tipo</th><th>Cantidad</th><th>Porcentaje</th></tr></thead>
        <tbody>
          {Object.entries(stats.byType).map(([type, count]) => (
            <tr key={type}>
              <td>{type}</td><td><b>{count}</b></td><td>{stats.totalInfractions > 0 ? `${((count / stats.totalInfractions) * 100).toFixed(1)}%` : '0%'}</td>
            </tr>
          ))}
        </tbody>
      </table></div>

      {Object.keys(stats.byDriver).length > 0 && (
        <>
          <h3 style={{ marginTop: '20px' }}>Infracciones por Conductor</h3>
          <div className="tw"><table>
            <thead><tr><th>Conductor</th><th>Cantidad</th></tr></thead>
            <tbody>
              {Object.entries(stats.byDriver).sort((a, b) => b[1] - a[1]).map(([driver, count]) => (
                <tr key={driver}><td>{driver}</td><td><b>{count}</b></td></tr>
              ))}
            </tbody>
          </table></div>
        </>
      )}

      {Object.keys(stats.byMonth).length > 0 && (
        <>
          <h3 style={{ marginTop: '20px' }}>Infracciones por Mes</h3>
          <div className="tw"><table>
            <thead><tr><th>Mes</th><th>Cantidad</th></tr></thead>
            <tbody>
              {Object.entries(stats.byMonth).sort((a, b) => b[0].localeCompare(a[0])).map(([month, count]) => (
                <tr key={month}><td>{month}</td><td><b>{count}</b></td></tr>
              ))}
            </tbody>
          </table></div>
        </>
      )}

      <h3 style={{ marginTop: '20px' }}>Detalle de Infracciones</h3>
      {filtered.length > 0 ? (
        <div className="tw"><table>
          <thead><tr><th>Conductor</th><th>Vehículo</th><th>Fecha</th><th>Tipo</th><th>N° Infracción</th><th>Multa ($)</th><th>Estado</th></tr></thead>
          <tbody>
            {filtered.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).map((i) => {
              const d = drivers.find((x) => x.id === i.driver_id);
              const v = vehicles.find((x) => x.id === i.vehicle_id);
              const statusColor: Record<string, string> = { 'Registrada': '#ff9800', 'Pagada': '#4caf50', 'Anulada': '#999' };
              return (
                <tr key={i.id}>
                  <td>{d?.name || '—'}</td><td>{v?.plate || '—'}</td><td>{i.date}</td><td>{i.type}</td>
                  <td>{i.infraction_number || '—'}</td><td>{i.fine_amount ? `$${i.fine_amount.toFixed(2)}` : '—'}</td>
                  <td><span style={{ padding: '4px 8px', borderRadius: '4px', backgroundColor: statusColor[i.status], color: '#fff', fontSize: '12px' }}>{i.status}</span></td>
                </tr>
              );
            })}
          </tbody>
        </table></div>
      ) : (
        <div className="empty">No hay infracciones que coincidan con los filtros.</div>
      )}

      <div className="bar" style={{ marginTop: '20px' }}>
        <span className="sp" />
        <button className="b2" onClick={handleDownloadPDF}>📄 Descargar PDF</button>
        <button className="b2" onClick={handleDownloadCSV}>⬇ Descargar CSV</button>
        <button className="b2" onClick={handlePrint}>🖨 Imprimir</button>
      </div>
    </>
  );
}
