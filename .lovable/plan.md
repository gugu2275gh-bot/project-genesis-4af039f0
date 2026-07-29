## O que aconteceu

Verifiquei a configuração da etapa inicial do fluxo "Pre-Hands off G" e o motor do fluxo:

1. **A pergunta dos 6 meses na Europa foi pulada por causa do "mínimo de dados".** A etapa tem 6 campos (idade, país, formação, familiar europeu, Europa 6 meses, nome) e "Dados suficientes para pular esta etapa" = **5**. Como idade, nome, país, formação e familiar europeu foram entendidos, o mínimo (5) foi atingido e a regra atual (`generalCaptureSatisfied` em `flow-required.ts`, usada por `flow-turn.ts`) encerra a etapa mesmo com um campo marcado como **obrigatório** ainda vazio.

2. **A resposta de "familiar europeu" foi gravada como texto cru.** A frase "somente tenho familia no Brasil" foi salva literalmente em `contacts.has_eu_family_member`, porque a captura de campo obrigatório aceita qualquer texto que não seja ruído, sem converter para sim/não.

## O que vou mudar

**1. Obrigatório manda mais que o mínimo**
- Em `flow-required.ts`: o "mínimo de dados" passa a valer **apenas para os campos não obrigatórios**. Enquanto houver campo marcado como obrigatório sem valor (e sem tentativas esgotadas), a etapa não avança e não transfere para humano.
- `generalCaptureSatisfied` só devolve "satisfeito" quando todos os obrigatórios estão preenchidos (ou foram esgotados após as tentativas máximas) **e** o mínimo dos demais foi atingido.
- Mantém a proteção contra laço infinito: no máximo 2 insistências por campo; depois disso o campo fica em branco e o fluxo segue.

**2. Campos sim/não viram sim/não**
- Novo normalizador para os campos booleanos (`eu_family`, `europe_6m`, `education_superior`, `empadronado`, `in_spain`): frases como "somente tenho família no Brasil", "nenhum", "só no Brasil", "ninguém", "claro que sim", "tengo un tío español" são convertidas para `sim`/`nao` nos 4 idiomas.
- Quando a frase não permitir decidir, o agente repergunta uma vez de forma objetiva ("Você possui algum familiar europeu? (sim/não)") em vez de gravar o texto cru.
- Aplicado tanto na captura por campo obrigatório (`flow-turn.ts`) quanto no que o intake extrai (`flow-intake.ts`).

**3. Ajustes de exibição no sandbox**
- `CapturedFieldsCard.tsx`: rótulos amigáveis para `contact.has_eu_family_member` ("Familiar europeu"), `contact.eu_entry_last_6_months` ("Esteve na Europa (6 meses)"), `outside.age` ("Idade") e `funnel.interest_confirmed` ("Interesse confirmado"), no lugar de "Has Eu Family Member".
- **Posição:** mover o card "Dados reconhecidos" para **abaixo do campo de digitação da mensagem** no sandbox (`AgentSandbox.tsx`), logo após a área de input, em vez da coluna/posição atual.

**4. Texto do editor de fluxo**
- Em `StepGeneralCaptureEditor.tsx`, deixar explícito que o mínimo não dispensa campos obrigatórios ("o mínimo vale para os campos opcionais; obrigatórios são sempre perguntados").

## Detalhes técnicos

- Arquivos: `supabase/functions/_shared/flow-required.ts`, `flow-turn.ts`, `flow-intake.ts`, `src/components/ai-agents/AgentSandbox.tsx`, `src/components/ai-agents/CapturedFieldsCard.tsx`, `src/components/ai-agents/flow-builder/StepGeneralCaptureEditor.tsx`.
- Testes: atualizar `flow_required_gate_test.ts` (a regra "mínimo governa" muda para "obrigatório governa") e adicionar casos de normalização sim/não; rodar toda a suíte Deno.
- Sem migração de banco: a configuração atual do fluxo (min_fields = 5) continua válida — apenas passa a não pular obrigatórios.
