// @ts-nocheck
/**
 * Campos obrigatórios da etapa "Pergunta geral".
 *
 * A etapa aproveita tudo que o cliente já contou. Quando algum campo marcado
 * como OBRIGATÓRIO continua vazio, o agente não segue (nem transfere para o
 * humano) antes de perguntar — um campo por vez, sem repetir o que já sabe.
 */

import {
  appendMessage,
  buildStayTurn,
  generalCaptureOf,
  indexSteps,
  isGeneralCaptureStep,
  type FlowLang,
  type FlowRunState,
  type FlowStep,
  type FlowTurnResult,
} from './flow-engine.ts'
import { fieldValuesFromAnswers, pickFieldValue } from './flow-vars.ts'
import { birthDateMessage, checkBirthDate } from './flow-birthdate.ts'

export interface RequiredCaptureField {
  source: string
  target_field: string
  prompts?: Record<string, string>
}

/** Máximo de insistências por campo obrigatório (evita laço infinito). */
export const MAX_REQUIRED_ATTEMPTS = 2

/** Perguntas padrão por dado, nos 4 idiomas do atendimento. */
const DEFAULT_PROMPTS: Record<string, Record<string, string>> = {
  full_name: {
    'pt-BR': 'Como você se chama?',
    es: '¿Cómo te llamas?',
    en: 'What is your name?',
    fr: 'Comment vous appelez-vous ?',
  },
  email: {
    'pt-BR': 'Qual é o seu e-mail?',
    es: '¿Cuál es tu correo electrónico?',
    en: 'What is your email address?',
    fr: 'Quelle est votre adresse e-mail ?',
  },
  age: {
    'pt-BR': 'Faltou só uma informação: qual é a sua idade?',
    es: 'Solo falta un dato: ¿cuál es tu edad?',
    en: 'Just one thing missing: how old are you?',
    fr: 'Il manque juste une information : quel âge avez-vous ?',
  },
  birth_date: {
    'pt-BR': 'Qual é a sua data de nascimento? Por favor, no formato DD/MM/AAAA (exemplo: 05/03/1990).',
    es: '¿Cuál es tu fecha de nacimiento? Por favor, en el formato DD/MM/AAAA (ejemplo: 05/03/1990).',
    en: 'What is your date of birth? Please use the DD/MM/YYYY format (example: 05/03/1990).',
    fr: 'Quelle est votre date de naissance ? Merci d’utiliser le format JJ/MM/AAAA (exemple : 05/03/1990).',
  },
  city: {
    'pt-BR': 'Em qual cidade você mora hoje?',
    es: '¿En qué ciudad vives actualmente?',
    en: 'Which city do you live in right now?',
    fr: 'Dans quelle ville habitez-vous actuellement ?',
  },
  residence_country: {
    'pt-BR': 'Em que país você mora hoje?',
    es: '¿En qué país vives actualmente?',
    en: 'Which country do you live in right now?',
    fr: 'Dans quel pays habitez-vous actuellement ?',
  },
  in_spain: {
    'pt-BR': 'Você já está na Espanha?',
    es: '¿Ya estás en España?',
    en: 'Are you already in Spain?',
    fr: 'Êtes-vous déjà en Espagne ?',
  },
  intent: {
    'pt-BR': 'E qual é o seu objetivo aqui na Espanha?',
    es: 'Y ¿cuál es tu objetivo aquí en España?',
    en: 'And what is your goal here in Spain?',
    fr: 'Et quel est votre objectif ici en Espagne ?',
  },
  arrival_date: {
    'pt-BR': 'Qual foi (ou será) a sua data de chegada na Espanha? (DD/MM/AAAA)',
    es: '¿Cuál fue (o será) tu fecha de llegada a España? (DD/MM/AAAA)',
    en: 'What was (or will be) your arrival date in Spain? (DD/MM/YYYY)',
    fr: 'Quelle a été (ou sera) votre date d’arrivée en Espagne ? (JJ/MM/AAAA)',
  },
  empadronado: {
    'pt-BR': 'Você já está empadronado?',
    es: '¿Ya estás empadronado?',
    en: 'Are you already registered (empadronado)?',
    fr: 'Êtes-vous déjà inscrit (empadronado) ?',
  },
  empadronado_city: {
    'pt-BR': 'Em qual cidade você está empadronado?',
    es: '¿En qué ciudad estás empadronado?',
    en: 'In which city are you registered (empadronado)?',
    fr: 'Dans quelle ville êtes-vous inscrit (empadronado) ?',
  },
  education_superior: {
    'pt-BR': 'Você possui formação superior?',
    es: '¿Tienes formación superior (universitaria)?',
    en: 'Do you have a university degree?',
    fr: 'Avez-vous une formation universitaire ?',
  },
  eu_family: {
    'pt-BR': 'Você possui algum familiar europeu?',
    es: '¿Tienes algún familiar europeo?',
    en: 'Do you have any European family member?',
    fr: 'Avez-vous un membre de votre famille européen ?',
  },
  europe_6m: {
    'pt-BR': 'Você esteve na Europa nos últimos 6 meses?',
    es: '¿Has estado en Europa en los últimos 6 meses?',
    en: 'Have you been in Europe in the last 6 months?',
    fr: 'Avez-vous été en Europe au cours des 6 derniers mois ?',
  },
}

