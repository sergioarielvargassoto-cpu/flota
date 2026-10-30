import jsPDF from 'jspdf';

interface KmReportData {
  r: { id: string; km_total: number; km_previous: number | null };
  v: { id: string; plate: string; brand: string | null; model: string | null; branch: string } | undefined;
  kmTotal: number;
  variation: number | null;
  excluded: boolean;
}

export async function generateKmReportPdf(
  data: KmReportData[],
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
  doc.text('REPORTE MENSUAL DE KILÓMETROS', pageWidth / 2, yPos, { align: 'center' });
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
  const totalKm = data.reduce((s, d) => s + d.kmTotal, 0);
  const avgKm = data.length > 0 ? Math.round(totalKm / data.length) : 0;

  doc.setFontSize(10);
  doc.setTextColor(0, 0, 0);
  const kpiWidth = (pageWidth - 30) / 3;

  // KPI 1
  doc.setFillColor(59, 130, 246);
  doc.rect(15, yPos, kpiWidth, 20, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(12);
  doc.text(String(Math.round(totalKm)), 15 + kpiWidth / 2, yPos + 10, { align: 'center' });
  doc.setFontSize(9);
  doc.text('Km Totales', 15 + kpiWidth / 2, yPos + 16, { align: 'center' });

  // KPI 2
  doc.setFillColor(16, 185, 129);
  doc.rect(15 + kpiWidth + 5, yPos, kpiWidth, 20, 'F');
  doc.text(String(avgKm), 15 + kpiWidth + 5 + kpiWidth / 2, yPos + 10, { align: 'center' });
  doc.text('Km Promedio', 15 + kpiWidth + 5 + kpiWidth / 2, yPos + 16, { align: 'center' });

  // KPI 3
  doc.setFillColor(139, 92, 246);
  doc.rect(15 + (kpiWidth + 5) * 2, yPos, kpiWidth, 20, 'F');
  doc.text(String(data.length), 15 + (kpiWidth + 5) * 2 + kpiWidth / 2, yPos + 10, { align: 'center' });
  doc.text('Vehículos', 15 + (kpiWidth + 5) * 2 + kpiWidth / 2, yPos + 16, { align: 'center' });

  doc.setTextColor(0, 0, 0);
  yPos += 28;

  // Tabla
  doc.setFontSize(10);
  const headers: string[] = ['Patente', 'Marca/Modelo', 'Km Mes', 'Km Anterior', 'Variación %', 'Sucursal'];
  const tableData: string[][] = [...[headers]];

  for (const d of data) {
    tableData.push([
      d.v?.plate || '?',
      d.v?.brand && d.v?.model ? `${d.v.brand} ${d.v.model}` : d.v?.brand || '-',
      String(Math.round(d.kmTotal)),
      d.r.km_previous ? String(Math.round(d.r.km_previous)) : '-',
      d.variation !== null ? `${d.variation > 0 ? '+' : ''}${d.variation}%` : '-',
      d.v?.branch || '-',
    ]);
  }

  const colWidths: number[] = [25, 35, 18, 20, 20, 24];
  const rowHeight = 7;

  // Header fila
  doc.setFillColor(51, 65, 85);
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(9);
  doc.setFont('', 'bold');

  let xPos = 15;
  for (let i = 0; i < headers.length; i++) {
    doc.rect(xPos, yPos, colWidths[i]!, rowHeight, 'F');
    const txt = headers[i]!;
    doc.text(txt, xPos + 2, yPos + 5);
    xPos += colWidths[i]!;
  }
  yPos += rowHeight;

  // Filas datos
  doc.setFont('', 'normal');
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(8);

  for (let i = 1; i < tableData.length; i++) {
    if (yPos + rowHeight > pageHeight - 20) {
      doc.addPage();
      yPos = 10;
      doc.setFillColor(51, 65, 85);
      doc.setTextColor(255, 255, 255);
      doc.setFont('', 'bold');
      xPos = 15;
      for (let j = 0; j < headers.length; j++) {
        doc.rect(xPos, yPos, colWidths[j]!, rowHeight, 'F');
        const txt = headers[j]!;
        doc.text(txt, xPos + 2, yPos + 5);
        xPos += colWidths[j]!;
      }
      yPos += rowHeight;
      doc.setFont('', 'normal');
      doc.setTextColor(0, 0, 0);
    }

    if (i % 2 === 0) {
      doc.setFillColor(245, 245, 245);
      xPos = 15;
      for (let j = 0; j < headers.length; j++) {
        doc.rect(xPos, yPos, colWidths[j]!, rowHeight, 'F');
        xPos += colWidths[j]!;
      }
    }

    xPos = 15;
    for (let j = 0; j < tableData[i]!.length; j++) {
      const txt = tableData[i]![j]!;
      doc.text(txt, xPos + 2, yPos + 5);
      xPos += colWidths[j]!;
    }
    yPos += rowHeight;
  }

  yPos += 8;

  // Notas finales
  doc.setFontSize(8);
  doc.setTextColor(120, 120, 120);
  doc.text('Este reporte fue generado automáticamente por el sistema de control de flota.', 15, pageHeight - 15);
  doc.text('Empresa: Serprove - Control de Flota', 15, pageHeight - 10);

  // Guardar
  doc.save(`Reporte_KM_${year}-${month}${branch ? '_' + branch : ''}.pdf`);
}
