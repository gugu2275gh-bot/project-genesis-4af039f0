

# Plano: Correcao dos 4 Bugs do Smart Reactivation Engine

## Bug 1: direct_route sobrescrito para SEND_MESSAGE

**Problema**: Linhas 319-330 -- o `result.action` e definido como `DIRECT_ROUTE` mas logo depois sobrescrito para `SEND_MESSAGE`. No webhook (linha 912), o `DIRECT_ROUTE` nunca e recebido, entao `reactivationLeadOverride` nunca e preenchido.

**Correcao**: Manter `action = 'DIRECT_ROUTE'` e adicionar `message_to_customer` como campo separado. No webhook, tratar `DIRECT_ROUTE` para tambem enviar a mensagem E aplicar o lead override.

## Bug 2: Respostas numericas e por nome de setor nao processadas

**Problema**: `handleConfirmationReply` so entende sim/nao. Se o fallback listou "1. Pagamento\n2. Documentacao" e o cliente responde "1" ou "pagamento", cai em "ambiguous" e retorna `CURRENT_FLOW`.

**Correcao**: Adicionar logica em `handleConfirmationReply` para:
- Detectar respostas numericas ("1", "2", "3") e mapear para o candidato correspondente no `ranked_candidates_json`
- Detectar nome de setor/assunto por comparacao textual com `pending_subject_title` e `sector` dos candidatos
- Detectar "novo assunto" / "outro" como equivalente a negativa final

## Bug 3: ask_disambiguation identico a ask_confirmation

**Problema**: Ambos enviam a mesma mensagem de confirmacao sobre 1 candidato. `ask_disambiguation` deveria listar multiplas opcoes.

**Correcao**: Quando `decision === 'ask_disambiguation'`, montar mensagem com lista numerada dos top candidatos (igual ao fallback), em vez de confirmar apenas o primeiro.

## Bug 4: Respostas ambiguas descartam contexto

**Problema**: Linhas 504-511 -- se a resposta nao e sim/nao/numero, o sistema retorna `CURRENT_FLOW` e o AI agent processa sem contexto de reativacao.

**Correcao**: Em vez de `CURRENT_FLOW`, re-processar a mensagem ambigua pela LLM com contexto adicional (tentativa anterior + resposta do cliente). Se ainda ambiguo, enviar mensagem neutra pedindo esclarecimento. Marcar resolucao como `no_response` somente apos 2 tentativas ambiguas.

## Arquivos Afetados

| Arquivo | Alteracao |
|---|---|
| `supabase/functions/smart-reactivation/index.ts` | Corrigir os 4 pontos na logica de decisao e confirmacao |
| `supabase/functions/whatsapp-webhook/index.ts` | Ajustar handler de DIRECT_ROUTE para enviar mensagem + override |

## Detalhes Tecnicos

### smart-reactivation/index.ts

**direct_route (linhas 318-352)**: Remover `result.action = 'SEND_MESSAGE'`. Retornar `action: 'DIRECT_ROUTE'` com `message_to_customer` incluso.

**handleConfirmationReply**: Reestruturar o fluxo:
1. Verificar resposta positiva → confirmar
2. Verificar resposta negativa → proximo candidato
3. Verificar "novo assunto"/"outro" → NEW_SUBJECT
4. Verificar resposta numerica (1-3) → selecionar candidato por indice
5. Verificar match textual com setor/assunto → selecionar candidato
6. Se nenhum match e `confirmation_attempt_count < 2` → reenviar opcoes com mensagem neutra
7. Se `confirmation_attempt_count >= 2` → NEW_SUBJECT

**ask_disambiguation (linhas 353-378)**: Quando `decision === 'ask_disambiguation'`, gerar mensagem com lista numerada dos ranked_candidates (top 3) + opcao "novo assunto".

### whatsapp-webhook/index.ts (linhas 901-921)

Ajustar o bloco `DIRECT_ROUTE` para:
- Enviar `message_to_customer` via insert em `mensagens_cliente` (como ja faz no SEND_MESSAGE)
- Aplicar `reactivationLeadOverride`
- Nao pular AI se nao houver lead override

