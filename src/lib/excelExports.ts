import * as XLSX from 'xlsx';
import type { AnalisisConductor, AnalisisCosto, ComparativaSucursal } from './analisisHelpers';

export function exportarConductoresExcel(
  data: AnalisisConductor[],
  monthYear: (string | undefined)[],
  branch: string | null
) {
  const year = monthYear[0] || '2026';
  const month = monthYear[1] || '01';

  const datos = data.map((a) => ({
    Conductor: a.name,
    'Total Infracciones': a.totalInfracciones,
    'Infracciones Pendientes': a.infraccionesPendientes,
    'Multas Acumuladas': a.multasAcumuladas,
    'Días con Exceso': a.diasConExceso,
    'Días Totales': a.diasTotales,
    'Km Totales': a.kmTotal,
    'Litros Totales': a.litrosTotal,
    'Eficiencia (km/L)': a.eficiencia.toFixed(2),
    'Rating Seguridad': a.ratingSeguridad,
  }));

  const ws = XLSX.utils.json_to_sheet(datos);
  ws['!cols'] = [
    { wch: 20 },
    { wch: 15 },
    { wch: 15 },
    { wch: 15 },
    { wch: 15 },
    { wch: 15 },
    { wch: 12 },
    { wch: 12 },
    { wch: 15 },
    { wch: 15 },
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Conductores');

  // Agregar resumen
  const resumen = [
    ['RESUMEN'],
    ['Rating Promedio', Math.round(data.reduce((s, d) => s + d.ratingSeguridad, 0) / (data.length || 1))],
    ['Infracciones Totales', data.reduce((s, d) => s + d.totalInfracciones, 0)],
    ['Multas Totales', data.reduce((s, d) => s + d.multasAcumuladas, 0)],
    ['Cantidad Conductores', data.length],
  ];

  const wsSummary = XLSX.utils.aoa_to_sheet(resumen);
  XLSX.utils.book_append_sheet(wb, wsSummary, 'Resumen');

  const fileName = `Reporte_Conductores_${year}-${month}${branch ? '_' + branch : ''}.xlsx`;
  XLSX.writeFile(wb, fileName);
}

export function exportarCostosExcel(data: AnalisisCosto[], monthYear: (string | undefined)[], branch: string | null) {
  const year = monthYear[0] || '2026';
  const month = monthYear[1] || '01';

  const datos = data.map((a) => ({
    Patente: a.plate,
    Marca: a.brand || '-',
    Modelo: a.model || '-',
    Sucursal: a.branch,
    Combustible: a.combustible.toFixed(2),
    Reparaciones: a.reparaciones.toFixed(2),
    Mantenimiento: a.mantenimiento.toFixed(2),
    Multas: a.multas.toFixed(2),
    'Total Costos': a.totalCostos.toFixed(2),
    'Km Recorridos': a.kmRecorridos,
    'Costo/km': a.costoPorKm.toFixed(2),
    'Variación Mes Ant. (%)': a.variacionMesAnterior || '-',
    'Variación Año Ant. (%)': a.variacionAnoAnterior || '-',
  }));

  const ws = XLSX.utils.json_to_sheet(datos);
  ws['!cols'] = [
    { wch: 12 },
    { wch: 15 },
    { wch: 15 },
    { wch: 12 },
    { wch: 12 },
    { wch: 12 },
    { wch: 12 },
    { wch: 10 },
    { wch: 12 },
    { wch: 12 },
    { wch: 10 },
    { wch: 15 },
    { wch: 15 },
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Costos');

  // Agregar resumen
  const totalCostos = data.reduce((s, d) => s + d.totalCostos, 0);
  const costoPorKmPromedio =
    data.length > 0 ? (data.reduce((s, d) => s + d.costoPorKm, 0) / data.length).toFixed(2) : 0;
  const kmTotales = data.reduce((s, d) => s + d.kmRecorridos, 0);

  const resumen = [
    ['RESUMEN'],
    ['Costo Total', totalCostos.toFixed(2)],
    ['Costo Promedio/km', costoPorKmPromedio],
    ['Km Totales', kmTotales],
    ['Cantidad Vehículos', data.length],
    [''],
    ['DESGLOSE GASTOS'],
    ['Combustible', data.reduce((s, d) => s + d.combustible, 0).toFixed(2)],
    ['Reparaciones', data.reduce((s, d) => s + d.reparaciones, 0).toFixed(2)],
    ['Mantenimiento', data.reduce((s, d) => s + d.mantenimiento, 0).toFixed(2)],
    ['Multas', data.reduce((s, d) => s + d.multas, 0).toFixed(2)],
  ];

  const wsSummary = XLSX.utils.aoa_to_sheet(resumen);
  XLSX.utils.book_append_sheet(wb, wsSummary, 'Resumen');

  const fileName = `Reporte_Costos_${year}-${month}${branch ? '_' + branch : ''}.xlsx`;
  XLSX.writeFile(wb, fileName);
}

export function exportarSucursalesExcel(data: ComparativaSucursal[], monthYear: (string | undefined)[]) {
  const year = monthYear[0] || '2026';
  const month = monthYear[1] || '01';

  const datos = data.map((s) => ({
    Sucursal: s.branch,
    'Km Totales': s.totalKm,
    'Combustible (L)': s.totalCombustible.toFixed(2),
    'Costo Promedio/km': s.costPromedioKm.toFixed(2),
    Infracciones: s.totalInfracciones,
    Conductores: s.cantidadConductores,
    Vehículos: s.cantidadVehiculos,
    'Rating Seguridad Prom.': s.ratingSeguridadPromedio,
    'Eficiencia Prom. (km/L)': s.eficienciaPromedio.toFixed(2),
  }));

  const ws = XLSX.utils.json_to_sheet(datos);
  ws['!cols'] = [
    { wch: 15 },
    { wch: 12 },
    { wch: 15 },
    { wch: 15 },
    { wch: 12 },
    { wch: 12 },
    { wch: 10 },
    { wch: 18 },
    { wch: 18 },
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Sucursales');

  // Agregar rankings
  const rankings = [
    ['RANKINGS'],
    ['Sucursal más eficiente (costo/km)', data.reduce((a, b) => (a.costPromedioKm < b.costPromedioKm ? a : b)).branch],
    [
      'Sucursal más segura (rating)',
      data.reduce((a, b) => (a.ratingSeguridadPromedio > b.ratingSeguridadPromedio ? a : b)).branch,
    ],
    [
      'Mejor eficiencia (km/litro)',
      data.reduce((a, b) => (a.eficienciaPromedio > b.eficienciaPromedio ? a : b)).branch,
    ],
    [''],
    ['TOTALES'],
    ['Total Km', data.reduce((s, c) => s + c.totalKm, 0)],
    ['Total Infracciones', data.reduce((s, c) => s + c.totalInfracciones, 0)],
    ['Total Vehículos', data.reduce((s, c) => s + c.cantidadVehiculos, 0)],
    ['Total Conductores', data.reduce((s, c) => s + c.cantidadConductores, 0)],
  ];

  const wsRankings = XLSX.utils.aoa_to_sheet(rankings);
  XLSX.utils.book_append_sheet(wb, wsRankings, 'Rankings');

  const fileName = `Reporte_Sucursales_${year}-${month}.xlsx`;
  XLSX.writeFile(wb, fileName);
}
