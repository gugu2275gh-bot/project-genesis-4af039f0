## Objetivo

Criar o fluxo **"Pre-Hands off G"** implementando o documento anexo, reutilizando o motor de fluxo visual atual (`flow-engine`, `flow-intake`, `flow-required`, `flow-turn`, `visual-flow`) — sem criar caminho paralelo.

## O que já existe e será reaproveitado

- Etapa `PERGUNTA_GERAL` com extração multi-campo por LLM e `min_fields`/campos obrigatórios.
- Duas "pernas" na prática: a mensagem inicial é interpretada; o que já veio não é perguntado de novo.
- Persistência em `contacts` / `leads` via `field_mapping` (`contact.residence_country`, `contact.education_level`, `contact.has_eu_family_member`, `contact.eu_entry_last_6_months`, `is_in_spain` derivado do país).
- Handoff, supressão de resposta automática e idempotência do webhook.

## Lacunas a corrigir no motor

1. **Data de nascimento**: hoje o sistema grava `AAAA-01-01` a partir da idade (`visual-flow.ts`). Passará a **nunca** gerar data artificial; novo campo de captura `birth_date` com validação estrita `DD/MM/AAAA`, data existente, sem data futura, checagem de coerência com a idade declarada e conversão sem fuso para `YYYY-MM-DD`.
2. **Classificação da 1ª mensagem**: reforçar a regra "saudação pura não conta como informação válida" e que o nome do perfil do WhatsApp não altera a classificação (só é usado depois, e nome declarado prevalece).
3. **Catálogo de serviços**: hoje só preenchemos `leads.service_interest`. Passará a resolver também `leads.service_type_id` consultando `service_types` com `is_active = true` (match semântico por `name`/`description`/`code`, ordenado por `display_order`), com pergunta de desambiguação usando os nomes reais quando houver empate e nova pergunta quando não houver correspondência. Enum permitido: `VISTO_ESTUDANTE`, `VISTO_TRABALHO`, `REAGRUPAMENTO`, `RENOVACAO_RESIDENCIA`, `NACIONALIDADE_RESIDENCIA`, `NACIONALIDADE_CASAMENTO`, `RESIDENCIA_PARENTE_COMUNITARIO`, `OUTRO`, `SEM_SERVICO`.
4. **Booleanos**: `false` conta como preenchido (não repergunta) — reforçado no gate de obrigatórios.
5. **Gate de handoff**: transferir só com nome, data de nascimento válida, país, formação, familiar europeu, Europa 6 meses, `service_type_id` e `service_interest` preenchidos.
6. **"Quero trabalhar"** não vira oferta de trabalho automaticamente: pergunta de confirmação.
7. Perguntas jurídicas durante o pré-handoff: guardadas no histórico/resumo, resposta de acolhimento sem orientação conclusiva.

Nenhum registro em `service_cases` é criado.

## Estrutura do novo fluxo (dados)

Criado por migration, sem tocar nos fluxos existentes:

```text
1. dados_pessoais  (PERGUNTA_GERAL, min_fields conforme obrigatórios)
   obrigatórios: full_name, birth_date, residence_country,
                 education_superior, eu_family, europe_6m
   opcionais aproveitados: age, intent, in_spain, email
2. objetivo        (PERGUNTA_GERAL) -> intent + resolução no catálogo
   (pulada se o objetivo já foi capturado)
3. transferencia   (HANDOFF) com mensagem final do documento
```

Todas as mensagens e prompts por campo em PT-BR, ES, EN e FR (a camada `flow-i18n` continua garantindo o idioma da conversa).

## Detalhes técnicos

- `supabase/functions/_shared/flow-intake.ts`: novo campo `birth_date` no schema de extração + normalização de intenção sem inventar oferta de trabalho.
- `supabase/functions/_shared/flow-required.ts`: prompts padrão para `birth_date`; booleanos `false` = preenchido; validador de data com mensagens de erro do documento.
- Novo `supabase/functions/_shared/service-catalog.ts`: busca de `service_types` ativos, match semântico e mapeamento `code -> service_interest`.
- `supabase/functions/whatsapp-webhook/lib/visual-flow.ts`: remover a gravação de `AAAA-01-01`; gravar `birth_date` só quando validada; gravar `lead.service_type_id`.
- `src/components/ai-agents/StepGeneralCaptureEditor.tsx`: expor o campo `birth_date` na lista de dados capturáveis.
- Testes Deno cobrindo os casos 1–34 do documento (classificação, nome, data, dados pessoais, objetivo/serviço), rodando junto com a suíte atual.

## Fora do escopo

Criação de oportunidade/caso, alterações em outros fluxos ativos e mudanças fora do pré-handoff.
