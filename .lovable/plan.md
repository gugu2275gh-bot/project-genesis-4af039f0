

# Plano de Desenvolvimento: Departamento Técnico

## Visão Geral

O Departamento Técnico é responsável pelo acompanhamento do cliente desde a contratação até a conclusão do processo. Com base na análise do código atual, já existe uma estrutura sólida mas que precisa ser expandida para atender ao fluxo operacional completo.

---

## O Que Já Existe

| Funcionalidade | Status | Arquivo |
|----------------|--------|---------|
| Lista de casos (`/cases`) | ✅ Implementado | `CasesList.tsx` |
| Detalhe do caso | ✅ Implementado | `CaseDetail.tsx` |
| Status técnicos (22 status) | ✅ Implementado | `types/database.ts` |
| Gestão de documentos | ✅ Implementado | `useDocuments.ts` |
| Exigências do órgão | ✅ Implementado | `useRequirements.ts` |
| Seção de Huellas | ✅ Implementado | `HuellasSection.tsx` |
| Seção de retirada TIE | ✅ Implementado | `TiePickupSection.tsx` |
| Portal do cliente | ✅ Implementado | `PortalDashboard.tsx` |
| Onboarding do cliente | ✅ Implementado | `PortalOnboarding.tsx` |
| Upload de documentos pelo cliente | ✅ Implementado | `PortalDocuments.tsx` |
| Timeline do caso (cliente) | ✅ Implementado | `CaseTimeline.tsx` |
| Geração de EX17 e Taxa 790 | ✅ Implementado | `generate-ex17.ts`, `generate-taxa790.ts` |
| Automações SLA | ✅ Parcialmente | `sla-automations/index.ts` |

---

## O Que Precisa Ser Desenvolvido

### Fase 1: Dashboard do Técnico

**Objetivo**: Criar uma visão consolidada para o técnico ver seus casos, pendências e métricas.

| Item | Descrição |
|------|-----------|
| Dashboard técnico | Página com visão geral dos casos atribuídos |
| Cards de métricas | Casos por status, documentos pendentes, huellas agendados |
| Lista de prioridades | Casos urgentes, próximos vencimentos de SLA |
| Filtros rápidos | Por status, por tipo de serviço, por setor |

**Arquivos a criar**:
- `src/pages/technical/TechnicalDashboard.tsx`

---

### Fase 2: Melhorias no Detalhe do Caso

**Objetivo**: Aprimorar a experiência de gestão do caso.

| Item | Descrição |
|------|-----------|
| Histórico de status | Timeline visual das mudanças de status do caso |
| Notas do técnico | Campo para anotações internas sobre o caso |
| Checklist de documentos | Visão consolidada com progresso |
| Comunicação com cliente | Botão para enviar WhatsApp diretamente |
| Alertas visuais | Destaque para casos com SLA próximo do vencimento |

**Arquivos a modificar**:
- `src/pages/cases/CaseDetail.tsx` (adicionar abas/seções)
- `src/hooks/useCases.ts` (adicionar notas e histórico)

---

### Fase 3: Fluxo de Contato Inicial

**Objetivo**: Automatizar e padronizar o primeiro contato pós-contratação.

| Item | Descrição |
|------|-----------|
| Botão "Iniciar Contato" | Dispara mensagem padrão via WhatsApp |
| Atualização automática de status | Muda de CONTATO_INICIAL para AGUARDANDO_DOCUMENTOS |
| Notificação para o cliente | Orienta sobre o portal e onboarding |
| Registro de interação | Salva em `mensagens_cliente` |

**Arquivos a modificar**:
- `src/pages/cases/CaseDetail.tsx` (adicionar botão de contato inicial)
- Edge Function para envio de mensagem padrão

---

### Fase 4: Gestão de Documentos Melhorada

**Objetivo**: Facilitar a conferência e aprovação de documentos.

| Item | Descrição |
|------|-----------|
| Visão em grid/cards | Visualização mais amigável dos documentos |
| Preview de documento | Modal para visualizar PDF/imagem |
| Aprovação em lote | Aprovar múltiplos documentos de uma vez |
| Notificação ao cliente | Aviso automático quando documento é rejeitado |
| Indicador de progresso | Barra mostrando % de documentos aprovados |

