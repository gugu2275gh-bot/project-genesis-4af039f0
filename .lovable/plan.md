## Plano

1. **Corrigir a origem do vazamento de idioma nos botões**
   - Remover a reutilização de `TWILIO_YESNO_CONTENT_SID_*` para botões Sim/Não, porque esses templates podem ter sido criados antes da localização e manter títulos em português.
   - Fazer o envio do fluxo sempre criar/reutilizar Content API por idioma + pergunta + títulos efetivos.

2. **Forçar botões do fluxo a usarem os rótulos da etapa/idioma**
   - Quando `quickReply='on'`, enviar os botões recebidos de `buttonsForStep(...)`.
   - Se for uma etapa `SIM_NAO` sem lista explícita, cair nos rótulos do idioma travado: `Sí/No`, `Yes/No`, `Oui/Non`, `Sim/Não`.

3. **Preservar fallback legado fora do fluxo visual**
   - Manter a heurística `auto` apenas para casos antigos fora do fluxo.
   - Dentro do fluxo visual, a configuração da etapa continua sendo a única autoridade para decidir se há botões.

4. **Validar com teste automatizado**
   - Adicionar teste garantindo que etapa `SIM_NAO` em espanhol gera `Sí/No`.
   - Rodar os testes das Edge Functions relacionados a quick replies/fluxo.

5. **Publicar backend**
   - Após aprovação, aplicar a correção e redeployar `whatsapp-webhook` para produção.