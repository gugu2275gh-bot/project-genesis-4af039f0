// @ts-nocheck
/**
 * Aproveitamento da PRIMEIRA mensagem do cliente no fluxo pré-handoff.
 *
 * Extrai da frase inicial os dados que já respondem etapas do fluxo
 * (nome, se está na Espanha, intenção, data de chegada, empadronamento…),
 * converte para respostas de etapa (via `field_mapping`) e monta a saudação
 * humana que reconhece o que a pessoa já contou.
 *
 * Módulo PURO: a chamada ao LLM é injetada pelo chamador (`callLLM`).
 */

import {
  generalCaptureOf,
  inferFieldMapping,
  prependMessage,
  stepKindOf,
  validateAnswer,
  type FlowLang,
  type FlowStep,
  type FlowTurnResult,
} from './flow-engine.ts'
import { fieldAllowed, pickFieldValue } from './flow-vars.ts'
import { checkBirthDate } from './flow-birthdate.ts'
import { normalizeYesNo } from './flow-required.ts'


export interface IntakeExtraction {
  full_name?: string | null
  email?: string | null
  /** 'sim' | 'nao' */
  in_spain?: string | null
  intent?: string | null
  arrival_date?: string | null
  arrival_days_ago?: number | null
  empadronado?: string | null
  empadronado_city?: string | null
  /** Idade em anos. */
  age?: number | string | null
  /** Data de nascimento em DD/MM/AAAA, exatamente como dita pelo cliente. */
  birth_date?: string | null
  /** Cidade onde a pessoa mora hoje. */
  city?: string | null
  /** País onde a pessoa mora hoje (parte do endereço residencial). */
  residence_country?: string | null
  /** 'sim' | 'nao' — possui formação superior. */
  education_superior?: string | null
  /** 'sim' | 'nao' — possui familiar europeu. */
  eu_family?: string | null
  /** 'sim' | 'nao' — esteve na Europa nos últimos 6 meses. */
  europe_6m?: string | null
  confidence?: Record<string, number>
}

/** Dados que a IA sabe interpretar, com o campo do CRM usado por padrão. */
export const CAPTURE_SOURCES: { source: string; default_target: string }[] = [
  { source: 'full_name', default_target: 'contact.full_name' },
  { source: 'email', default_target: 'contact.email' },
  { source: 'in_spain', default_target: 'funnel.location_known' },
  { source: 'intent', default_target: 'funnel.interest_confirmed' },
  { source: 'arrival_date', default_target: 'funnel.entry_date_confirmed' },
  { source: 'empadronado', default_target: 'funnel.empadronado_confirmed' },
  { source: 'empadronado_city', default_target: 'funnel.empadronado_city' },
  { source: 'age', default_target: 'outside.age' },
  { source: 'birth_date', default_target: 'contact.birth_date' },
  { source: 'city', default_target: 'funnel.empadronado_city' },
  { source: 'residence_country', default_target: 'contact.residence_country' },
  { source: 'education_superior', default_target: 'contact.education_level' },
  { source: 'eu_family', default_target: 'contact.has_eu_family_member' },
  { source: 'europe_6m', default_target: 'contact.eu_entry_last_6_months' },
]


export interface IntakeConfig {
  enabled: boolean
  /** field_mappings que podem ser aproveitados (vazio = todos). */
  fields: string[]
  /** Confiança mínima (0..1) para aceitar um dado extraído. */
  min_confidence: number
  /** Saudação usada quando nada foi aproveitado. */
  greeting_default: Record<string, string>
  /** Saudação usada quando houve aproveitamento ({nome}, {resumo}). */
  greeting_personalized: Record<string, string>
  /** Frase curta de reconhecimento humano ({nome}). */
  ack_message: Record<string, string>
}

export const DEFAULT_INTAKE_CONFIG: IntakeConfig = {
  enabled: false,
  fields: [],
  min_confidence: 0.7,
  greeting_default: {},
  greeting_personalized: {
    'pt-BR': 'Olá, {nome}! 😊 Sou a assistente virtual da CB Asesoria. {resumo} Vou continuar de onde você parou.',
    es: '¡Hola, {nome}! 😊 Soy la asistente virtual de CB Asesoria. {resumo} Sigo desde donde te quedaste.',
    en: 'Hi, {nome}! 😊 I am CB Asesoria’s virtual assistant. {resumo} Let’s continue from there.',
    fr: 'Bonjour, {nome} ! 😊 Je suis l’assistante virtuelle de CB Asesoria. {resumo} Continuons à partir de là.',
  },
  ack_message: {
    'pt-BR': 'Perfeito, obrigada!',
    es: '¡Perfecto, gracias!',
    en: 'Perfect, thank you!',
    fr: 'Parfait, merci !',
  },
}

