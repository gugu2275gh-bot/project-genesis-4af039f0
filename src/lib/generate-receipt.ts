import jsPDF from "jspdf";

interface ReceiptData {
  receiptNumber: string;
  clientName: string;
  clientDocument?: string;
  amount: number;
  currency: string;
  paymentMethod: string;
  paymentDate: string;
  transactionId?: string;
  description: string;
  companyName?: string;
  companyAddress?: string;
  companyNIF?: string;
}

// Innovatia / Bruckschen brand
const BRAND = {
  burgundy: [110, 39, 43] as [number, number, number],
  lightGray: [240, 240, 240] as [number, number, number],
  midGray: [180, 180, 180] as [number, number, number],
  darkText: [40, 40, 40] as [number, number, number],
  mutedText: [110, 110, 110] as [number, number, number],
};

const COMPANY_DEFAULTS = {
  name: "Bruckschen e Asociados SL",
  nif: "NIF B75866277",
  addressLine1: "CALLE MALLORCA, 140, 2º 3ª",
  addressLine2: "BARCELONA, CATALUNYA 08036",
  phone: "+34 697 98 78 17",
};

function formatEUR(value: number, currency = "EUR"): string {
  const symbol = currency === "EUR" ? "€" : currency;
  const formatted = value
    .toFixed(2)
    .replace(".", ",")
    .replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${formatted} ${symbol}`;
}

function drawLogo(doc: jsPDF, x: number, y: number, size: number) {
  // Burgundy square with "CB" monogram
  doc.setFillColor(...BRAND.burgundy);
  doc.roundedRect(x, y, size, size, 2, 2, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(size * 0.55);
  doc.text("CB", x + size / 2, y + size / 2 + size * 0.18, { align: "center" });
}

export function generateReceipt(data: ReceiptData): Blob {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const marginX = 20;
  const contentRight = pageWidth - marginX;

  // ---------- HEADER: logo (left) + "RECIBO" (right) ----------
  drawLogo(doc, marginX, 18, 24);

  doc.setTextColor(...BRAND.mutedText);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(30);
  doc.text("RECIBO", contentRight, 30, { align: "right" });

  // ---------- Company info ----------
  let y = 58;
  doc.setTextColor(...BRAND.darkText);
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text(`De: ${data.companyName || COMPANY_DEFAULTS.name}`, marginX, y);

  y += 7;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(data.companyNIF || COMPANY_DEFAULTS.nif, marginX, y);

  y += 6;
  const addressLines = (data.companyAddress || `${COMPANY_DEFAULTS.addressLine1}\n${COMPANY_DEFAULTS.addressLine2}\n${COMPANY_DEFAULTS.phone}`).split("\n");
  addressLines.forEach((line) => {
    doc.text(line, marginX, y);
    y += 6;
  });

  // ---------- Facturar a ----------
  y += 6;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text(`Facturar a: ${data.clientName.toUpperCase()}`, marginX, y);
  if (data.clientDocument) {
    y += 6;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text(`Documento: ${data.clientDocument}`, marginX, y);
  }

  // ---------- Receipt number (subtle) ----------
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...BRAND.mutedText);
  doc.text(`Nº ${data.receiptNumber}`, contentRight, 58, { align: "right" });

  // ---------- Items table ----------
  y += 14;
  const tableX = marginX;
  const tableW = contentRight - marginX;
  const rowH = 11;

  // Header row
  doc.setFillColor(...BRAND.lightGray);
  doc.rect(tableX, y, tableW, rowH, "F");
  doc.setTextColor(...BRAND.darkText);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("Artículos", tableX + 4, y + rowH / 2 + 1.5);
  doc.text("Cantidad", tableX + tableW - 40, y + rowH / 2 + 1.5, { align: "right" });
  doc.text("Impuesto", tableX + tableW - 4, y + rowH / 2 + 1.5, { align: "right" });

  y += rowH;
  // divider
  doc.setDrawColor(...BRAND.darkText);
  doc.setLineWidth(0.4);
  doc.line(tableX, y, tableX + tableW, y);

  // Item row
  const itemY = y + rowH / 2 + 1.5;
  doc.setFont("helvetica", "normal");
  const descLines = doc.splitTextToSize(data.description, tableW - 90);
  doc.text(descLines, tableX + 4, itemY);
  doc.text("1", tableX + tableW - 40, itemY, { align: "right" });
  doc.text("—", tableX + tableW - 4, itemY, { align: "right" });

  y += rowH;
  doc.setDrawColor(...BRAND.midGray);
  doc.setLineWidth(0.2);
  doc.line(tableX, y, tableX + tableW, y);

  // ---------- Totals ----------
  y += 8;
  const totalsLabelX = tableX + tableW - 60;
  const totalsValueX = tableX + tableW - 4;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text("Subtotal", totalsLabelX, y);
  doc.text(formatEUR(data.amount, data.currency), totalsValueX, y, { align: "right" });

  y += 6;
  // Total highlight row
  doc.setFillColor(...BRAND.lightGray);
  doc.rect(totalsLabelX - 6, y - 2, tableW - (totalsLabelX - tableX) + 6, 10, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("Importe total", totalsLabelX, y + 4);
  doc.text(formatEUR(data.amount, data.currency), totalsValueX, y + 4, { align: "right" });

  y += 8;
  doc.setDrawColor(...BRAND.darkText);
  doc.setLineWidth(0.4);
  doc.line(totalsLabelX - 6, y + 2, tableX + tableW, y + 2);

  // ---------- Payment method table ----------
  y += 18;
  doc.setFillColor(...BRAND.lightGray);
  doc.rect(tableX, y, tableW, rowH, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...BRAND.darkText);
  doc.text("Forma de pago", tableX + 4, y + rowH / 2 + 1.5);
  doc.text("Fecha", tableX + tableW / 2, y + rowH / 2 + 1.5, { align: "center" });
  doc.text("Monto", tableX + tableW - 4, y + rowH / 2 + 1.5, { align: "right" });

  y += rowH;
  doc.setDrawColor(...BRAND.darkText);
  doc.setLineWidth(0.4);
  doc.line(tableX, y, tableX + tableW, y);

  const payY = y + rowH / 2 + 1.5;
  doc.setFont("helvetica", "normal");
  doc.text(data.paymentMethod, tableX + 4, payY);
  doc.text(data.paymentDate, tableX + tableW / 2, payY, { align: "center" });
  doc.text(formatEUR(data.amount, data.currency), tableX + tableW - 4, payY, { align: "right" });

  y += rowH;
  doc.setDrawColor(...BRAND.midGray);
  doc.setLineWidth(0.2);
  doc.line(tableX, y, tableX + tableW, y);

  if (data.transactionId) {
    y += 8;
    doc.setFontSize(8);
    doc.setTextColor(...BRAND.mutedText);
    doc.text(`ID Transacción: ${data.transactionId}`, tableX, y);
  }

  // ---------- Footer ----------
  const footerY = 285;
  doc.setDrawColor(...BRAND.midGray);
  doc.setLineWidth(0.2);
  doc.line(marginX, footerY - 6, contentRight, footerY - 6);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...BRAND.mutedText);
  doc.text("1", marginX, footerY);
  doc.text(
    `Documento generado el ${new Date().toLocaleDateString("es-ES")}`,
    contentRight,
    footerY,
    { align: "right" }
  );

  return doc.output("blob");
}

export function downloadReceipt(data: ReceiptData, filename?: string): void {
  const blob = generateReceipt(data);
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename || `Recibo_${data.receiptNumber}_${data.clientName.replace(/\s+/g, "_")}.pdf`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function generateReceiptNumber(): string {
  const year = new Date().getFullYear();
  const timestamp = Date.now().toString().slice(-6);
  return `REC-${year}-${timestamp}`;
}
