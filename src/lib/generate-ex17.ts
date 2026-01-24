import jsPDF from "jspdf";

interface EX17Data {
  // Datos del solicitante
  nie?: string;
  fullName: string;
  nationality?: string;
  birthDate?: string;
  passportNumber?: string;
  address?: string;
  city?: string;
  postalCode?: string;
  province?: string;
  phone?: string;
  email?: string;
  
  // Datos del representante (si aplica)
  representativeName?: string;
  representativeNIE?: string;
  
  // Tipo de solicitud
  requestType: string;
  serviceType: string;
  
  // Datos adicionales
  spouseName?: string;
  spouseNIE?: string;
  numberOfDependents?: number;
}

export function generateEX17(data: EX17Data): Blob {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  
  // Header
  doc.setFontSize(10);
  doc.text("MINISTERIO DE INCLUSION, SEGURIDAD SOCIAL Y MIGRACIONES", pageWidth / 2, 15, { align: "center" });
  doc.text("SECRETARÍA DE ESTADO DE MIGRACIONES", pageWidth / 2, 20, { align: "center" });
  
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text("SOLICITUD DE AUTORIZACIÓN DE RESIDENCIA TEMPORAL", pageWidth / 2, 30, { align: "center" });
  doc.text("Y TRABAJO", pageWidth / 2, 36, { align: "center" });
  
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text("(EX-17)", pageWidth / 2, 42, { align: "center" });
  
  // Tipo de solicitud
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text("1. TIPO DE SOLICITUD", 14, 55);
  
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  
  const requestTypes = [
    { label: "Autorización inicial", checked: data.requestType === "INICIAL" },
    { label: "Renovación", checked: data.requestType === "RENOVACION" },
    { label: "Modificación", checked: data.requestType === "MODIFICACION" },
  ];
  
  let y = 62;
  requestTypes.forEach((type) => {
    doc.rect(14, y - 4, 4, 4);
    if (type.checked) {
      doc.text("X", 15, y - 0.5);
    }
    doc.text(type.label, 22, y);
    y += 7;
  });
  
  // Datos del solicitante
  y += 5;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("2. DATOS DEL SOLICITANTE", 14, y);
  
  y += 8;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  
  // Campo NIE
  doc.text("NIE:", 14, y);
  doc.rect(40, y - 4, 60, 6);
  doc.text(data.nie || "", 42, y);
  
  doc.text("Pasaporte:", 110, y);
  doc.rect(135, y - 4, 60, 6);
  doc.text(data.passportNumber || "", 137, y);
  
  y += 10;
  
  // Nombre completo
  doc.text("Nombre completo:", 14, y);
  doc.rect(50, y - 4, 145, 6);
  doc.text(data.fullName || "", 52, y);
  
  y += 10;
  
  // Nacionalidad y Fecha de nacimiento
  doc.text("Nacionalidad:", 14, y);
  doc.rect(45, y - 4, 50, 6);
  doc.text(data.nationality || "", 47, y);
  
  doc.text("Fecha de nacimiento:", 100, y);
  doc.rect(145, y - 4, 50, 6);
  doc.text(data.birthDate || "", 147, y);
  
  y += 10;
  
  // Dirección
  doc.text("Dirección:", 14, y);
  doc.rect(40, y - 4, 155, 6);
  doc.text(data.address || "", 42, y);
  
  y += 10;
  
  // Ciudad, Código Postal, Provincia
  doc.text("Ciudad:", 14, y);
  doc.rect(35, y - 4, 50, 6);
  doc.text(data.city || "", 37, y);
  
  doc.text("C.P.:", 90, y);
  doc.rect(100, y - 4, 30, 6);
  doc.text(data.postalCode || "", 102, y);
  
  doc.text("Provincia:", 135, y);
  doc.rect(160, y - 4, 35, 6);
  doc.text(data.province || "", 162, y);
  
  y += 10;
  
  // Teléfono y Email
  doc.text("Teléfono:", 14, y);
  doc.rect(40, y - 4, 50, 6);
  doc.text(data.phone || "", 42, y);
  
  doc.text("Email:", 95, y);
  doc.rect(115, y - 4, 80, 6);
  doc.text(data.email || "", 117, y);
  
  // Tipo de autorización solicitada
  y += 15;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("3. TIPO DE AUTORIZACIÓN SOLICITADA", 14, y);
  
  y += 8;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(`Tipo de servicio: ${data.serviceType}`, 14, y);
  
  // Datos del cónyuge (si aplica)
  if (data.spouseName) {
    y += 15;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text("4. DATOS DEL CÓNYUGE/PAREJA", 14, y);
    
    y += 8;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    
    doc.text("Nombre:", 14, y);
    doc.rect(40, y - 4, 80, 6);
    doc.text(data.spouseName, 42, y);
    
    doc.text("NIE:", 125, y);
    doc.rect(140, y - 4, 55, 6);
    doc.text(data.spouseNIE || "", 142, y);
  }
  
  // Número de dependientes
  if (data.numberOfDependents && data.numberOfDependents > 0) {
    y += 10;
    doc.text(`Número de dependientes: ${data.numberOfDependents}`, 14, y);
  }
  
  // Firma
  y = 240;
  doc.text("Fecha: _______________", 14, y);
  doc.text("Firma del solicitante:", 120, y);
  
  y += 20;
  doc.line(120, y, 190, y);
  
  // Footer
  doc.setFontSize(8);
  doc.text("Documento generado automáticamente - CB Asesoría", pageWidth / 2, 285, { align: "center" });
  doc.text(`Generado el: ${new Date().toLocaleDateString("es-ES")}`, pageWidth / 2, 290, { align: "center" });
  
  return doc.output("blob");
}

export function downloadEX17(data: EX17Data, filename?: string): void {
  const blob = generateEX17(data);
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename || `EX17_${data.fullName.replace(/\s+/g, "_")}.pdf`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
