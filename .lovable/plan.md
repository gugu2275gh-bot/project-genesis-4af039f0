## Objetivo

Hoje, quando o fluxo envia uma pergunta como *Quick Reply* (botões) no WhatsApp, o registro salvo em `mensagens_cliente` guarda apenas o texto. No acompanhamento pelo sistema (Conversa WhatsApp) o atendente vê a pergunta como se fosse aberta, sem saber que o cliente recebeu botões nem quais opções foram oferecidas.

A correção é persistir as opções enviadas e exibi-las no chat interno, no idioma real do atendimento.

## O que será feito

1. **Banco de dados**
   - Adicionar a coluna `interactive_options jsonb` (nullable) em `mensagens_cliente`, guardando os rótulos exatamente como foram enviados ao WhatsApp (ex.: `["Sí","No"]`).
   - Sem mudança de RLS/grants (a tabela já é lida pelo chat).

2. **Webhook de produção (`whatsapp-webhook/index.ts`)**
   - No ponto onde a mensagem do fluxo é persistida após envio, gravar `interactive_options` com o resultado de `buttonsForStep(...)` quando `quick_reply` estiver ativo (inclusive no caminho de reenvio pós-dedup).
   - Mesmo tratamento nos demais envios que usam quick reply (Sim/Não legado), gravando os rótulos localizados efetivamente usados.

3. **Interface — chat do lead (`src/components/crm/LeadChat.tsx`)**
   - Incluir `interactive_options` no `select` das mensagens e no tipo interno.
   - Em balões da IA com opções, renderizar abaixo do texto uma linha discreta: rótulo "Enviado com botões" + chips com cada opção (usando tokens do design system, sem cores fixas).
   - Quando a resposta do cliente corresponder exatamente a uma das opções da última pergunta com botões, marcar o balão do cliente com um indicador de "resposta por botão".

4. **Sandbox (opcional, mesma lógica)**
   - Exibir também no teste de fluxo os botões, para o comportamento ficar idêntico ao produtivo.

## Detalhes técnicos

- `buttonsForStep` já devolve os rótulos traduzidos pelo idioma travado; nada de tradução nova é necessário.
- Persistência continua em `fireAndForget`, apenas com um campo a mais — sem impacto de latência.
- Mensagens antigas ficam com `interactive_options = null` e são renderizadas como hoje.
- Após as alterações: redeploy de `whatsapp-webhook` (e `ai-agent-sandbox`, se incluído) e regeneração dos tipos do Supabase.
