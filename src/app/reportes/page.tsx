'use client';
import { useState, useMemo } from 'react';
import { useData } from '@/lib/data';
import { todayStr } from '@/lib/util';

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
    const pendingFines = fines
      .filter((f) => filtered.some((i) => i.id === f.infraction_id) && !f.paid_amount)
      .reduce((sum, f) => sum + f.amount, 0);
    const paidFines = fines
      .filter((f) => filtered.some((i) => i.id === f.infraction_id) && f.paid_amount)
      .reduce((sum, f) => sum + f.paid_amount, 0);

    const byType = filtered.reduce((acc, i) => {
      acc[i.type] = (acc[i.type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const byDriver = filtered.reduce((acc, i) => {
      const d = drivers.find((x) => x.id === i.driver_id);
      const name = d?.name || 'Desconocido';
      acc[name] = (acc[name] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const byMonth = filtered.reduce((acc, i) => {
      const month = i.date.substring(0, 7);
      acc[month] = (acc[month] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return { totalInfractions, totalFines, pendingFines, paidFines, byType, byDriver, byMonth };
  }, [filtered, fines, drivers]);

  const handlePrint = () => window.print();

  const handleDownloadCSV = () => {
    const rows = [['Conductor', 'Vehículo', 'Fecha', 'Tipo', 'N° Infracción', 'Multa ($)', 'Estado']];
    filtered.forEach((i) => {
      const d = drivers.find((x) => x.id === i.driver_id);
      const v = vehicles.find((x) => x.id === i.vehicle_id);
      rows.push([
        d?.name || '—',
        v?.plate || '—',
        i.date,
        i.type,
        i.infraction_number || '—',
        i.fine_amount ? String(i.fine_amount.toFixed(2)) : '—',
        i.status,
      ]);
    });
    const csv = rows.map((r) => r.map((c) => '"' + String(c).replace(/"/g, '""') + '"').join(';')).join('\r\n');
    const link = document.createElement('a');
    link.href = `data:text/csv;charset=utf-8,﻿${csv}`;
    link.download = `reportes_infracciones_${todayStr()}.csv`;
    link.click();
  };

  return (
    <>
      <h2>Generador de Reportes</h2>

      <div style={{ padding: '16px', backgroundColor: '#f5f5f5', borderRadius: '8px', marginBottom: '20px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', marginBottom: '12px' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '4px', fontWeight: 'bold' }}>Tipo de Reporte</label>
            <select value={reportType} onChange={(e) => setReportType(e.target.value as any)} style={{ width: '100%', padding: '8px' }}>
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
      </div>

      <div className="cards">
        <div className="card"><div className="n">{stats.totalInfractions}</div><div className="l">Total de Infracciones</div></div>
        <div className="card"><div className="n">${stats.totalFines.toFixed(2)}</div><div className="l">Multas Total</div></div>
        <div className="card"><div className="n">${stats.pendingFines.toFixed(2)}</div><div className="l">Multas Pendientes</div></div>
        <div className="card"><div className="n">${stats.paidFines.toFixed(2)}</div><div className="l">Multas Pagadas</div></div>
      </div>

      <h3>Infracciones por Tipo</h3>
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
        <button className="b2" onClick={handleDownloadCSV}>⬇ Descargar CSV</button>
        <button className="b2" onClick={handlePrint}>🖨 Imprimir</button>
      </div>
    </>
  );
}
