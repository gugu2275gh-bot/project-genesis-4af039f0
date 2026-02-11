import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  AlignmentType,
  TabStopPosition,
  TabStopType,
  ImageRun,
  Footer,
  Header,
} from 'docx';
import { saveAs } from 'file-saver';
import logoImage from '@/assets/logo-cb-asesoria.png';

export interface ContractData {
  template: string;
  clientName: string;
  documentNumber: string;
  contractNumber: string;
  date?: Date;
}

const MONTHS_ES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'
];

function formatDateSpanish(date: Date): string {
  const day = date.getDate();
  const month = MONTHS_ES[date.getMonth()];
  const year = date.getFullYear();
  return `${day} de ${month} de ${year}`;
}

function heading(text: string): Paragraph {
  return new Paragraph({
    children: [new TextRun({ text, bold: true, size: 24, font: 'Calibri' })],
    spacing: { before: 300, after: 150 },
  });
}

function para(text: string, opts?: { bold?: boolean; italic?: boolean; size?: number }): Paragraph {
  return new Paragraph({
    children: [new TextRun({ text, bold: opts?.bold, italics: opts?.italic, size: opts?.size || 22, font: 'Calibri' })],
    spacing: { after: 100 },
    alignment: AlignmentType.JUSTIFIED,
  });
}

function bullet(text: string): Paragraph {
  return new Paragraph({
    children: [new TextRun({ text, size: 22, font: 'Calibri' })],
    bullet: { level: 0 },
    spacing: { after: 60 },
    alignment: AlignmentType.JUSTIFIED,
  });
}

function numbered(num: string, text: string): Paragraph {
  return new Paragraph({
    children: [new TextRun({ text: `${num}. ${text}`, size: 22, font: 'Calibri' })],
    spacing: { after: 60 },
    alignment: AlignmentType.JUSTIFIED,
  });
}

function emptyLine(): Paragraph {
  return new Paragraph({ children: [new TextRun({ text: '', size: 22 })], spacing: { after: 100 } });
}

function footerParagraph(): Footer {
  return new Footer({
    children: [
      new Paragraph({
        children: [new TextRun({ text: 'Sus trámites en buenas manos.', italics: true, size: 18, font: 'Calibri', color: '888888' })],
        alignment: AlignmentType.CENTER,
      }),
    ],
  });
}

function contractHeader(contractNumber: string, dateStr: string): Paragraph[] {
  return [
    new Paragraph({
      children: [new TextRun({ text: `N.º CONTRATO: ${contractNumber}`, bold: true, size: 24, font: 'Calibri' })],
      spacing: { after: 100 },
    }),
    new Paragraph({
      children: [new TextRun({ text: `Barcelona, ${dateStr}.`, size: 22, font: 'Calibri' })],
      spacing: { after: 200 },
    }),
  ];
}

function contractParties(clientName: string, documentNumber: string): Paragraph[] {
  return [
    heading('CONTRATO DE PRESTACIÓN DE SERVICIOS JURÍDICOS ENTRE:'),
    heading('PRESTADOR DEL SERVICIO'),
    para('CB ASESORÍA (Bruckschen e Asociados S.L.)'),
    para('NIF: B75866277'),
    para('Domicilio social: Calle Mallorca 140, 2º3ª, 08036 – Barcelona'),
    para('(en adelante, "CB ASESORÍA" o "EL PRESTADOR"), quien actúa a través de su equipo profesional multidisciplinar.'),
    emptyLine(),
    heading('Y:'),
    heading('CLIENTE:'),
    para(clientName.toUpperCase(), { bold: true }),
    para(`DOCUMENTO (PASAPORTE / NIE / DNI / NIF): ${documentNumber}`),
    para('(en adelante, "EL CLIENTE")'),
    emptyLine(),
    heading('CLÁUSULAS'),
  ];
}

