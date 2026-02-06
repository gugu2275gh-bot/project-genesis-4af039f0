
Objetivo
- Fazer com que mensagens antigas (já gravadas no banco) que chegam como JSON do WhatsApp sejam exibidas de forma legível no chat do Lead.
- Corrigir o caso atual (print) onde a mensagem vem como um objeto com `selectedDisplayText` e o fluxo (NativeFlowMessage) vem “aninhado” dentro de `contextInfo.quotedMessage...`.

O que descobri (por que ainda está vindo “cru”)
- A mensagem no banco (tabela `mensagens_cliente`) está em JSON válido, mas no formato:
  - `selectedDisplayText` / `selectedID` no root
  - e o menu original (botões) dentro de:
    - `contextInfo.quotedMessage.interactiveMessage.InteractiveMessage.NativeFlowMessage.buttons`
    - e o texto do menu em `...InteractiveMessage.body.text`
- O parser atual (`parseWhatsAppFlowMessage`) só reconhece:
  1) `parsed.NativeFlowMessage` no root
  2) `parsed` como array de botões
  3) `parsed.body / parsed.buttons` no root
- Como esse JSON vem em uma estrutura diferente (aninhada), o parser retorna `null` e o componente renderiza o JSON inteiro.

Mudanças propostas (código)
1) Atualizar o parser para suportar o “Formato 4” (resposta de quick reply com quotedMessage)
Arquivo: `src/components/crm/LeadChat.tsx`

- Adicionar uma nova detecção antes do `return null`, algo como:
  - Detectar se existe:
    - `parsed?.contextInfo?.quotedMessage?.interactiveMessage?.InteractiveMessage`
  - Extrair:
    - `interactive = parsed.contextInfo.quotedMessage.interactiveMessage.InteractiveMessage`
    - `native = interactive.NativeFlowMessage`
    - `bodyText = interactive.body?.text ?? 'Opções:'`
    - `options` a partir de `native.buttons` usando o mesmo parse de `buttonParamsJSON` (já existente)
    - `selectedIndex = parsed.selectedIndex ?? native.selectedIndex ?? null` (se existir)
    - `selectedOption = parsed.selectedDisplayText ?? (selectedIndex != null ? options[selectedIndex] : null)`

- Também suportar o caso “mínimo”:
  - Se tiver `selectedDisplayText`, mas não conseguir montar `options`, ainda assim exibir uma caixinha com o texto selecionado (ex.: “Renovação Residência”).

2) Melhorar a renderização para mostrar as opções (não só o selecionado)
Arquivo: `src/components/crm/LeadChat.tsx`

Hoje, quando `flowData` existe, o UI mostra:
- `bodyText`
- e só mostra o “selecionado” se existir

Ajustar para exibir:
- `bodyText`
- Lista de opções (quando `flowData.options.length > 0`)
  - Cada opção em uma linha (bullet)
  - Se a opção for a selecionada, destacar e colocar ícone de check
- Manter o bloco atual do “selecionado” (ou substituir por destaque na lista) para ficar consistente.

Resultado esperado no chat
Em vez do JSON gigante, aparecerá algo como:

- “Escolha o assunto:”
- Lista:
  - Visto Estudante
  - Visto Trabalho
  - Reagrupamento
  - Renovação Residência (com check/destaque)
  - Nacionalidade Residência
  - Nacionalidade Casamento
  - Outro

Por que isso “converte” as mensagens antigas
- A conversão será no momento da renderização: a mensagem permanece salva como JSON (não perde informação), mas o app passa a interpretá-la e exibir em português de forma legível.
- Assim, todo histórico já salvo passa a aparecer formatado automaticamente após o deploy.

Testes (passo a passo)
1) Abrir um Lead que já tem essa mensagem “crua” no chat (o do print).
2) Confirmar que:
   - O JSON não aparece mais inteiro.
   - Aparece o texto “Escolha o assunto:” (ou “Opções:” caso não exista body).
   - A opção selecionada aparece destacada/check.
3) Clicar no botão de refresh do chat (ícone ↻) e validar que continua correto.
4) Validar que mensagens “normais” (texto simples) continuam aparecendo como antes (sem tentar formatar indevidamente).

Riscos / cuidados
- `buttonParamsJSON` pode vir inválido em alguns botões: manter try/catch como já está para não quebrar o chat.
- Não assumir sempre a estrutura completa; checar com optional chaining e retornar algo parcial quando só existir `selectedDisplayText`.

Arquivos envolvidos
- `src/components/crm/LeadChat.tsx` (único arquivo)

Opcional (se você quiser além do necessário)
- Normalizar já na entrada (Edge Function `supabase/functions/whatsapp-webhook/index.ts`): se `message.body` for JSON e tiver `selectedDisplayText`, salvar também uma versão “limpa” em `interactions.content` e/ou `mensagens_cliente.mensagem_cliente`. Isso melhoraria notificações e relatórios, mas exige cuidado para não perder o payload original. Não é obrigatório para resolver o problema do chat.
