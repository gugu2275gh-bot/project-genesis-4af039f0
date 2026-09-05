# Modo Manutenção

Nova opção em Configurações, visível apenas para rvbarros@gmail.com, que coloca o sistema em manutenção.

## Comportamento

Desligado: nada muda, sistema funciona normalmente.

Ligado:
- Todos os usuários conectados são desconectados automaticamente (em poucos segundos), exceto rvbarros@gmail.com.
- A tela de login passa a exibir, dentro do mesmo card, apenas o aviso em letras grandes: **SISTEMA EM MANUTENÇÃO** (sem campos de e-mail/senha).
- Acesso de emergência: clicar 5 vezes no logo "CB Asesoria" revela o formulário de login normal, para que rvbarros@gmail.com possa entrar e desligar o modo.

## Onde fica

Configurações → aba Sistema: um cartão "Modo Manutenção" com uma chave liga/desliga e uma confirmação antes de ativar. O cartão só aparece para rvbarros@gmail.com; para os demais é como se não existisse.

## Detalhes técnicos

- Chave `maintenance_mode` na tabela `system_config` (valor 'true'/'false').
- Migração: política de leitura pública (anon + authenticated) apenas para a linha `key = 'maintenance_mode'`, com o GRANT de leitura correspondente para `anon`; escrita dessa linha permitida somente quando `auth.jwt() ->> 'email' = 'rvbarros@gmail.com'`. As demais linhas de `system_config` mantêm as regras atuais.
- Hook `useMaintenanceMode`: lê a chave, expõe `isEnabled` e a mutação de atualização; realtime na tabela + polling de 30s como reforço.
- `AuthContext`: ao detectar `maintenance_mode = true` e e-mail diferente de rvbarros@gmail.com, executa `signOut()` e redireciona para /auth.
- `src/pages/Auth.tsx`: quando a flag está ativa e o "destravamento" pelo logo não foi acionado, renderiza no card o aviso grande em vez do formulário; contador de cliques no logo em estado local (não persistido).
- `src/pages/settings/SystemSettings.tsx`: novo cartão condicionado a `user?.email === 'rvbarros@gmail.com'`.