function commonClause_Tercera(): Paragraph[] {
  return [
    heading('TERCERA. Obligaciones del Cliente'),
    para('El CLIENTE se compromete a:'),
    numbered('1', 'Proporcionar a CB ASESORÍA información veraz, completa y actualizada.'),
    numbered('2', 'Entregar en plazo la documentación exigida para el trámite, para que el trámite sea protocolado en la plataforma correspondiente.'),
    numbered('3', 'Abonar los honorarios conforme a lo estipulado, para que el trámite sea protocolado en la plataforma correspondiente.'),
    numbered('4', 'Comparecer a las citas necesarias para la tramitación del servicio contratado, previamente programadas por CB ASESORÍA ante organismos oficiales (administración pública, notaría, registros civiles, etc.).'),
    para('La incomparecencia injustificada podrá dar lugar al cobro de honorarios adicionales por reprogramación o nueva gestión.'),
  ];
}

function commonClause_Cuarta(): Paragraph[] {
  return [
    heading('CUARTA. Obligaciones de CB ASESORÍA (EL PRESTADOR)'),
    para('CB ASESORÍA se compromete a:'),
    numbered('1', 'Prestar los servicios contratados con la debida diligencia profesional y conforme a la legislación vigente.'),
    numbered('2', 'Ejecutar los servicios a través de su equipo técnico y jurídico, no vinculado a una persona específica.'),
    numbered('3', 'Informar oportunamente al CLIENTE sobre el estado del expediente y cualquier incidencia relevante.'),
    numbered('4', 'Guardar confidencialidad sobre toda la información recibida, incluso tras la finalización de la relación contractual.'),
    numbered('5', 'Utilizar los datos personales únicamente para los fines descritos en este contrato.'),
    numbered('6', 'Facilitar al CLIENTE, si lo solicita, copia de los documentos generados.'),
  ];
}

function commonClause_Quinta(): Paragraph[] {
  return [
    heading('QUINTA. Inicio del Procedimiento'),
    para('CB ASESORÍA dispondrá de un plazo máximo de 48 horas hábiles tras la confirmación del pago para contactar con EL CLIENTE e iniciar la gestión.'),
    para('El cómputo excluye fines de semana y días festivos.'),
    para('En caso de no contacto en plazo, el CLIENTE podrá comunicarse mediante los canales oficiales para información.'),
    para('Condición para protocolar el trámite: solo se presentará en la plataforma correspondiente, cuando se haya recibido el pago completo de los honorarios y toda la documentación requerida.'),
  ];
}

function commonClause_Sexta(): Paragraph[] {
  return [
    heading('SEXTA. Protección de Datos'),
    para('Los datos personales del CLIENTE serán tratados conforme al Reglamento (UE) 2016/679 (RGPD) y la Ley Orgánica 3/2018 (LOPDGDD).'),
    para('Finalidades del tratamiento:', { bold: true }),
    bullet('Ejecución del servicio contratado.'),
    bullet('Gestión administrativa y contable.'),
    bullet('Envío de información relevante o relacionada.'),
    para('Categorías de datos tratados: Datos de identificación, contacto, bancarios y documentales.'),
    para('Derechos del cliente: Acceso, rectificación, supresión, oposición, limitación y portabilidad.'),
    para('Contacto: Mallorca 140, 2º 3ª – 08036 Barcelona o info@cbasesoria.com'),
  ];
}

