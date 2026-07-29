// @ts-nocheck
/**
 * Resolução do serviço de interesse contra o catálogo real (`service_types`).
 *
 * O agente nunca inventa serviço: o texto do cliente é comparado com os
 * serviços ATIVOS do catálogo. Sem correspondência clara, devolve `null` e o
 * fluxo segue sem gravar `service_type_id`.
 */

export interface ServiceTypeRow {
  id: string
  code: string | null
  name: string
  is_active?: boolean | null
}

export interface ServiceMatch {
  service_type_id: string
  code: string
  name: string
  /** Enum `service_interest` correspondente, quando houver. */
  service_interest: string | null
}

const CACHE_MS = 60_000
let cache: { at: number; rows: ServiceTypeRow[] } | null = null

export function normalizeText(value: string): string {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Palavras-chave por enum de interesse (usado para casar com o catálogo). */
const INTEREST_HINTS: Array<[RegExp, string]> = [
  [/estud|student|estudia|curso|faculdade|master|mestrado|universidad/i, 'VISTO_ESTUDANTE'],
  [/trabalh|emprego|job|work|laboral|contrato de trabajo/i, 'VISTO_TRABALHO'],
  [/reagrupa|reagrupaci|family reunif|regroupement/i, 'REAGRUPAMENTO'],
  [/renova|renew|renovaci|prorrog/i, 'RENOVACAO_RESIDENCIA'],
  [/casamento|matrimonio|marriage|c[oô]njuge|esposa|esposo|marido/i, 'NACIONALIDADE_CASAMENTO'],
  [/nacionalidade|nacionalidad|citizenship|cidadania|passaporte espanhol/i, 'NACIONALIDADE_RESIDENCIA'],
  [/comunitari|familiar europeu|eu family|parente europeu/i, 'RESIDENCIA_PARENTE_COMUNITARIO'],
  [/morar|viver|residir|residencia|residir na espanha|live in spain|vivir/i, 'RENOVACAO_RESIDENCIA'],
]

export function inferInterestEnum(text: string): string | null {
  const v = String(text || '')
  if (v.trim().length < 3) return null
  for (const [re, label] of INTEREST_HINTS) if (re.test(v)) return label
  return null
}

/** Limpa o cache do catálogo (usado em testes e após alterações). */
export function clearServiceTypeCache(): void {
  cache = null
}

export async function loadServiceTypes(supabase: any): Promise<ServiceTypeRow[]> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.rows
  try {
    const { data } = await supabase
      .from('service_types')
      .select('id, code, name, is_active')
      .eq('is_active', true)
      .order('display_order', { ascending: true })
    const rows = (data || []) as ServiceTypeRow[]
    cache = { at: Date.now(), rows }
    return rows
  } catch (e) {
    console.warn('[SERVICE_CATALOG] falha ao carregar catálogo:', e instanceof Error ? e.message : e)
    return cache?.rows || []
  }
}

/** Pontuação simples: nome/código do serviço presentes no texto do cliente. */
function scoreRow(row: ServiceTypeRow, text: string): number {
  const hay = normalizeText(text)
  const name = normalizeText(row.name)
  const code = normalizeText(row.code || '').replace(/_/g, ' ')
  let score = 0
  if (name && hay.includes(name)) score += 10
  if (code && hay.includes(code)) score += 8
  const words = name.split(' ').filter((w) => w.length >= 5)
  for (const w of words) if (hay.includes(w)) score += 2
  return score
}

/**
 * Resolve o serviço a partir do texto livre do cliente.
 * Devolve `null` quando não há correspondência confiável.
 */
export async function resolveServiceType(supabase: any, text: string): Promise<ServiceMatch | null> {
  const raw = String(text || '').trim()
  if (raw.length < 3) return null

  const rows = await loadServiceTypes(supabase)
  if (!rows.length) return null

  const scored = rows
    .map((row) => ({ row, score: scoreRow(row, raw) }))
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)

  let picked = scored[0]?.row || null

  // Sem casamento textual: tenta pelo enum de interesse inferido.
  if (!picked) {
    const enumHint = inferInterestEnum(raw)
    if (!enumHint) return null
    picked = rows.find((r) => normalizeText(r.code || '') === normalizeText(enumHint)) || null
    if (!picked) {
      const hintWords = normalizeText(enumHint).split('_').filter((w) => w.length >= 5)
      picked = rows.find((r) => hintWords.some((w) => normalizeText(r.name).includes(w))) || null
    }
    if (!picked) return null
    return {
      service_type_id: picked.id,
      code: picked.code || '',
      name: picked.name,
      service_interest: enumHint,
    }
  }

  // Empate real entre dois serviços diferentes: não escolhe por conta própria.
  if (scored.length > 1 && scored[1].score === scored[0].score) return null

  return {
    service_type_id: picked.id,
    code: picked.code || '',
    name: picked.name,
    service_interest: inferInterestEnum(`${picked.name} ${picked.code || ''} ${raw}`),
  }
}
