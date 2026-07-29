## Objetivo

Criar um fluxo novo com duas "perguntas gerais" (dados pessoais e objetivo) que aproveitam tudo que o cliente já disse, com **campos obrigatórios opcionais por etapa**, e transferir para o humano só depois de completar os obrigatórios que faltarem.

## 1. Campos obrigatórios na "Pergunta geral"

Hoje a etapa geral só tem "quantos dados bastam para pular" (`min_fields`). Adicionar:

- No tipo `StepGeneralCapture`, cada item de `fields` ganha `required?: boolean`.
- No editor (`StepGeneralCaptureEditor.tsx`): checkbox "Obrigatório" por campo, com aviso de que os obrigatórios que faltarem serão perguntados individualmente antes de seguir.
- Por campo, texto opcional da repergunta (multi-idioma), com fallback automático a partir do rótulo do campo.

## 2. Comportamento no motor do fluxo

Em `flow-engine.ts` / `flow-intake.ts`:

- Ao entrar na etapa geral, calcular quais campos obrigatórios ainda estão vazios (usando os aliases de `flow-vars.ts`, para não repetir o que já veio antes).
- Depois da resposta: rodar a extração multi-campo; se sobrar obrigatório vazio, mini-loop dentro da própria etapa perguntando **um campo por vez**, nunca repetindo campo já preenchido, respeitando `max_reasks` e as regras de "resposta diferente do esperado".
- Sem obrigatórios pendentes (ou nenhum marcado): grava o que foi entendido e avança direto.
- Todo texto passa por `localizeTurn()` (`flow-i18n`) e `applyVars` para manter idioma e `{nome}`.

## 3. Os dois cenários de entrada (garantidos)

**A) Primeira mensagem já traz informações** ("tenho 34 anos, moro em Valencia, quero arraigo")
- O intake inicial (`flow-intake.ts`) extrai os campos antes de qualquer pergunta.
- A etapa 1 é considerada satisfeita e pulada (via `min_fields`/obrigatórios já preenchidos); se só o objetivo faltar, o fluxo cai direto na etapa 2; se tudo estiver preenchido, vai direto ao handoff.
- Nada já informado é perguntado de novo.

**B) Primeira mensagem é só "oi"**
- Nenhum campo extraído → o fluxo envia normalmente a saudação + pergunta geral 1, depois a 2, depois handoff.
- `{nome}` usa o nome do perfil do WhatsApp quando existir; se não existir, a variável some do texto sem deixar buraco (`applyVars` já faz isso).

Testes cobrindo os dois caminhos serão adicionados.

## 4. Idiomas

- Textos das duas etapas gravados na migração em **pt-BR, es, en e fr** (mensagens, reperguntas de campo obrigatório e mensagem de handoff).
- A camada `flow-i18n` continua como rede de segurança: qualquer texto sem tradução é traduzido em runtime e persistido no banco.
- Detecção de idioma na 1ª mensagem e trava de idioma (regras já existentes) permanecem válidas.

## 5. Fluxo novo (migração SQL)

Nome: **"Conversa natural"** (status RASCUNHO, você ativa quando quiser).

```text
inicio
  -> perfil (PERGUNTA_GERAL)
       "Olá, {nome}! Eu sou a assistente virtual da CB ASESORIA. 😊
        Para entender melhor o seu caso, farei algumas perguntas… me comente
        um pouco sobre você (idade, onde você mora, possui formação superior,
        possui algum familiar europeu, esteve na Europa nos últimos 6 meses)"
       campos: idade, cidade, formação superior, familiar europeu, Europa 6 meses
  -> objetivo (PERGUNTA_GERAL)
       "E qual o seu objetivo na Espanha?
        Visto de estudos, residência para nômades, arraigos, nacionalidade
        espanhola, já possui oferta de trabalho ou outros?"
       campo: objetivo / serviço de interesse
  -> handoff (FIM, transfere para atendente humano)
```

Gravação via `field_mapping` existente (contact/funnel/outside). Padrão: **nenhum campo obrigatório** (aproveita e segue); você marca no editor o que quiser exigir.

## 6. Validação

- Testes Deno: sem obrigatórios avança; obrigatório faltando pergunta só o que falta; campo já preenchido não é reperguntado; cenário "oi" e cenário "mensagem completa".
- Rodar a suíte de fluxo completa e redeployar `whatsapp-webhook` e `ai-agent-sandbox`.