function commonClause_Septima(): Paragraph[] {
  return [
    heading('SÉPTIMA. Uso de Imágenes'),
    para('CB ASESORÍA podrá utilizar imágenes o fotografías del CLIENTE exclusivamente para su publicación en redes sociales o sitio web, si el CLIENTE consiente expresamente.'),
    para('Se garantiza el cumplimiento normativo y la confidencialidad. La negativa del CLIENTE no afectará la prestación del servicio.'),
    para('Finalidades: Recogida, uso y publicación de imágenes y fotografías.'),
    para('Consentimiento publicación entidad, web y/o redes sociales.  ☐ Sí  ☐ No'),
    para('Categoría de Datos: Imágenes y fotografías'),
    emptyLine(),
    para('Las imágenes y/o fotografías recogidas las actividades de la Entidad, serán objeto de tratamiento automatizado reconocidos por ley y pasarán a formar parte de un fichero de titularidad de Bruckschen e Asociados S.L.'),
    para('que estas imágenes y fotografías están consideradas como tratamiento de datos y por lo tanto la aplicación de la Normativa actual vigente es exhaustiva en términos de confidencialidad.'),
    para('Por tanto:'),
    para('está prohibida su utilización, difusión o comercialización mediante el uso de cualquier plataforma electrónica, páginas web, así como redes sociales, Facebook, Instagram, Twitter, YouTube, Pinterest, LinkedIn, etc. y otras actividades en Internet si no existe el consentimiento del usuario.'),
    para('estas imágenes y fotografías sólo se pueden utilizar para la finalidad concretada por las partes que será la de su utilización para su publicación en la entidad, web y/o redes sociales de Bruckschen e Asociados S.L'),
    para('De acuerdo con lo establecido en la Ley Orgánica 1/1982, de 5 de mayo, de protección civil del derecho al honor, a la intimidad personal y familiar y a la propia imagen, y siempre que no nos notifique lo contrario, con la firma del actual contrato y marcado positivo del chekbox, usted acepta las condiciones informadas por Bruckschen e Asociados S.L en relación con las imágenes y fotografías realizados.'),
    para('Puede ejercer sus derechos de acceso, rectificación, supresión y portabilidad de sus datos y los de limitación y oposición del tratamiento, mediante un escrito a nuestra dirección: Mallorca, 140, 2º 3ª, 08036, Barcelona. Con la firma del actual documento y marcado positivo del chekbox, usted da su consentimiento explícito para el tratamiento, uso y recogida de sus imágenes personales según la finalidad informada.'),
    para('En virtud de lo establecido en la Ley Orgánica 3/2018 y Reglamento Europeo 2016/679, de Protección de Datos de carácter personal, le informamos que sus datos van a forman parte de un fichero titularidad de Bruckschen e Asociados S.L. La información registrada se utilizará para informarle por cualquier medio electrónico de nuestras novedades. Puede ejercer los derechos de acceso, rectificación, supresión y portabilidad de sus datos y los de limitación y oposición del tratamiento en Mallorca, 140, 2º 3ª, 08036, Barcelona o mediante un correo dirigido a info@cbasesoria.com.'),
  ];
}

function commonClause_Octava(): Paragraph[] {
  return [
    heading('OCTAVA. Cesión de Documentación'),
    para('EL CLIENTE autoriza a CB ASESORÍA a ceder documentación necesaria (DNI, justificantes, etc.) a terceros profesionales implicados, únicamente para los fines del procedimiento contratado.'),
  ];
}

function commonClause_Novena(): Paragraph[] {
  return [
    heading('NOVENA. Exención de Garantía'),
    para('CB ASESORÍA no garantiza el éxito o resultado favorable del procedimiento, el cual depende exclusivamente de las autoridades competentes.'),
  ];
}

