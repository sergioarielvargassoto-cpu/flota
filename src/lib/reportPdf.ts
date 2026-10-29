import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { todayStr } from './util';

export async function generatePDF(elementId: string, filename: string) {
  try {
    const element = document.getElementById(elementId);
    if (!element) throw new Error('Elemento no encontrado');

    // Crear canvas del elemento
    const canvas = await html2canvas(element, {
      scale: 2,
      useCORS: true,
      logging: false,
      backgroundColor: '#ffffff',
    });

    const imgData = canvas.toDataURL('image/png');
    const imgWidth = 210; // A4 width in mm
    const pageHeight = 297; // A4 height in mm
    let heightLeft = canvas.height * imgWidth / canvas.width;
    let position = 0;

    const pdf = new jsPDF('p', 'mm', 'a4');
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeightPdf = pdf.internal.pageSize.getHeight();

    // Agregar imagen al PDF (múltiples páginas si es necesario)
    while (heightLeft > 0) {
      const heightPage = Math.min(heightLeft, pageHeight);
      pdf.addImage(imgData, 'PNG', 0, position, pageWidth, heightPage * pageWidth / imgWidth);
      heightLeft -= pageHeight;
      position = -heightPage * pageWidth / imgWidth;
      if (heightLeft > 0) pdf.addPage();
    }

    pdf.save(filename);
  } catch (error) {
    console.error('Error generando PDF:', error);
    alert('Error al generar PDF');
  }
}

export async function generateSimplePDF(data: {
  title: string;
  stats: Record<string, string | number>;
  tables: Array<{ name: string; headers: string[]; rows: (string | number)[][] }>;
}) {
  const pdf = new jsPDF();
  let yPosition = 20;

  // Título
  pdf.setFontSize(16);
  pdf.text(data.title, 20, yPosition);
  yPosition += 15;

  // Estadísticas
  pdf.setFontSize(11);
  Object.entries(data.stats).forEach(([key, value]) => {
    pdf.text(`${key}: ${value}`, 20, yPosition);
    yPosition += 7;
  });

  yPosition += 5;

  // Tablas
  data.tables.forEach((table) => {
    pdf.setFontSize(12);
    pdf.text(table.name, 20, yPosition);
    yPosition += 8;

    // Encabezados
    pdf.setFontSize(10);
    pdf.setFillColor(240, 240, 240);
    const colWidth = (pdf.internal.pageSize.getWidth() - 40) / table.headers.length;
    table.headers.forEach((header, i) => {
      pdf.rect(20 + i * colWidth, yPosition, colWidth, 7, 'F');
      pdf.text(header, 22 + i * colWidth, yPosition + 5);
    });
    yPosition += 7;

    // Filas
    table.rows.forEach((row) => {
      if (yPosition > 270) {
        pdf.addPage();
        yPosition = 20;
      }
      row.forEach((cell, i) => {
        pdf.text(String(cell), 22 + i * colWidth, yPosition + 5);
      });
      yPosition += 7;
    });

    yPosition += 5;
  });

  pdf.save(`${data.title.replace(/\s+/g, '_')}_${todayStr()}.pdf`);
}
