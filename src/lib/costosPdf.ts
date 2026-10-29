import jsPDF from 'jspdf';
import type { AnalisisCosto } from './analisisHelpers';

export async function generateCostosPdf(
  data: AnalisisCosto[],
  monthYear: (string | undefined)[],
  branch: string | null,
) {
  const year = monthYear[0] || '2026';
  const month = monthYear[1] || '01';
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  let yPos = 10;

  // Header
  doc.setFontSize(16);
  doc.setTextColor(33, 33, 33);
  doc.text('ANÁLISIS DE COSTOS POR VEHÍCULO', pageWidth / 2, yPos, { align: 'center' });
  yPos += 8;

  doc.setFontSize(11);
  doc.setTextColor(100, 100, 100);
  const monthName = new Date(parseInt(year), parseInt(month) - 1).toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });
  doc.text(`Período: ${monthName}${branch ? ` - ${branch}` : ''}`, pageWidth / 2, yPos, { align: 'center' });
  yPos += 8;
  doc.text(`Generado: ${new Date().toLocaleDateString('es-AR')}`, pageWidth / 2, yPos, { align: 'center' });
  yPos += 12;

  // KPIs
  const totalCostos = data.reduce((s, d) => s + d.totalCostos, 0);
  const costoPorKmPromedio = data.length > 0 ? Math.round((data.reduce((s, d) => s + d.costoPorKm, 0) / data.length) * 100) / 100 : 0;

  doc.setFontSize(10);
  doc.setTextColor(0, 0, 0);
  const kpiWidth = (pageWidth - 60) / 4;

  // KPIs
  const kpis = [
    { label: 'Costo Total', value: `$${Math.round(totalCostos)}`, color: [59, 130, 246] },
    { label: 'Costo/km Prom.', value: `$${costoPorKmPromedio}`, color: [16, 185, 129] },
    { label: 'Vehículos', value: String(data.length), color: [139, 92, 246] },
    { label: 'Km Total', value: String(data.reduce((s, d) => s + d.kmRecorridos, 0)), color: [245, 158, 11] },
  ];

  for (let i = 0; i < kpis.length; i++) {
    const kpi = kpis[i]!;
    doc.setFillColor(...(kpi.color as [number, number, number]));
    const x = 30 + i * (kpiWidth + 5);
    doc.rect(x, yPos, kpiWidth, 18, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(11);
    doc.text(kpi.value, x + kpiWidth / 2, yPos + 8, { align: 'center' });
    doc.setFontSize(8);
    doc.text(kpi.label, x + kpiWidth / 2, yPos + 14, { align: 'center' });
  }

  doc.setTextColor(0, 0, 0);
  yPos += 25;

  // Tabla
  doc.setFontSize(8);
  const headers = ['Patente', 'Combustible', 'Reparaciones', 'Mantenimiento', 'Multas', 'Total', 'Costo/km', 'Var. %'];
  const colWidths = [18, 22, 22, 22, 18, 22, 18, 18];

  // Header fila
  doc.setFillColor(51, 65, 85);
  doc.setTextColor(255, 255, 255);
  doc.setFont('', 'bold');

  let xPos = 15;
  for (let i = 0; i < headers.length; i++) {
    doc.rect(xPos, yPos, colWidths[i]!, 6, 'F');
    doc.text(headers[i]!, xPos + 2, yPos + 4);
    xPos += colWidths[i]!;
  }
  yPos += 6;

  // Filas datos
  doc.setFont('', 'normal');
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(7);

  for (let i = 0; i < data.length; i++) {
    if (yPos + 6 > pageHeight - 20) {
      doc.addPage();
      yPos = 10;
      doc.setFillColor(51, 65, 85);
      doc.setTextColor(255, 255, 255);
      doc.setFont('', 'bold');
      xPos = 15;
      for (let j = 0; j < headers.length; j++) {
        doc.rect(xPos, yPos, colWidths[j]!, 6, 'F');
        doc.text(headers[j]!, xPos + 2, yPos + 4);
        xPos += colWidths[j]!;
      }
      yPos += 6;
      doc.setFont('', 'normal');
      doc.setTextColor(0, 0, 0);
    }

    if (i % 2 === 0) {
      doc.setFillColor(245, 245, 245);
      xPos = 15;
      for (let j = 0; j < headers.length; j++) {
        doc.rect(xPos, yPos, colWidths[j]!, 6, 'F');
        xPos += colWidths[j]!;
      }
    }

    const d = data[i]!;
    const row = [
      d.plate,
      `$${d.combustible.toFixed(0)}`,
      `$${d.reparaciones.toFixed(0)}`,
      `$${d.mantenimiento.toFixed(0)}`,
      `$${d.multas.toFixed(0)}`,
      `$${d.totalCostos.toFixed(0)}`,
      `$${d.costoPorKm.toFixed(2)}`,
      d.variacionMesAnterior ? `${d.variacionMesAnterior > 0 ? '+' : ''}${d.variacionMesAnterior}%` : '—',
    ];

    xPos = 15;
    for (let j = 0; j < row.length; j++) {
      doc.text(row[j]!, xPos + 2, yPos + 4);
      xPos += colWidths[j]!;
    }
    yPos += 6;
  }

  yPos += 5;

  // Footer
  doc.setFontSize(7);
  doc.setTextColor(120, 120, 120);
  doc.text('Este reporte fue generado automáticamente por el sistema de control de flota.', 15, pageHeight - 10);
  doc.text('Empresa: Serprove - Control de Flota', 15, pageHeight - 5);

  doc.save(`Reporte_Costos_${year}-${month}${branch ? '_' + branch : ''}.pdf`);
}
