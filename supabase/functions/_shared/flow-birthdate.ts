// @ts-nocheck
/**
 * Data de nascimento no pré-handoff.
 *
 * Regra do negócio: `contacts.birth_date` só pode receber a data REAL informada
 * pelo cliente, no formato DD/MM/AAAA. Nunca uma data aproximada derivada da
 * idade ("tenho 42 anos" -> 1984-01-01 é proibido).
 */

export type BirthDateProblem = 'format' | 'invalid' | 'future' | 'age_mismatch' | ''

export interface BirthDateCheck {
  ok: boolean
  problem: BirthDateProblem
  /** YYYY-MM-DD quando válida. */
  iso: string
  /** Idade calculada a partir da data. */
  age: number | null
}

const STRICT_RE = /^(\d{2})\/(\d{2})\/(\d{4})$/

/** Idade em anos completos entre `iso` e `now` (sem influência de fuso). */
export function ageFromIso(iso: string, now: Date = new Date()): number | null {
  const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return null
  const [, y, mo, d] = m.map(Number)
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  let age = today.getUTCFullYear() - y
  const monthDiff = today.getUTCMonth() + 1 - mo
  if (monthDiff < 0 || (monthDiff === 0 && today.getUTCDate() < d)) age--
  return age
}

/**
 * Valida a data digitada pelo cliente.
 * `declaredAge` (opcional) é a idade informada antes: divergência > 1 ano pede
 * confirmação em vez de gravar.
 */
export function checkBirthDate(
  raw: string,
  opts: { declaredAge?: number | string | null; now?: Date } = {},
): BirthDateCheck {
  const text = String(raw || '').trim()
  const now = opts.now || new Date()
  const fail = (problem: BirthDateProblem): BirthDateCheck => ({ ok: false, problem, iso: '', age: null })

  const m = text.match(STRICT_RE)
  if (!m) return fail('format')

  const day = Number(m[1])
  const month = Number(m[2])
  const year = Number(m[3])
  if (month < 1 || month > 12 || day < 1 || day > 31 || year < 1900) return fail('invalid')

  const dt = new Date(Date.UTC(year, month - 1, day))
  if (dt.getUTCFullYear() !== year || dt.getUTCMonth() !== month - 1 || dt.getUTCDate() !== day) {
    return fail('invalid')
  }

  const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  if (dt.getTime() > todayUtc) return fail('future')

  const iso = `${year}-${m[2]}-${m[1]}`
  const age = ageFromIso(iso, now)

  const declared = Number(String(opts.declaredAge ?? '').replace(/\D+/g, ''))
  if (Number.isFinite(declared) && declared > 0 && age !== null && Math.abs(age - declared) > 1) {
    return { ok: false, problem: 'age_mismatch', iso, age }
  }

  return { ok: true, problem: '', iso, age }
}

const MESSAGES: Record<BirthDateProblem, Record<string, string>> = {
  format: {
    'pt-BR': 'Por favor, informe a data de nascimento no formato DD/MM/AAAA, usando dois dígitos para o dia, dois para o mês e quatro para o ano. Exemplo: 05/03/1990.',
    es: 'Por favor, indica tu fecha de nacimiento en el formato DD/MM/AAAA, con dos dígitos para el día, dos para el mes y cuatro para el año. Ejemplo: 05/03/1990.',
    en: 'Please provide your date of birth in the DD/MM/YYYY format, with two digits for the day, two for the month and four for the year. Example: 05/03/1990.',
    fr: 'Merci d’indiquer votre date de naissance au format JJ/MM/AAAA, avec deux chiffres pour le jour, deux pour le mois et quatre pour l’année. Exemple : 05/03/1990.',
  },
  invalid: {
    'pt-BR': 'Essa data não é válida. Por favor, confira e informe novamente no formato DD/MM/AAAA.',
    es: 'Esa fecha no es válida. Por favor, revísala e indícala nuevamente en el formato DD/MM/AAAA.',
    en: 'That date is not valid. Please check it and send it again in the DD/MM/YYYY format.',
    fr: 'Cette date n’est pas valide. Merci de la vérifier et de l’indiquer à nouveau au format JJ/MM/AAAA.',
  },
  future: {
    'pt-BR': 'A data de nascimento não pode estar no futuro. Por favor, informe novamente no formato DD/MM/AAAA.',
    es: 'La fecha de nacimiento no puede estar en el futuro. Por favor, indícala nuevamente en el formato DD/MM/AAAA.',
    en: 'The date of birth cannot be in the future. Please send it again in the DD/MM/YYYY format.',
    fr: 'La date de naissance ne peut pas être dans le futur. Merci de l’indiquer à nouveau au format JJ/MM/AAAA.',
  },
  age_mismatch: {
    'pt-BR': 'Você informou anteriormente que possui {idade} anos, mas a data de nascimento informada não corresponde a essa idade. Poderia confirmar sua data de nascimento no formato DD/MM/AAAA?',
    es: 'Antes indicaste que tienes {idade} años, pero la fecha de nacimiento no corresponde a esa edad. ¿Podrías confirmar tu fecha de nacimiento en el formato DD/MM/AAAA?',
    en: 'You told me you are {idade} years old, but the date of birth does not match that age. Could you confirm your date of birth in the DD/MM/YYYY format?',
    fr: 'Vous avez indiqué avoir {idade} ans, mais la date de naissance ne correspond pas à cet âge. Pourriez-vous confirmer votre date de naissance au format JJ/MM/AAAA ?',
  },
  '': { 'pt-BR': '', es: '', en: '', fr: '' },
}

export function birthDateMessage(
  problem: BirthDateProblem,
  lang = 'pt-BR',
  declaredAge?: number | string | null,
): string {
  if (!problem) return ''
  const bag = MESSAGES[problem] || MESSAGES.format
  const text = bag[lang] || bag['pt-BR']
  return String(text).replace(/\{idade\}/g, String(declaredAge ?? '').replace(/\D+/g, ''))
}

/** Pergunta usada quando o cliente informou só a idade. */
export const ASK_BIRTH_DATE: Record<string, string> = {
  'pt-BR': 'Para registrar essa informação corretamente, informe sua data de nascimento no formato DD/MM/AAAA. Por exemplo: 15/08/1983.',
  es: 'Para registrar correctamente esta información, indícame tu fecha de nacimiento en el formato DD/MM/AAAA. Por ejemplo: 15/08/1983.',
  en: 'To record this correctly, please tell me your date of birth in the DD/MM/YYYY format. For example: 15/08/1983.',
  fr: 'Pour enregistrer correctement cette information, indiquez votre date de naissance au format JJ/MM/AAAA. Par exemple : 15/08/1983.',
}
