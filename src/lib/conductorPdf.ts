import jsPDF from 'jspdf';
import type { AnalisisConductor } from './analisisHelpers';

export async function generateConductorPdf(
  data: AnalisisConductor[],
  monthYear: (string | undefined)[],
  branch: string | null
) {
  const year = monthYear[0] || '2026';
  const month = monthYear[1] || '01';
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  let yPos = 10;

  // Header
  doc.setFontSize(16);
  doc.setTextColor(33, 33, 33);
  doc.text('ANÁLISIS DE CONDUCTORES', pageWidth / 2, yPos, { align: 'center' });
  yPos += 8;

  doc.setFontSize(11);
  doc.setTextColor(100, 100, 100);
  const monthName = new Date(parseInt(year), parseInt(month) - 1).toLocaleDateString('es-AR', {
    month: 'long',
    year: 'numeric',
  });
  doc.text(`Período: ${monthName}${branch ? ` - ${branch}` : ''}`, pageWidth / 2, yPos, { align: 'center' });
  yPos += 8;
  doc.text(`Generado: ${new Date().toLocaleDateString('es-AR')}`, pageWidth / 2, yPos, { align: 'center' });
  yPos += 12;

  // KPIs
  const ratingPromedio =
    data.length > 0 ? Math.round(data.reduce((s, d) => s + d.ratingSeguridad, 0) / data.length) : 0;
  const infraccionesTotal = data.reduce((s, d) => s + d.totalInfracciones, 0);
  const multasTotal = data.reduce((s, d) => s + d.multasAcumuladas, 0);

  doc.setFontSize(10);
  doc.setTextColor(0, 0, 0);
  const kpiWidth = (pageWidth - 30) / 4;

  // KPI 1
  doc.setFillColor(139, 92, 246);
  doc.rect(15, yPos, kpiWidth, 20, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(12);
  doc.text(String(ratingPromedio), 15 + kpiWidth / 2, yPos + 10, { align: 'center' });
  doc.setFontSize(9);
  doc.text('Rating Prom.', 15 + kpiWidth / 2, yPos + 16, { align: 'center' });

  // KPI 2
  doc.setFillColor(239, 68, 68);
  doc.rect(15 + kpiWidth + 5, yPos, kpiWidth, 20, 'F');
  doc.setFontSize(12);
  doc.text(String(infraccionesTotal), 15 + kpiWidth + 5 + kpiWidth / 2, yPos + 10, { align: 'center' });
  doc.setFontSize(9);
  doc.text('Infracciones', 15 + kpiWidth + 5 + kpiWidth / 2, yPos + 16, { align: 'center' });

  // KPI 3
  doc.setFillColor(245, 158, 11);
  doc.rect(15 + (kpiWidth + 5) * 2, yPos, kpiWidth, 20, 'F');
  doc.setFontSize(12);
  doc.text(`$${Math.round(multasTotal)}`, 15 + (kpiWidth + 5) * 2 + kpiWidth / 2, yPos + 10, { align: 'center' });
  doc.setFontSize(9);
  doc.text('Multas', 15 + (kpiWidth + 5) * 2 + kpiWidth / 2, yPos + 16, { align: 'center' });

  // KPI 4
  doc.setFillColor(16, 185, 129);
  doc.rect(15 + (kpiWidth + 5) * 3, yPos, kpiWidth, 20, 'F');
  doc.setFontSize(12);
  doc.text(String(data.length), 15 + (kpiWidth + 5) * 3 + kpiWidth / 2, yPos + 10, { align: 'center' });
  doc.setFontSize(9);
  doc.text('Conductores', 15 + (kpiWidth + 5) * 3 + kpiWidth / 2, yPos + 16, { align: 'center' });

  doc.setTextColor(0, 0, 0);
  yPos += 28;

  // Tabla
  doc.setFontSize(9);
  const headers = ['Conductor', 'Infracciones', 'Pendientes', 'Multas', 'Días Exceso', 'Eficiencia', 'Rating'];
  const colWidths: number[] = [30, 20, 18, 20, 20, 20, 22];

  // Header fila
  doc.setFillColor(51, 65, 85);
  doc.setTextColor(255, 255, 255);
  doc.setFont('', 'bold');

  let xPos = 15;
  for (let i = 0; i < headers.length; i++) {
    doc.rect(xPos, yPos, colWidths[i]!, 7, 'F');
    doc.text(headers[i]!, xPos + 2, yPos + 5);
    xPos += colWidths[i]!;
  }
  yPos += 7;

  // Filas datos
  doc.setFont('', 'normal');
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(8);

  for (let i = 0; i < data.length; i++) {
    if (yPos + 7 > pageHeight - 20) {
      doc.addPage();
      yPos = 10;
      doc.setFillColor(51, 65, 85);
      doc.setTextColor(255, 255, 255);
      doc.setFont('', 'bold');
      xPos = 15;
      for (let j = 0; j < headers.length; j++) {
        doc.rect(xPos, yPos, colWidths[j]!, 7, 'F');
        doc.text(headers[j]!, xPos + 2, yPos + 5);
        xPos += colWidths[j]!;
      }
      yPos += 7;
      doc.setFont('', 'normal');
      doc.setTextColor(0, 0, 0);
    }

    if (i % 2 === 0) {
      doc.setFillColor(245, 245, 245);
      xPos = 15;
      for (let j = 0; j < headers.length; j++) {
        doc.rect(xPos, yPos, colWidths[j]!, 7, 'F');
        xPos += colWidths[j]!;
      }
    }

    const d = data[i]!;
    const row = [
      d.name,
      String(d.totalInfracciones),
      String(d.infraccionesPendientes),
      `$${Math.round(d.multasAcumuladas)}`,
      `${d.diasConExceso}/${d.diasTotales}`,
      `${d.eficiencia.toFixed(1)}`,
      String(d.ratingSeguridad),
    ];

    xPos = 15;
    for (let j = 0; j < row.length; j++) {
      doc.text(row[j]!, xPos + 2, yPos + 5);
      xPos += colWidths[j]!;
    }
    yPos += 7;
  }

  yPos += 8;

  // Footer
  doc.setFontSize(8);
  doc.setTextColor(120, 120, 120);
  doc.text('Este reporte fue generado automáticamente por el sistema de control de flota.', 15, pageHeight - 15);
  doc.text('Empresa: Serprove - Control de Flota', 15, pageHeight - 10);

  doc.save(`Reporte_Conductores_${year}-${month}${branch ? '_' + branch : ''}.pdf`);
}
