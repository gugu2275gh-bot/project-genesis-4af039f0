import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
  AlignmentType,
  PageBreak,
} from 'docx';
import { saveAs } from 'file-saver';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const createHeading = (text: string, level: typeof HeadingLevel[keyof typeof HeadingLevel]) => {
  return new Paragraph({
    text,
    heading: level,
    spacing: { before: 400, after: 200 },
  });
};

const createParagraph = (text: string, bold = false) => {
  return new Paragraph({
    children: [new TextRun({ text, bold })],
    spacing: { after: 120 },
  });
};

const createBulletPoint = (text: string) => {
  return new Paragraph({
    children: [new TextRun({ text })],
    bullet: { level: 0 },
    spacing: { after: 60 },
  });
};

const createTable = (headers: string[], rows: string[][]) => {
  const headerRow = new TableRow({
    children: headers.map(
      (header) =>
        new TableCell({
          children: [new Paragraph({ children: [new TextRun({ text: header, bold: true })] })],
          shading: { fill: '3B82F6' },
        })
    ),
  });

  const dataRows = rows.map(
    (row) =>
      new TableRow({
        children: row.map(
          (cell) =>
            new TableCell({
              children: [new Paragraph({ text: cell })],
            })
        ),
      })
  );

  return new Table({
    rows: [headerRow, ...dataRows],
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: { style: BorderStyle.SINGLE, size: 1 },
      bottom: { style: BorderStyle.SINGLE, size: 1 },
      left: { style: BorderStyle.SINGLE, size: 1 },
      right: { style: BorderStyle.SINGLE, size: 1 },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 1 },
      insideVertical: { style: BorderStyle.SINGLE, size: 1 },
    },
  });
};

