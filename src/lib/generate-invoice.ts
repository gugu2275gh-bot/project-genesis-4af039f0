import jsPDF from "jspdf";

export interface InvoiceLineItem {
  date: string; // dd/MM/yyyy
  description: string;
  quantity: number;
  amount: number;
  discountPct?: number;
}

export interface InvoiceData {
  invoiceNumber: string; // e.g. "381"
  year: string; // e.g. "2026"
  issueDate: string; // dd/MM/yyyy
  clientName: string;
  clientDocument?: string;
  clientAddressLines?: string[];
  clientPhone?: string;

  items: InvoiceLineItem[];

  // Totals
  honorarios: number; // base
  pagosDelegados?: number;
  vatBase?: number;
  vatRate?: number; // 0.21
  vatAmount?: number;
  irpf?: number;
  provFondos?: number;
  totalLiquido: number;

  // Payment info
  bankName?: string;
  iban?: string;
  paymentMethod?: string;

  // Company (defaults to CB Asesoria)
  companyName?: string;
  companyNIF?: string;
  companyAddressLines?: string[];
  companyPhone?: string;
}

const BRAND = {
  burgundy: [110, 39, 43] as [number, number, number],
  lightGray: [240, 240, 240] as [number, number, number],
  midGray: [180, 180, 180] as [number, number, number],
  darkText: [40, 40, 40] as [number, number, number],
  mutedText: [110, 110, 110] as [number, number, number],
  headerBg: [235, 230, 231] as [number, number, number],
};

const DEFAULTS = {
  companyName: "BRUCKSCHEN E ASOCIADOS SLU",
  companyNIF: "N.I.F B75866277",
  companyAddress: ["CL MALLORCA 140 2-3", "08036 BARCELONA"],
  companyPhone: "+34 697987817",
  bankName: "BANCO DE SANTANDER",
  iban: "IBAN ES67 0049 1654 9528 1017 3798",
  paymentMethod: "Transferencia Bancaria",
};

const LOPD_TEXT =
  "De acuerdo con lo que establece la Ley Orgánica 3/2018 LOPD-GDD y el Reglamento Europeo 2016/679, RGPD le informamos que los datos personales recogidos en este documento serán incorporados a un fichero informatizado bajo la responsabilidad de CB Asesoria. Puede ejercer sus derechos de acceso, rectificación, supresión, oposición, limitación y portabilidad en Mallorca, 140, 2º 3ª, 08036, Barcelona";

