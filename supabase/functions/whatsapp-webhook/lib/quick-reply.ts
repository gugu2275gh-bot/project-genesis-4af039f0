// @ts-nocheck
// WhatsApp Quick Reply (Sim/Não) — integração determinística com o fluxo existente.
//
// Objetivo:
//  - Reutilizar as PERGUNTAS já emitidas pelo fluxo (nenhuma nova pergunta é criada).
//  - Quando o texto de saída for uma pergunta binária SIM/NÃO conhecida, enviar via
//    Twilio Content API (twilio/quick-reply) com botões [Sim] e [Não] localizados
//    e identificadores estáveis "YES"/"NO".
//  - Fora da janela de 24h ou em qualquer erro, cair silenciosamente no envio de
//    texto normal (não altera o fallback existente para templates HSM).
//
// Nada aqui altera a máquina de estados: a normalização YES/NO acontece no
// webhook (parseMessage) mapeando ButtonPayload → tokens curtos "sim"/"no"
// que já são aceitos por classifyYesNo() em lib/questions.ts.

import type { ChatLanguage } from './language.ts'
import { normalizeForLanguageChecks } from './language.ts'

// -------- Labels & payloads --------

export const YES_NO_LABELS: Record<ChatLanguage, { yes: string; no: string }> = {
  'pt-BR': { yes: 'Sim', no: 'Não' },
  'es':    { yes: 'Sí',  no: 'No'  },
  'en':    { yes: 'Yes', no: 'No'  },
  'fr':    { yes: 'Oui', no: 'Non' },
}

export const YES_PAYLOAD = 'YES'
export const NO_PAYLOAD  = 'NO'

/**
 * Converte um ButtonPayload recebido do Twilio em token curto reconhecido pelo
 * classifyYesNo() já existente ("sim" ou "no"). Retorna null se não for um
 * payload YES/NO reconhecido.
 */
export function normalizeButtonPayloadToText(payload: string | null | undefined): string | null {
  if (!payload) return null
  const p = String(payload).trim().toUpperCase()
  if (p === YES_PAYLOAD || p === 'SIM' || p === 'SI' || p === 'SÍ' || p === 'OUI') return 'sim'
  if (p === NO_PAYLOAD || p === 'NAO' || p === 'NÃO' || p === 'NON') return 'no'
  return null
}

// -------- Detecção de perguntas binárias SIM/NÃO --------
//
// Só marcamos como binária as perguntas que o próprio roteiro define como
// fechadas de sim/não. Detecção é frouxa (normalizada, sem acento/caixa) para
// tolerar pequenas variações de preâmbulo emitidas pelo LLM.

const YESNO_QUESTION_PATTERNS: RegExp[] = [
  // Localização (A/B split): "Hoje você já está na Espanha?" e variantes
  /(voce (ja )?esta (na |em )?espanha|ya estas en espana|hoy ya estas en espana|are you (already )?in spain|etes vous (deja )?en espagne)/i,
  // Empadronamento
  /(voce esta empadronad|estas empadronad|are you (registered|empadronad)|etes vous empadronad)/i,
  // Familiar europeu / residente legal
  /(familiar (europeu|europeo)|european family (member)?|membre .* famille .* europeen|residente legal.*espan|legal resident.*spain)/i,
  // Trabalho remoto
  /(trabalha remoto|trabajas? remoto|work remotely|travaillez (a distance|de mani[eè]re)? distance)/i,
  // Formação superior
  /(forma[cç][ãa]o superior|formaci[oó]n superior|higher education|college degree|formation sup[eé]rieure)/i,
  // Europa nos últimos 6 meses
  /(europa nos ultimos 6 meses|europa en los ultimos 6 meses|europe in the last 6 months|europe .* 6 derniers mois)/i,
]

/**
 * Retorna true se o texto de saída é uma pergunta binária SIM/NÃO do fluxo
 * atual (que deve ser enviada como Quick Reply). Falso para perguntas abertas.
 * Extrai a última pergunta do texto (se houver várias linhas) antes de checar.
 */
export function isBinaryYesNoQuestion(text: string): boolean {
  if (!text) return false
  // Precisa terminar em pergunta
  if (!/\?/.test(text)) return false
  const normalized = normalizeForLanguageChecks(text)
  if (!normalized) return false
  return YESNO_QUESTION_PATTERNS.some((re) => re.test(normalized))
}

// -------- Twilio Content API (twilio/quick-reply) --------

