Diagnóstico do caso Pedro Henrique:

- O webhook está recebendo as mensagens, mas registrando como `REPLIED` com `parts: 0` e `response_chars: 0`.
- Isso significa que a função considera que respondeu, mas nenhuma bolha foi enviada ao WhatsApp.
- A causa direta é o deduplicador final: ele remove a pergunta repetida `¿Estás en España?` porque ela já tinha sido enviada recentemente, e como não sobra nenhuma mensagem, o turno termina “com sucesso” sem envio.
- O watchdog tentou recuperar, mas reexecutou o mesmo fluxo e caiu no mesmo `parts: 0`, então também não resolveu.
- Há ainda um problema secundário: a resposta curta `Sí` à pergunta `¿Estás en España?` não atualizou `location_known`, porque o detector de pergunta de localização não reconhece a forma curta `¿Estás en España?`.
- Também há pressão de quota nos modelos Gemini, mas o fallback OpenAI está funcionando; não é a causa principal deste travamento.

Plano de correção:

1. Ampliar o detector de pergunta de localização
   - Reconhecer `¿Estás en España?`, `Está na Espanha?`, `In Spain?`, e variações curtas.
   - Assim, respostas como `Sí` gravam `location_known = 'spain'` imediatamente.

2. Ajustar o deduplicador final para nunca retornar mensagem vazia durante o gate
   - Se todos os chunks forem removidos como duplicados, gerar a próxima pergunta canônica pendente em vez de retornar string vazia.
   - Para o caso atual, isso evitaria `parts: 0` e enviaria a pergunta correta do próximo passo.

3. Adicionar uma rede de segurança antes do envio
   - Após limpar/deduplicar a resposta, se `parts.length === 0`, não registrar como `REPLIED`.
   - Gerar fallback determinístico baseado no estado do funil e enviar esse fallback.
   - Se mesmo assim não houver texto, registrar como erro recuperável (`AI_FAILED`/`EMPTY_RESPONSE`) para o watchdog conseguir agir de verdade.

4. Melhorar o watchdog
   - Tratar `REPLIED` com `response_chars = 0` ou `details.parts = 0` como falha, não como recuperação.
   - Assim ele não marcará recuperação falsa quando nada foi enviado.

5. Validar com um teste específico
   - Simular o fluxo: bot pergunta `¿Estás en España?`, cliente responde `Sí`, depois `Hola?`.
   - Confirmar que o estado vira `location_known = spain` e que o bot envia a próxima pergunta em vez de ficar mudo.