function commonClause_Devolucion(): Paragraph[] {
  return [
    para('10.1. Iniciación del Servicio:', { bold: true }),
    para('Se entenderá como iniciado el servicio una vez que el asesor responsable por el trámite haya establecido contacto directo con EL CLIENTE a través de medios electrónicos, telefónicos o presenciales. A partir de ese momento, no será posible la devolución total o parcial del importe abonado. Si el procedimiento aún no se ha completado o si se paraliza por causas externas, el cliente tendrá 12 meses para hacer uso del servicio contratado.'),
    emptyLine(),
    para('10.2. Ausencia de Devoluciones por Servicios de Terceros:', { bold: true }),
    para('No se aceptarán devoluciones por conceptos ya ejecutados o pagados a terceros, entre ellos:'),
    bullet('Tasas de órganos públicos (Ministerio de Justicia, exámenes DELE/CCSE, tasas administrativas).'),
    bullet('Traducciones juradas, apostillas, legalizaciones, o cualquier otro servicio de gestoría, notaría o certificación externa.'),
    bullet('Matrículas o inscripciones en cursos o exámenes.'),
    bullet('Honorarios de terceros profesionales (procuradores, traductores, peritos, etc.).'),
    emptyLine(),
    para('10.3. Exclusiones de la Prestación del Servicio:', { bold: true }),
    para('El servicio contratado no incluye:'),
    bullet('La interposición de recursos administrativos o contencioso, salvo pacto expreso por escrito y pago adicional.'),
    bullet('La búsqueda, solicitud o tramitación de documentos personales en nombre del CLIENTE (por ejemplo: certificados de nacimiento, antecedentes penales, certificado de seguridad social, empadronamientos, etc.).'),
    bullet('Es responsabilidad exclusiva del CLIENTE proporcionar la documentación necesaria en los plazos indicados.'),
    emptyLine(),
    para('10.4. Motivos Justificables de Devolución:', { bold: true }),
    para('Únicamente se aceptarán devoluciones si concurre alguna de las siguientes circunstancias:'),
    numbered('1', 'Cambio de legislación que genere imposibilidad legal sobrevenida no imputable al CLIENTE.'),
    numbered('2', 'Incumplimiento grave, acreditado y documentado, por parte de CB ASESORÍA.'),
    para('Aún que concurra alguna de las circunstancias supra mencionadas solo se aceptará y procederá con una solicitud de cancelación una vez agotadas todas las instancias y recursos judiciales o administrativos que pudieran corresponder al CLIENTE en relación con el servicio prestado. Es decir, la devolución procederá únicamente cuando se haya hecho uso de todos los medios legales disponibles.'),
    emptyLine(),
    para('10.5. Procedimiento de Solicitud de Reembolso:', { bold: true }),
    para('Toda solicitud de reembolso deberá realizarse por escrito, de forma motivada, acompañada de documentación justificativa, y remitida por correo electrónico o entregada físicamente en el domicilio de CB ASESORÍA.'),
    para('El plazo máximo para la resolución de la solicitud será de 15 días hábiles a partir de su recepción. En caso de resolución favorable, el reembolso se realizará por transferencia bancaria o en efectivo.'),
    emptyLine(),
    para('10.6. Renuncia del Cliente:', { bold: true }),
    para('Con la firma del presente contrato, EL CLIENTE renuncia expresamente a reclamar la devolución del importe abonado una vez iniciado el servicio o una vez ejecutado algún pago a terceros por parte del PRESTADOR en nombre del CLIENTE.'),
  ];
}

function commonClause_Legislacion(): Paragraph[] {
  return [
    para('Este contrato se rige por la legislación española. Ambas partes se someten expresamente a los Juzgados y Tribunales de Barcelona, con renuncia a cualquier otro fuero que pudiera corresponderles.'),
  ];
}

function commonClause_Contacto(): Paragraph[] {
  return [
    para('En cumplimiento de la Ley del Consumidor, queda designado por el cliente que sus medios de contacto usuales y por los cuales puede y debe ser encontrados son:'),
    emptyLine(),
    para('Teléfono: _______________________________________________'),
    para('E-mail: _______________________________________________'),
    para('Dirección: _______________________________________________'),
    emptyLine(),
    para('EL CLIENTE se compromete a mantener actualizados estos datos para fines de comunicación contractual.'),
  ];
}

function signatureBlock(clientName: string): Paragraph[] {
  return [
    heading('FIRMA DE ACEPTACIÓN'),
    para('Si acuerda con los términos anteriores, confirme su aceptación del presente contrato firmando y devolviendo una copia escaneada a nosotros.'),
    emptyLine(),
    emptyLine(),
    para('Firmado por y en nombre de Bruckschen e Asociados S.L.'),
    para('CAMILA BRUCKSCHEN', { bold: true }),
    emptyLine(),
    emptyLine(),
    para(`Firmado por y en nombre de ${clientName.toUpperCase()}`, { bold: true }),
  ];
}