export async function generateCustomerJourneyDocument(): Promise<void> {
  const doc = new Document({
    sections: [
      {
        properties: {},
        children: [
          // CAPA
          new Paragraph({
            children: [new TextRun({ text: '', break: 5 })],
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: 'CB ASESORIA',
                bold: true,
                size: 72,
                color: '3B82F6',
              }),
            ],
            alignment: AlignmentType.CENTER,
          }),
          new Paragraph({
            children: [new TextRun({ text: '', break: 2 })],
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: 'Documentação Completa',
                bold: true,
                size: 48,
              }),
            ],
            alignment: AlignmentType.CENTER,
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: 'Esteira da Jornada do Cliente',
                size: 36,
                italics: true,
              }),
            ],
            alignment: AlignmentType.CENTER,
          }),
          new Paragraph({
            children: [new TextRun({ text: '', break: 10 })],
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: `Documento gerado em: ${format(new Date(), "dd 'de' MMMM 'de' yyyy 'às' HH:mm", { locale: ptBR })}`,
                size: 24,
              }),
            ],
            alignment: AlignmentType.CENTER,
          }),
          new Paragraph({
            children: [new PageBreak()],
          }),

          // 1. VISÃO GERAL DO SISTEMA
          createHeading('1. Visão Geral do Sistema', HeadingLevel.HEADING_1),
          createParagraph(
            'O CB Asesoria é um sistema SaaS completo para gestão de assessoria de imigração na Espanha, gerenciando todo o ciclo de vida do cliente desde o primeiro contato até o encerramento do caso.'
          ),
          createHeading('1.1 Tipos de Serviço', HeadingLevel.HEADING_2),
          createTable(
            ['Código', 'Serviço', 'Setor'],
            [
              ['VISTO_ESTUDANTE', 'Visto de Estudante', 'ESTUDANTE'],
              ['VISTO_TRABALHO', 'Visto de Trabalho', 'TRABALHO'],
              ['REAGRUPAMENTO', 'Reagrupamento Familiar', 'REAGRUPAMENTO'],
              ['RENOVACAO_RESIDENCIA', 'Renovação de Residência', 'RENOVACAO'],
              ['NACIONALIDADE_RESIDENCIA', 'Nacionalidade por Residência', 'NACIONALIDADE'],
              ['NACIONALIDADE_CASAMENTO', 'Nacionalidade por Casamento', 'NACIONALIDADE'],
            ]
          ),
          new Paragraph({ text: '' }),
          createHeading('1.2 Perfis de Usuário', HeadingLevel.HEADING_2),
          createTable(
            ['Perfil', 'Descrição', 'Acesso Principal'],
            [
              ['ADMIN', 'Administrador do Sistema', 'Controle total, gestão de usuários e configurações'],
              ['MANAGER', 'Gerente', 'Todos os dashboards e relatórios, visualização de operações'],
              ['ATENCAO_CLIENTE', 'Atendimento ao Cliente', 'CRUD de leads e oportunidades'],
              ['JURIDICO', 'Jurídico', 'Elaboração e revisão de contratos'],
              ['FINANCEIRO', 'Financeiro', 'Gestão de pagamentos e cobranças'],
              ['TECNICO', 'Técnico', 'Casos atribuídos por tipo de serviço'],
              ['CLIENTE', 'Cliente', 'Portal do cliente (seus casos, docs, pagamentos)'],
            ]
          ),
          new Paragraph({ children: [new PageBreak()] }),

          // 2. FASE 1: CAPTAÇÃO DE LEADS
          createHeading('2. Fase 1: Captação de Leads', HeadingLevel.HEADING_1),
          createHeading('2.1 Canais de Entrada', HeadingLevel.HEADING_2),
          createBulletPoint('WhatsApp (integração via bot de IA)'),
          createBulletPoint('Website (formulário de contato)'),
          createBulletPoint('Instagram (direct messages)'),
          createBulletPoint('Facebook (messenger)'),
          createBulletPoint('Email (caixa de entrada)'),
          createBulletPoint('Indicação (clientes existentes)'),
          createBulletPoint('Outro (feiras, eventos, etc.)'),

          createHeading('2.2 Endpoint de Integração', HeadingLevel.HEADING_2),
          createParagraph('POST /lead-intake', true),
          createParagraph(
            'Endpoint preparado para receber dados do bot de WhatsApp ou outros sistemas de captação:'
          ),
          createBulletPoint('phone: Telefone do contato (obrigatório para WhatsApp)'),
          createBulletPoint('full_name: Nome completo do contato'),
          createBulletPoint('email: Email do contato'),
          createBulletPoint('preferred_language: Idioma preferido (pt, es, en, fr, ca)'),
          createBulletPoint('origin_channel: Canal de origem'),
          createBulletPoint('service_interest: Interesse de serviço inicial'),
          createBulletPoint('message_summary: Resumo da primeira conversa'),

          createHeading('2.3 Ações Automáticas', HeadingLevel.HEADING_2),
          createBulletPoint('Criação automática de Contato (se não existir pelo telefone)'),
          createBulletPoint('Criação automática de Lead vinculado ao contato'),
          createBulletPoint('Lead criado com status "NOVO"'),
          createBulletPoint('Registro de interação inicial (primeira mensagem)'),
          createBulletPoint('Disparo de SLA de primeira resposta (2 horas úteis)'),
          new Paragraph({ children: [new PageBreak()] }),

          // 3. FASE 2: QUALIFICAÇÃO DO LEAD
          createHeading('3. Fase 2: Qualificação do Lead', HeadingLevel.HEADING_1),
          createHeading('3.1 Status do Lead', HeadingLevel.HEADING_2),
          createTable(
            ['Status', 'Descrição', 'Próximas Ações'],
            [
              ['NOVO', 'Lead recém-criado, aguardando primeiro contato', 'Atendente deve fazer contato em até 2h'],
              ['DADOS_INCOMPLETOS', 'Faltam informações essenciais', 'Solicitar dados, re-engajamento D+1/D+3'],
              ['INTERESSE_PENDENTE', 'Dados completos, aguardando confirmação', 'Confirmar interesse no serviço'],
              ['INTERESSE_CONFIRMADO', 'Cliente confirmou interesse', 'Criar Oportunidade automaticamente'],
              ['ARQUIVADO_SEM_RETORNO', 'Sem resposta após múltiplas tentativas', 'Arquivado após D+3 sem resposta'],
            ]
          ),
          new Paragraph({ text: '' }),
          createHeading('3.2 SLAs de Qualificação', HeadingLevel.HEADING_2),
          createTable(
            ['SLA', 'Prazo', 'Ação Automática'],
            [
              ['Primeira Resposta', '2 horas úteis', 'Alerta ao atendente e gerente'],
              ['Mensagem de Boas-Vindas', '15 minutos', 'Envio automático pelo bot'],
              ['Reengajamento D+1', '24 horas', 'Notificação para atendente'],
              ['Reengajamento D+3', '72 horas', 'Última tentativa antes de arquivar'],
              ['Arquivamento Automático', 'D+3 sem resposta', 'Status muda para ARQUIVADO_SEM_RETORNO'],
            ]
          ),
          new Paragraph({ text: '' }),
          createHeading('3.3 Portão de Transição: Lead → Oportunidade', HeadingLevel.HEADING_2),
          createParagraph('Condições obrigatórias para criar Oportunidade:', true),
          createBulletPoint('Status do Lead = INTERESSE_CONFIRMADO'),
          createBulletPoint('Dados do contato completos (nome, email OU telefone)'),
          createBulletPoint('Tipo de serviço definido'),
          createBulletPoint('Confirmação de interesse registrada (interest_confirmed = true)'),
          new Paragraph({ children: [new PageBreak()] }),

          // 4. FASE 3: OPORTUNIDADE COMERCIAL
          createHeading('4. Fase 3: Oportunidade Comercial', HeadingLevel.HEADING_1),
          createHeading('4.1 Criação da Oportunidade', HeadingLevel.HEADING_2),
          createParagraph('Quando o interesse é confirmado, o sistema automaticamente:'),
          createBulletPoint('Cria uma Oportunidade vinculada ao Lead'),
          createBulletPoint('Define status inicial como "ABERTA"'),
          createBulletPoint('Cria tarefa "Elaborar Contrato" para o setor Jurídico'),
          createBulletPoint('Cria tarefa "Configurar Pagamento" para o setor Financeiro'),
          createBulletPoint('Atualiza o Lead para INTERESSE_CONFIRMADO'),

          createHeading('4.2 Status da Oportunidade', HeadingLevel.HEADING_2),
          createTable(
            ['Status', 'Descrição', 'Responsável'],
            [
              ['ABERTA', 'Oportunidade criada, aguardando elaboração de contrato', 'Jurídico'],
              ['CONTRATO_EM_ELABORACAO', 'Contrato sendo elaborado', 'Jurídico'],
              ['CONTRATO_ENVIADO', 'Contrato enviado para assinatura', 'Cliente'],
              ['CONTRATO_ASSINADO', 'Contrato assinado pelo cliente', 'Financeiro'],
              ['PAGAMENTO_PENDENTE', 'Aguardando confirmação de pagamento', 'Financeiro'],
              ['FECHADA_GANHA', 'Pagamento confirmado, caso iniciado', 'Técnico'],
              ['FECHADA_PERDIDA', 'Oportunidade perdida', 'N/A'],
              ['CONGELADA', 'Oportunidade pausada temporariamente', 'Atendimento'],
            ]
          ),
          new Paragraph({ children: [new PageBreak()] }),

          // 5. FASE 4: ELABORAÇÃO E ASSINATURA DE CONTRATO
          createHeading('5. Fase 4: Elaboração e Assinatura de Contrato', HeadingLevel.HEADING_1),
          createHeading('5.1 Fluxo do Contrato', HeadingLevel.HEADING_2),
          createTable(
            ['Status', 'Descrição', 'Ações'],
            [
              ['EM_ELABORACAO', 'Jurídico criando/editando contrato', 'Definir escopo, valores, condições'],
              ['EM_REVISAO', 'Contrato em revisão (4 olhos)', 'Outro membro jurídico revisa'],
              ['ENVIADO', 'Contrato enviado ao cliente', 'Aguardar assinatura'],
              ['ASSINADO', 'Contrato assinado pelo cliente', 'Liberar para pagamento'],
              ['CANCELADO', 'Contrato cancelado', 'Registrar motivo'],
            ]
          ),
          new Paragraph({ text: '' }),
          createHeading('5.2 Campos do Contrato', HeadingLevel.HEADING_2),
          createBulletPoint('opportunity_id: Oportunidade relacionada'),
          createBulletPoint('service_type: Tipo de serviço contratado'),
          createBulletPoint('scope_summary: Resumo do escopo do serviço'),
          createBulletPoint('total_fee: Valor total dos honorários'),
          createBulletPoint('currency: Moeda (EUR, USD, BRL)'),
          createBulletPoint('installment_conditions: Condições de parcelamento'),
          createBulletPoint('refund_policy_text: Política de reembolso'),
          createBulletPoint('language: Idioma do contrato'),
          createBulletPoint('external_signature_id: ID da assinatura digital externa'),

          createHeading('5.3 SLAs de Contrato', HeadingLevel.HEADING_2),
          createTable(
            ['SLA', 'Prazo', 'Ação'],
            [
              ['Lembrete D+2', '48 horas após envio', 'Notificação ao cliente'],
              ['Lembrete D+5', '5 dias após envio', 'Notificação + alerta ao atendente'],
              ['Escalação', '7 dias sem assinatura', 'Alerta ao gerente'],
            ]
          ),
          new Paragraph({ children: [new PageBreak()] }),

          // 6. FASE 5: GESTÃO DE PAGAMENTOS
          createHeading('6. Fase 5: Gestão de Pagamentos', HeadingLevel.HEADING_1),
          createHeading('6.1 Status do Pagamento', HeadingLevel.HEADING_2),
          createTable(
            ['Status', 'Descrição'],
            [
              ['PENDENTE', 'Pagamento aguardando processamento'],
              ['EM_ANALISE', 'Pagamento em análise (comprovante enviado)'],
              ['CONFIRMADO', 'Pagamento confirmado'],
              ['PARCIAL', 'Pagamento parcial recebido'],
              ['ESTORNADO', 'Pagamento estornado'],
            ]
          ),
          new Paragraph({ text: '' }),
          createHeading('6.2 Métodos de Pagamento', HeadingLevel.HEADING_2),
          createBulletPoint('CARTAO: Cartão de crédito/débito'),
          createBulletPoint('TRANSFERENCIA: Transferência bancária'),
          createBulletPoint('PIX: Pagamento instantâneo'),
          createBulletPoint('OUTRO: Outros métodos'),

          createHeading('6.3 Campos do Pagamento', HeadingLevel.HEADING_2),
          createBulletPoint('opportunity_id: Oportunidade relacionada'),
          createBulletPoint('contract_id: Contrato vinculado'),
          createBulletPoint('amount: Valor do pagamento'),
          createBulletPoint('currency: Moeda'),
          createBulletPoint('payment_method: Método de pagamento'),
          createBulletPoint('payment_link: Link para pagamento online'),
          createBulletPoint('transaction_id: ID da transação externa'),
          createBulletPoint('paid_at: Data/hora do pagamento'),

          createHeading('6.4 SLAs de Pagamento', HeadingLevel.HEADING_2),
          createTable(
            ['SLA', 'Prazo', 'Ação'],
            [
              ['Lembrete D+1', '24 horas', 'Notificação ao cliente'],
              ['Lembrete D+3', '72 horas', 'Notificação + alerta ao financeiro'],
              ['Escalação D+7', '7 dias', 'Alerta ao gerente, possível cancelamento'],
            ]
          ),

          createHeading('6.5 Portão de Transição: Pagamento → Caso Técnico', HeadingLevel.HEADING_2),
          createParagraph('Condições para criar Caso Técnico:', true),
          createBulletPoint('Contrato assinado (status = ASSINADO)'),
          createBulletPoint('Pagamento confirmado (status = CONFIRMADO) OU pagamento parcial aceito'),
          createBulletPoint('Oportunidade atualizada para FECHADA_GANHA'),
          new Paragraph({ children: [new PageBreak()] }),

          // 7. FASE 6: EXECUÇÃO TÉCNICA DO CASO
          createHeading('7. Fase 6: Execução Técnica do Caso', HeadingLevel.HEADING_1),
          createHeading('7.1 Status Técnico do Caso', HeadingLevel.HEADING_2),
          createTable(
            ['Status', 'Descrição', 'Ações'],
            [
              ['CONTATO_INICIAL', 'Caso criado, primeiro contato técnico', 'Orientar cliente sobre documentos'],
              ['AGUARDANDO_DOCUMENTOS', 'Aguardando envio de documentos', 'Monitorar uploads no portal'],
              ['DOCUMENTOS_EM_CONFERENCIA', 'Documentos em análise técnica', 'Revisar, aprovar ou rejeitar'],
              ['PRONTO_PARA_SUBMISSAO', 'Todos docs aprovados', 'Agendar submissão'],
              ['SUBMETIDO', 'Processo submetido ao órgão', 'Registrar protocolo'],
              ['EM_ACOMPANHAMENTO', 'Aguardando resposta do órgão', 'Monitorar prazos'],
              ['EXIGENCIA_ORGAO', 'Órgão solicitou documentos adicionais', 'Responder em 48-72h'],
              ['AGUARDANDO_RECURSO', 'Recurso em andamento', 'Acompanhar processo'],
              ['ENCERRADO_APROVADO', 'Processo aprovado', 'Enviar pesquisa NPS'],
              ['ENCERRADO_NEGADO', 'Processo negado', 'Orientar próximos passos'],
            ]
          ),
          new Paragraph({ text: '' }),
          createHeading('7.2 Gestão de Documentos', HeadingLevel.HEADING_2),
          createParagraph('Status de Documento:', true),
          createTable(
            ['Status', 'Descrição'],
            [
              ['NAO_ENVIADO', 'Documento ainda não enviado pelo cliente'],
              ['ENVIADO', 'Documento enviado, aguardando conferência'],
              ['EM_CONFERENCIA', 'Documento em análise técnica'],
              ['APROVADO', 'Documento aprovado'],
              ['REJEITADO', 'Documento rejeitado (com motivo)'],
            ]
          ),
          new Paragraph({ text: '' }),
          createParagraph('Cada tipo de serviço possui sua lista de documentos obrigatórios e opcionais, configuráveis pelo admin. Documentos podem requerer:'),
          createBulletPoint('Tradução juramentada (needs_translation)'),
          createBulletPoint('Apostilamento de Haia (needs_apostille)'),

          createHeading('7.3 Portão de Transição: Documentos → Submissão', HeadingLevel.HEADING_2),
          createParagraph('Condições para submeter ao órgão:', true),
          createBulletPoint('100% dos documentos obrigatórios com status APROVADO'),
          createBulletPoint('Revisão de 4 olhos concluída'),
          createBulletPoint('Formulários do órgão preenchidos'),
          createBulletPoint('Taxas governamentais pagas (quando aplicável)'),

          createHeading('7.4 Exigências de Órgão', HeadingLevel.HEADING_2),
          createParagraph('Quando o órgão solicita documentos adicionais:'),
          createBulletPoint('Registro na tabela requirements_from_authority'),
          createBulletPoint('Prazo oficial (official_deadline_date)'),
          createBulletPoint('Prazo interno (internal_deadline_date) - geralmente 48-72h antes'),
          createBulletPoint('Status: ABERTA → RESPONDIDA → ENCERRADA'),
          createBulletPoint('SLA de resposta monitora cumprimento do prazo interno'),
          new Paragraph({ children: [new PageBreak()] }),

          // 8. FASE 7: ENCERRAMENTO E PÓS-VENDA
          createHeading('8. Fase 7: Encerramento e Pós-Venda', HeadingLevel.HEADING_1),
          createHeading('8.1 Resultados Possíveis', HeadingLevel.HEADING_2),
          createTable(
            ['Resultado', 'Descrição', 'Ações'],
            [
              ['APROVADO', 'Processo deferido pelo órgão', 'Notificar cliente, enviar NPS, encerrar'],
              ['NEGADO', 'Processo indeferido', 'Orientar sobre recurso ou nova tentativa'],
              ['EM_ANDAMENTO', 'Processo ainda em análise', 'Continuar acompanhamento'],
              ['NULO', 'Processo anulado/arquivado', 'Registrar motivo'],
            ]
          ),
          new Paragraph({ text: '' }),
          createHeading('8.2 Pesquisa NPS', HeadingLevel.HEADING_2),
          createParagraph('Após encerramento APROVADO, o sistema envia pesquisa de satisfação:'),
          createBulletPoint('Score: 0-10 (NPS clássico)'),
          createBulletPoint('Comentário: feedback aberto'),
          createBulletPoint('Vinculado ao service_case_id'),
          createBulletPoint('Usado para métricas de qualidade'),
          new Paragraph({ children: [new PageBreak()] }),

          // 9. SISTEMA DE SLAs E AUTOMAÇÕES
          createHeading('9. Sistema de SLAs e Automações', HeadingLevel.HEADING_1),
          createHeading('9.1 Edge Function: sla-monitor', HeadingLevel.HEADING_2),
          createParagraph('Função executada via cron job (a cada hora) que monitora:'),
          createBulletPoint('Leads sem primeira resposta (2h)'),
          createBulletPoint('Leads sem reengajamento (D+1, D+3)'),
          createBulletPoint('Contratos sem assinatura (D+2, D+5)'),
          createBulletPoint('Pagamentos pendentes (D+1, D+3, D+7)'),
          createBulletPoint('Exigências de órgão (48-72h)'),
          createBulletPoint('Documentos em conferência (prazo interno)'),

          createHeading('9.2 Tabela de SLAs Configuráveis', HeadingLevel.HEADING_2),
          createTable(
            ['Chave', 'Valor Padrão', 'Descrição'],
            [
              ['first_response_hours', '2', 'Horas para primeira resposta a lead'],
              ['welcome_message_minutes', '15', 'Minutos para mensagem automática'],
              ['lead_reengagement_d1', '24', 'Horas para primeiro reengajamento'],
              ['lead_reengagement_d3', '72', 'Horas para segundo reengajamento'],
              ['lead_archive_days', '3', 'Dias sem resposta para arquivar'],
              ['contract_reminder_d2', '48', 'Horas para lembrete de contrato'],
              ['contract_reminder_d5', '120', 'Horas para segundo lembrete'],
              ['payment_reminder_d1', '24', 'Horas para lembrete de pagamento'],
              ['payment_reminder_d3', '72', 'Horas para segundo lembrete'],
              ['payment_escalation_d7', '168', 'Horas para escalação'],
              ['requirement_response_hours', '48', 'Horas para responder exigência'],
              ['document_review_hours', '24', 'Horas para revisar documento'],
            ]
          ),
          new Paragraph({ text: '' }),
          createHeading('9.3 Escalação', HeadingLevel.HEADING_2),
          createParagraph('Quando um SLA é violado:'),
          createBulletPoint('Notificação ao responsável direto'),
          createBulletPoint('Notificação ao gerente (escalação)'),
          createBulletPoint('Registro de violação para relatórios'),
          createBulletPoint('Criação de tarefa urgente'),
          new Paragraph({ children: [new PageBreak()] }),

          // 10. PORTAL DO CLIENTE
          createHeading('10. Portal do Cliente', HeadingLevel.HEADING_1),
          createHeading('10.1 Acesso e Autenticação', HeadingLevel.HEADING_2),
          createParagraph('O Portal do Cliente é acessado via rota separada (/portal) com autenticação específica para o perfil CLIENTE.'),

          createHeading('10.2 Funcionalidades', HeadingLevel.HEADING_2),
          createBulletPoint('Dashboard: Visão geral dos casos do cliente'),
          createBulletPoint('Timeline: Histórico visual do caso (contrato → pagamento → docs → submissão → decisão)'),
          createBulletPoint('Documentos: Upload de documentos, visualização de status'),
          createBulletPoint('Contratos: Visualização de contratos assinados'),
          createBulletPoint('Pagamentos: Histórico de pagamentos, recibos'),
          createBulletPoint('Mensagens: Comunicação interna com a equipe'),

          createHeading('10.3 Idiomas Suportados', HeadingLevel.HEADING_2),
          createTable(
            ['Código', 'Idioma'],
            [
              ['pt', 'Português'],
              ['es', 'Español'],
              ['en', 'English'],
              ['fr', 'Français'],
              ['ca', 'Català (opcional)'],
            ]
          ),
          new Paragraph({ text: '' }),
          createParagraph('O idioma é detectado automaticamente pelo navegador e pode ser alterado pelo cliente a qualquer momento.'),
          new Paragraph({ children: [new PageBreak()] }),

          // 11. INTEGRAÇÕES EXTERNAS
          createHeading('11. Integrações Externas', HeadingLevel.HEADING_1),
          createHeading('11.1 Endpoints Preparados', HeadingLevel.HEADING_2),
          createTable(
            ['Endpoint', 'Método', 'Descrição'],
            [
              ['/lead-intake', 'POST', 'Recebe dados de leads do bot de WhatsApp'],
              ['/client-status', 'GET', 'Retorna status do cliente para o bot'],
              ['/handover', 'POST', 'Marca transferência humano/bot'],
            ]
          ),
          new Paragraph({ text: '' }),
          createHeading('11.2 Webhooks (Preparados)', HeadingLevel.HEADING_2),
          createParagraph('O sistema está preparado para receber webhooks de:'),
          createBulletPoint('ASSINATURA: Plataformas de assinatura digital'),
          createBulletPoint('PAGAMENTO: Gateways de pagamento'),
          createBulletPoint('IA_WHATSAPP: Bot de WhatsApp'),
          createBulletPoint('OUTRO: Outras integrações'),
          createParagraph('Todos os webhooks são registrados na tabela webhook_logs para auditoria.'),
          new Paragraph({ children: [new PageBreak()] }),

          // 12. RELATÓRIOS E MÉTRICAS
          createHeading('12. Relatórios e Métricas', HeadingLevel.HEADING_1),
          createHeading('12.1 Dashboards em Tempo Real', HeadingLevel.HEADING_2),
          createBulletPoint('Leads: novos, confirmados, por canal, taxa de conversão'),
          createBulletPoint('Oportunidades: abertas, ganhas, perdidas, receita'),
          createBulletPoint('Contratos: pendentes, assinados'),
          createBulletPoint('Pagamentos: pendentes, confirmados, valores'),
          createBulletPoint('Casos: ativos, encerrados, por setor'),
          createBulletPoint('Tarefas: pendentes, atrasadas, concluídas'),
          createBulletPoint('SLAs: taxa de cumprimento, violações'),

          createHeading('12.2 Relatórios Exportáveis', HeadingLevel.HEADING_2),
          createBulletPoint('Filtros: período, tipo de serviço, setor, usuário'),
          createBulletPoint('Formatos: Excel (.xlsx) e PDF'),
          createBulletPoint('Gráficos: evolução diária/mensal, comparativo de períodos'),
          createBulletPoint('Tabs: Visão Geral, Leads, Oportunidades, Pagamentos, Casos, Tarefas, SLAs'),

          createHeading('12.3 Métricas de SLA', HeadingLevel.HEADING_2),
          createBulletPoint('Taxa de cumprimento por categoria'),
          createBulletPoint('Tempo médio de resposta'),
          createBulletPoint('Violações por período'),
          createBulletPoint('Performance por usuário/equipe'),
          new Paragraph({ children: [new PageBreak()] }),

          // APÊNDICE
          createHeading('Apêndice: Diagrama de Fluxo', HeadingLevel.HEADING_1),
          createParagraph('Fluxo Resumido da Jornada:', true),
          new Paragraph({ text: '' }),
          createParagraph('1. CAPTAÇÃO'),
          createBulletPoint('WhatsApp/Site/Redes → Contact + Lead (NOVO)'),
          new Paragraph({ text: '' }),
          createParagraph('2. QUALIFICAÇÃO'),
          createBulletPoint('Lead NOVO → DADOS_INCOMPLETOS → INTERESSE_PENDENTE → INTERESSE_CONFIRMADO'),
          new Paragraph({ text: '' }),
          createParagraph('3. COMERCIAL'),
          createBulletPoint('Opportunity (ABERTA) → Contract (EM_ELABORACAO → ENVIADO → ASSINADO)'),
          new Paragraph({ text: '' }),
          createParagraph('4. FINANCEIRO'),
          createBulletPoint('Payment (PENDENTE → CONFIRMADO) → Opportunity (FECHADA_GANHA)'),
          new Paragraph({ text: '' }),
          createParagraph('5. TÉCNICO'),
          createBulletPoint('ServiceCase (AGUARDANDO_DOCUMENTOS → DOCUMENTOS_EM_CONFERENCIA → SUBMETIDO → ENCERRADO)'),
          new Paragraph({ text: '' }),
          createParagraph('6. ENCERRAMENTO'),
          createBulletPoint('Decision (APROVADO/NEGADO) → NPS Survey'),
          new Paragraph({ text: '' }),
          new Paragraph({
            children: [
              new TextRun({
                text: '— Fim do Documento —',
                italics: true,
              }),
            ],
            alignment: AlignmentType.CENTER,
            spacing: { before: 400 },
          }),
        ],
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  saveAs(blob, `CB_Asesoria_Jornada_Cliente_${format(new Date(), 'yyyy-MM-dd')}.docx`);
}
