## Causa

Em `supabase/functions/_shared/flow-required.ts`, `applyRequiredGate` contém:

```ts
const presentedNow = !turn.reasked && (turn.outbound || []).some(o => o?.step_code === code)
if (presentedNow) return { ...turn, state: { ...turn.state, required_field: '', required_attempts: 0 } }
```

Ou seja: no turno em que a "Pergunta geral" é apresentada, os campos obrigatórios ainda vazios **não são cobrados**. O nome (obrigatório em `dados_pessoais`) só entrou na fila um turno depois. Confirmado na sessão de teste: a cobrança do nome só apareceu após a 2ª resposta do cliente.

Bônus confirmado no mesmo teste: a saudação saiu como "Olá, **!**" porque `{nome}` estava vazio.

## Correção

**1. Obrigatório cobrado já na entrada da etapa** — `flow-required.ts`
- Manter a mensagem da "Pergunta geral" (ela continua sendo enviada uma vez), mas, quando existir campo obrigatório ainda vazio após o intake da 1ª mensagem, **anexar a pergunta do campo faltante na mesma resposta** e já marcar `required_field` no estado.
- Resultado no caso reportado: turno 2 passa a ser
  "…me comente um pouco sobre você (…)" + "Antes de tudo, qual é o seu nome completo?"
- Regra de ordem: campos obrigatórios são cobrados na ordem em que aparecem na configuração da etapa, um por vez.
- Se a mensagem da etapa já pergunta explicitamente aquele dado (detecção por sobreposição de texto, mesma técnica já usada em `greetingAlreadyPresent`), não duplica — apenas marca `required_field` para o próximo turno.

**2. Não perder os demais dados da resposta** — `_shared/flow-turn.ts`
- Hoje, com `required_field` pendente, a captura roda só para aquele campo. Passa a rodar para **todos** os campos da etapa, gravando o obrigatório e aproveitando o resto (ex.: cliente responde "Fred, moro em Recife" → grava nome e cidade).

**3. Saudação sem nome** — `_shared/flow-intake.ts`
- `renderIntakeGreeting`: quando o nome está vazio, usar a variante não personalizada (ou limpar a vírgula/`!` órfãos), eliminando o "Olá, !".

**4. Garantia final antes do handoff**
- Reforçar em `flow-turn.ts` que nenhuma etapa `HANDOFF` é alcançada com obrigatório vazio de qualquer "Pergunta geral" já percorrida (rede de segurança, além do gate por etapa).

## Testes
- `_shared/flow_required_gate_test.ts`: 1ª mensagem sem nome → resposta contém a pergunta geral **e** a cobrança do nome, com `required_field = contact.full_name`.
- 1ª mensagem com nome → nenhuma cobrança extra (comportamento atual preservado).
- Resposta ao obrigatório com dados extras → nome gravado + demais campos aproveitados.
- Saudação com nome desconhecido → sem "Olá, !".
- Rodar as suítes de `_shared` e `whatsapp-webhook` para garantir zero regressão.

Sem alterações de banco: a configuração do fluxo "Conversa Natural Fred" permanece como está.
