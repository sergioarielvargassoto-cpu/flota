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
    let heightLeft = (canvas.height * imgWidth) / canvas.width;
    let position = 0;

    const pdf = new jsPDF('p', 'mm', 'a4');
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeightPdf = pdf.internal.pageSize.getHeight();

    // Agregar imagen al PDF (múltiples páginas si es necesario)
    while (heightLeft > 0) {
      const heightPage = Math.min(heightLeft, pageHeight);
      pdf.addImage(imgData, 'PNG', 0, position, pageWidth, (heightPage * pageWidth) / imgWidth);
      heightLeft -= pageHeight;
      position = (-heightPage * pageWidth) / imgWidth;
      if (heightLeft > 0) pdf.addPage();
    }

    pdf.save(filename);
  } catch (error) {
    console.error('Error generando PDF:', error);
    alert('Error al generar PDF');
  }
}

function sanitizeFilename(filename: string): string {
  return filename.replace(/[/\\:?*"<>|]/g, '_').substring(0, 200);
}

export async function generateSimplePDF(data: {
  title: string;
  stats: Record<string, string | number>;
  tables: Array<{ name: string; headers: string[]; rows: (string | number)[][] }>;
}): Promise<void> {
  try {
    const pdf = new jsPDF();
    let yPosition = 20;
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();

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
      // Page break si es necesario
      if (yPosition > 250) {
        pdf.addPage();
        yPosition = 20;
      }

      pdf.setFontSize(12);
      pdf.text(table.name, 20, yPosition);
      yPosition += 8;

      // Encabezados
      pdf.setFontSize(10);
      pdf.setFillColor(240, 240, 240);
      const colWidth = (pageWidth - 40) / table.headers.length;
      table.headers.forEach((header, i) => {
        pdf.rect(20 + i * colWidth, yPosition, colWidth, 7, 'F');
        const truncatedHeader = header.length > 20 ? header.substring(0, 17) + '...' : header;
        pdf.text(truncatedHeader, 22 + i * colWidth, yPosition + 5);
      });
      yPosition += 7;

      // Filas con word wrapping
      pdf.setFillColor(255, 255, 255);
      pdf.setTextColor(0, 0, 0);
      table.rows.forEach((row) => {
        if (yPosition > pageHeight - 20) {
          pdf.addPage();
          yPosition = 20;
        }
        const rowHeights = row.map((cell, i) => {
          const cellText = String(cell);
          const lines = pdf.splitTextToSize(cellText, colWidth - 4);
          return lines.length * 5;
        });
        const maxHeight = Math.max(...rowHeights, 7);

        row.forEach((cell, i) => {
          const cellText = String(cell);
          const lines = pdf.splitTextToSize(cellText, colWidth - 4);
          pdf.rect(20 + i * colWidth, yPosition, colWidth, maxHeight);
          pdf.text(lines, 22 + i * colWidth, yPosition + 4);
        });
        yPosition += maxHeight;
      });

      yPosition += 5;
    });

    const sanitized = sanitizeFilename(`${data.title}_${todayStr()}`);
    pdf.save(`${sanitized}.pdf`);
  } catch (error) {
    console.error('Error en generateSimplePDF:', error);
    throw error;
  }
}
