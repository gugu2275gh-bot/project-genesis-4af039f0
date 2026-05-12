Do I know what the issue is? Sim.

O que aconteceu às 17:26:
- Às 17:22 o cliente respondeu “Gustavo Braga” e o contato ficou correto: `contacts.full_name = Gustavo Braga` e `name_source = USER_CONFIRMED`.
- Mas a tabela persistente do funil ficou dessincronizada para esse lead: `lead_funnel_state.name_confirmed = false` e `step = nome`.
- No turno das 17:26, o webhook registrou exatamente isso nos logs: `dataKnown.name=false` e `nextStep=nome`, então o agente foi instruído a voltar para a etapa de nome.
- Ou seja: o erro não foi “o modelo esqueceu” apenas; o backend alimentou o modelo com um estado persistente errado, mesmo o contato já tendo o nome confirmado.

Por que a correção anterior não foi definitiva:
- Ela adicionou travas no prompt e testes, mas deixou uma fonte de verdade conflitante:
  - `contacts` dizia que o nome estava confirmado.
  - `lead_funnel_state` dizia que o nome não estava confirmado.
- O código carrega `lead_funnel_state` existente e não reconcilia automaticamente com `contacts` quando o contato já tem `name_source = USER_CONFIRMED`.
- A proteção final `forceSkipFullNameIfAlreadyKnown` também depende de `nameMissing`; se o turno entra com estado/contacto inconsistentes, a pergunta de nome pode escapar.

Plano de correção definitiva:

1. Tornar `contacts` a fonte soberana para nome e e-mail confirmados
- Em `loadFunnelState`, quando carregar um estado existente, reconciliar imediatamente:
  - se `contact.name_source` for `USER_CONFIRMED` ou `STAFF_EDITED`, forçar `name_confirmed = true`.
  - se `contact.email` existir, forçar `email_confirmed = true`.
- Se houver divergência, atualizar `lead_funnel_state` antes de montar o prompt da IA.

2. Usar o estado reconciliado antes da geração da IA
- Garantir que `buildStateDirective(...)` receba o estado já corrigido, não o estado antigo carregado do banco.
- Assim, o prompt passa a conter a trava rígida: “NOME já está confirmado — JAMAIS pergunte o nome novamente.”

3. Adicionar um hard guard pós-IA independente do funil
- Antes de enviar a resposta ao WhatsApp, se o contato tiver nome confirmado, remover/substituir qualquer pergunta de nome completo da resposta.
- Essa proteção não deve depender de `lead_funnel_state`; deve depender diretamente de `contacts.name_source`.
- Se e-mail ainda estiver faltando, troca pergunta de nome por e-mail; se e-mail já existir, remove a pergunta e avança para a próxima etapa segura.

4. Corrigir os registros já corrompidos
- Rodar um ajuste nos estados existentes para sincronizar `lead_funnel_state.name_confirmed` com contatos que já têm `name_source in ('USER_CONFIRMED', 'STAFF_EDITED')`.
- Fazer o mesmo para `email_confirmed` quando `contacts.email` já existe.
- Para o lead mostrado, isso deixaria `name_confirmed=true` imediatamente.

5. Criar regressões específicas para o caso Gustavo
- Teste: contato com `name_source=USER_CONFIRMED`, mas `lead_funnel_state.name_confirmed=false` deve ser reconciliado para `true`.
- Teste: resposta da IA “como é seu nome completo?” deve ser bloqueada quando o contato já tem nome confirmado.
- Teste: cenário completo `nome -> email -> localização -> empadronado=false` nunca pode retornar para `nome`.

6. Deploy e validação nos logs reais
- Rodar a suíte do `whatsapp-webhook`.
- Publicar a Edge Function `whatsapp-webhook`.
- Conferir logs: para esse lead, o próximo `[TURN]` deve mostrar `dataKnown.name=true` e nunca `nextStep=nome` quando o contato já está confirmado.

<lov-actions>
  <lov-open-history>View History</lov-open-history>
</lov-actions>

<lov-actions>
<lov-link url="https://docs.lovable.dev/tips-tricks/troubleshooting">Troubleshooting docs</lov-link>
</lov-actions>