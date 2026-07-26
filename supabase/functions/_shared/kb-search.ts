// @ts-nocheck
/**
 * Busca léxica simples na base de conhecimento, usada pela checagem de
 * respostas por etapa (fluxo visual) e pelo simulador.
 *
 * O atendimento de produção pode injetar uma busca mais rica (híbrida);
 * esta versão é autocontida para funcionar em qualquer edge function.
 */

function normalize(text: string): string {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export async function searchKnowledgeBase(
  supabase: any,
  query: string,
  limit = 6,
): Promise<string> {
  const q = normalize(query)
  if (!q) return ''

  try {
    const { data, error } = await supabase
      .from('knowledge_base')
      .select('content, file_name, chunk_index')
      .eq('is_active', true)
      .limit(400)
    if (error || !data?.length) return ''

    const words = q.split(' ').filter((w) => w.length > 2)
    const scored = data
      .map((row: any) => {
        const content = normalize(row.content)
        const file = normalize(row.file_name || '')
        let score = 0
        for (const w of words) {
          if (file.includes(w)) score += 3
          if (content.includes(w)) score += 1
        }
        if (content.includes(q)) score += 5
        return { row, score }
      })
      .filter((s: any) => s.score > 0)
      .sort((a: any, b: any) => b.score - a.score)
      .slice(0, limit)

    return scored
      .map(({ row }: any) => `[${row.file_name} | ${row.chunk_index}]\n${row.content}`)
      .join('\n\n')
      .slice(0, 3000)
  } catch (e) {
    console.warn('[KB_SEARCH] falha:', e instanceof Error ? e.message : e)
    return ''
  }
}
