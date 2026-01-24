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

export function generateReceipt(data: ReceiptData): Blob {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  
  // Header with company info
  doc.setFillColor(42, 87, 141);
  doc.rect(0, 0, pageWidth, 40, "F");
  
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.text(data.companyName || "CB ASESORÍA", pageWidth / 2, 15, { align: "center" });
  
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text(data.companyAddress || "Asesoría Integral de Extranjería", pageWidth / 2, 23, { align: "center" });
  doc.text(data.companyNIF || "NIF: B12345678", pageWidth / 2, 30, { align: "center" });
  
  // Title
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(22);
  doc.setFont("helvetica", "bold");
  doc.text("RECIBO DE PAGO", pageWidth / 2, 55, { align: "center" });
  
  // Receipt number
  doc.setFontSize(12);
  doc.setFont("helvetica", "normal");
  doc.text(`Nº: ${data.receiptNumber}`, pageWidth - 14, 65, { align: "right" });
  
  // Client info box
  doc.setDrawColor(200, 200, 200);
  doc.setFillColor(248, 249, 250);
  doc.roundedRect(14, 75, pageWidth - 28, 35, 3, 3, "FD");
  
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.text("DATOS DEL CLIENTE", 20, 85);
  
  doc.setFont("helvetica", "normal");
  doc.text(`Nombre: ${data.clientName}`, 20, 95);
  if (data.clientDocument) {
    doc.text(`Documento: ${data.clientDocument}`, 20, 103);
  }
  
  // Payment details
  let y = 125;
  
  doc.setFillColor(248, 249, 250);
  doc.roundedRect(14, y, pageWidth - 28, 70, 3, 3, "FD");
  
  y += 10;
  doc.setFont("helvetica", "bold");
  doc.text("DETALLES DEL PAGO", 20, y);
  
  y += 12;
  doc.setFont("helvetica", "normal");
  
  // Description
  doc.text("Concepto:", 20, y);
  doc.text(data.description, 60, y);
  
  y += 10;
  doc.text("Fecha de pago:", 20, y);
  doc.text(data.paymentDate, 60, y);
  
  y += 10;
  doc.text("Método de pago:", 20, y);
  doc.text(data.paymentMethod, 60, y);
  
  if (data.transactionId) {
    y += 10;
    doc.text("ID Transacción:", 20, y);
    doc.text(data.transactionId, 60, y);
  }
  
  // Amount box
  y += 20;
  doc.setFillColor(42, 87, 141);
  doc.roundedRect(pageWidth - 90, y - 15, 76, 25, 3, 3, "F");
  
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(9);
  doc.text("IMPORTE RECIBIDO", pageWidth - 52, y - 8, { align: "center" });
  
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text(`${data.amount.toFixed(2)} ${data.currency}`, pageWidth - 52, y + 2, { align: "center" });
  
  // Note
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(9);
  doc.setFont("helvetica", "italic");
  y = 220;
  doc.text("Este recibo es un comprobante de pago. No tiene validez como factura fiscal.", pageWidth / 2, y, { align: "center" });
  doc.text("Para solicitar factura, contacte con nuestro departamento financiero.", pageWidth / 2, y + 6, { align: "center" });
  
  // Signature area
  y = 245;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text("Sello y firma:", 14, y);
  doc.line(14, y + 25, 80, y + 25);
  
  doc.text("Fecha:", pageWidth - 60, y);
  doc.text(new Date().toLocaleDateString("es-ES"), pageWidth - 60, y + 10);
  
  // Footer
  doc.setFontSize(8);
  doc.setTextColor(128, 128, 128);
  doc.text("Documento generado automáticamente por CB Asesoría", pageWidth / 2, 285, { align: "center" });
  doc.text(`Generado el: ${new Date().toLocaleString("es-ES")}`, pageWidth / 2, 290, { align: "center" });
  
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
