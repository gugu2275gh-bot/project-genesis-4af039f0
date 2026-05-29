# Tratativa de datas — regra global DD/MM/YYYY

## Problema
No exemplo (BM - Gustavo), o cliente respondeu "22 de maio" à pergunta "Qual foi a data exata da sua entrada na Espanha?". O bot aceitou sem ano, gerando ambiguidade (poderia ser 2024, 2025, 2026). Não há validação de data centralizada.

## Objetivo
Tratar **data como regra do sistema**: sempre que o bot pedir ou receber uma data do cliente (entrada na Espanha, nascimento, validade de documento, agendamento, etc.), o formato esperado é **DD/MM/YYYY** e o ano é **obrigatório**.

## Mudanças

### 1. Novo módulo `lib/date-utils.ts` (whatsapp-webhook)
Helper centralizado:
- `parseUserDate(text, locale)` → retorna `{ valid, date, missingYear, raw }`.
  - Reconhece: `22/05/2025`, `22-05-2025`, `22/5/25`, `22 de maio de 2025`, `22 de mayo de 2025`, `May 22 2025`, `ontem`, `hoje`, `anteontem`, `há 3 dias`.
  - Detecta ausência de ano ("22 de maio", "22/05", "ayer sin año") → `missingYear: true`.
- `formatDate(date)` → sempre `DD/MM/YYYY` na exibição.
- `dateAskPrompt(locale)` → frase padrão multi-idioma pedindo `DD/MM/YYYY`.

### 2. Instruções no prompt base do AI Agent
Em `supabase/functions/whatsapp-webhook/lib/overrides.ts` (ou onde o system prompt é montado), adicionar bloco fixo:
> "REGRA DE DATAS: Toda data deve ser solicitada e confirmada no formato **DD/MM/YYYY**. Se o cliente responder sem ano (ex.: '22 de maio', '22/05'), NÃO assuma o ano — pergunte novamente: 'Pode confirmar a data completa no formato DD/MM/AAAA, por favor?' (adapte ao idioma do cliente: ES → 'DD/MM/AAAA', EN → 'DD/MM/YYYY'). Ao repetir/confirmar uma data ao cliente, sempre use DD/MM/YYYY."

### 3. Validação pós-resposta do cliente
No fluxo principal do webhook, quando a última pergunta do bot for classificada como "pergunta de data" (heurística: contém "data", "fecha", "date", "quando", "cuándo", "when" + termo temporal), interceptar a resposta do cliente:
- Rodar `parseUserDate`.
- Se `missingYear === true` → forçar bubble de reprompt no idioma do lead com `dateAskPrompt` e **não** avançar de etapa nem registrar a data.
- Se válida → normalizar para `DD/MM/YYYY` antes de salvar em `lead_metadata` / `interactions` e antes de qualquer eco ao cliente.

### 4. Templates e textos do sistema
Auditar templates WhatsApp e textos SLA que pedem datas (ex.: agendamento Huellas, validade de NIE) para padronizar o pedido `DD/MM/AAAA` (PT) / `DD/MM/AAAA` (ES) / `DD/MM/YYYY` (EN).

### 5. Frontend (CRM)
Sem mudanças funcionais nesta entrega — apenas garantir que campos de data exibidos ao operador continuem `DD/MM/YYYY` (já é o padrão; verificação rápida em `LeadDetail` e `ContactDetail`).

## Arquivos previstos
- novo: `supabase/functions/whatsapp-webhook/lib/date-utils.ts`
- editar: `supabase/functions/whatsapp-webhook/index.ts` (interceptação + normalização)
- editar: `supabase/functions/whatsapp-webhook/lib/overrides.ts` (bloco de regra no prompt)
- editar (se necessário): templates em `whatsapp_templates` com placeholder de data

## Fora de escopo
- Migração de datas históricas já salvas em texto livre.
- Date pickers no portal do cliente.

## Confirmações antes de implementar
1. Aplicar a regra **somente no agente WhatsApp** (bot) ou também em formulários do portal do cliente?
2. Quando o cliente disser "ontem" / "hoje" / "há 3 dias", aceitar e converter para `DD/MM/YYYY` automaticamente, ou ainda assim pedir confirmação explícita?