**Arquivos a modificar**:
- `src/pages/cases/CaseDetail.tsx` (aba de documentos)
- `src/hooks/useDocuments.ts` (adicionar aprovação em lote)

---

### Fase 5: Fluxo Técnico → Jurídico

**Objetivo**: Formalizar a passagem do caso para o departamento jurídico.

| Item | Descrição |
|------|-----------|
| Validação antes de enviar | Verificar se todos os documentos obrigatórios estão aprovados |
| Registro de data de envio | Campo `sent_to_legal_at` |
| Notificação ao jurídico | Alerta para o departamento jurídico |
| Status ENVIADO_JURIDICO | Já existe, garantir uso correto |

**Arquivos a modificar**:
- `src/pages/cases/CaseDetail.tsx` (validação antes de enviar)
- `src/hooks/useCases.ts` (atualizar campos de data)

---

### Fase 6: Acompanhamento Pós-Protocolo

**Objetivo**: Gerenciar o período entre submissão e decisão.

| Item | Descrição |
|------|-----------|
| Lembretes automáticos | Verificar status a cada X dias |
| Registro de consultas | Anotar quando verificou o status |
| Gestão de exigências | Já existe, melhorar UX |
| Alerta de decisão | Quando mudar para APROVADO/NEGADO |

**Arquivos a modificar**:
- `src/pages/cases/CaseDetail.tsx` (seção de acompanhamento)
- Edge Function para lembretes automáticos (já existe)

---

### Fase 7: Huellas e TIE (Melhorias)

**Objetivo**: Aprimorar o fluxo de agendamento e retirada.

| Item | Descrição |
|------|-----------|
| Envio de lembrete pré-cita | WhatsApp 24h antes da tomada de huellas |
| Checklist de documentos para levar | Já existe parcialmente |
| Upload do resguardo | Após huellas, anexar comprovante |
| Notificação de TIE disponível | Avisar cliente quando TIE chegar |
| Confirmação de retirada | Registro com data |

**Arquivos a modificar**:
- `src/components/cases/HuellasSection.tsx` (upload de resguardo)
- `src/components/cases/TiePickupSection.tsx` (notificação ao cliente)
- Edge Function para lembretes de huellas

---

### Fase 8: Comunicação Automatizada

**Objetivo**: Centralizar e automatizar comunicações.

| Item | Descrição |
|------|-----------|
| Templates de mensagem | Mensagens padrão para cada situação |
| Envio com 1 clique | Botões de ação rápida no caso |
| Histórico de mensagens | Visualizar todas as mensagens enviadas |
| Mensagem de protocolo | Já implementado automaticamente |

**Arquivos a criar**:
- `src/components/cases/MessageTemplates.tsx`
- `src/components/cases/MessageHistory.tsx`

---

## Priorização Sugerida

| Fase | Prioridade | Esforço | Impacto |
|------|------------|---------|---------|
| Fase 2: Melhorias Detalhe | 🔴 Alta | Médio | Alto |
| Fase 3: Contato Inicial | 🔴 Alta | Baixo | Alto |
| Fase 4: Gestão Documentos | 🟡 Média | Médio | Alto |
| Fase 1: Dashboard Técnico | 🟡 Média | Médio | Médio |
| Fase 5: Fluxo Jurídico | 🟡 Média | Baixo | Médio |
| Fase 7: Huellas/TIE | 🟢 Baixa | Baixo | Médio |
| Fase 6: Pós-Protocolo | 🟢 Baixa | Baixo | Baixo |
| Fase 8: Comunicação | 🟢 Baixa | Médio | Médio |

---

## Próximos Passos

1. **Aprovar o escopo** - Confirmar quais fases implementar primeiro
2. **Definir templates de mensagem** - Textos padrão para cada situação
3. **Iniciar desenvolvimento** - Começar pelas fases de alta prioridade

---

## Perguntas para Definir Escopo

Antes de iniciar, seria útil saber:

1. Qual fase você gostaria de começar? (sugiro Fase 2 + Fase 3)
2. Existem templates de mensagem específicos para contato inicial?
3. O técnico precisa ver todos os casos ou apenas os atribuídos a ele?
4. Deseja algum relatório específico para o departamento técnico?