// =====================================================
// TEMPLATE: REGULARIZACIÓN EXTRAORDINARIA
// =====================================================
function buildRegularizacionExtraordinaria(data: ContractData, dateStr: string): Paragraph[] {
  return [
    ...contractHeader(data.contractNumber, dateStr),
    ...contractParties(data.clientName, data.documentNumber),

    heading('PRIMERA. Objeto del Contrato'),
    para('El presente documento tiene por objeto reservar y anticipar la prestación de servicios profesionales relacionados con el futuro trámite de Regularización Excepcional Única, actualmente pendiente de aprobación legislativa y, por tanto, no disponible ni garantizado en la normativa vigente.'),
    para('TRAMITACIÓN DE LA SOLICITUD DE REGULARIZACIÓN EXCEPCIONAL ÚNICA.', { bold: true }),
    para('Los servicios serán ejecutados por el equipo profesional de CB ASESORÍA, bajo la dirección técnica correspondiente, sin que estén vinculados a una persona concreta salvo acuerdo expreso por escrito.'),

    heading('SEGUNDA. Honorarios y Forma de Pago'),
    para('Honorarios profesionales:', { bold: true }),
    para('[Detallar honorarios y forma de pago]'),
    emptyLine(),
    para('2.1. Los honorarios no incluyen:', { bold: true }),
    bullet('Tasas administrativas, notariales, judiciales, traducciones juradas, ni otros gastos derivados de gestiones ante terceros.'),
    bullet('Intervención de otros profesionales (procuradores, agentes inmobiliarios, etc.).'),
    bullet('Costes relacionados con procedimientos contenciosos o incidentales posteriores.'),
    emptyLine(),
    para('2.2. Retraso en el pago de los honorarios:', { bold: true }),
    para('En caso de retraso en el pago de los honorarios, el CLIENTE incurrirá en las siguientes consecuencias:'),
    numbered('1', 'Se aplicará un interés moratorio equivalente al 1,5% mensual sobre el importe adeudado, acumulable por cada mes natural completo de retraso, sin perjuicio de los intereses legales que puedan corresponder conforme a la normativa vigente.'),
    numbered('2', 'Además, el CLIENTE deberá abonar una multa contractual equivalente al 5% del importe total adeudado en concepto de penalización por mora, sin necesidad de requerimiento previo.'),
    para('CB ASESORÍA podrá suspender temporalmente la prestación de los servicios contratados hasta que se regularice el pago, sin que ello genere derecho a indemnización o reclamación alguna por parte del CLIENTE.'),

    ...commonClause_Tercera(),
    ...commonClause_Cuarta(),
    ...commonClause_Quinta(),
    ...commonClause_Sexta(),
    ...commonClause_Septima(),
    ...commonClause_Octava(),
    ...commonClause_Novena(),

    heading('DÉCIMA - Condición suspensiva'),
    para('El presente contrato queda condicionado a la aprobación y entrada en vigor de la Ley que regule la Regularización Excepcional Única.'),
    para('Hasta ese momento, no existe obligación de prestación del servicio principal, ni puede garantizarse su contenido, requisitos o viabilidad.'),

    heading('UNDÉCIMA - Destino del importe en caso de no aprobarse la Ley'),
    para('En caso de que la Ley no sea aprobada, o quede sin efecto, el importe abonado quedará registrado como crédito a favor del CLIENTE, pudiendo utilizarse íntegramente para cualquier otro trámite o servicio ofrecido por EL PRESTADOR, sin fecha de caducidad. En ningún caso se perderá el importe abonado.'),

    heading('DUODÉCIMA. Política de Devolución de Honorarios'),
    ...commonClause_Devolucion(),

    heading('DECIMOTERCERA. Legislación Aplicable y Jurisdicción'),
    ...commonClause_Legislacion(),

    heading('DECIMOCUARTA. Información de Contacto y Notificaciones'),
    ...commonClause_Contacto(),

    ...signatureBlock(data.clientName),
  ];
}

