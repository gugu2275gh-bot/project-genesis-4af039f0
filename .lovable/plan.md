## Objetivo

Três correções na etapa "Pergunta geral" (fluxo Pre-Hands off G e demais):

1. "nem sei o que é isso" (formação superior) deve chegar a um sim/não assertivo, não repetir a pergunta.
2. "tio", "avó", "meu pai" etc. na pergunta de familiar europeu devem ser lidos como **sim**.
3. Se o nome não veio do WhatsApp nem da resposta, a **próxima** pergunta é o nome — e nenhuma outra pergunta da etapa avança antes disso.

## 1. Resposta "não sei o que é isso" em campos sim/não

Em `supabase/functions/_shared/flow-required.ts`:
- Novo detector `isDontKnow(text)` (pt/es/en/fr): "não sei", "nem sei o que é isso", "no sé qué es", "what is that", "je ne sais pas", "?" isolado.
- Em `requiredValueIssue` para campo sim/não:
  - 1ª vez: devolve uma **explicação curta + repergunta fechada** por campo, com tradução nos 4 idiomas. Ex. formação superior: "Formação superior é ter concluído (ou estar cursando) um curso universitário/faculdade. Você possui? Responda sim ou não."
  - 2ª vez (ou já esgotada a tentativa): grava **`nao`** em vez de deixar em branco (quem não sabe o que é, não tem).
- Textos de esclarecimento por `source` (`education_superior`, `eu_family`, `europe_6m`, `empadronado`) em PT/ES/EN/FR.

## 2. Vínculo familiar = sim

Ainda em `flow-required.ts`, dentro de `normalizeYesNo` (aplicado quando o campo é `eu_family`/`has_eu_family_member`):
- Lista de termos de parentesco: pai, mãe, avô/avó, bisavô/bisavó, filho/filha, irmão/irmã, tio/tia, primo/prima, sobrinho, esposa/marido/cônjuge, sogro, padrasto + equivalentes es/en/fr (padre, abuela, tío, hermano; father, grandmother, uncle; père, grand-mère, oncle…).
- Se a resposta contém um desses termos e **não** há negação explícita ("não tenho tio europeu"), o valor vira `sim`.
- Cuidado com o caso já tratado hoje: "só tenho família no Brasil" continua `nao` (negação/restrição tem prioridade).

## 3. Nome obrigatório e sempre primeiro

- **Dados do fluxo (SQL)**: no passo `dados_pessoais` do "Pre-Hands off G", marcar o campo `full_name` como `required: true` (hoje está `false`) e manter `min_fields`.
- **Motor** (`flow-required.ts`): em `missingRequired` e no gate, ordenar os pendentes colocando `full_name` (alvo `contact.full_name`) **em primeiro lugar**, de modo que seja sempre a próxima pergunta quando estiver vazio.
- O nome já conhecido pelo perfil do WhatsApp continua contando como preenchido (vem em `known`), então quem já se identificou não é perguntado de novo.
- O nome não entra na regra de "esgotou tentativas e segue em branco": enquanto não houver nome válido, a etapa repergunta (com variação de texto a partir da 2ª vez) e não avança nem transfere. Os demais campos mantêm `MAX_REQUIRED_ATTEMPTS`.

## Testes

Ampliar `supabase/functions/_shared/flow_required_gate_test.ts`:
- "nem sei o que é isso" → esclarecimento na 1ª vez, `nao` na 2ª.
- "tio" / "minha avó é italiana" → `sim`; "só tenho família no Brasil" → `nao`.
- Etapa sem nome conhecido → próxima pergunta é o nome; com nome vindo do WhatsApp → não pergunta.
- Rodar a suíte completa das edge functions.
