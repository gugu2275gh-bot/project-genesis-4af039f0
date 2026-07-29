## Problema

O documento existe em duas cópias e nenhuma está acessível corretamente:

- `docs/mapeamento-ficha-cliente.md` (projeto) — versão atualizada, 4.696 bytes, com todo o levantamento de `service_cases`, `service_types` e a ligação `leads → opportunities → service_cases`.
- `/mnt/documents/docs/mapeamento-ficha-cliente.md` (área de downloads) — versão **antiga**, 1.973 bytes, sem as últimas adições.

Além disso, o link de download da última resposta usou o caminho `../../dev-server/docs/...`, que é inválido: o caminho do artefato precisa ser relativo à pasta de documentos (`docs/mapeamento-ficha-cliente.md`).

## Correção

1. Copiar a versão atual de `docs/mapeamento-ficha-cliente.md` sobre `/mnt/documents/docs/mapeamento-ficha-cliente.md`, sincronizando o conteúdo completo.
2. Reemitir o link de download com o caminho correto (`docs/mapeamento-ficha-cliente.md`, tipo `text/markdown`), para que apareça no painel de arquivos gerados e possa ser baixado.
3. Conferir o tamanho/conteúdo final para garantir que a versão entregue é a completa.

Nenhuma alteração de código da aplicação é necessária.