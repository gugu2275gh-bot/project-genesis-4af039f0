## Diagnóstico

**1. O arquivo "OK - Estancia por estudos.pdf" FOI indexado, mas seu conteúdo de imagens NÃO foi.**

Verifiquei a `knowledge_base`:
- O arquivo está ativo, com 3 chunks (~4.240 caracteres extraídos).
- Os 3 chunks contêm apenas o **texto puro** do PDF: introdução, perfil, requisitos, etapas, prazos e um FAQ curto. Nenhum dos chunks menciona "90 días", "fuera de España", "ausencia" ou "tiempo de residencia desde la fecha de la concesión".
- A informação que o usuário menciona ("imagem 2 do arquivo") provavelmente está dentro de um **screenshot / imagem embutida no PDF** (ex.: tabela ou recorte de FAQ), não no texto digital.

**2. Por que a imagem não foi lida:**
A função `process-knowledge-pdf` (linha 229-340) funciona em duas etapas:
1. Extração básica do text-layer do PDF (regex sobre streams).
2. **Fallback** para OpenAI (`gpt-4.1-mini` / `gpt-4o-mini`) **somente** se a extração básica falhar (`< MIN_EXTRACTED_TEXT_LENGTH` ou padrão "unable to extract").

Como o PDF do Estancia por Estudios tem texto digital suficiente (>4 mil chars), a etapa 1 deu certo e o fallback de OpenAI (que faria OCR/visão dentro das imagens) **nunca rodou**. Resultado: tudo que está dentro de imagens/screenshots dentro do PDF ficou de fora do índice.

**3. Por que a IA respondeu sobre "Larga Duración":**
A pergunta semântica do Pedro ("permanecer fuera de España por mas de 90 días consecutivos") tem alta similaridade com o chunk de **OK - LARGA DURACION.pdf**, que literalmente contém a regra de "6 meses consecutivos / 10 meses no total em 5 anos". Como o KB do Estancia por Estudios não tem nenhuma menção a esse tema, o `match_knowledge_base` retornou o conteúdo correto disponível — mas não o que o usuário esperava (que estava só na imagem).

## Plano para corrigir

### Passo 1 — Reprocessar o PDF com OCR forçado
Adicionar parâmetro `force_ocr` no `process-knowledge-pdf` que ignora a extração básica e vai direto para o OpenAI Vision (`gpt-4.1-mini` com `input_file` PDF). Reprocessar "OK - Estancia por estudos.pdf" com essa flag — o gpt-4.1-mini lê PDFs com imagens nativamente e devolve o texto das figuras.

### Passo 2 — Detecção automática de "PDF com imagens relevantes"
Após a extração básica, se o PDF tiver mais de N páginas com objetos `/Image` em relação ao tamanho do texto extraído (heurística: razão `bytes_imagens / chars_texto` acima de um limiar), rodar **adicionalmente** o OpenAI Vision e concatenar o resultado ao texto básico antes de chunkar. Isso evita perder conteúdo em imagens em qualquer PDF futuro, sem precisar de ação manual.

### Passo 3 — Botão "Reprocessar com OCR" na UI da KB
Na tela de gerenciamento da Base de Conhecimento (Configurações → Base de Conhecimento), adicionar ação por linha "Reprocessar com OCR" que chama o endpoint com `force_ocr=true`. Útil para qualquer PDF que o ADMIN suspeite estar perdendo conteúdo visual.

### Passo 4 — Reprocessar lote inicial
Rodar `force_ocr=true` para todos os PDFs `OK - *.pdf` da KB (são ~50 arquivos) para garantir que nenhum conteúdo de imagem fique de fora. Custo estimado: ~50 chamadas OpenAI Vision (~US$ 0,02 cada).

## Detalhes técnicos

- Arquivos a editar:
  - `supabase/functions/process-knowledge-pdf/index.ts` — adicionar `force_ocr` no body e heurística de detecção de imagens.
  - `src/pages/settings/KnowledgeBase.tsx` (ou equivalente) — botão "Reprocessar com OCR".
- Modelo: manter `gpt-4.1-mini` como primário no Vision (já configurado), com fallback `gpt-4o-mini`.
- Logs: adicionar `[KB-PROCESS] force_ocr=true → vision retornou X chars adicionais` para rastreabilidade.
- Sem mudanças de schema na `knowledge_base`.

## Resposta direta à sua pergunta

Sim, o "OK - Estancia por estudos.pdf" foi consultado (está indexado e ativo), mas a **imagem 2 do arquivo nunca chegou ao índice** porque o extrator só faz OCR quando o text-layer falha. Como o PDF tem texto digital, o conteúdo visual foi ignorado — por isso a IA respondeu com base no que sabia (Larga Duración), e não com o que está na imagem.