export function normalizeIntakeConfig(raw: unknown): IntakeConfig {
  const v = (raw && typeof raw === 'object' ? raw : {}) as Partial<IntakeConfig>
  const conf = Number(v.min_confidence)
  return {
    enabled: v.enabled === true,
    fields: Array.isArray(v.fields) ? v.fields.map((f) => String(f || '')).filter(Boolean) : [],
    min_confidence: Number.isFinite(conf) ? Math.min(1, Math.max(0, conf)) : DEFAULT_INTAKE_CONFIG.min_confidence,
    greeting_default: (v.greeting_default && typeof v.greeting_default === 'object' ? v.greeting_default : {}) as Record<string, string>,
    greeting_personalized: (v.greeting_personalized && typeof v.greeting_personalized === 'object' && Object.keys(v.greeting_personalized).length
      ? v.greeting_personalized
      : DEFAULT_INTAKE_CONFIG.greeting_personalized) as Record<string, string>,
    ack_message: (v.ack_message && typeof v.ack_message === 'object' && Object.keys(v.ack_message).length
      ? v.ack_message
      : DEFAULT_INTAKE_CONFIG.ack_message) as Record<string, string>,
  }
}

// ---------------------------------------------------------------------------
// Prompt + parsing

export function buildIntakePrompt(message: string, sources: string[] = []): string {
  const only = (sources || []).filter(Boolean)
  const filter = only.length
    ? `\nExtraia SOMENTE estas chaves (as demais devem ser null): ${only.join(', ')}.`
    : ''
  return `Você extrai dados de uma mensagem de um cliente de uma assessoria de imigração na Espanha.
Retorne APENAS um JSON válido, sem markdown, com as chaves abaixo. Inclua SOMENTE o que foi dito
EXPLICITAMENTE. Nunca invente. Campos desconhecidos devem ser null.${filter}

{
  "full_name": "nome completo ou primeiro nome dito pela pessoa, ou null",
  "email": "e-mail ou null",
  "in_spain": "sim | nao | null (a pessoa está FISICAMENTE na Espanha agora?). Só preencha se ela disser isso claramente (ex.: 'estou na Espanha', 'cheguei aqui', 'moro em Madri'). Morar em outro país NÃO responde esta pergunta: nesse caso use null",
  "intent": "resumo curto do objetivo (ex.: estudar, trabalhar, residência, nômade digital, arraigo, nacionalidade, oferta de trabalho) ou null. Quem diz que quer morar/viver/residir na Espanha (vivir/live in Spain) tem intent = \"residência\"",
  "arrival_date": "DD/MM/AAAA se a data de chegada na Espanha foi dita, senão null",
  "arrival_days_ago": número inteiro se disse algo como "estou aqui há 5 dias", senão null,
  "empadronado": "sim | nao | null",
  "empadronado_city": "cidade do empadronamento ou null",
  "age": número inteiro da idade em anos, senão null,
  "birth_date": "data de nascimento EXATAMENTE como dita, no formato DD/MM/AAAA, senão null. NUNCA calcule a data a partir da idade",
  "city": "cidade onde a pessoa mora hoje, ou null",
  "residence_country": "país onde a pessoa mora hoje (ex.: Brasil, Espanha, Portugal), ou null. Se apenas a CIDADE for dita (ex.: 'moro em Paris'), preencha o país correspondente a essa cidade (França)",
  "education_superior": "sim | nao | null (possui formação superior/universitária?)",
  "eu_family": "sim | nao | null (possui familiar europeu ou morando na UE?). QUALQUER menção a um parente (tio, avó, pai, primo, cônjuge…) europeu ou na Europa = \"sim\"",
  "europe_6m": "sim | nao | null (esteve na Europa nos últimos 6 meses?)",

  "confidence": { "full_name": 0..1, "residence_country": 0..1, "in_spain": 0..1, "intent": 0..1, "arrival_date": 0..1, "empadronado": 0..1, "age": 0..1, "birth_date": 0..1, "city": 0..1, "education_superior": 0..1, "eu_family": 0..1, "europe_6m": 0..1 }
}

Mensagem do cliente:
"""${String(message || '').slice(0, 1500)}"""`
}


