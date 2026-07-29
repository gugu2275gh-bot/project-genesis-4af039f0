## Objetivo

1. Trocar os textos e os campos das duas primeiras etapas do fluxo **Pre-Hands off G**.
2. Mostrar, ao lado do badge de idioma no Sandbox, qual fluxo está sendo testado.

## 1. Etapa inicial (`dados_pessoais`)

Nova mensagem (PT-BR), com o nome vindo do perfil do WhatsApp (`{nome}`; se não houver nome, a saudação sai como "Olá!" sem vírgula solta):

```text
Olá, {nome}! Eu sou a assistente virtual da CB ASESORIA. 😊
Para entender melhor o seu caso, farei algumas perguntas… me comente um pouco sobre você (idade, onde você mora, possui formação superior, possui algum familiar europeu, esteve na Europa nos últimos 6 meses).
```

Traduções equivalentes em ES, EN e FR gravadas no mesmo campo `messages`.

Campos capturados nesta etapa (substituindo nome/data de nascimento/país):
- `age` — idade (obrigatório)
- `residence_country` — onde mora hoje (obrigatório; segue derivando "está na Espanha")
- `education_superior` — formação superior (obrigatório)
- `eu_family` — familiar europeu (obrigatório)
- `europe_6m` — esteve na Europa nos últimos 6 meses (obrigatório)
- `full_name` — opcional, aproveitado se a pessoa disser o nome (perfil do WhatsApp continua preenchendo)

`min_fields` = 5, com pergunta individual automática (já traduzida) para cada campo que faltar antes de avançar. A data de nascimento deixa de ser pedida nesta etapa.

## 2. Etapa de objetivo (`objetivo`)

Nova mensagem (PT-BR):

```text
E qual o seu objetivo na Espanha?

Visto de estudos, residência para nômades, arraigos, nacionalidade espanhola, já possui oferta de trabalho ou outros?
```

Traduções em ES/EN/FR. Continua capturando `intent` (obrigatório) e resolvendo o serviço contra o catálogo `service_types`.

## 3. Sandbox: identificar o fluxo em teste

Em `src/components/ai-agents/AgentSandbox.tsx`, adicionar um badge ao lado de "idioma:" com o nome do fluxo ativo do agente (ex.: `fluxo: Pre-Hands off G`), lido da configuração do agente/resposta da função de teste; se o agente não tiver fluxo vinculado, exibir `fluxo: nenhum (modo livre)`.

## Detalhes técnicos

- As etapas são atualizadas por migração SQL em `ai_agent_flow_steps` (`messages` e `validation.general_capture.fields`), sem mudança de `step_code`, ordem ou roteamento.
- Nenhuma alteração nos módulos `flow-intake.ts`, `flow-required.ts` ou `flow-turn.ts`: todos os campos usados já existem como fontes de captura.
- `flow-birthdate.ts` permanece no projeto, apenas não é mais exercitado por este fluxo.
