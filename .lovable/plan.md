## O que está acontecendo hoje (verificado no atendimento do Fred)

- A etapa `dados_pessoais` do fluxo "Conversa Natural Fred" tem **6 campos marcados como obrigatórios** e "mínimo de dados = 2". Como o obrigatório tem prioridade absoluta sobre o mínimo, o agente ficou cobrando um campo por vez e **nunca chegou à pergunta 2 (objetivo)** dentro da etapa.
- O último texto do cliente ("Falar com atendente") foi gravado como resposta de "esteve na Europa nos últimos 6 meses" — no cadastro virou **false**, ou seja, **dado inventado**.
- "Brasil" foi entendido pelo motor (aparece nos dados da conversa), mas o campo **País onde mora ficou vazio no contato**.

## Como passa a funcionar

1. **Mínimo manda.** Assim que a etapa "Pergunta geral" tiver a quantidade mínima de dados válidos (2, no fluxo do Fred), a etapa é encerrada e o agente **faz a pergunta seguinte do fluxo** no mesmo turno.
2. **Nada mais é cobrado.** Os campos que não foram respondidos simplesmente **ficam em branco**; não há insistência nem cobrança antes da transferência para o humano.
3. **Sem dado inventado.** Uma resposta só é gravada quando a interpretação reconhece o dado. Texto solto ("Falar com atendente", "não sei", "ok") **não vira valor** de campo nenhum, e sim/não só viram verdadeiro/falso quando são realmente sim/não.
4. **País é gravado.** O país entendido na conversa passa a ser salvo no contato (bloco de endereço residencial) e define "está na Espanha" corretamente.

## Detalhes técnicos

**Avanço pelo mínimo (`flow-required.ts`, `flow-turn.ts`)**
- `applyRequiredGate` passa a checar `generalCaptureSatisfied` **antes** de cobrar obrigatório: satisfeito o mínimo, não prende a etapa nem reescreve o turno.
- `generalCaptureSatisfied` deixa de exigir `missingRequired = []`; conta apenas os campos com valor válido contra `min_fields`.
- `enforceRequiredBeforeHandoff` deixa de reverter o handoff quando o mínimo foi atingido (mantém a rede de segurança só para etapas que nem chegaram ao mínimo).
- Em `flow-turn.ts`, no bloco de campo obrigatório pendente: após gravar a resposta, se o mínimo já foi atingido, fecha a etapa e chama `advanceFlow` em vez de perguntar o próximo obrigatório.

**Nada de valor inventado (`flow-turn.ts`, `visual-flow.ts`)**
- Remover o fallback `if (!value && text) value = text` — sem extração confiável, o campo fica vazio e o fluxo segue (respeitando `max_reasks`).
- Ignorar respostas de escape ("falar com atendente", "não sei", "sei lá", "ok", equivalentes ES/EN/FR) como valor de campo.
- Em `visual-flow.ts`, endurecer `toBoolOrNull` / `toYesNo`: só reconhecem sim/não explícitos; qualquer outro texto retorna `null` e **não** grava no contato.

**País no cadastro (`visual-flow.ts`)**
- A persistência passa a considerar o `captured_fields` acumulado do estado (não só o que foi capturado no turno), garantindo que `contact.residence_country` chegue ao contato mesmo quando entendido em turno anterior; `is_in_spain` e `location_known` continuam derivados do país.

**Limpeza do dado errado**
- Corrigir o contato do Fred: `eu_entry_last_6_months` volta a vazio e o país é preenchido com "Brasil".

**Testes**
- `flow_required_gate_test.ts`: avanço ao atingir o mínimo com obrigatórios pendentes; nenhum bloqueio antes do handoff nesse caso.
- `flow_turn_test.ts`: resposta de escape não vira valor de campo; campo fica vazio e o fluxo avança.