const CONTENT_API_URL = 'https://content.twilio.com/v1/Content'
const GATEWAY_URL = 'https://connector-gateway.lovable.dev/twilio'
const TWILIO_FROM_NUMBER = 'whatsapp:+34654378464'

// Cache in-memory por (language + questão normalizada → ContentSid).
// Evita recriar o mesmo Content resource em cada envio dentro de uma instância.
const contentSidCache = new Map<string, string>()

function cacheKey(language: ChatLanguage, question: string): string {
  return `${language}::${normalizeForLanguageChecks(question).slice(0, 200)}`
}

function envSidFor(language: ChatLanguage): string | undefined {
  const map: Record<ChatLanguage, string> = {
    'pt-BR': 'TWILIO_YESNO_CONTENT_SID_PT_BR',
    'es':    'TWILIO_YESNO_CONTENT_SID_ES',
    'en':    'TWILIO_YESNO_CONTENT_SID_EN',
    'fr':    'TWILIO_YESNO_CONTENT_SID_FR',
  }
  const v = Deno.env.get(map[language])
  return v && v.trim().length > 0 ? v.trim() : undefined
}

/**
 * Cria (ou reutiliza) um Content resource twilio/quick-reply com Body dinâmico
 * ({{1}} = pergunta) e 2 botões [Sim/YES], [Não/NO] no idioma alvo.
 * Retorna o ContentSid.
 *
 * Preferência: env var por idioma → cache em memória → cria novo via Content API.
 */
async function ensureYesNoContentSid(
  language: ChatLanguage,
  question: string,
  auth: { accountSid: string; authToken: string },
): Promise<string> {
  const envSid = envSidFor(language)
  if (envSid) return envSid

  const key = cacheKey(language, question)
  const cached = contentSidCache.get(key)
  if (cached) return cached

  const labels = YES_NO_LABELS[language]
  const basicAuth = btoa(`${auth.accountSid}:${auth.authToken}`)

  const payload = {
    friendly_name: `yesno_quickreply_${language}_${Date.now()}`,
    language: language === 'pt-BR' ? 'pt_BR' : language,
    variables: { '1': labels.yes },
    types: {
      'twilio/quick-reply': {
        body: '{{1}}',
        actions: [
          { title: labels.yes, id: YES_PAYLOAD },
          { title: labels.no,  id: NO_PAYLOAD  },
        ],
      },
    },
  }

  const resp = await fetch(CONTENT_API_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${basicAuth}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })
  const data = await resp.json().catch(() => ({}))
  if (!resp.ok || !(data as any).sid) {
    throw new Error(`Twilio Content API create failed [${resp.status}]: ${JSON.stringify(data).slice(0, 400)}`)
  }
  const sid = String((data as any).sid)
  contentSidCache.set(key, sid)
  console.log('[QUICK_REPLY] Created Content resource', { language, sid, question: question.slice(0, 80) })
  return sid
}

/**
 * Envia uma pergunta binária SIM/NÃO como Quick Reply via Twilio Content API.
 * Lança em caso de erro para que o chamador decida cair no fallback de texto.
 */
export async function sendYesNoQuickReply(
  phone: string,
  question: string,
  language: ChatLanguage,
): Promise<void> {
  const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY')
  const TWILIO_API_KEY = Deno.env.get('TWILIO_API_KEY')
  const TWILIO_ACCOUNT_SID = Deno.env.get('TWILIO_ACCOUNT_SID')
  const TWILIO_AUTH_TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN')

  if (!LOVABLE_API_KEY || !TWILIO_API_KEY) {
    throw new Error('Twilio gateway credentials not configured')
  }
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN) {
    throw new Error('TWILIO_ACCOUNT_SID/TWILIO_AUTH_TOKEN required for Content API')
  }

  const contentSid = await ensureYesNoContentSid(language, question, {
    accountSid: TWILIO_ACCOUNT_SID,
    authToken: TWILIO_AUTH_TOKEN,
  })

  const params: Record<string, string> = {
    To: `whatsapp:+${phone}`,
    From: TWILIO_FROM_NUMBER,
    ContentSid: contentSid,
    ContentVariables: JSON.stringify({ '1': question }),
  }

  const resp = await fetch(`${GATEWAY_URL}/Messages.json`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${LOVABLE_API_KEY}`,
      'X-Connection-Api-Key': TWILIO_API_KEY,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams(params),
  })
  if (!resp.ok) {
    const body = await resp.text()
    throw new Error(`Twilio Messages send (quick-reply) failed [${resp.status}]: ${body.slice(0, 400)}`)
  }
  console.log('[QUICK_REPLY] Sent yes/no quick reply', { phone, language })
}
