// @ts-nocheck
/**
 * Runtime do "agente em producao" (AGENTE 1.0).
 *
 * Carrega, por requisicao, o agente marcado com `is_production = true` na tabela
 * `ai_agents` e disponibiliza:
 *  - textos do roteiro por idioma (tabela `ai_agent_texts`)
 *  - prompt estruturado (`prompt_flow`) e diretrizes adicionais (`prompt_base`)
 *  - cascata de modelos (`model_cascade`)
 *  - toggles de runtime (`runtime_config`)
 *
 * TUDO e opcional: quando nao existe agente de producao (ou o campo esta vazio),
 * o comportamento atual em codigo continua valendo como fallback.
 */

export type ChatLanguage = 'pt-BR' | 'es' | 'en' | 'fr'

export interface AgentRuntime {
  id: string
  name: string
  promptFlow: string
  promptBase: string
  modelCascade: Array<{ provider: string; model: string; order?: number }>
  runtimeConfig: Record<string, unknown>
  texts: Record<string, Partial<Record<ChatLanguage, string>>>
  /** Fluxos visuais configurados no agente (quando houver). */
  flowIds: { pre_handoff: string | null; handoff: string | null; legacy: string | null }
}


let RUNTIME: AgentRuntime | null = null

export function setAgentRuntime(runtime: AgentRuntime | null): void {
  RUNTIME = runtime
}

export function getAgentRuntime(): AgentRuntime | null {
  return RUNTIME
}

export function clearAgentRuntime(): void {
  RUNTIME = null
}

/** Retorna o texto customizado do agente de producao ou o fallback do codigo. */
export function t(key: string, language: ChatLanguage, fallback: string): string {
  const value = RUNTIME?.texts?.[key]?.[language]
  if (typeof value === 'string' && value.trim()) return value
  return fallback
}

/** Todas as variantes (idiomas) customizadas para uma chave — usado por detectores. */
export function textVariants(key: string): string[] {
  const entry = RUNTIME?.texts?.[key]
  if (!entry) return []
  return Object.values(entry).filter((v) => typeof v === 'string' && v.trim()) as string[]
}

/**
 * Chaves de texto editaveis na tela do agente.
 * `group` e usado apenas para organizar a interface.
 */
export const AGENT_TEXT_KEYS: Array<{ key: string; label: string; group: string }> = [
  { key: 'opening.line1', label: 'Saudação (1ª mensagem)', group: 'Abertura' },
  { key: 'opening.line2', label: 'Saudação (2ª mensagem / pergunta de nome)', group: 'Abertura' },
  { key: 'opening.askName', label: 'Pergunta de nome completo', group: 'Abertura' },
  { key: 'opening.thanksThenAskEmail', label: 'Agradecimento + pergunta de e-mail', group: 'Abertura' },
  { key: 'opening.interestQuestion', label: 'Pergunta de interesse', group: 'Abertura' },
  { key: 'opening.servicesCatalog', label: 'Catálogo de serviços (prompt)', group: 'Abertura' },
  { key: 'opening.oneMomentPlease', label: 'Reconhecimento de dúvida ("já te explico")', group: 'Abertura' },
  { key: 'opening.askLocationSpain', label: 'Pergunta de localização (prompt)', group: 'Abertura' },
  { key: 'opening.outsideIntro', label: 'Introdução — fora da Espanha', group: 'Abertura' },
  { key: 'opening.insideIntro', label: 'Introdução — dentro da Espanha', group: 'Abertura' },

  { key: 'name.reask', label: 'Repergunta de nome completo', group: 'Nome' },
  { key: 'name.requiredReask', label: 'Repergunta obrigatória de nome completo', group: 'Nome' },

  { key: 'email.question', label: 'Pergunta de e-mail', group: 'E-mail (inativo no fluxo)' },
  { key: 'email.reask', label: 'Repergunta de e-mail', group: 'E-mail (inativo no fluxo)' },
  { key: 'email.requiredReask', label: 'Repergunta obrigatória de e-mail', group: 'E-mail (inativo no fluxo)' },

  { key: 'location.question', label: 'Pergunta "Hoje você já está na Espanha?"', group: 'Localização' },
  { key: 'location.requiredReask', label: 'Repergunta obrigatória de localização', group: 'Localização' },
  { key: 'services.offered', label: 'Mensagem de serviços atendidos', group: 'Localização' },

  { key: 'inside.entryDate', label: 'Data exata de entrada na Espanha', group: 'Dentro da Espanha' },
  { key: 'inside.entryDateNeedsYear', label: 'Data incompleta (falta o ano)', group: 'Dentro da Espanha' },
  { key: 'inside.empadronado', label: 'Está empadronado?', group: 'Dentro da Espanha' },
  { key: 'inside.empadronadoSince', label: 'Desde quando está empadronado?', group: 'Dentro da Espanha' },
  { key: 'inside.empadronadoCity', label: 'Em qual cidade foi empadronado?', group: 'Dentro da Espanha' },
  { key: 'inside.invalidCity', label: 'Cidade espanhola não reconhecida', group: 'Dentro da Espanha' },

  { key: 'outside.age', label: 'Qual sua idade?', group: 'Fora da Espanha' },
  { key: 'outside.europe6m', label: 'Esteve na Europa nos últimos 6 meses?', group: 'Fora da Espanha' },
  { key: 'outside.euFamily', label: 'Possui familiar europeu/residente?', group: 'Fora da Espanha' },
  { key: 'outside.remoteWork', label: 'Trabalha remoto?', group: 'Fora da Espanha' },
  { key: 'outside.yesNoReaskPrefix', label: 'Prefixo de repergunta Sim/Não', group: 'Fora da Espanha' },

  { key: 'handoff.preSummary', label: 'Pré-handoff (H1 ||| H2)', group: 'Handoff' },
  { key: 'handoff.transfer', label: 'Handoff (H3)', group: 'Handoff' },
  { key: 'handoff.postWaitSuffix', label: 'Sufixo pós-handoff', group: 'Handoff' },

  { key: 'system.transientError', label: 'Erro temporário de resposta', group: 'Sistema' },
]

