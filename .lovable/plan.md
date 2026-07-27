Plano para corrigir os botões em idioma incorreto:

1. **Corrigir a regra do motor do fluxo**
   - Ajustar `buttonsOf/localizedOptions` para que opções padrão de Sim/Não sejam localizadas automaticamente pelo idioma travado do atendimento, mesmo quando a etapa está como `BOTOES` e as opções foram cadastradas em português (`Sim` / `Não`).
   - Isso evita depender exclusivamente de `options_i18n` para casos binários.

2. **Corrigir o fluxo ativo existente**
   - Atualizar a etapa ativa `msg_7_perguntar_localizacao` do fluxo `Pré-Handsoff`, que hoje está como `BOTOES` com opções base `Sim` / `Não` e sem `options_i18n`.
   - Gravar traduções explícitas para: espanhol `Sí/No`, inglês `Yes/No`, francês `Oui/Non`.

3. **Garantir persistência correta no chat do sistema**
   - Confirmar que `interactive_options` usa os mesmos rótulos localizados enviados ao WhatsApp.
   - Se necessário, ajustar a persistência para não cair novamente nos rótulos base em português.

4. **Testar o cenário que falhou**
   - Adicionar/ajustar teste para etapa `BOTOES` com opções `Sim/Não` em atendimento espanhol, esperando botões `Sí/No`.
   - Rodar os testes das Edge Functions relacionados ao fluxo e botões.

5. **Deploy**
   - Redeployar `whatsapp-webhook` após a correção.

Causa confirmada: a etapa ativa de localização está configurada como `BOTOES` com opções base `Sim/Não`, sem traduções salvas em `options_i18n`. A regra atual só traduz automaticamente Sim/Não quando o tipo da etapa é `SIM_NAO`; em `BOTOES`, ela usa as opções cadastradas literalmente.