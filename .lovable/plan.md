## Problema observado

Mensagem: "tenho 50 anos, tio na europa e moro em paris"

O agente respondeu "Vi que você ainda não está na Espanha." e repetiu a lista com "possui algum familiar europeu" e sem tratar Paris como país.

Três falhas confirmadas na leitura do código (`supabase/functions/_shared/flow-intake.ts`) e da configuração do fluxo no banco:

1. `in_spain` é aceito como veio da IA — que deduziu "não está na Espanha" só porque a pessoa mora em Paris.
2. "Paris" é gravado apenas em `city`; `residence_country` fica vazio, então o país obrigatório continua em aberto e o item "onde você mora" não sai da lista.
3. "tio na europa" não vira `eu_family = sim`: a instrução do prompt pede "familiar europeu ou residente na UE" e a IA devolve `null` para menção de parentesco; a normalização por parentesco só roda quando o campo é respondido isoladamente, não no intake.

## O que será feito

### 1. Nunca deduzir presença na Espanha
- Em `flow-intake.ts`, só aceitar `in_spain` quando a mensagem citar explicitamente Espanha/España/Spain/Espagne ou um advérbio de presença ("estou aqui", "aquí", "cheguei"). Caso contrário, descartar o valor.
- Reforçar a instrução no `buildIntakePrompt`: morar em outro país NÃO responde `in_spain`.
- `buildIntakeSummary` deixa de afirmar "ainda não está na Espanha" quando isso não foi dito; com país conhecido usa "Vi que você mora em {país}".

### 2. Perguntar se está na Espanha
- Adicionar ao passo `dados_pessoais` do fluxo "Pre-Hands off G" um campo obrigatório `in_spain → funnel.location_known`, logo após o país, com pergunta nos 4 idiomas ("Você está na Espanha agora?" / "¿Estás en España ahora?" / "Are you in Spain right now?" / "Êtes-vous en Espagne en ce moment ?"). Se a pessoa já tiver dito, o campo entra preenchido e a pergunta não é feita.
- Manter `min_fields`, mas como o campo é obrigatório ele será cobrado antes do handoff (regra "obrigatório manda no mínimo" já existente).

### 3. Cidade vira país
- Instruir no prompt: quando só a cidade for dita, preencher também `residence_country` com o país dessa cidade.
- Rede de segurança determinística: tabela de cidades conhecidas (Paris/Lyon → França, Lisboa/Porto → Portugal, Madrid/Barcelona → Espanha, São Paulo/Rio → Brasil, Roma/Milão → Itália, Londres → Reino Unido, Berlim → Alemanha, Buenos Aires → Argentina, etc.). Se `city` existir e `residence_country` estiver vazio, o país é derivado da cidade.
- Continua sem inferir localização física a partir disso.

### 4. Parentesco = sim
- Prompt: "qualquer menção a parente (tio, avó, pai, primo, cônjuge...) europeu ou morando na UE = sim".
- Pós-processamento: aplicar a normalização por parentesco (`normalizeYesNo` com `kinship`) ao campo `eu_family` do intake, para que "tio na europa" grave `sim` mesmo se a IA devolver texto livre.

### 5. Lista dinâmica da abertura
- Com país e familiar europeu resolvidos, o corte da lista entre parênteses (já implementado) passa a remover "onde você mora" e "possui algum familiar europeu" corretamente. Ajustar as palavras-chave se algum item não casar.

## Detalhes técnicos
- Arquivos: `supabase/functions/_shared/flow-intake.ts` (prompt, `extractionToSourceValues`, mapa cidade→país, `buildIntakeSummary`), `flow-required.ts` (palavras-chave da lista, se necessário) e uma migração/SQL de atualização do `validation.general_capture.fields` do passo `dados_pessoais`.
- Testes: novos casos em `flow_intake_test.ts` (Paris → França sem `in_spain`; "tio na europa" → `sim`; lista de abertura sem os itens já respondidos) e execução da suíte completa Deno.
