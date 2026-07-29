// @ts-nocheck
/**
 * Variáveis nas falas do agente ({nome}, {cidade}, {objetivo}, {idade}…) e
 * equivalência entre nomes de campo (`field_mapping`).
 *
 * Duas necessidades resolvidas aqui:
 *
 * 1. O editor permite escrever "Olá, {nome}!" em qualquer etapa. Sem uma camada
 *    de substituição o texto saía literal para o cliente.
 * 2. A extração da 1ª mensagem e as etapas do fluxo podem usar nomes diferentes
 *    para o MESMO dado (ex.: `outside.eu_family` x `contact.has_eu_family_member`).
 *    Sem os apelidos o aproveitamento silenciosamente não casava.
 */

import { inferFieldMapping, type FlowStep, type FlowTurnResult } from './flow-engine.ts'

/** Campos equivalentes: qualquer um serve para responder o outro. */
export const FIELD_ALIAS_GROUPS: string[][] = [
  ['outside.eu_family', 'contact.has_eu_family_member'],
  ['outside.europe_6m', 'contact.eu_entry_last_6_months'],
  ['outside.remote_work', 'contact.works_remotely'],
  ['outside.age', 'contact.age'],
  ['funnel.empadronado_city', 'contact.empadronamiento_city', 'contact.city'],
  ['funnel.empadronado_confirmed', 'contact.is_empadronado'],
  ['funnel.entry_date_confirmed', 'contact.spain_arrival_date'],
  ['funnel.location_known', 'contact.is_in_spain'],
  ['funnel.interest_confirmed', 'lead.service_interest'],
  ['contact.residence_country', 'outside.residence_country', 'contact.country_of_origin'],
]

const ALIAS_INDEX = new Map<string, string[]>()
for (const group of FIELD_ALIAS_GROUPS) {
  for (const field of group) ALIAS_INDEX.set(field, group)
}

/** O próprio campo mais todos os equivalentes conhecidos. */
export function aliasesOf(field: string): string[] {
  const key = String(field || '').trim()
  if (!key) return []
  const group = ALIAS_INDEX.get(key)
  return group ? [key, ...group.filter((f) => f !== key)] : [key]
}

/** Valor de um campo considerando os equivalentes. */
export function pickFieldValue(values: Record<string, string>, field: string): string {
  for (const key of aliasesOf(field)) {
    const v = String(values?.[key] ?? '').trim()
    if (v) return v
  }
  return ''
}

/** `true` quando o campo (ou um equivalente) está na lista permitida. */
export function fieldAllowed(allowed: Set<string>, field: string): boolean {
  if (!allowed || !allowed.size) return true
  return aliasesOf(field).some((f) => allowed.has(f))
}

// ---------------------------------------------------------------------------
// Variáveis das mensagens

/** Variáveis reconhecidas nas mensagens, com os apelidos por idioma. */
export const MESSAGE_VARIABLES: { key: string; aliases: string[]; label: string; field: string }[] = [
  { key: 'nome', aliases: ['nome', 'name', 'nombre', 'prenom'], label: 'Primeiro nome do cliente', field: 'contact.full_name' },
  { key: 'cidade', aliases: ['cidade', 'ciudad', 'city', 'ville'], label: 'Cidade onde mora', field: 'funnel.empadronado_city' },
  { key: 'objetivo', aliases: ['objetivo', 'objective', 'goal', 'intencao', 'intención'], label: 'Objetivo / serviço de interesse', field: 'funnel.interest_confirmed' },
  { key: 'idade', aliases: ['idade', 'edad', 'age'], label: 'Idade', field: 'outside.age' },
  { key: 'pais', aliases: ['pais', 'país', 'country', 'pays'], label: 'País onde mora', field: 'contact.residence_country' },
  { key: 'email', aliases: ['email', 'e-mail', 'correo'], label: 'E-mail', field: 'contact.email' },
]

const ALIAS_TO_KEY = new Map<string, string>()
for (const v of MESSAGE_VARIABLES) {
  for (const a of v.aliases) ALIAS_TO_KEY.set(a.toLowerCase(), v.key)
}

function firstName(full: string): string {
  return String(full || '').trim().split(/\s+/)[0] || ''
}

/** Respostas do fluxo (`step_code -> valor`) convertidas em `campo -> valor`. */
export function fieldValuesFromAnswers(
  steps: FlowStep[],
  answers: Record<string, string> = {},
): Record<string, string> {
  const out: Record<string, string> = {}
  for (const step of steps || []) {
    const value = String(answers?.[step.step_code] ?? '').trim()
    if (!value) continue
    const field = inferFieldMapping(step)
    if (!field) continue
    out[field] = value
  }
  return out
}

/** Monta o dicionário de variáveis a partir dos dados já conhecidos. */
export function buildFlowVars(
  fieldValues: Record<string, string> = {},
  extra: { profileName?: string | null } = {},
): Record<string, string> {
  const vars: Record<string, string> = {}
  for (const v of MESSAGE_VARIABLES) {
    const value = pickFieldValue(fieldValues, v.field)
    if (value) vars[v.key] = value
  }
  if (!vars.nome && extra.profileName) vars.nome = String(extra.profileName).trim()
  if (vars.nome) vars.nome = firstName(vars.nome)
  return vars
}

const VAR_RE = /\{\s*([a-zA-Zà-úÀ-Ú_-]{2,20})\s*\}/g

/**
 * Substitui as variáveis no texto. Variável sem valor vira vazio e a frase é
 * limpa (ex.: "Olá, {nome}!" → "Olá!") — nunca sai `{nome}` para o cliente.
 */
export function applyVars(text: string, vars: Record<string, string> = {}): string {
  const raw = String(text || '')
  if (!raw || !raw.includes('{')) return raw
  let touched = false
  const replaced = raw.replace(VAR_RE, (match, name) => {
    const key = ALIAS_TO_KEY.get(String(name).toLowerCase())
    if (!key) return match // não é variável conhecida: preserva
    touched = true
    return String(vars[key] ?? '').trim()
  })
  if (!touched) return raw
  return replaced
    .replace(/[ \t]*,[ \t]*([!?.,;:])/g, '$1')
    .replace(/[ \t]+([!?.,;:])/g, '$1')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/[ \t]+$/gm, '')
    .trim()
}

/** Aplica as variáveis em todas as mensagens de saída do turno. */
export function applyVarsToTurn(
  turn: FlowTurnResult,
  vars: Record<string, string> = {},
): FlowTurnResult {
  if (!turn) return turn
  const outbound = Array.isArray(turn.outbound) ? turn.outbound : []
  if (!outbound.length) return turn
  const next = outbound.map((item: any) => ({ ...item, text: applyVars(item?.text || '', vars) }))
  return { ...turn, outbound: next, messages: next.map((m: any) => m.text) }
}

/** Variáveis usadas num texto (para avisos no editor). */
export function variablesUsed(text: string): string[] {
  const out = new Set<string>()
  for (const m of String(text || '').matchAll(VAR_RE)) {
    const key = ALIAS_TO_KEY.get(String(m[1]).toLowerCase())
    if (key) out.add(key)
  }
  return [...out]
}