export function parseIntakeJson(raw: string): IntakeExtraction | null {
  const text = String(raw || '')
  const match = text.match(/\{[\s\S]*\}/)
  if (!match) return null
  try {
    const obj = JSON.parse(match[0])
    return obj && typeof obj === 'object' ? (obj as IntakeExtraction) : null
  } catch {
    return null
  }
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

export function daysAgoToDate(days: number, now: Date = new Date()): string {
  const d = new Date(now.getTime() - Math.max(0, Math.round(days)) * 86400000)
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`
}

// ---------------------------------------------------------------------------
// Extração → respostas de etapa

const YES_WORDS = ['sim', 'si', 'sí', 'yes', 'true', 'oui', 'claro']
const NO_WORDS = ['nao', 'não', 'no', 'false', 'non']

function normText(v: unknown): string {
  return String(v ?? '').trim()
}

function toYesNo(v: unknown, opts: { kinship?: boolean } = {}): string {
  const t = normText(v).toLowerCase()
  if (YES_WORDS.includes(t)) return 'sim'
  if (NO_WORDS.includes(t)) return 'nao'
  // Frases livres ("somente tenho família no Brasil") também viram sim/nao.
  return normalizeYesNo(t, opts)
}



/** Intenções livres normalizadas para serviços válidos da assessoria. */
const INTENT_HINTS: Array<[RegExp, string]> = [
  [/(estud|student|curso|faculdade|master|mestrado|étud)/i, 'estudos'],
  [/(reagrupa|reagrupaci|family reunif|regroupement)/i, 'reagrupamento familiar'],
  [/(nacionalidade|nacionalidad|citizenship|cidadania|nationalit)/i, 'nacionalidade'],
  [/(arraigo)/i, 'arraigo'],
  [/(n[oô]made|nomad|teletrabalho|teletrabajo|remote)/i, 'nômade digital'],
  [/(trabalh|emprego|\bjob\b|\bwork\b|laboral|travail)/i, 'trabalho'],
  // "quero morar/viver na Espanha" = residência (serviço válido)
  [/(morar|viver|residir|resid[êe]ncia|residencia|vivir|live in spain|habiter|m[ou]dar)/i, 'residência'],
]

/** "morar na Espanha" vira "residência"; o resto é mantido como veio. */
export function normalizeIntent(raw: unknown): string {
  const text = normText(raw)
  if (!text) return ''
  for (const [re, label] of INTENT_HINTS) if (re.test(text)) return label
  return text
}

const SPAIN_RE = /^(espanha|espa[nñ]a|spain|espagne)$/i

export function isSpain(country: string): boolean {
  return SPAIN_RE.test(String(country || '').trim())
}

/** País informado em texto livre, com capitalização simples. */
export function normalizeCountry(raw: unknown): string {
  const text = normText(raw).replace(/^(no|na|em|en|in|do|da|de)\s+/i, '').trim()
  if (!text || text.length < 3) return ''
  return text.charAt(0).toUpperCase() + text.slice(1)
}

/**
 * Cidades conhecidas → país. Rede de segurança para "moro em Paris": sem isso
 * o país de residência (campo obrigatório) ficava vazio.
 */
const CITY_COUNTRY: Array<[RegExp, string]> = [
  [/^(paris|lyon|marselha|marseille|toulouse|bordeaux|nice|nantes|estrasburgo|strasbourg)$/i, 'França'],
  [/^(madri|madrid|barcelona|valencia|val[eè]ncia|sevilha|sevilla|bilbao|m[áa]laga|alicante|murcia|zaragoza|palma|tenerife|las palmas|granada|vigo|san sebasti[áa]n)$/i, 'Espanha'],
  [/^(lisboa|lisbon|porto|braga|coimbra|faro|cascais)$/i, 'Portugal'],
  [/^(s[ãa]o paulo|sao paulo|rio de janeiro|rio|bras[íi]lia|salvador|belo horizonte|curitiba|porto alegre|recife|fortaleza|manaus|goi[âa]nia|bel[ée]m|florian[óo]polis|campinas|natal|macei[óo]|s[ãa]o lu[íi]s|jo[ãa]o pessoa|vit[óo]ria|cuiab[áa])$/i, 'Brasil'],
  [/^(roma|rome|mil[ãa]o|milano|milan|npoles|n[áa]poles|napoli|turim|torino|floren[çc]a|firenze|veneza|venezia|bolonha|bologna)$/i, 'Itália'],
  [/^(londres|london|manchester|liverpool|birmingham|edimburgo|edinburgh|glasgow)$/i, 'Reino Unido'],
  [/^(berlim|berlin|munique|m[üu]nchen|munich|frankfurt|hamburgo|hamburg|colônia|colonia|k[öo]ln|stuttgart|d[üu]sseldorf)$/i, 'Alemanha'],
  [/^(buenos aires|c[óo]rdoba argentina|rosario|mendoza)$/i, 'Argentina'],
  [/^(bogot[áa]|medell[íi]n|cali|cartagena)$/i, 'Colômbia'],
  [/^(cidade do m[ée]xico|ciudad de m[ée]xico|mexico city|cdmx|guadalajara|monterrey)$/i, 'México'],
  [/^(caracas|maracaibo|valencia venezuela)$/i, 'Venezuela'],
  [/^(lima|cusco|arequipa)$/i, 'Peru'],
  [/^(santiago|santiago do chile|valpara[íi]so)$/i, 'Chile'],
  [/^(montevid[ée]u|montevideo)$/i, 'Uruguai'],
  [/^(assun[çc][ãa]o|asunci[óo]n)$/i, 'Paraguai'],
  [/^(havana|la habana)$/i, 'Cuba'],
  [/^(bruxelas|bruselas|brussels|antu[ée]rpia|anvers)$/i, 'Bélgica'],
  [/^(amsterd[ãa]|amsterdam|roterd[ãa]|rotterdam|haia|the hague)$/i, 'Países Baixos'],
  [/^(dublin|cork)$/i, 'Irlanda'],
  [/^(zurique|zurich|z[üu]rich|genebra|gen[èe]ve|geneva|berna|bern)$/i, 'Suíça'],
  [/^(viena|vienna|wien)$/i, 'Áustria'],
  [/^(vars[óo]via|warsaw|warszawa|crac[óo]via|krakow)$/i, 'Polônia'],
  [/^(nova york|new york|miami|orlando|boston|chicago|los angeles|houston|washington)$/i, 'Estados Unidos'],
  [/^(toronto|montreal|vancouver|ottawa)$/i, 'Canadá'],
  [/^(luanda|benguela)$/i, 'Angola'],
  [/^(maputo)$/i, 'Moçambique'],
  [/^(casablanca|rabat|marrakech)$/i, 'Marrocos'],
]

/** País correspondente a uma cidade conhecida (vazio quando não reconhecida). */
export function countryFromCity(raw: unknown): string {
  const city = normText(raw).replace(/^(em|no|na|en|in|à|a)\s+/i, '').trim()
  if (!city) return ''
  for (const [re, country] of CITY_COUNTRY) if (re.test(city)) return country
  return ''
}

/**
 * A mensagem fala explicitamente da Espanha/da presença aqui? Só nesse caso
 * `in_spain` pode ser aceito — morar em outro país NÃO significa estar fora
 * da Espanha agora.
 */
const SPAIN_MENTION_RE =
  /(espanha|espa[nñ]a|spain|espagne|\bestou aqui\b|\bestoy aqu[íi]\b|\bi'?m here\b|\bje suis ici\b|cheguei|llegu[ée]|arrived|arriv[ée])/i

export function messageMentionsSpain(message: unknown): boolean {
  return SPAIN_MENTION_RE.test(String(message || ''))
}

/**
 * Valores extraídos por "dado interpretado" (`source`), já filtrados pela
 * confiança mínima. É a base tanto do intake da 1ª mensagem quanto da etapa
 * "Pergunta geral".
 *
 * `opts.message` é a mensagem original: quando informada, `in_spain` só é
 * aceito se ela citar a Espanha (evita a IA deduzir "não está na Espanha"
 * apenas porque a pessoa mora em Paris).
 */
export function extractionToSourceValues(
  extraction: IntakeExtraction,
  minConfidence = 0.7,
  now: Date = new Date(),
  opts: { message?: string } = {},
): Record<string, string> {
  const out: Record<string, string> = {}
  const conf = (key: string) => {
    const c = Number(extraction?.confidence?.[key])
    return Number.isFinite(c) ? c : 1
  }
  const put = (key: string, value: string, checkConf = true) => {
    if (!value) return
    if (checkConf && conf(key) < minConfidence) return
    out[key] = value
  }

  put('full_name', normText(extraction.full_name))
  put('email', normText(extraction.email), false)
  put('in_spain', toYesNo(extraction.in_spain))

  put('intent', normalizeIntent(extraction.intent))


  let arrival = normText(extraction.arrival_date)
  if (!arrival && Number.isFinite(Number(extraction.arrival_days_ago))) {
    arrival = daysAgoToDate(Number(extraction.arrival_days_ago), now)
  }
  put('arrival_date', arrival)

  put('empadronado', toYesNo(extraction.empadronado))
  put('empadronado_city', normText(extraction.empadronado_city), false)

  const age = Number(String(extraction.age ?? '').replace(/\D+/g, ''))
  if (Number.isFinite(age) && age >= 14 && age <= 100) put('age', String(age))
  // Data de nascimento: só entra se vier em DD/MM/AAAA e for uma data real.
  const birth = checkBirthDate(normText(extraction.birth_date), { now })
  if (birth.ok) {
    put('birth_date', normText(extraction.birth_date))
    if (!out.age && birth.age !== null && birth.age >= 14 && birth.age <= 100) {
      out.age = String(birth.age)
    }
  }
  const city = normText(extraction.city)
  put('city', city)
  put('residence_country', normalizeCountry(extraction.residence_country))
  // "Moro em Paris": só a cidade foi dita — o país vem da cidade conhecida.

  if (!out.residence_country) {
    const derived = countryFromCity(out.city || city)
    if (derived) out.residence_country = derived
  }
  // ATENÇÃO: morar fora da Espanha NÃO significa não estar na Espanha agora.
  // Quando o cliente só disse onde mora (sem citar a Espanha), qualquer
  // `in_spain` devolvido pela IA é dedução: é descartado e a pergunta continua
  // em aberto para ser feita ao cliente.
  const hasMessage = typeof opts.message === 'string' && opts.message.trim().length > 0
  if (
    out.in_spain &&
    hasMessage &&
    !messageMentionsSpain(opts.message) &&
    (out.residence_country || out.city) &&
    !isSpain(out.residence_country)
  ) {
    delete out.in_spain
  }

  put('education_superior', toYesNo(extraction.education_superior))
  // "tio na europa", "minha avó é italiana" → sim (grau de parentesco).
  put('eu_family', toYesNo(extraction.eu_family, { kinship: true }))
  put('europe_6m', toYesNo(extraction.europe_6m))

  return out
}

/** Valores extraídos convertidos para o vocabulário de `field_mapping`. */
export function extractionToFieldValues(
  extraction: IntakeExtraction,
  minConfidence = 0.7,
  now: Date = new Date(),
  opts: { message?: string } = {},
): Record<string, string> {
  const src = extractionToSourceValues(extraction, minConfidence, now, opts)

  const out: Record<string, string> = {}

  if (src.full_name) out['contact.full_name'] = src.full_name
  if (src.email) out['contact.email'] = src.email
  if (src.in_spain) out['funnel.location_known'] = src.in_spain
  if (src.intent) {
    out['funnel.interest_confirmed'] = src.intent
    out['lead.service_interest'] = src.intent
  }
  if (src.arrival_date) {
    out['funnel.entry_date_confirmed'] = src.arrival_date
    out['contact.spain_arrival_date'] = src.arrival_date
  }
  if (src.empadronado) {
    out['funnel.empadronado_confirmed'] = src.empadronado
    out['contact.is_empadronado'] = src.empadronado
  }
  const city = src.empadronado_city || src.city
  if (city) {
    out['funnel.empadronado_city'] = city
    out['contact.empadronamiento_city'] = city
  }
  if (src.residence_country) out['contact.residence_country'] = src.residence_country
  if (src.age) out['outside.age'] = src.age
  if (src.birth_date) out['contact.birth_date'] = src.birth_date
  if (src.education_superior) out['contact.education_level'] = src.education_superior
  if (src.eu_family) out['contact.has_eu_family_member'] = src.eu_family
  if (src.europe_6m) out['contact.eu_entry_last_6_months'] = src.europe_6m

  return out
}


/**
 * Casa os valores extraídos com as etapas do fluxo (via `field_mapping`
 * explícito ou inferido) e devolve `step_code -> resposta` já validada.
 *
 * A etapa "Pergunta geral" não tem um único `field_mapping`: ela é considerada
 * respondida quando o intake já entendeu pelo menos `min_fields` dos dados que
 * ela captura — foi essa lacuna que fazia o agente reperguntar tudo mesmo com
 * a 1ª mensagem já cheia de informação.
 */
export function prefillFromFieldValues(
  steps: FlowStep[],
  fieldValues: Record<string, string>,
  allowedFields: string[] = [],
): Record<string, string> {
  const allow = new Set((allowedFields || []).filter(Boolean))
  const prefilled: Record<string, string> = {}

  for (const step of steps || []) {
    const general = generalCaptureOf(step)
    if (general.enabled) {
      const hits: string[] = []
      let missingRequired = false
      for (const f of general.fields) {
        if (!fieldAllowed(allow, f.target_field)) {
          if ((f as any).required) missingRequired = true
          continue
        }
        const value = pickFieldValue(fieldValues, f.target_field)
        if (value) hits.push(`${f.source}: ${value}`)
        else if ((f as any).required) missingRequired = true
      }
      // Campo obrigatório em falta: a etapa NÃO é dada como respondida — o
      // agente ainda precisa perguntar o que falta antes de seguir.
      if (!missingRequired && hits.length >= general.min_fields) {
        prefilled[step.step_code] = hits.join('; ')
      }
      continue
    }

    const field = inferFieldMapping(step)
    if (!field) continue
    if (!fieldAllowed(allow, field)) continue
    const raw = pickFieldValue(fieldValues, field)
    if (!raw) continue
    const check = validateAnswer(step, raw)
    if (!check.valid) continue
    prefilled[step.step_code] = check.value ?? raw
  }

  return prefilled
}

/**
 * Campos entendidos que NÃO têm etapa própria no fluxo — precisam ser gravados
 * no cadastro mesmo assim (ex.: data de chegada quando não há etapa de data).
 */
export function capturedFromFieldValues(
  steps: FlowStep[],
  fieldValues: Record<string, string>,
): { step_code: string; field: string; value: string }[] {
  const out: { step_code: string; field: string; value: string }[] = []
  for (const [field, value] of Object.entries(fieldValues || {})) {
    const text = String(value ?? '').trim()
    if (!text) continue
    out.push({ step_code: 'intake', field, value: text })
  }
  return out
}

// ---------------------------------------------------------------------------
// Saudação humana

const SUMMARY_TEMPLATES: Record<
  string,
  { spain: string; outside: string; country: string; intent: string; joiner: string }
> = {
  'pt-BR': { spain: 'Vi que você já está na Espanha', outside: 'Vi que você ainda não está na Espanha', country: 'Vi que você mora em {pais}', intent: 'e que seu objetivo é {intencao}', joiner: '. ' },
  es: { spain: 'Vi que ya estás en España', outside: 'Vi que todavía no estás en España', country: 'Vi que vives en {pais}', intent: 'y que tu objetivo es {intencao}', joiner: '. ' },
  en: { spain: 'I see you are already in Spain', outside: 'I see you are not in Spain yet', country: 'I see you live in {pais}', intent: 'and that your goal is {intencao}', joiner: '. ' },
  fr: { spain: 'Je vois que vous êtes déjà en Espagne', outside: 'Je vois que vous n’êtes pas encore en Espagne', country: 'Je vois que vous habitez en {pais}', intent: 'et que votre objectif est {intencao}', joiner: '. ' },
}

export function buildIntakeSummary(fieldValues: Record<string, string>, lang: FlowLang): string {
  const t = SUMMARY_TEMPLATES[String(lang)] || SUMMARY_TEMPLATES['pt-BR']
  const parts: string[] = []
  // Localização só é afirmada quando o cliente disse explicitamente onde está.
  const loc = fieldValues['funnel.location_known']
  const country = fieldValues['contact.residence_country']
  if (loc === 'sim') parts.push(t.spain)
  else if (loc === 'nao') parts.push(t.outside)
  else if (country) parts.push(t.country.replace('{pais}', country))
  const intent = fieldValues['funnel.interest_confirmed']
  if (intent) parts.push(t.intent.replace('{intencao}', intent))
  if (!parts.length) return ''
  return `${parts.join(' ')}.`
}

function firstName(full: string): string {
  return String(full || '').trim().split(/\s+/)[0] || ''
}

/** Remove vírgulas/espaços órfãos deixados por variáveis vazias ("Olá, !"). */
export function cleanEmptyPlaceholders(text: string): string {
  return String(text || '')
    .replace(/([^\s,;:])\s*[,;:]\s*(?=[!?.…])/g, '$1')
    .replace(/\s+([!?.,;:…])/g, '$1')
    .replace(/[,;:]\s*$/gm, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

export function renderIntakeGreeting(
  cfg: IntakeConfig,
  lang: FlowLang,
  fieldValues: Record<string, string>,
): string {
  const name = firstName(fieldValues['contact.full_name'] || '')
  const summary = buildIntakeSummary(fieldValues, lang)
  const hasData = !!name || !!summary
  const bag = hasData ? cfg.greeting_personalized : cfg.greeting_default
  const template = String(bag?.[String(lang)] ?? bag?.['pt-BR'] ?? '').trim()
  if (!template) return ''
  const rendered = template
    .replace(/\{nome\}/g, name)
    .replace(/\{resumo\}/g, summary)
    .replace(/\{intencao\}/g, fieldValues['funnel.interest_confirmed'] || '')
    .replace(/\{localizacao\}/g, fieldValues['funnel.location_known'] || '')
    .replace(/\s{2,}/g, ' ')
    .trim()
  return name ? rendered : cleanEmptyPlaceholders(rendered)
}

/**
 * Remove as mensagens das etapas INFORMATIVAS de abertura (as que vêm antes da
 * primeira pergunta) quando a saudação do intake já cumpre esse papel — evita
 * mandar duas saudações seguidas.
 */
export function dropOpeningMessages(turn: FlowTurnResult, steps: FlowStep[]): FlowTurnResult {
  const byCode = new Map((steps || []).map((s) => [s.step_code, s]))
  const drop = new Set<string>()
  for (const code of turn.path || []) {
    const step = byCode.get(code)
    if (!step) continue
    const kind = stepKindOf(step)
    if (kind === 'INICIO') continue
    if (kind === 'INFORMATIVA') {
      drop.add(code)
      continue
    }
    break // chegou na primeira pergunta: para de suprimir
  }
  if (!drop.size) return turn
  const outbound = (turn.outbound || []).filter((m: any) => !drop.has(String(m.step_code)))
  return { ...turn, outbound, messages: outbound.map((m: any) => m.text) }
}

// --- Dedup de saudação ------------------------------------------------------

function normalizeForCompare(s: string): string {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\{[^}]*\}/g, ' ') // placeholders ({nome}, {resumo}…)
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function tokensOf(s: string): string[] {
  return normalizeForCompare(s).split(' ').filter((t) => t.length >= 3)
}

/** Fração dos tokens de `part` que já aparecem no início de `whole`. */
function overlapRatio(part: string, whole: string): number {
  const pt = tokensOf(part)
  if (pt.length < 3) return 0
  const head = new Set(tokensOf(whole).slice(0, 40))
  if (!head.size) return 0
  let hit = 0
  for (const t of pt) if (head.has(t)) hit++
  return hit / pt.length
}

/** A saudação já está (essencialmente) contida na primeira mensagem do turno? */
export function greetingAlreadyPresent(greeting: string, firstMessage: string): boolean {
  // Compara a ABERTURA da saudação (primeiros tokens) com o início da mensagem
  // da etapa — o resto da saudação (resumo) não deve diluir a detecção.
  const opening = tokensOf(greeting).slice(0, 6)
  if (opening.length < 4) return false
  return overlapRatio(opening.join(' '), firstMessage) >= 0.7
}


/**
 * Prefixa a saudação do intake (personalizada ou padrão) no turno.
 *
 * Se a primeira mensagem do turno já abre com a mesma saudação (caso comum
 * quando a 1ª etapa do fluxo repete "Olá, {nome}! Eu sou a assistente…"),
 * evita a bolha duplicada: mantém apenas as frases da saudação que NÃO estão
 * na mensagem da etapa (tipicamente o resumo do que já foi entendido).
 */
export function prependIntakeGreeting(turn: FlowTurnResult, greeting: string): FlowTurnResult {
  const text = String(greeting || '').trim()
  if (!text) return turn
  const first = String(turn?.outbound?.[0]?.text ?? turn?.messages?.[0] ?? '')
  if (!first || !greetingAlreadyPresent(text, first)) {
    return prependMessage(turn, text, 'intake')
  }
  const remainder = text
    .split(/(?<=[.!?…])\s+|\n+|(?<=\p{Extended_Pictographic})\s+/u)
    .filter((sentence) => {
      const t = tokensOf(sentence)
      // frases curtas ("Olá, Roberto!") fazem parte da abertura repetida
      if (t.length < 3) return false
      return overlapRatio(sentence, first) < 0.7
    })
    .join(' ')
    .replace(/\s{2,}/g, ' ')
    .trim()

  if (normalizeForCompare(remainder).length < 12) return turn
  return prependMessage(turn, remainder, 'intake')
}


export function renderAckMessage(cfg: IntakeConfig, lang: FlowLang, name?: string): string {
  const template = String(cfg.ack_message?.[String(lang)] ?? cfg.ack_message?.['pt-BR'] ?? '').trim()
  if (!template) return ''
  return template.replace(/\{nome\}/g, firstName(name || '')).replace(/\s{2,}/g, ' ').trim()
}

// ---------------------------------------------------------------------------
// Orquestração (com LLM injetado)

/** Motivo do resultado do intake — sempre registrado em log. */
export type IntakeReason =
  | 'ok'
  | 'disabled'
  | 'short_message'
  | 'llm_error'
  | 'parse_error'
  | 'no_data'
  | 'no_match'

export interface IntakeResult {
  fieldValues: Record<string, string>
  prefilled: Record<string, string>
  greeting: string
  reason: IntakeReason
  /** Detalhe do erro do LLM (status/mensagem), quando houver. */
  detail?: string
}

export async function runIntake(params: {
  message: string
  steps: FlowStep[]
  lang: FlowLang
  config: IntakeConfig
  callLLM: (prompt: string) => Promise<string>
  now?: Date
  /** Dados já conhecidos antes da IA (ex.: nome do perfil do WhatsApp). */
  seed?: Record<string, string>
}): Promise<IntakeResult> {
  const { message, steps, lang, config, callLLM } = params
  const allowed = config?.fields || []
  const allowSet = new Set(allowed.filter(Boolean))
  const seed: Record<string, string> = {}
  for (const [k, v] of Object.entries(params.seed || {})) {
    if (!v) continue
    if (!fieldAllowed(allowSet, k)) continue
    seed[k] = v
  }

  /** Resultado quando a IA não roda: ainda aproveitamos o que já sabemos. */
  const empty = (reason: IntakeReason, detail?: string): IntakeResult => ({
    fieldValues: { ...seed },
    prefilled: Object.keys(seed).length ? prefillFromFieldValues(steps, seed, allowed) : {},
    greeting: Object.keys(seed).length ? renderIntakeGreeting(config, lang, seed) : '',
    reason,
    ...(detail ? { detail } : {}),
  })
  if (!config?.enabled) return empty('disabled')
  if (!message || String(message).trim().length < 5) return empty('short_message')

  let raw = ''
  try {
    raw = await callLLM(buildIntakePrompt(message))
  } catch (e) {
    return empty('llm_error', e instanceof Error ? e.message : String(e))
  }

  const extraction = parseIntakeJson(raw)
  if (!extraction) return empty('parse_error', String(raw || '').slice(0, 200))

  const fieldValues = extractionToFieldValues(extraction, config.min_confidence, params.now, {
    message: String(message || ''),
  })
  const filtered: Record<string, string> = { ...seed }
  for (const [k, v] of Object.entries(fieldValues)) {
    if (!fieldAllowed(allowSet, k)) continue
    filtered[k] = v
  }

  const prefilled = prefillFromFieldValues(steps, filtered, allowed)


  // A saudação personalizada usa TUDO que foi entendido — inclusive um primeiro
  // nome que não serve para responder a etapa de "nome completo".
  const greeting = renderIntakeGreeting(config, lang, filtered)

  let reason: IntakeReason = 'ok'
  if (!Object.keys(filtered).length) reason = 'no_data'
  else if (!Object.keys(prefilled).length) reason = 'no_match'

  return { fieldValues: filtered, prefilled, greeting, reason }
}


// ---------------------------------------------------------------------------
// Nome vindo do perfil do WhatsApp

/** Nomes de perfil que não servem como nome real do cliente. */
export function isUsableProfileName(raw: string | null | undefined, phone = ''): boolean {
  const name = String(raw || '').trim()
  if (name.length < 2) return false
  if (/^whatsapp/i.test(name)) return false
  const digits = phone.replace(/\D+/g, '')
  const nameDigits = name.replace(/\D+/g, '')
  if (nameDigits && digits && (digits.includes(nameDigits) || nameDigits.includes(digits))) return false
  // Só números, símbolos ou emojis.
  if (!/\p{L}/u.test(name)) return false
  const letters = (name.match(/\p{L}/gu) || []).length
  if (letters < 2) return false
  return true
}

/** Nome do perfil do WhatsApp como valor de `field_mapping` (ou vazio). */
export function profileNameToFieldValues(
  profileName: string | null | undefined,
  phone = '',
): Record<string, string> {
  if (!isUsableProfileName(profileName, phone)) return {}
  return { 'contact.full_name': String(profileName).trim() }
}

// ---------------------------------------------------------------------------
// Etapa "Pergunta geral": interpreta a resposta e preenche vários campos

export interface GeneralCaptureResult {
  /** Valores por campo do CRM (`field_mapping`). */
  fieldValues: Record<string, string>
  /** Etapas do fluxo que ficam respondidas por esses valores. */
  prefilled: Record<string, string>
  reason: IntakeReason
  detail?: string
}

/**
 * Executa a interpretação multi-campo da resposta de uma etapa "Pergunta geral".
 * `fields` liga cada dado interpretado (`source`) ao campo do CRM escolhido.
 */
export async function runGeneralCapture(params: {
  message: string
  steps: FlowStep[]
  fields: { source: string; target_field: string }[]
  minConfidence?: number
  callLLM: (prompt: string) => Promise<string>
  now?: Date
}): Promise<GeneralCaptureResult> {
  const empty = (reason: IntakeReason, detail?: string): GeneralCaptureResult => ({
    fieldValues: {},
    prefilled: {},
    reason,
    ...(detail ? { detail } : {}),
  })

  const fields = (params.fields || []).filter((f) => f?.source && f?.target_field)
  if (!fields.length) return empty('disabled')
  const message = String(params.message || '').trim()
  if (message.length < 2) return empty('short_message')

  let raw = ''
  try {
    raw = await params.callLLM(buildIntakePrompt(message, fields.map((f) => f.source)))
  } catch (e) {
    return empty('llm_error', e instanceof Error ? e.message : String(e))
  }

  const extraction = parseIntakeJson(raw)
  if (!extraction) return empty('parse_error', String(raw || '').slice(0, 200))

  const minConfidence = Number.isFinite(Number(params.minConfidence)) ? Number(params.minConfidence) : 0.7
  const sourceValues = extractionToSourceValues(extraction, minConfidence, params.now, { message })

  const fieldValues: Record<string, string> = {}
  for (const { source, target_field } of fields) {
    const value = sourceValues[source]
    if (!value) continue
    fieldValues[target_field] = value
  }
  if (!Object.keys(fieldValues).length) return empty('no_data')

  const prefilled = prefillFromFieldValues(params.steps, fieldValues)
  return {
    fieldValues,
    prefilled,
    reason: Object.keys(prefilled).length ? 'ok' : 'no_match',
  }
}
