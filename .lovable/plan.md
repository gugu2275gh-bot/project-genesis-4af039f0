

## Adicionar Guia de Variáveis + Logs Colapsável

### O que será feito

Duas alterações em `src/pages/settings/WhatsAppTemplatesSettings.tsx`:

1. **Seção "Variáveis Disponíveis"** — Card colapsável (fechado por padrão) entre os templates e os logs, com tabela mostrando cada `automation_type`, suas variáveis e placeholders Twilio correspondentes.

2. **Logs colapsável** — Envolver o card de "Logs de Envio" (linhas 581-688) num `Collapsible`, fechado por padrão, com trigger clicável no header.

### Detalhes técnicos

- Adicionar dois estados: `variablesOpen` e `logsOpen` (ambos `false` por padrão)
- Dados de variáveis como constante estática `VARIABLE_REFERENCE` com a estrutura:

```text
Tipo              | Variáveis                  | Placeholders
welcome           | nombre                     | {{1}}
payment_pre_7d    | nombre, valor, fecha       | {{1}}, {{2}}, {{3}}
document_reminder | nombre, documento          | {{1}}, {{2}}
...etc
```

- Usar `Collapsible` + `CollapsibleTrigger` + `CollapsibleContent` (já importados)
- Ícones `ChevronDown`/`ChevronRight` como indicador visual (já importados)

### Arquivo modificado
- `src/pages/settings/WhatsAppTemplatesSettings.tsx`

