// Montagem do prompt final do agente.
// Modular de propósito: no futuro o mesmo builder poderá ser usado pelo atendimento real.

export interface AgentBehavior {
  personality?: string
  tone?: string
  allowed_languages?: string[]
  required_rules?: string[]
  forbidden_rules?: string[]
  forbidden_information?: string[]
  on_unknown?: string
  on_off_topic?: string
  on_handoff?: string
}

export interface AgentCapabilities {
  answer_questions?: boolean
  use_knowledge_base?: boolean
  use_rag?: boolean
  ask_questions?: boolean
  run_structured_flow?: boolean
  handoff_to_human?: boolean
}

export interface AgentConfig {
  name: string
  description?: string | null
  default_language?: string
  prompt_base?: string
  prompt_behavior?: string
  fallback_message?: string
  handoff_message?: string
  behavior?: AgentBehavior | null
  capabilities?: AgentCapabilities | null
}

export interface FlowStep {
  step_code: string
  name: string
  description?: string | null
  message?: string | null
  answer_type?: string | null
  next_step_code?: string | null
  allow_parallel_question?: boolean
  allow_free_answer?: boolean
  handoff?: boolean
  order_index?: number
}

function list(title: string, items?: string[] | null): string {
  const clean = (items || []).map((i) => String(i).trim()).filter(Boolean)
  if (!clean.length) return ''
  return `\n${title}:\n${clean.map((i) => `- ${i}`).join('\n')}`
}

export function buildFlowSection(steps: FlowStep[]): string {
  if (!steps.length) return ''
  const lines = steps
    .slice()
    .sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0))
    .map((s) => {
      const parts = [
        `[${s.step_code}] ${s.name}`,
        s.description ? `  Descrição: ${s.description}` : '',
        s.message ? `  Mensagem ao cliente: ${s.message}` : '',
        s.answer_type ? `  Tipo de resposta esperada: ${s.answer_type}` : '',
        s.next_step_code ? `  Próxima etapa: ${s.next_step_code}` : '',
        s.allow_parallel_question === false ? '  Não aceitar pergunta paralela.' : '',
        s.allow_free_answer === false ? '  Não aceitar resposta livre.' : '',
        s.handoff ? '  Esta etapa encaminha para atendimento humano.' : '',
      ].filter(Boolean)
      return parts.join('\n')
    })
  return `\n\n## FLUXO DE ATENDIMENTO\nSiga as etapas na ordem indicada:\n${lines.join('\n\n')}`
}

export function buildSystemPrompt(agent: AgentConfig, steps: FlowStep[] = []): string {
  const b = agent.behavior || {}
  const c = agent.capabilities || {}

  const sections: string[] = []

  sections.push(`## IDENTIDADE\nVocê é "${agent.name}".${agent.description ? ` ${agent.description}` : ''}`)

  if (agent.prompt_base?.trim()) sections.push(`## PROMPT BASE\n${agent.prompt_base.trim()}`)

  const behaviorLines = [
    b.personality ? `Personalidade: ${b.personality}` : '',
    b.tone ? `Tom de voz: ${b.tone}` : '',
    b.allowed_languages?.length ? `Idiomas permitidos: ${b.allowed_languages.join(', ')}` : '',
    agent.default_language ? `Idioma padrão: ${agent.default_language}` : '',
  ].filter(Boolean)
  const behaviorBlock =
    behaviorLines.join('\n') +
    list('Regras obrigatórias', b.required_rules) +
    list('Regras proibidas', b.forbidden_rules) +
    list('Informações que você NUNCA pode fornecer', b.forbidden_information) +
    (b.on_unknown ? `\nQuando não souber responder: ${b.on_unknown}` : '') +
    (b.on_off_topic ? `\nQuando o cliente fugir do assunto: ${b.on_off_topic}` : '') +
    (b.on_handoff ? `\nQuando encaminhar para humano: ${b.on_handoff}` : '')
  if (behaviorBlock.trim()) sections.push(`## COMPORTAMENTO\n${behaviorBlock.trim()}`)

  if (agent.prompt_behavior?.trim())
    sections.push(`## INSTRUÇÕES ADICIONAIS DE COMPORTAMENTO\n${agent.prompt_behavior.trim()}`)

  const caps = [
    c.answer_questions ? 'responder perguntas' : '',
    c.use_knowledge_base ? 'consultar a base de conhecimento' : '',
    c.use_rag ? 'utilizar RAG' : '',
    c.ask_questions ? 'fazer perguntas ao cliente' : '',
    c.run_structured_flow ? 'executar o fluxo estruturado' : '',
    c.handoff_to_human ? 'encaminhar para atendimento humano' : '',
  ].filter(Boolean)
  if (caps.length) sections.push(`## CAPACIDADES PERMITIDAS\nVocê pode: ${caps.join('; ')}.`)

  if (c.run_structured_flow) {
    const flow = buildFlowSection(steps)
    if (flow) sections.push(flow.trim())
  }

  const msgs = [
    agent.fallback_message ? `Mensagem de fallback: "${agent.fallback_message}"` : '',
    agent.handoff_message ? `Mensagem de encaminhamento para humano: "${agent.handoff_message}"` : '',
  ].filter(Boolean)
  if (msgs.length) sections.push(`## MENSAGENS PADRÃO\n${msgs.join('\n')}`)

  return sections.join('\n\n')
}