function fmt(n: number): string {
  return n
    .toFixed(2)
    .replace(".", ",")
    .replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

export function generateInvoice(data: InvoiceData): Blob {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const marginX = 12;
  const contentR = pageW - marginX;

  // ---------- HEADER: company info (top-left) ----------
  let y = 14;
  doc.setTextColor(...BRAND.darkText);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text(data.companyName || DEFAULTS.companyName, marginX, y);
  y += 5;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(data.companyNIF || DEFAULTS.companyNIF, marginX, y);
  const addr = data.companyAddressLines || DEFAULTS.companyAddress;
  addr.forEach((line) => {
    y += 4.5;
    doc.text(line, marginX, y);
  });
  y += 4.5;
  doc.text(data.companyPhone || DEFAULTS.companyPhone, marginX, y);

  // Right thin divider line at very top-right (like sample "/")
  doc.setDrawColor(...BRAND.midGray);
  doc.setLineWidth(0.2);
  doc.line(contentR - 0.5, 12, contentR - 0.5, 34);

  // ---------- Invoice number / year / date row ----------
  const rowY = 42;
  const boxH = 12;

  // Number
  doc.setDrawColor(...BRAND.darkText);
  doc.setLineWidth(0.3);
  doc.rect(marginX, rowY, 22, boxH);
  doc.rect(marginX + 22, rowY, 22, boxH);
  doc.rect(marginX + 44, rowY, 40, boxH);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(...BRAND.darkText);
  doc.text(data.invoiceNumber, marginX + 11, rowY + 8, { align: "center" });
  doc.setFontSize(11);
  doc.text(data.year, marginX + 33, rowY + 8, { align: "center" });

  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...BRAND.mutedText);
  doc.text("FECHA", marginX + 64, rowY - 1.5, { align: "center" });
  doc.setFontSize(11);
  doc.setTextColor(...BRAND.darkText);
  doc.setFont("helvetica", "bold");
  doc.text(data.issueDate, marginX + 64, rowY + 8, { align: "center" });

  // Client block (right side)
  const clientX = marginX + 90;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text(data.clientName.toUpperCase(), clientX, rowY + 2);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  let cy = rowY + 7;
  if (data.clientDocument) {
    doc.text(data.clientDocument, clientX, cy);
    cy += 4.5;
  }
  (data.clientAddressLines || []).forEach((line) => {
    doc.text(line, clientX, cy);
    cy += 4.5;
  });
  if (data.clientPhone) {
    doc.text(data.clientPhone, clientX, cy);
  }

  // ---------- Items table ----------
  const tableY = 68;
  const tableW = contentR - marginX;
  // Columns: FECHA(22) | CONCEPTO(flex) | UNID.(15) | (price)(28) | %DTO(18) | ABONOS(24)
  const colX = {
    fecha: marginX,
    concepto: marginX + 22,
    unid: marginX + tableW - 85,
    price: marginX + tableW - 70,
    dto: marginX + tableW - 42,
    abonos: marginX + tableW - 24,
  };

  // Header row
  doc.setFillColor(...BRAND.headerBg);
  doc.rect(marginX, tableY, tableW, 7, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(...BRAND.darkText);
  doc.text("FECHA", colX.fecha + 2, tableY + 4.8);
  doc.text("CONCEPTO", colX.concepto + 2, tableY + 4.8);
  doc.text("UNID.", colX.unid + 6, tableY + 4.8, { align: "center" });
  doc.text("% DTO", colX.dto + 8, tableY + 4.8, { align: "center" });
  doc.text("ABONOS", colX.abonos + 22, tableY + 4.8, { align: "right" });

  // Rows
  let ry = tableY + 7;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  const rowMinH = 8;
  const itemsToRender = [...data.items];
  // Pad to at least 8 rows to mimic layout
  while (itemsToRender.length < 8) {
    itemsToRender.push({ date: "", description: "", quantity: 0, amount: 0 });
  }

  itemsToRender.forEach((item) => {
    const descLines = item.description
      ? doc.splitTextToSize(item.description, colX.unid - colX.concepto - 4)
      : [""];
    const rowH = Math.max(rowMinH, descLines.length * 4 + 2);
    // date
    if (item.date) doc.text(item.date, colX.fecha + 2, ry + 5);
    // description
    doc.text(descLines, colX.concepto + 2, ry + 5);
    // unid
    if (item.quantity) doc.text(String(item.quantity), colX.unid + 6, ry + 5, { align: "center" });
    // price (unit)
    if (item.amount) doc.text(fmt(item.amount), colX.price + 22, ry + 5, { align: "right" });
    // dto
    if (item.discountPct) doc.text(`${item.discountPct}%`, colX.dto + 8, ry + 5, { align: "center" });
    // abonos (total line)
    const lineTotal = item.amount * (item.quantity || 1) * (1 - (item.discountPct || 0) / 100);
    doc.text(fmt(lineTotal || 0), colX.abonos + 22, ry + 5, { align: "right" });
    ry += rowH;
  });

  // Table border
  doc.setDrawColor(...BRAND.midGray);
  doc.setLineWidth(0.2);
  doc.rect(marginX, tableY, tableW, ry - tableY);
  // Column separators
  [colX.concepto, colX.unid, colX.dto, colX.abonos].forEach((x) => {
    doc.line(x, tableY, x, ry);
  });

  // ---------- IVA row ----------
  let iy = ry + 8;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(...BRAND.darkText);
  doc.text("I.V.A.: Base", marginX, iy);
  doc.text("%", marginX + 32, iy);
  doc.text("I.V.A.: Base", marginX + 70, iy);
  doc.text("%", marginX + 102, iy);
  doc.text("% Rec. E", marginX + 140, iy);
  doc.text("%", marginX + 168, iy);

  iy += 5;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  if (data.vatBase) {
    doc.text(fmt(data.vatBase), marginX + 2, iy);
    doc.text(String(((data.vatRate ?? 0.21) * 100).toFixed(0)), marginX + 32, iy);
  }

  // divider
  iy += 4;
  doc.setDrawColor(...BRAND.midGray);
  doc.line(marginX, iy, contentR, iy);

  // ---------- Totals row ----------
  iy += 5;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  const totalsHeaders = ["HONORARIOS", "PAGOS DELEGADOS", "I.V.A + REC. EQ", "I.R.P.F", "PROV. FONDOS"];
  const totalsValues = [
    data.honorarios,
    data.pagosDelegados ?? 0,
    data.vatAmount ?? 0,
    data.irpf ?? 0,
    data.provFondos ?? 0,
  ];
  const colW = (contentR - marginX) / 5;
  totalsHeaders.forEach((h, i) => {
    doc.text(h, marginX + i * colW + 2, iy);
  });
  iy += 6;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  totalsValues.forEach((v, i) => {
    doc.text(fmt(v), marginX + i * colW + colW / 2, iy, { align: "center" });
  });

  iy += 4;
  doc.setDrawColor(...BRAND.midGray);
  doc.line(marginX, iy, contentR, iy);

  // ---------- Banking / payment section ----------
  iy += 5;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.text("DOMICILIO DE COBRO", marginX, iy);
  doc.text("IBAN", marginX + 100, iy);
  iy += 5;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(data.bankName || DEFAULTS.bankName, marginX, iy);
  doc.text(data.iban || DEFAULTS.iban, marginX + 100, iy);
  iy += 4;
  doc.line(marginX, iy, contentR, iy);

  iy += 5;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.text("FORMA DE PAGO", marginX, iy);
  doc.text("IMPORTE LÍQUIDO", contentR - 2, iy, { align: "right" });
  iy += 6;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.text(data.paymentMethod || DEFAULTS.paymentMethod, marginX, iy);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text(`€${fmt(data.totalLiquido)}`, contentR - 2, iy, { align: "right" });

  // ---------- LOPD footer ----------
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(...BRAND.mutedText);
  const lopdLines = doc.splitTextToSize(LOPD_TEXT, contentR - marginX);
  doc.text(lopdLines, marginX, 280);

  return doc.output("blob");
}

export function downloadInvoice(data: InvoiceData, filename?: string): void {
  const blob = generateInvoice(data);
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download =
    filename ||
    `${data.invoiceNumber}_-_${data.clientName.replace(/\s+/g, "_").toUpperCase()}.pdf`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