// =====================================================
// TEMPLATE: NACIONALIDAD
// =====================================================
function buildNacionalidad(data: ContractData, dateStr: string): Paragraph[] {
  return [
    ...contractHeader(data.contractNumber, dateStr),
    ...contractParties(data.clientName, data.documentNumber),

    heading('PRIMERA. Objeto del Contrato'),
    para('El presente contrato tiene por objeto la prestación de servicios jurídicos de extranjería por parte de CB ASESORÍA, consistentes en:'),
    para('TRAMITACIÓN TELEMÁTICA DE LA SOLICITUD DE LA NACIONALIDAD ESPAÑOLA POR RESIDENCIA.', { bold: true }),
    para('Los servicios serán ejecutados por el equipo profesional de CB ASESORÍA, bajo la dirección técnica correspondiente, sin que estén vinculados a una persona concreta salvo acuerdo expreso por escrito.'),

    heading('SEGUNDA. Honorarios y Forma de Pago'),
    para('Honorarios profesionales:', { bold: true }),
    para('[Detallar honorarios y forma de pago]'),
    emptyLine(),
    para('2.1. Los honorarios no incluyen:', { bold: true }),
    bullet('Tasas administrativas, notariales, judiciales, traducciones juradas, ni otros gastos derivados de gestiones ante terceros.'),
    bullet('Intervención de otros profesionales (procuradores, agentes inmobiliarios, etc.).'),
    bullet('Costes relacionados con procedimientos contenciosos o incidentales posteriores.'),
    bullet('Los exámenes: DELE A2 para los extranjeros cuya lengua materna no sea el español (134€), CCSE todos los extranjeros deben realizarlo, sin importar su lengua materna deben aprobar en el (85€) y Tasa Ministerio de la Justicia (104.05€).'),
    emptyLine(),
    para('2.2. Retraso en el pago de los honorarios:', { bold: true }),
    para('En caso de retraso en el pago de los honorarios, el CLIENTE incurrirá en las siguientes consecuencias:'),
    para('a) Se aplicará un interés moratorio equivalente al 1,5% mensual sobre el importe adeudado, acumulable por cada mes natural completo de retraso, sin perjuicio de los intereses legales que puedan corresponder conforme a la normativa vigente.'),
    para('b) Además, el CLIENTE deberá abonar una multa contractual equivalente al 5% del importe total adeudado en concepto de penalización por mora, sin necesidad de requerimiento previo.'),
    para('CB ASESORÍA podrá suspender temporalmente la prestación de los servicios contratados hasta que se regularice el pago, sin que ello genere derecho a indemnización o reclamación alguna por parte del CLIENTE.'),

    ...commonClause_Tercera(),
    ...commonClause_Cuarta(),
    ...commonClause_Quinta(),
    ...commonClause_Sexta(),
    ...commonClause_Septima(),
    ...commonClause_Octava(),
    ...commonClause_Novena(),

    heading('DÉCIMA. Política de Devolución de Honorarios'),
    ...commonClause_Devolucion(),

    heading('UNDÉCIMA. Legislación Aplicable y Jurisdicción'),
    ...commonClause_Legislacion(),

    heading('DUODÉCIMA. Información de Contacto y Notificaciones'),
    ...commonClause_Contacto(),

    ...signatureBlock(data.clientName),
  ];
}

