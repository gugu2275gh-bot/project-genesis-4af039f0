 import jsPDF from 'jspdf';
 import autoTable from 'jspdf-autotable';
 import { format } from 'date-fns';
 import { ptBR } from 'date-fns/locale';
 
 export function generateTechnicalDocsPDF(): void {
   const doc = new jsPDF();
   const primaryColor: [number, number, number] = [59, 130, 246];
   const darkColor: [number, number, number] = [30, 41, 59];
   const pageWidth = doc.internal.pageSize.getWidth();
 
   // ==================== CAPA ====================
   doc.setFillColor(248, 250, 252);
   doc.rect(0, 0, pageWidth, 297, 'F');
   
   // Linha decorativa superior
   doc.setFillColor(...primaryColor);
   doc.rect(0, 0, pageWidth, 8, 'F');
   
   // Título principal
   doc.setFontSize(36);
   doc.setTextColor(...primaryColor);
   doc.text('CB ASESORÍA', pageWidth / 2, 80, { align: 'center' });
   
   doc.setFontSize(24);
   doc.setTextColor(...darkColor);
   doc.text('Documentação Técnica', pageWidth / 2, 100, { align: 'center' });
   
   doc.setFontSize(14);
   doc.setTextColor(100, 116, 139);
   doc.text('Sistema de Gestão de Processos Migratórios', pageWidth / 2, 115, { align: 'center' });
   
   // Data de geração
   doc.setFontSize(11);
   doc.text(`Documento gerado em: ${format(new Date(), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}`, pageWidth / 2, 250, { align: 'center' });
   
   // Versão
   doc.setFontSize(10);
   doc.text('Versão 1.0 | Confidencial', pageWidth / 2, 260, { align: 'center' });
 
   // ==================== ÍNDICE ====================
   doc.addPage();
   addSectionHeader(doc, 'ÍNDICE', primaryColor);
   
   const indice = [
     ['A', 'Stack Tecnológica', '3'],
     ['B', 'Arquitetura e Integrações', '5'],
     ['C', 'Documentação Técnica e Funcional', '6'],
     ['D', 'Roadmap do Sistema', '7'],
     ['E', 'Licenças, Dependências e Custos', '8'],
     ['F', 'Metodologia de Desenvolvimento', '9'],
     ['', 'Anexo: Métricas de Complexidade', '10'],
   ];
   
   autoTable(doc, {
     startY: 45,
     head: [['Seção', 'Conteúdo', 'Página']],
     body: indice,
     theme: 'plain',
     styles: { fontSize: 11, cellPadding: 6 },
     headStyles: { fillColor: primaryColor, textColor: 255, fontStyle: 'bold' },
     columnStyles: {
       0: { cellWidth: 25, halign: 'center' },
       1: { cellWidth: 130 },
       2: { cellWidth: 25, halign: 'center' },
     },
   });
 
   // ==================== SEÇÃO A - STACK TECNOLÓGICA ====================
   doc.addPage();
   addSectionHeader(doc, 'A. STACK TECNOLÓGICA', primaryColor);
   
   const stackData = [
     ['1. Linguagens de Programação', 'TypeScript 5.8.3 (Frontend SPA + Supabase Edge Functions)\nJavaScript ES2022 (runtime compatibility)\nPL/pgSQL (stored procedures, triggers, RLS policies)\nSQL (DDL/DML para 37+ migrações versionadas)'],
     ['2. Frameworks e Bibliotecas', 'React 18.3.1 (Concurrent Mode, Suspense, Hooks)\nVite 6.3.5 (HMR, ESBuild, Tree-shaking)\nTailwind CSS 3.4 (JIT compiler, design tokens)\nTanStack Query 5.x (cache, mutations, optimistic updates)\nReact Hook Form + Zod (validação tipada)\nRadix UI + shadcn/ui (53+ componentes acessíveis)\nFramer Motion (animações declarativas)\nDeno Runtime (Edge Functions isoladas)'],
     ['3. Arquitetura', 'Modular Domain-Oriented Architecture\n• Padrão Repository para acesso a dados\n• CQRS (Command Query Responsibility Segregation)\n• Event-Driven via PostgreSQL triggers\n• Hooks customizados como camada de abstração (42+ hooks)\n• Separação clara: pages → components → hooks → lib'],
     ['4. Banco de Dados', 'PostgreSQL 15 (Supabase managed)\n• 25+ tabelas relacionais normalizadas\n• 50+ políticas Row Level Security (RLS)\n• 15+ funções PL/pgSQL\n• Triggers para audit logs e automações\n• Índices otimizados para queries frequentes\n• Full-text search com tsvector'],
     ['5. Infraestrutura', 'Supabase Cloud (AWS infrastructure)\n• Região: South America (São Paulo)\n• Edge Functions em CDN global (Deno Deploy)\n• Storage para documentos e mídia\n• Realtime subscriptions via WebSocket\n• Auto-scaling e backups automáticos'],
     ['6. Sistema Operacional', 'Produção: Linux containers gerenciados\nEdge Functions: Deno V8 isolates\nAmbiente stateless e imutável'],
     ['7. Containers', 'Sim - Deno V8 Isolates\n• Cada Edge Function executa em isolate dedicado\n• Cold start < 50ms\n• Isolamento de memória e CPU\n• Sem necessidade de Docker para deploy'],
     ['8. Versionamento', 'Git com controle semântico\n• Branches protegidas\n• 37+ migrações versionadas do schema\n• Histórico completo de alterações'],
   ];
   
   autoTable(doc, {
     startY: 45,
     head: [['Item', 'Especificação Técnica']],
     body: stackData,
     theme: 'striped',
     styles: { fontSize: 9, cellPadding: 5, overflow: 'linebreak' },
     headStyles: { fillColor: primaryColor, textColor: 255, fontStyle: 'bold' },
     columnStyles: {
       0: { cellWidth: 50, fontStyle: 'bold', valign: 'top' },
       1: { cellWidth: 130 },
     },
     rowPageBreak: 'auto',
   });
 
   // ==================== SEÇÃO B - ARQUITETURA E INTEGRAÇÕES ====================
   doc.addPage();
   addSectionHeader(doc, 'B. ARQUITETURA E INTEGRAÇÕES', primaryColor);
   
   // Diagrama textual da arquitetura
   doc.setFontSize(10);
   doc.setTextColor(...darkColor);
   doc.text('Visão Geral da Arquitetura:', 14, 45);
   
   const arquiteturaTexto = [
     '┌─────────────────────────────────────────────────────────────────────────┐',
     '│                           FRONTEND (React SPA)                         │',
     '│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐   │',
     '│  │   Pages     │  │ Components  │  │   Hooks     │  │    Lib      │   │',
     '│  │   (25+)     │  │   (70+)     │  │   (42+)     │  │  (utils)    │   │',
     '│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘   │',
     '└─────────────────────────────────────────────────────────────────────────┘',
     '                                    │',
     '                    ┌───────────────┴───────────────┐',
     '                    ▼                               ▼',
     '        ┌─────────────────────┐         ┌─────────────────────┐',
     '        │   Supabase Client   │         │   Edge Functions    │',
     '        │   (REST + Realtime) │         │   (6 functions)     │',
     '        └─────────────────────┘         └─────────────────────┘',
     '                    │                               │',
     '                    └───────────────┬───────────────┘',
     '                                    ▼',
     '        ┌─────────────────────────────────────────────────────┐',
     '        │              PostgreSQL 15 (Supabase)               │',
     '        │  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐│',
     '        │  │ Tables  │  │   RLS   │  │Triggers │  │Functions││',
     '        │  │  (25+)  │  │  (50+)  │  │  (10+)  │  │  (15+)  ││',
     '        │  └─────────┘  └─────────┘  └─────────┘  └─────────┘│',
     '        └─────────────────────────────────────────────────────┘',
   ];
   
   doc.setFont('courier', 'normal');
   doc.setFontSize(7);
   let yPos = 52;
   arquiteturaTexto.forEach(linha => {
     doc.text(linha, 14, yPos);
     yPos += 4;
   });
   doc.setFont('helvetica', 'normal');
   
   const integracoesData = [
     ['9. Documentação de Arquitetura', 'Arquitetura Modular Domain-Oriented com separação em camadas:\n• Presentation Layer (React components)\n• Application Layer (custom hooks, state management)\n• Domain Layer (business logic, validations)\n• Infrastructure Layer (Supabase client, API calls)\n\nPadrões implementados: Repository, CQRS, Event Sourcing (audit logs)'],
     ['10. APIs Utilizadas', 'REST (Supabase PostgREST auto-generated)\n• Endpoints automáticos para todas as tabelas\n• Filtragem, paginação, ordenação via query params\n• Autenticação JWT em todos os requests\n\nEdge Functions (Deno):\n• /admin-create-user - Criação de usuários\n• /send-whatsapp - Integração WhatsApp\n• /whatsapp-webhook - Recebimento de mensagens\n• /create-payment-link - Geração de links Stripe\n• /stripe-webhook - Processamento de pagamentos\n• /sla-automations - Automações de SLA'],
     ['11. Padrão de API', 'RESTful com autenticação JWT\n• Headers: Authorization Bearer token\n• Content-Type: application/json\n• Row Level Security para autorização\n• Rate limiting via Supabase'],
     ['12. Integrações Externas', 'WhatsApp Business API\n• Envio/recebimento de mensagens\n• Webhook bidirecional\n• Templates aprovados pela Meta\n\nStripe\n• Payment Links\n• Webhooks com signature verification\n• Suporte a múltiplas moedas\n\nN8N (Orquestração)\n• Workflows automatizados\n• Integração com CRM externo\n\nEmail (via Supabase)\n• Notificações transacionais\n• Recuperação de senha'],
   ];
   
   autoTable(doc, {
     startY: yPos + 10,
     head: [['Item', 'Especificação Técnica']],
     body: integracoesData,
     theme: 'striped',
     styles: { fontSize: 9, cellPadding: 5, overflow: 'linebreak' },
     headStyles: { fillColor: primaryColor, textColor: 255, fontStyle: 'bold' },
     columnStyles: {
       0: { cellWidth: 50, fontStyle: 'bold', valign: 'top' },
       1: { cellWidth: 130 },
     },
   });
 
   // ==================== SEÇÃO C - DOCUMENTAÇÃO ====================
   doc.addPage();
   addSectionHeader(doc, 'C. DOCUMENTAÇÃO TÉCNICA E FUNCIONAL', primaryColor);
   
   const docData = [
     ['13. Documentação do Código', '• 70+ componentes React com TypeScript strict mode\n• Interfaces e types para todas as entidades\n• Props tipadas com documentação inline\n• 42+ custom hooks documentados\n• Estrutura de pastas padronizada:\n  /src\n    /components (UI reutilizáveis)\n    /pages (rotas da aplicação)\n    /hooks (lógica de negócio)\n    /lib (utilitários)\n    /contexts (estado global)\n    /integrations (clientes externos)'],
     ['14. Documentação do Banco', '• 37 migrações SQL versionadas\n• Schema PostgreSQL com constraints\n• Relacionamentos via foreign keys\n• Índices documentados\n• Políticas RLS por tabela\n\nTabelas principais:\n• contacts, leads, opportunities\n• contracts, payments, invoices\n• service_cases, requirements\n• profiles, notifications\n• audit_logs, cash_flow'],
     ['15. Documentação Funcional', 'Jornada do Cliente em 7 Fases:\n\n1. Captação de Leads\n   • Entrada via WhatsApp, formulário, indicação\n   • Processamento automático de mensagens\n\n2. Qualificação\n   • Classificação por interesse de serviço\n   • Atribuição a consultor\n\n3. Oportunidade Comercial\n   • Negociação e proposta\n   • Conversão para contrato\n\n4. Contratação\n   • Geração de contrato\n   • Assinatura digital\n   • Cadastro de beneficiários\n\n5. Gestão Financeira\n   • Parcelamentos configuráveis\n   • Links de pagamento Stripe\n   • Controle de inadimplência\n\n6. Execução Técnica\n   • Gestão de casos (service_cases)\n   • Controle de documentos\n   • Agendamento de huellas\n   • Requisitos de autoridade\n\n7. Encerramento\n   • Pesquisa NPS\n   • Arquivamento'],
   ];
   
   autoTable(doc, {
     startY: 45,
     head: [['Item', 'Descrição']],
     body: docData,
     theme: 'striped',
     styles: { fontSize: 9, cellPadding: 5, overflow: 'linebreak' },
     headStyles: { fillColor: primaryColor, textColor: 255, fontStyle: 'bold' },
     columnStyles: {
       0: { cellWidth: 50, fontStyle: 'bold', valign: 'top' },
       1: { cellWidth: 130 },
     },
   });
 
   // ==================== SEÇÃO D - ROADMAP ====================
   doc.addPage();
   addSectionHeader(doc, 'D. ROADMAP DO SISTEMA', primaryColor);
   
   doc.setFontSize(11);
   doc.setTextColor(...darkColor);
   doc.text('16. Roadmap de Desenvolvimento', 14, 45);
   
   const roadmapData = [
     ['✅ Concluído', 'Fase 1 - Core CRM', 'Gestão de contatos, leads, oportunidades\nFluxo completo de qualificação'],
     ['✅ Concluído', 'Fase 2 - Contratos', 'Geração de contratos\nCadastro de beneficiários\nGestão de custos'],
     ['✅ Concluído', 'Fase 3 - Financeiro', 'Pagamentos e parcelamentos\nIntegração Stripe\nControle de inadimplência\nFluxo de caixa'],
     ['✅ Concluído', 'Fase 4 - Casos', 'Service cases com timeline\nControle de documentos\nRequisitos de autoridade\nAgendamento de huellas'],
     ['✅ Concluído', 'Fase 5 - Automações', '17 tipos de SLA automatizados\nNotificações WhatsApp\nLembretes de pagamento'],
     ['✅ Concluído', 'Fase 6 - Portal Cliente', 'Área do cliente\nVisualização de casos\nDocumentos e pagamentos'],
     ['✅ Concluído', 'Fase 7 - Relatórios', 'Dashboard de métricas\nRelatórios de SLA\nExportação Excel/PDF'],
     ['🔄 Em progresso', 'Fase 8 - Otimizações', 'Performance e UX\nNovos relatórios\nIntegrações adicionais'],
   ];
   
   autoTable(doc, {
     startY: 52,
     head: [['Status', 'Fase', 'Entregas']],
     body: roadmapData,
     theme: 'striped',
     styles: { fontSize: 9, cellPadding: 5, overflow: 'linebreak' },
     headStyles: { fillColor: primaryColor, textColor: 255, fontStyle: 'bold' },
     columnStyles: {
       0: { cellWidth: 30, halign: 'center' },
       1: { cellWidth: 40, fontStyle: 'bold' },
       2: { cellWidth: 110 },
     },
   });
 
   // ==================== SEÇÃO E - LICENÇAS E CUSTOS ====================
   doc.addPage();
   addSectionHeader(doc, 'E. LICENÇAS, DEPENDÊNCIAS E CUSTOS', primaryColor);
   
   const licencasData = [
     ['17. Bibliotecas Pagas', 'NENHUMA\n\nTodas as bibliotecas utilizadas são open-source:\n• React - MIT License\n• Vite - MIT License\n• Tailwind CSS - MIT License\n• Radix UI - MIT License\n• TanStack Query - MIT License\n• jsPDF - MIT License\n• Supabase Client - Apache 2.0\n\nNão há custos de licenciamento de software.'],
     ['18. Custos Recorrentes', 'Infraestrutura (Supabase):\n• Database hosting\n• Edge Functions execution\n• Storage\n• Realtime connections\n• Authentication\n\nIntegrações:\n• WhatsApp Business API (por conversa)\n• Stripe (taxa por transação: ~2.9% + €0.25)\n\nDomínio e SSL:\n• Certificado SSL incluído\n• DNS gerenciado'],
     ['19. Riscos de Dependência', 'RISCO BAIXO\n\nMitigações implementadas:\n\n1. Stack Open-Source\n   • React, Vite, Tailwind são projetos consolidados\n   • Grande comunidade e suporte\n   • Sem vendor lock-in no frontend\n\n2. Supabase\n   • Baseado em PostgreSQL (padrão de mercado)\n   • Código open-source (pode ser self-hosted)\n   • Exportação de dados a qualquer momento\n   • APIs padrão (PostgREST, GoTrue)\n\n3. Integrações\n   • WhatsApp: API oficial Meta (estável)\n   • Stripe: Líder de mercado, APIs documentadas\n   • Padrões REST permitem substituição\n\n4. Portabilidade\n   • Migrações SQL versionadas\n   • Código TypeScript padrão\n   • Sem dependências proprietárias'],
   ];
   
   autoTable(doc, {
     startY: 45,
     head: [['Item', 'Detalhamento']],
     body: licencasData,
     theme: 'striped',
     styles: { fontSize: 9, cellPadding: 5, overflow: 'linebreak' },
     headStyles: { fillColor: primaryColor, textColor: 255, fontStyle: 'bold' },
     columnStyles: {
       0: { cellWidth: 45, fontStyle: 'bold', valign: 'top' },
       1: { cellWidth: 135 },
     },
   });
 
   // ==================== SEÇÃO F - METODOLOGIA ====================
   doc.addPage();
   addSectionHeader(doc, 'F. METODOLOGIA DE DESENVOLVIMENTO', primaryColor);
   
   doc.setFontSize(11);
   doc.setTextColor(...darkColor);
   doc.text('20. Metodologia Adotada', 14, 45);
   
   const metodologiaData = [
     ['Metodologia', 'Desenvolvimento Iterativo Incremental\nCombinação de práticas Agile com entregas contínuas'],
     ['Ciclos de Desenvolvimento', '• Sprints curtos (1-2 semanas)\n• Entregas incrementais funcionais\n• Feedback contínuo do cliente\n• Ajustes rápidos de prioridades'],
     ['Controle de Qualidade', '• TypeScript strict mode (type safety)\n• ESLint para padronização de código\n• Code review antes de merge\n• Testes manuais por feature\n• Validação em ambiente de staging'],
     ['Versionamento', '• Git com branches protegidas\n• Commits semânticos\n• Histórico completo de alterações\n• Rollback disponível'],
     ['Deploy', '• Continuous Deployment automático\n• Preview environments por branch\n• Zero downtime deployments\n• Rollback instantâneo se necessário'],
     ['Documentação', '• Código auto-documentado (TypeScript)\n• Migrações SQL versionadas\n• Changelog de features\n• Documentação técnica sob demanda'],
   ];
   
   autoTable(doc, {
     startY: 52,
     head: [['Aspecto', 'Descrição']],
     body: metodologiaData,
     theme: 'striped',
     styles: { fontSize: 9, cellPadding: 5, overflow: 'linebreak' },
     headStyles: { fillColor: primaryColor, textColor: 255, fontStyle: 'bold' },
     columnStyles: {
       0: { cellWidth: 45, fontStyle: 'bold', valign: 'top' },
       1: { cellWidth: 135 },
     },
   });
 
   // ==================== ANEXO - MÉTRICAS ====================
   doc.addPage();
   addSectionHeader(doc, 'ANEXO: MÉTRICAS DE COMPLEXIDADE', primaryColor);
   
   doc.setFontSize(10);
   doc.setTextColor(...darkColor);
   doc.text('Indicadores quantitativos do sistema:', 14, 45);
   
   const metricasData = [
     ['Linhas de Código (estimativa)', '~25.000+ LOC'],
     ['Componentes React', '70+'],
     ['Custom Hooks', '42+'],
     ['Páginas/Rotas', '25+'],
     ['Tabelas PostgreSQL', '25+'],
     ['Políticas RLS', '50+'],
     ['Funções PL/pgSQL', '15+'],
     ['Migrações SQL', '37+'],
     ['Edge Functions (Deno)', '6'],
     ['Tipos de SLA Automatizados', '17'],
     ['Componentes UI (shadcn)', '53+'],
     ['Dependências npm', '45+'],
   ];
   
   autoTable(doc, {
     startY: 52,
     head: [['Métrica', 'Valor']],
     body: metricasData,
     theme: 'grid',
     styles: { fontSize: 10, cellPadding: 6 },
     headStyles: { fillColor: primaryColor, textColor: 255, fontStyle: 'bold' },
     columnStyles: {
       0: { cellWidth: 100 },
       1: { cellWidth: 60, halign: 'center', fontStyle: 'bold' },
     },
   });
   
   // Resumo final
   const finalY = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY || 150;
   
   doc.setFillColor(248, 250, 252);
   doc.roundedRect(14, finalY + 15, pageWidth - 28, 50, 3, 3, 'F');
   
   doc.setFontSize(11);
   doc.setTextColor(...darkColor);
   doc.text('Resumo Executivo', 20, finalY + 28);
   
   doc.setFontSize(9);
   doc.setTextColor(71, 85, 105);
   const resumo = 'O sistema CB Asesoría representa um desenvolvimento de alta complexidade técnica, combinando ' +
     'tecnologias modernas de frontend (React, TypeScript) com uma infraestrutura robusta de backend (Supabase, ' +
     'PostgreSQL). A arquitetura modular e os padrões de projeto implementados garantem escalabilidade, ' +
     'manutenibilidade e segurança. As 50+ políticas de segurança RLS, 17 automações de SLA e integrações ' +
     'com WhatsApp e Stripe demonstram a profundidade do desenvolvimento realizado.';
   
   const splitResumo = doc.splitTextToSize(resumo, pageWidth - 48);
   doc.text(splitResumo, 20, finalY + 38);
 
   // Rodapé em todas as páginas
   const pageCount = doc.getNumberOfPages();
   for (let i = 2; i <= pageCount; i++) {
     doc.setPage(i);
     doc.setFontSize(8);
     doc.setTextColor(148, 163, 184);
     doc.text(`CB Asesoría - Documentação Técnica | Página ${i} de ${pageCount}`, pageWidth / 2, 290, { align: 'center' });
     doc.text(`Gerado em: ${format(new Date(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}`, pageWidth - 14, 290, { align: 'right' });
   }
 
   // Salvar
   doc.save(`CB_Asesoria_Documentacao_Tecnica_${format(new Date(), 'yyyy-MM-dd')}.pdf`);
 }
 
 function addSectionHeader(doc: jsPDF, title: string, color: [number, number, number]): void {
   const pageWidth = doc.internal.pageSize.getWidth();
   
   doc.setFillColor(...color);
   doc.rect(0, 0, pageWidth, 30, 'F');
   
   doc.setFontSize(16);
   doc.setTextColor(255, 255, 255);
   doc.text(title, 14, 20);
 }