const GENERIC_PROMPT: Record<string, string> = {
  'pt-BR': 'Faltou só uma informação:',
  es: 'Solo falta un dato:',
  en: 'Just one detail missing:',
  fr: 'Il manque juste une information :',
}

/** Campos marcados como obrigatórios na etapa "Pergunta geral". */
export function requiredFieldsOf(step: FlowStep): RequiredCaptureField[] {
  if (!isGeneralCaptureStep(step)) return []
  const cfg = generalCaptureOf(step)
  return (cfg.fields || []).filter((f: any) => f?.required === true) as RequiredCaptureField[]
}

/** Valores conhecidos até aqui (respostas do fluxo + campos interpretados). */
export function knownFieldsOf(steps: FlowStep[], state: FlowRunState): Record<string, string> {
  return {
    ...fieldValuesFromAnswers(steps, (state?.answers || {}) as Record<string, string>),
    ...((state?.captured_fields || {}) as Record<string, string>),
  }
}

/** O nome é sempre a primeira cobrança e nunca fica em branco. */
export function isNameField(field: RequiredCaptureField): boolean {
  return (
    String(field?.source || '') === 'full_name' ||
    String(field?.target_field || '') === 'contact.full_name'
  )
}

/** Campos obrigatórios da etapa que continuam sem valor (nome sempre primeiro). */
export function missingRequired(
  step: FlowStep,
  known: Record<string, string>,
  skipped: string[] = [],
): RequiredCaptureField[] {
  const ignore = new Set(skipped || [])
  const pending = requiredFieldsOf(step).filter(
    (f) => !ignore.has(f.target_field) && !pickFieldValue(known, f.target_field),
  )
  return pending.sort((a, b) => Number(isNameField(b)) - Number(isNameField(a)))
}

/**
 * A etapa "Pergunta geral" já pode ser encerrada?
 *
 * REGRA: o obrigatório manda mais que o mínimo. Enquanto houver campo marcado
 * como obrigatório sem valor (e que ainda não esgotou as tentativas), a etapa
 * NÃO é considerada satisfeita. O "mínimo de dados" vale apenas para os campos
 * opcionais — e só governa quando a etapa não tem nenhum obrigatório.
 */
export function generalCaptureSatisfied(
  step: FlowStep,
  known: Record<string, string>,
  skipped: string[] = [],
): boolean {
  if (!isGeneralCaptureStep(step)) return false
  const cfg = generalCaptureOf(step)
  const fields = (cfg.fields || []) as Array<RequiredCaptureField & { required?: boolean }>
  if (!fields.length) return true

  const ignore = new Set(skipped || [])
  const required = fields.filter((f) => (f as any)?.required === true)
  if (required.length) {
    const pending = required.filter(
      (f) => !ignore.has(f.target_field) && !pickFieldValue(known, f.target_field),
    )
    return pending.length === 0
  }

  const min = Number(cfg.min_fields) > 0 ? Number(cfg.min_fields) : 1
  const hits = fields.filter((f) => !!pickFieldValue(known, f.target_field)).length
  return hits >= Math.min(min, fields.length)
}


/**
 * Respostas de escape/ruído que NÃO podem virar valor de campo — senão o
 * cadastro fica com dado inventado ("Falar com atendente" virando "não esteve
 * na Europa").
 */
