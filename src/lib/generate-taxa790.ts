import jsPDF from "jspdf";

interface Taxa790Data {
  // Datos del contribuyente
  nie?: string;
  fullName: string;
  address?: string;
  city?: string;
  postalCode?: string;
  province?: string;
  
  // Tipo de tasa
  taxCode: "790" | "012";
  taxAmount: number;
  concept: string;
  
  // Expediente
  expedientNumber?: string;
}

const taxDescriptions: Record<string, string> = {
  "790_052": "Autorización inicial de residencia temporal",
  "790_062": "Renovación de autorización de residencia",
  "790_012": "Autorización de trabajo",
  "012": "Expedición de Tarjeta de Identidad de Extranjero (TIE)",
};

export function generateTaxa790(data: Taxa790Data): Blob {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  
  // Header
  doc.setFillColor(0, 51, 102);
  doc.rect(0, 0, pageWidth, 25, "F");
  
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.text("AGENCIA TRIBUTARIA", pageWidth / 2, 10, { align: "center" });
  doc.setFontSize(10);
  doc.text("MODELO " + data.taxCode, pageWidth / 2, 18, { align: "center" });
  
  // Reset color
  doc.setTextColor(0, 0, 0);
  
  // Title
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text("TASA POR LA TRAMITACIÓN DE AUTORIZACIONES", pageWidth / 2, 35, { align: "center" });
  doc.text("ADMINISTRATIVAS Y DOCUMENTOS DE EXTRANJERÍA", pageWidth / 2, 41, { align: "center" });
  
  // Datos del contribuyente
  let y = 55;
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.text("DATOS DEL CONTRIBUYENTE", 14, y);
  
  doc.setDrawColor(0, 51, 102);
  doc.rect(14, y + 2, pageWidth - 28, 50);
  
  y += 12;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  
  doc.text("NIE/NIF:", 18, y);
  doc.text(data.nie || "________________", 45, y);
  
  y += 8;
  doc.text("Apellidos y nombre:", 18, y);
  doc.text(data.fullName, 55, y);
  
  y += 8;
  doc.text("Domicilio:", 18, y);
  doc.text(data.address || "", 45, y);
  
  y += 8;
  doc.text("Municipio:", 18, y);
  doc.text(data.city || "", 45, y);
  
  doc.text("C.P.:", 100, y);
  doc.text(data.postalCode || "", 115, y);
  
  doc.text("Provincia:", 140, y);
  doc.text(data.province || "", 165, y);
  
  // Concepto
  y += 25;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("CONCEPTO DE LA TASA", 14, y);
  
  doc.rect(14, y + 2, pageWidth - 28, 25);
  
  y += 12;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(`Código: ${data.taxCode}`, 18, y);
  
  y += 8;
  doc.text(`Concepto: ${data.concept}`, 18, y);
  
  // Importe
  y += 20;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("IMPORTE A INGRESAR", 14, y);
  
  doc.setFillColor(240, 240, 240);
  doc.rect(14, y + 2, pageWidth - 28, 20, "FD");
  
  y += 15;
  doc.setFontSize(14);
  doc.text(`${data.taxAmount.toFixed(2)} €`, pageWidth / 2, y, { align: "center" });
  
  // Código de barras simulado
  y += 30;
  doc.setFillColor(0, 0, 0);
  
  // Simular código de barras con rectángulos
  const barcodeStart = 40;
  const barcodeWidth = 130;
  const bars = 50;
  
  for (let i = 0; i < bars; i++) {
    const barWidth = Math.random() > 0.5 ? 2 : 1;
    const x = barcodeStart + (i * barcodeWidth / bars);
    doc.rect(x, y, barWidth, 20, "F");
  }
  
  y += 25;
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  const referenceNumber = `${data.taxCode}${Date.now().toString().slice(-10)}`;
  doc.text(`Referencia: ${referenceNumber}`, pageWidth / 2, y, { align: "center" });
  
  // Expediente
  if (data.expedientNumber) {
    y += 10;
    doc.text(`Número de expediente: ${data.expedientNumber}`, pageWidth / 2, y, { align: "center" });
  }
  
  // Instrucciones de pago
  y += 20;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("FORMA DE PAGO:", 14, y);
  
  y += 6;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  const instructions = [
    "• En cualquier entidad bancaria colaboradora",
    "• A través de la Sede Electrónica de la Agencia Tributaria",
    "• En oficinas de Correos mediante giro postal",
  ];
  
  instructions.forEach((instruction) => {
    doc.text(instruction, 18, y);
    y += 5;
  });
  
  // Footer
  doc.setFontSize(7);
  doc.text("Este documento es válido para el pago únicamente durante 30 días desde su generación.", pageWidth / 2, 270, { align: "center" });
  doc.text(`Documento generado el: ${new Date().toLocaleDateString("es-ES")} - CB Asesoría`, pageWidth / 2, 275, { align: "center" });
  
  // Línea de corte
  doc.setLineDashPattern([3, 3], 0);
  doc.line(14, 250, pageWidth - 14, 250);
  doc.setLineDashPattern([], 0);
  
  doc.setFontSize(8);
  doc.text("EJEMPLAR PARA EL INTERESADO", 14, 255);
  
  return doc.output("blob");
}

export function downloadTaxa790(data: Taxa790Data, filename?: string): void {
  const blob = generateTaxa790(data);
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename || `Taxa${data.taxCode}_${data.fullName.replace(/\s+/g, "_")}.pdf`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
