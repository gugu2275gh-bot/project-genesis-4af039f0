import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export interface ExportColumn {
  header: string;
  key: string;
  width?: number;
}

export interface ExportOptions {
  filename: string;
  title?: string;
  columns: ExportColumn[];
  data: Record<string, unknown>[];
  dateRange?: { start: Date; end: Date };
}

export function exportToExcel(options: ExportOptions): void {
  const { filename, columns, data } = options;

  // Prepare data with headers
  const headers = columns.map((col) => col.header);
  const rows = data.map((row) =>
    columns.map((col) => {
      const value = row[col.key];
      if (value instanceof Date) {
        return format(value, 'dd/MM/yyyy', { locale: ptBR });
      }
      if (typeof value === 'number') {
        return value;
      }
      return value ?? '';
    })
  );

  // Create worksheet
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);

  // Set column widths
  ws['!cols'] = columns.map((col) => ({ wch: col.width || 15 }));

  // Create workbook
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Relatório');

  // Generate file
  XLSX.writeFile(wb, `${filename}_${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
}

export function exportToPDF(options: ExportOptions): void {
  const { filename, title, columns, data, dateRange } = options;

  const doc = new jsPDF();

  // Title
  doc.setFontSize(18);
  doc.text(title || 'Relatório', 14, 22);

  // Date range if provided
  if (dateRange) {
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(
      `Período: ${format(dateRange.start, 'dd/MM/yyyy', { locale: ptBR })} - ${format(dateRange.end, 'dd/MM/yyyy', { locale: ptBR })}`,
      14,
      30
    );
  }

  // Generated date
  doc.setFontSize(8);
  doc.text(`Gerado em: ${format(new Date(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}`, 14, 36);

  // Table
  const tableData = data.map((row) =>
    columns.map((col) => {
      const value = row[col.key];
      if (value instanceof Date) {
        return format(value, 'dd/MM/yyyy', { locale: ptBR });
      }
      if (typeof value === 'number') {
        return value.toLocaleString('pt-BR');
      }
      return String(value ?? '');
    })
  );

  autoTable(doc, {
    head: [columns.map((col) => col.header)],
    body: tableData,
    startY: dateRange ? 42 : 32,
    styles: { fontSize: 9, cellPadding: 3 },
    headStyles: {
      fillColor: [59, 130, 246],
      textColor: 255,
      fontStyle: 'bold',
    },
    alternateRowStyles: { fillColor: [245, 247, 250] },
  });

  // Save
  doc.save(`${filename}_${format(new Date(), 'yyyy-MM-dd')}.pdf`);
}