// =====================================================
// TEMPLATE: DOCUMENTOS
// =====================================================
function buildDocumentos(data: ContractData, dateStr: string): Paragraph[] {
  return [
    ...contractHeader(data.contractNumber, dateStr),
    ...contractParties(data.clientName, data.documentNumber),

    heading('PRIMERA. Objeto del Contrato'),
    para('El presente contrato tiene por objeto la prestación de servicios jurídicos de extranjería por parte de CB ASESORÍA, consistentes en:'),
    para('TRAMITACIÓN DE LA SOLICITUD DEL CERTIFICADO / DOCUMENTO SOLICITADO.', { bold: true }),
    para('Los servicios serán ejecutados por el equipo profesional de CB ASESORÍA, bajo la dirección técnica correspondiente, sin que estén vinculados a una persona concreta salvo acuerdo expreso por escrito.'),

    heading('SEGUNDA. Honorarios y Forma de Pago'),
    para('Honorarios profesionales:', { bold: true }),
    para('[Detallar honorarios y forma de pago]'),
    emptyLine(),
    para('2.1. Los honorarios no incluyen:', { bold: true }),
    bullet('Tasas administrativas, notariales, judiciales, traducciones juradas, ni otros gastos derivados de gestiones ante terceros.'),
    bullet('Intervención de otros profesionales (procuradores, agentes inmobiliarios, etc.).'),
    bullet('Costes relacionados con procedimientos contenciosos o incidentales posteriores.'),
    emptyLine(),
    para('2.2. Retraso en el pago de los honorarios:', { bold: true }),
    para('En caso de retraso en el pago de los honorarios, el CLIENTE incurrirá en las siguientes consecuencias:'),
    numbered('1', 'Se aplicará un interés moratorio equivalente al 1,5% mensual sobre el importe adeudado, acumulable por cada mes natural completo de retraso, sin perjuicio de los intereses legales que puedan corresponder conforme a la normativa vigente.'),
    numbered('2', 'Además, el CLIENTE deberá abonar una multa contractual equivalente al 5% del importe total adeudado en concepto de penalización por mora, sin necesidad de requerimiento previo.'),
    para('CB ASESORÍA podrá suspender temporalmente la prestación de los servicios contratados hasta que se regularice el pago, sin que ello genere derecho a indemnización o reclamación alguna por parte del CLIENTE.'),

    ...commonClause_Tercera(),
    ...commonClause_Cuarta(),
    ...commonClause_Quinta(),
    ...commonClause_Sexta(),
    ...commonClause_Septima(),
    ...commonClause_Octava(),
    ...commonClause_Novena(),

    heading('DÉCIMA. Política de Devolución de Honorarios'),
    ...commonClause_Devolucion(),

    heading('UNDÉCIMA. Legislación Aplicable y Jurisdicción'),
    ...commonClause_Legislacion(),

    heading('DUODÉCIMA. Información de Contacto y Notificaciones'),
    ...commonClause_Contacto(),

    ...signatureBlock(data.clientName),
  ];
}

export async function generateContractDocument(data: ContractData): Promise<void> {
  const date = data.date || new Date();
  const dateStr = formatDateSpanish(date);

  let children: Paragraph[];

  switch (data.template) {
    case 'REGULARIZACION_EXTRAORDINARIA':
      children = buildRegularizacionExtraordinaria(data, dateStr);
      break;
    case 'NACIONALIDADE':
      children = buildNacionalidad(data, dateStr);
      break;
    case 'DOCUMENTOS':
      children = buildDocumentos(data, dateStr);
      break;
    default:
      // Fallback for GENERICO or unknown
      children = buildDocumentos(data, dateStr);
      break;
  }

  const doc = new Document({
    sections: [
      {
        properties: {},
        children,
        footers: {
          default: footerParagraph(),
        },
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  const templateName = data.template === 'REGULARIZACION_EXTRAORDINARIA'
    ? 'Regularizacion_Extraordinaria'
    : data.template === 'NACIONALIDADE'
    ? 'Nacionalidad'
    : 'Documentos';

  const fileName = `Contrato_${templateName}_${data.clientName.replace(/\s+/g, '_')}_${data.contractNumber || 'SN'}.docx`;
  saveAs(blob, fileName);
}
