## Objetivo

Na etapa de "Pergunta geral" (ex.: fluxo "Pre-Hands off G"), a primeira mensagem deve sair **sozinha** — apenas a saudação/pergunta aberta. Só **depois** que o cliente responder, se o nome não tiver sido identificado (nem na resposta, nem pelo perfil do WhatsApp), o nome é a **primeira** cobrança, antes de qualquer outro campo obrigatório.

## Comportamento hoje (verificado em `flow-required.ts`)

Quando a etapa geral é apresentada (`presentedNow`), o gate acrescenta na mesma resposta a cobrança do primeiro obrigatório pendente e já grava `required_field`. Com o nome ordenado em primeiro lugar, a saudação sai junto com "qual é o seu nome?".

## Mudanças

1. **`supabase/functions/_shared/flow-required.ts` — `applyRequiredGate`**
   - No ramo `presentedNow`: enviar apenas a mensagem da etapa, sem anexar `requiredPrompt`, e deixar `required_field` vazio (com `required_attempts: 0`).
   - Assim a resposta do cliente entra pelo caminho de captura geral (interpreta todos os campos de uma vez), e não como resposta de um campo específico.

2. **Cobrança após a resposta (já existente, sem mudança de motor)**
   - Em `flow-turn.ts`, depois da captura geral, os obrigatórios que continuarem vazios são perguntados um a um; `missingRequired` já ordena o nome em primeiro lugar e o nome nunca é pulado.

3. **Rede de segurança mantida**
   - `enforceRequiredBeforeHandoff` continua bloqueando transferência com nome em branco.

4. **Testes (`_shared/flow_required_gate_test.ts`)**
   - Inverter o teste "nome ausente é cobrado JUNTO com a pergunta geral" para: a primeira mensagem contém só a pergunta aberta e `required_field` fica vazio.
   - Ajustar o teste que espera `required_field = 'outside.age'` na apresentação.
   - Novo teste: após uma resposta sem nome, o próximo pedido é o nome; com nome informado, o nome não é perguntado.
   - Rodar a suíte completa (`_shared/`, `whatsapp-webhook/`, `ai-agent-sandbox/`).

Sem mudança de banco de dados nem de UI.