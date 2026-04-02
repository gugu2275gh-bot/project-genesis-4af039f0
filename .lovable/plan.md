

## Adicionar Valores de Exemplo para Variáveis nos Templates

### Problema
A Twilio/Meta exige valores de exemplo (sample values) para cada variável ao criar um Content Template. Sem eles, o template pode ser rejeitado ou não pode ser submetido para aprovação do WhatsApp.

### O que será feito

#### 1. Edge Function — Incluir `variables` com samples no payload de criação
No `submit-whatsapp-templates`, ao criar o Content Template (Step 1), gerar automaticamente os sample values baseados no índice da variável:
- `{{1}}` → `"Jorge"`
- `{{2}}` → `"9,99"` (decimal com vírgula, padrão do projeto)
- `{{3}}` → `"31/12/2050"`

O payload passará a incluir o campo `variables` exigido pela Twilio Content API:
```json
{
  "friendly_name": "cb_welcome_es",
  "language": "es",
  "types": {
    "twilio/text": {
      "body": "Hola {{1}}! Bienvenido..."
    }
  },
  "variables": {
    "1": "Jorge",
    "2": "9,99",
    "3": "31/12/2050"
  }
}
```

A lógica detectará quantas variáveis (`{{N}}`) existem no `body_text` e gerará os samples automaticamente, usando a lista ordenada de nomes das variáveis do template como fallback descritivo nos logs.

#### 2. UI — Mostrar os sample values no formulário de criação e edição
Adicionar uma nota informativa nos dialogs de criação e edição, abaixo do campo de variáveis, explicando os valores de exemplo que serão enviados automaticamente:

```
ℹ️ Valores de exemplo enviados ao WhatsApp:
  {{1}} → Jorge  |  {{2}} → 9,99  |  {{3}} → 31/12/2050
```

### Arquivos modificados
- `supabase/functions/submit-whatsapp-templates/index.ts` (adicionar `variables` no payload)
- `src/pages/settings/WhatsAppTemplatesSettings.tsx` (nota informativa nos dialogs)