const NON_ANSWER_RE =
  /^(ok(ay)?|blz|beleza|sim,?\s*obrigad[oa]|obrigad[oa]|gracias|thanks?|merci|n[ãa]o sei|nao sei|sei l[áa]|no s[ée]|i don'?t know|je ne sais pas|talvez|maybe|quiz[áa]s|falar com (o |um )?(atendente|humano|especialista)|hablar con (un )?(agente|humano|asesor)|talk to (a |an )?(agent|human)|parler [àa] (un )?(agent|humain)|atendente|humano|agente)$/i

export function isNonAnswer(text: string): boolean {
  const t = String(text || '').trim().replace(/[.!?…]+$/, '')
  if (!t) return true
  return NON_ANSWER_RE.test(t)
}


/** Texto da pergunta de um campo obrigatório, no idioma do atendimento. */
export function requiredPrompt(field: RequiredCaptureField, lang: FlowLang = 'pt-BR'): string {
  const custom = field?.prompts && (field.prompts[lang] || field.prompts['pt-BR'])
  if (custom && String(custom).trim()) return String(custom).trim()
  const preset = DEFAULT_PROMPTS[field.source]
  if (preset) return preset[lang] || preset['pt-BR']
  const generic = GENERIC_PROMPT[lang] || GENERIC_PROMPT['pt-BR']
  return `${generic} ${field.source}`
}

/**
 * A mensagem que está saindo já pergunta esse dado? Evita a bolha duplicada
 * quando o texto da etapa ("me comente sobre você: idade, cidade…") já cobre
 * o campo obrigatório.
 */
const FIELD_KEYWORDS: Record<string, RegExp> = {
  full_name: /(nome\s+completo|seu\s+nome|nombre|full\s+name|your\s+name|votre\s+nom)/i,
  email: /(e-?mail|correo|courriel)/i,
  age: /(idade|edad|\bage\b|âge)/i,
  birth_date: /(nascimento|nacimiento|birth|naissance)/i,
  city: /(cidade|ciudad|\bcity\b|ville)/i,
  residence_country: /(pa[íi]s|country|pays)/i,
  in_spain: /(na\s+espanha|en\s+espa[ñn]a|in\s+spain|en\s+espagne)/i,
  intent: /(objetivo|goal|but\b|objectif)/i,
  arrival_date: /(chegada|llegada|arrival|arriv[ée]e)/i,
  empadronado: /(empadronad)/i,
  empadronado_city: /(empadronad)/i,
  education_superior: /(forma[çc][ãa]o|superior|universit|degree|dipl[ôo]me)/i,
  eu_family: /(familiar\s+europeu|familiar\s+europeo|european\s+(family|relative)|famille\s+europ)/i,
  europe_6m: /(6\s*meses|6\s*months|6\s*mois|últimos\s+6|ultimos\s+6)/i,
}

export function fieldAlreadyAskedIn(field: RequiredCaptureField, text: string): boolean {
  const t = String(text || '')
  if (!t.trim()) return false
  const re = FIELD_KEYWORDS[field.source]
  return re ? re.test(t) : false
}

/**
 * Reescreve o turno quando ele parou numa "Pergunta geral" que já tem parte
 * dos dados: em vez de repetir a pergunta aberta inteira, o agente pergunta
 * apenas o próximo campo obrigatório que falta.
 *
 * Quando a pergunta da etapa está saindo AGORA e já existe campo obrigatório
 * vazio, a cobrança vai JUNTO na mesma resposta — o obrigatório nunca fica
 * para o turno seguinte.
 */
export function applyRequiredGate(
  steps: FlowStep[],
  turn: FlowTurnResult,
  lang: FlowLang = 'pt-BR',
  extraKnown: Record<string, string> = {},
): FlowTurnResult {
  const code = turn?.state?.current_step
  const byCode = indexSteps(steps)
  const step = code ? byCode.get(code) : null

  // Rede de segurança: nenhum handoff/fim acontece com obrigatório vazio de
  // alguma "Pergunta geral" já percorrida no fluxo.
  if (turn?.finished || turn?.handoff) {
    return enforceRequiredBeforeHandoff(steps, turn, lang, extraKnown)
  }

  if (!step || !isGeneralCaptureStep(step)) return turn

  const required = requiredFieldsOf(step)
  if (!required.length) return turn

  const known = { ...extraKnown, ...knownFieldsOf(steps, turn.state) }
  const skipped = (turn.state?.required_skipped || []) as string[]
  const pending = missingRequired(step, known, skipped)

  const presentedNow = !turn.reasked && (turn.outbound || []).some((o: any) => o?.step_code === code)

  // Mínimo de dados atingido: a etapa não cobra mais nada — o que não foi
  // respondido fica em branco e o fluxo segue.
  if (!pending.length || generalCaptureSatisfied(step, known, skipped)) {
    return presentedNow || turn.state?.required_field
      ? { ...turn, state: { ...turn.state, required_field: '', required_attempts: 0 } }
      : turn
  }


  const next = pending[0]

  if (presentedNow) {
    // A pergunta aberta continua sendo enviada; a cobrança do obrigatório é
    // acrescentada na MESMA resposta (a menos que o texto já a contenha).
    const presentedText = (turn.outbound || [])
      .filter((o: any) => o?.step_code === code)
      .map((o: any) => o?.text || '')
      .join(' ')
    const base = fieldAlreadyAskedIn(next, presentedText)
      ? turn
      : appendMessage(turn, requiredPrompt(next, lang), code)
    return {
      ...base,
      finished: false,
      handoff: false,
      state: {
        ...base.state,
        current_step: code,
        required_field: next.target_field,
        required_attempts: 0,
      },
    }
  }

  const stay = buildStayTurn(step, requiredPrompt(next, lang), turn.state, {
    current_step: code,
    required_field: next.target_field,
    required_attempts: 0,
    captured_fields: { ...(turn.state?.captured_fields || {}) },
  })
  return { ...stay, captured: turn.captured || [], finished: false, handoff: false }
}

/**
 * Antes de encerrar/transferir: se alguma "Pergunta geral" percorrida NEM
 * chegou ao mínimo de dados e ainda tem obrigatório vazio, o fluxo volta para
 * ela e pergunta. Atingido o mínimo, nada mais é cobrado.
 */
export function enforceRequiredBeforeHandoff(
  steps: FlowStep[],
  turn: FlowTurnResult,
  lang: FlowLang = 'pt-BR',
  extraKnown: Record<string, string> = {},
): FlowTurnResult {
  const known = { ...extraKnown, ...knownFieldsOf(steps, turn.state) }
  const skipped = (turn.state?.required_skipped || []) as string[]
  const byCode = indexSteps(steps)
  const visited = new Set<string>([
    ...((turn.path || []) as string[]),
    ...Object.keys((turn.state?.answers || {}) as Record<string, string>),
  ])

  for (const code of visited) {
    const step = byCode.get(code)
    if (!step || !isGeneralCaptureStep(step)) continue
    if (generalCaptureSatisfied(step, known, skipped)) continue
    const pending = missingRequired(step, known, skipped)
    if (!pending.length) continue

    const next = pending[0]
    const stay = buildStayTurn(step, requiredPrompt(next, lang), turn.state, {
      current_step: code,
      required_field: next.target_field,
      required_attempts: 0,
      captured_fields: { ...(turn.state?.captured_fields || {}) },
    })
    return { ...stay, captured: turn.captured || [], finished: false, handoff: false }
  }
  return turn
}

/** Campos cuja resposta só pode ser "sim" ou "nao". */
const BOOLEAN_SOURCES = new Set([
  'eu_family',
  'europe_6m',
  'education_superior',
  'empadronado',
  'in_spain',
  'works_remotely',
])

const BOOLEAN_TARGETS = new Set([
  'contact.has_eu_family_member',
  'contact.has_european_family',
  'contact.eu_entry_last_6_months',
  'contact.was_in_europe_6m',
  'contact.education_level',
  'contact.is_empadronado',
  'contact.is_in_spain',
  'contact.works_remotely',
  'funnel.location_known',
])

export function isBooleanField(field: RequiredCaptureField): boolean {
  return (
    BOOLEAN_SOURCES.has(String(field?.source || '')) ||
    BOOLEAN_TARGETS.has(String(field?.target_field || ''))
  )
}

const YES_RE =
  /(^|\b)(sim|s[ií]|yes|yeah|yep|oui|claro|com certeza|certamente|tenho|tengo|possuo|j[áa] estive|estive|ja fui|j[áa] fui|i (do|have|was)|j['e]ai|positivo|afirmativo|isso|exato|verdade)(\b|$)/i
const NO_RE =
  /(^|\b)(n[ãa]o|nao|no|nope|non|nunca|jamais|nenhum[ao]?|ningu[eé]m|nadie|ninguno|none|nobody|negativo|s[óo] (no|na|em)|somente (no|na|em)|apenas (no|na|em)|solo en|only in|n[ãa]o tenho|nao tenho|no tengo|i don'?t|i have no|never)(\b|$)/i

/** Grau de parentesco citado como resposta ("tio", "minha avó é italiana"). */
const KINSHIP_RE =
  /(^|\b)(pai|m[ãa]e|av[óôo]|av[óo]s|bisav[óôo]|filh[oa]|irm[ãa]os?|irm[ãa]|tios?|tias?|prim[oa]s?|sobrinh[oa]s?|espos[oa]|marido|mulher|c[ôo]njuge|sogr[oa]|padrasto|madrasta|bisneto|neto|neta|padre|madre|abuel[oa]s?|hij[oa]s?|hermanos?|hermanas?|t[íi]os?|t[íi]as?|prim[oa]s?|sobrin[oa]s?|father|mother|grand(?:father|mother|pa|ma|parents?)|son|daughter|brother|sister|uncle|aunt|cousin|nephew|niece|wife|husband|p[èe]re|m[èe]re|grand-?(?:p[èe]re|m[èe]re)|fils|fille|fr[èe]re|s(?:oe|œ)ur|oncle|tante|cousin[e]?|neveu|ni[èe]ce|femme|mari)(\b|$)/i

/** "Não sei o que é isso" / "no sé qué es" / "what is that?" / "je ne sais pas". */
const DONT_KNOW_RE =
  /(n[ãa]o\s+(sei|entendi|entendo|conhe[çc]o)|nem\s+sei|sei\s+l[áa]|no\s+s[ée]|no\s+entiendo|qu[eé]\s+es\s+eso|i\s+(do\s*n'?t|don'?t)\s+(know|understand)|what('| i)?s\s+that|je\s+ne\s+sais\s+pas|c'?est\s+quoi)/i

export function isDontKnow(text: string): boolean {
  const t = String(text || '').trim()
  if (!t) return false
  if (/^\?+$/.test(t)) return true
  return DONT_KNOW_RE.test(t)
}

/**
 * Converte a resposta livre de um campo sim/não em "sim" | "nao".
 * Devolve string vazia quando não dá para decidir.
 *
 * `opts.kinship` liga a leitura de grau de parentesco como "sim" (usado na
 * pergunta de familiar europeu: "tio", "minha avó é italiana").
 */
export function normalizeYesNo(text: string, opts: { kinship?: boolean } = {}): string {
  const t = String(text || '').trim()
  if (!t) return ''
  if (isDontKnow(t)) return ''
  const noHit = NO_RE.test(t)
  const yesHit = YES_RE.test(t)
  // "só tenho família no Brasil" casa nos dois: a negação tem prioridade.
  if (noHit) return 'nao'
  if (yesHit) return 'sim'
  if (opts.kinship && KINSHIP_RE.test(t)) return 'sim'
  return ''
}

function kinshipField(field: RequiredCaptureField): boolean {
  const source = String(field?.source || '')
  const target = String(field?.target_field || '')
  return (
    source === 'eu_family' ||
    target === 'contact.has_eu_family_member' ||
    target === 'contact.has_european_family'
  )
}

/**
 * Normaliza o valor antes de gravar (hoje: campos sim/não).
 * Em campo sim/não, "não sei o que é isso" já reperguntado vira "nao".
 */
export function normalizeRequiredValue(field: RequiredCaptureField, value: string): string {
  if (!isBooleanField(field)) return String(value || '').trim()
  const decided = normalizeYesNo(value, { kinship: kinshipField(field) })
  if (decided) return decided
  return isDontKnow(value) ? 'nao' : ''
}

const YES_NO_RETRY: Record<string, string> = {
  'pt-BR': 'Só para confirmar, responda com sim ou não:',
  es: 'Solo para confirmar, responde con sí o no:',
  en: 'Just to confirm, please answer yes or no:',
  fr: 'Juste pour confirmer, répondez par oui ou non :',
}

/** Explicação curta para quem respondeu "não sei o que é isso". */
const CLARIFY: Record<string, Record<string, string>> = {
  education_superior: {
    'pt-BR': 'Formação superior é ter concluído (ou estar cursando) uma faculdade/universidade.',
    es: 'Formación superior es haber terminado (o estar cursando) una carrera universitaria.',
    en: 'A university degree means you finished (or are currently studying) higher education.',
    fr: 'Une formation supérieure signifie avoir terminé (ou suivre) des études universitaires.',
  },
  eu_family: {
    'pt-BR': 'Familiar europeu é alguém da sua família (pai, mãe, avô, cônjuge, filho…) com cidadania de um país da Europa.',
    es: 'Un familiar europeo es alguien de tu familia (padre, madre, abuelo, cónyuge, hijo…) con ciudadanía de un país europeo.',
    en: 'A European relative is a family member (parent, grandparent, spouse, child…) who holds citizenship of a European country.',
    fr: 'Un membre de la famille européen est un parent (père, mère, grand-parent, conjoint, enfant…) ayant la nationalité d’un pays européen.',
  },
  europe_6m: {
    'pt-BR': 'A pergunta é se você viajou ou esteve em algum país da Europa nos últimos 6 meses.',
    es: 'La pregunta es si viajaste o estuviste en algún país de Europa en los últimos 6 meses.',
    en: 'The question is whether you travelled to or stayed in any European country in the last 6 months.',
    fr: 'La question est de savoir si vous avez voyagé ou séjourné dans un pays européen ces 6 derniers mois.',
  },
  empadronado: {
    'pt-BR': 'Empadronamento é o registro do seu endereço na prefeitura (ayuntamiento) na Espanha.',
    es: 'El empadronamiento es el registro de tu domicilio en el ayuntamiento en España.',
    en: 'Empadronamiento is registering your address at the local town hall in Spain.',
    fr: 'L’empadronamiento est l’enregistrement de votre adresse à la mairie en Espagne.',
  },
}

const ANSWER_YES_NO: Record<string, string> = {
  'pt-BR': 'Responda apenas sim ou não:',
  es: 'Responde solo sí o no:',
  en: 'Please answer just yes or no:',
  fr: 'Répondez simplement par oui ou non :',
}

/**
 * Validação específica de um campo obrigatório antes de gravar.
 * Devolve a mensagem de correção quando o valor não serve (string vazia = ok).
 *
 * Cobre a data de nascimento (DD/MM/AAAA, data real, coerente com a idade) e
 * os campos sim/não (resposta que não permite decidir é reperguntada — e quem
 * não sabe o que é o dado recebe a explicação uma vez; na sequência grava-se
 * "nao").
 */
export function requiredValueIssue(
  field: RequiredCaptureField,
  value: string,
  lang: FlowLang = 'pt-BR',
  known: Record<string, string> = {},
  attempts = 0,
): string {
  const source = String(field?.source || '')
  const target = String(field?.target_field || '')

  if (isBooleanField(field)) {
    const raw = String(value || '').trim()
    if (!raw) return ''
    if (normalizeYesNo(raw, { kinship: kinshipField(field) })) return ''
    if (isDontKnow(raw)) {
      // Já explicamos uma vez: assume "não" e segue (quem não sabe, não tem).
      if (attempts >= 1) return ''
      const clarify = CLARIFY[source]?.[lang] || CLARIFY[source]?.['pt-BR'] || ''
      const closing = ANSWER_YES_NO[lang] || ANSWER_YES_NO['pt-BR']
      return [clarify, `${closing} ${requiredPrompt(field, lang)}`].filter(Boolean).join(' ')
    }
    const prefix = YES_NO_RETRY[lang] || YES_NO_RETRY['pt-BR']
    return `${prefix} ${requiredPrompt(field, lang)}`
  }

  const isBirth = source === 'birth_date' || target === 'contact.birth_date'
  if (!isBirth) return ''

  const raw = String(value || '').trim()
  if (!raw) return ''
  const declaredAge = pickFieldValue(known, 'outside.age')
  const check = checkBirthDate(raw, { declaredAge })
  return check.ok ? '' : birthDateMessage(check.problem, lang, declaredAge)
}
