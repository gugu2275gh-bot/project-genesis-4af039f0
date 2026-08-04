# Logs de Conversas: garantir que TODAS as conversas apareçam

## Situação atual (verificada no banco)

- A chave `whatsapp_conversation_logging_enabled` está **ligada** e a rodada atual é **2**.
- O gatilho `trg_archive_whatsapp_message` está ativo em `mensagens_cliente` e grava as duas pontas (cliente e agente).
- As tabelas de auditoria **não têm chave estrangeira** para leads/contatos e **não estão** na lista de limpeza do `cleanup_test_data()` — ou seja, elas realmente sobrevivem ao "zerar a base", e a limpeza só avança o contador de rodada.
- Hoje há 20 mensagens em `mensagens_cliente` e 20 linhas no arquivo (cobertura 1:1 no período em que a chave esteve ligada).

Resposta curta: sim, o que entra a partir de agora é gravado e não é apagado pela limpeza. Mas ainda existem três lacunas para "todas, todas".

## Lacunas a corrigir

1. **Conversas anteriores à ativação da chave não foram arquivadas.** Tudo que aconteceu antes de o log ser ligado (e antes das limpezas anteriores, quando os dados ainda existiam) não está no arquivo. O que ainda existe hoje em `mensagens_cliente`/`interactions` pode ser importado retroativamente.
2. **Se a chave for desligada, o arquivo fica com buracos.** Como o objetivo é auditar tudo, a gravação deve ser sempre ligada por padrão e o desligamento tratado como exceção explícita.
3. **A tela limita a 5.000 mensagens ordenadas do mais antigo para o mais novo.** Passando desse volume, as conversas mais recentes deixam de aparecer.

## O que será feito

**Banco (migração)**
- Backfill: importar para o arquivo (marcado como rodada 1, "histórico anterior") todas as linhas ainda existentes em `mensagens_cliente` que não tenham correspondência no arquivo, respeitando a data original de cada mensagem.
- Proteção contra duplicidade no backfill via checagem por `source_message_id` + direção.
- Garantir o default `true` da chave de gravação, para que uma base nova já nasça registrando.

**Tela de Logs de Conversas**
- Trocar o teto fixo de 5.000 por carregamento paginado por conversa: a lista busca primeiro os cabeçalhos (rodada + telefone + contagem + datas, ordenados do mais recente) e a transcrição é carregada sob demanda ao abrir a conversa. Assim nenhuma conversa some por volume.
- Mostrar um resumo no topo: total de conversas, total de mensagens e rodadas existentes.
- Manter os filtros atuais (rodada, busca, período) e a exportação CSV.

**Configurações**
- Deixar explícito na descrição da chave que desligar cria lacunas na auditoria e que o arquivo nunca é apagado pela limpeza de base.

## Detalhes técnicos

- Migração com `INSERT ... SELECT` de `mensagens_cliente` para `whatsapp_conversation_archive`, usando `NOT EXISTS` por `source_message_id`/`direction`, `session_seq = 1` e `created_at` original; join opcional em `leads`/`contacts` para nome e telefone.
- Novo hook em `src/hooks/useConversationArchive.ts`: `useConversationList` (agregação por `session_seq`+`phone` com paginação por range) e `useConversationMessages(sessionSeq, phone)` para a transcrição.
- `src/pages/settings/ConversationLogs.tsx` passa a consumir os dois hooks; exportação CSV usa as mensagens já carregadas da conversa selecionada.
- Nenhuma alteração no fluxo de atendimento: o gatilho continua com `EXCEPTION WHEN OTHERS THEN RETURN NEW`.
