
-- Garantir extensão pgvector
CREATE EXTENSION IF NOT EXISTS vector;

-- Adicionar coluna de embedding (OpenAI text-embedding-3-small = 1536 dim)
ALTER TABLE public.knowledge_base
  ADD COLUMN IF NOT EXISTS embedding vector(1536);

-- Índice de similaridade (cosine)
CREATE INDEX IF NOT EXISTS knowledge_base_embedding_idx
  ON public.knowledge_base
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

-- Função RPC de busca semântica
CREATE OR REPLACE FUNCTION public.match_knowledge_base(
  query_embedding vector(1536),
  match_count int DEFAULT 8,
  similarity_threshold float DEFAULT 0.3
)
RETURNS TABLE (
  id uuid,
  file_name text,
  chunk_index int,
  content text,
  similarity float
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    kb.id,
    kb.file_name,
    kb.chunk_index,
    kb.content,
    1 - (kb.embedding <=> query_embedding) AS similarity
  FROM public.knowledge_base kb
  WHERE kb.is_active = true
    AND kb.embedding IS NOT NULL
    AND 1 - (kb.embedding <=> query_embedding) > similarity_threshold
  ORDER BY kb.embedding <=> query_embedding
  LIMIT match_count;
$$;