const EMPTY_CASCADE: AgentRuntime['modelCascade'] = []

/**
 * Monta o prompt do fluxo. Quando o agente tem blocos editaveis
 * (`prompt_blocks`), eles sao remontados na ordem salva; caso contrario usa o
 * texto unico de `prompt_flow`.
 */
function composePromptFlow(agent: any): string {
  const blocks = agent?.prompt_blocks
  if (Array.isArray(blocks) && blocks.length > 0) {
    const composed = blocks
      .filter((b: any) => b && (String(b.content || '').trim() || String(b.title || '').trim()))
      .map((b: any, i: number) => {
        const content = String(b.content || '').trim()
        const title = String(b.title || '').trim()
        if (i === 0 && title === 'IDENTIDADE DO AGENTE') return content
        return `## ${title}\n${content}`
      })
      .join('\n\n')
      .trim()
    if (composed) return composed
  }
  return typeof agent?.prompt_flow === 'string' ? agent.prompt_flow : ''
}

/**
 * Carrega o agente de producao do banco. Nunca lanca: qualquer falha mantem o
 * comportamento atual (fallback em codigo).
 */
export async function loadProductionAgentRuntime(supabase: any): Promise<AgentRuntime | null> {
  try {
    // Cache de 60s: `ai_agents` + `ai_agent_texts` mudam raramente e eram
    // relidos a cada mensagem recebida (2 roundtrips por turno).
    const cachedRuntime = await cached<AgentRuntime | null>('agent-runtime:production', 60_000, async () => {
      return await fetchProductionAgentRuntime(supabase)
    })
    setAgentRuntime(cachedRuntime)
    return cachedRuntime
  } catch (e) {
    console.warn('[AGENT_RUNTIME] falha ao carregar agente de producao (usando fallback):', e instanceof Error ? e.message : e)
    setAgentRuntime(null)
    return null
  }
}

async function fetchProductionAgentRuntime(supabase: any): Promise<AgentRuntime | null> {
  try {
    const { data: agent, error } = await supabase
      .from('ai_agents')
      .select('id, name, prompt_base, prompt_flow, prompt_blocks, model_cascade, runtime_config, status, is_production, flow_id, pre_handoff_flow_id, handoff_flow_id')
      .eq('is_production', true)
      .maybeSingle()


    if (error || !agent) {
      setAgentRuntime(null)
      return null
    }
    if (agent.status === 'INATIVO') {
      setAgentRuntime(null)
      return null
    }

    const { data: rows } = await supabase
      .from('ai_agent_texts')
      .select('text_key, translations')
      .eq('agent_id', agent.id)

    const texts: AgentRuntime['texts'] = {}
    for (const row of rows || []) {
      if (row?.text_key && row.translations && typeof row.translations === 'object') {
        texts[row.text_key] = row.translations
      }
    }

    const runtime: AgentRuntime = {
      id: agent.id,
      name: agent.name,
      promptFlow: composePromptFlow(agent),
      promptBase: typeof agent.prompt_base === 'string' ? agent.prompt_base : '',
      modelCascade: Array.isArray(agent.model_cascade) ? agent.model_cascade : EMPTY_CASCADE,
      runtimeConfig: (agent.runtime_config && typeof agent.runtime_config === 'object') ? agent.runtime_config : {},
      texts,
      flowIds: {
        pre_handoff: agent.pre_handoff_flow_id || null,
        handoff: agent.handoff_flow_id || null,
        legacy: agent.flow_id || null,
      },
    }
    setAgentRuntime(runtime)
    return runtime
  } catch (e) {
    console.warn('[AGENT_RUNTIME] falha ao carregar agente de producao (usando fallback):', e instanceof Error ? e.message : e)
    setAgentRuntime(null)
    return null
  }
}
