// @ts-nocheck
// Wave 3b step 11: contact data extraction & suggestions
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

/**
 * Mapeia uma resposta livre do cliente à pergunta de INTERESSE para um valor
 * válido do enum `service_interest`. Retorna null se nada bater.
 *
 * Enum disponível (ver migration):
 *   VISTO_ESTUDANTE, VISTO_TRABALHO, REAGRUPAMENTO, RENOVACAO_RESIDENCIA,
 *   NACIONALIDADE_RESIDENCIA, NACIONALIDADE_CASAMENTO, OUTRO,
 *   RESIDENCIA_PARENTE_COMUNITARIO, SEM_SERVICO
 */
// Detecta perguntas factuais ("o que é X?", "qué es X?", "what is X?",
// "qu'est-ce que X?", "como funciona", "quanto custa", etc.). Reusa o detector
// universal de lib/offtopic.ts para garantir paridade entre classificação
// off-topic e captura de interesse.
import { isFactualQuestion } from './offtopic.ts'

export function isFactualQuestionMessage(raw: string): boolean {
  return isFactualQuestion(raw)
}

export function extractInterestFromMessage(raw: string): string | null {
  if (!raw) return null
  // Bloqueia captura de interesse quando a mensagem é uma pergunta factual.
  if (isFactualQuestionMessage(raw)) return null
  const t = raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
  if (!t) return null
  // Pareja de hecho / cônjuge / namorado(a) com cidadão comunitário → família comunitária
  // (tem prioridade sobre casamento genérico, pois indica claramente régimen comunitario)
  if (/(pareja\s+de\s+hecho|uni[aã]o\s+est[aá]vel|uni[oó]n\s+de\s+hecho|civil\s+partnership|pacs)/.test(t)) return 'RESIDENCIA_PARENTE_COMUNITARIO'
  if (/(namorad[oa]|noiv[oa]|novi[oa]|c[oô]njuge|fiance|boyfriend|girlfriend|petit[e]?\s+ami[e]?)\s+(espanhol|espanhola|espanol|espanola|espagnol|espagnole|spanish|comunitari[oa]|europe[uo]|european)/.test(t)) return 'RESIDENCIA_PARENTE_COMUNITARIO'
  // Casamento tem prioridade sobre nacionalidade genérica
  if (/(casamento|matrimonio|conyug|esposa|esposo|marriage|spouse)/.test(t)) return 'NACIONALIDADE_CASAMENTO'
  if (/(nacionalidad|cidadania|ciudadan|citizenship|passaporte espanhol|passaporte espanol)/.test(t)) return 'NACIONALIDADE_RESIDENCIA'
  if (/(estud|homologa|universidad|faculdade|college|study|studies)/.test(t)) return 'VISTO_ESTUDANTE'
  if (/(reagrupa|reagrupacion|reunifica|family reunif)/.test(t)) return 'REAGRUPAMENTO'
  if (/(renova|renovacion|renewal)/.test(t)) return 'RENOVACAO_RESIDENCIA'
  if (/(arraigo|residenc|\bnie\b|\btie\b|tarjeta|residence)/.test(t)) return 'RESIDENCIA_PARENTE_COMUNITARIO'
  if (/(nomad|digital|trabalh|\bwork\b|\bjob\b|emprego|empleo|visto trabalho)/.test(t)) return 'VISTO_TRABALHO'
  return null
}

export function extractNameAndEmail(text: string): { name: string | null; email: string | null } {
  let name: string | null = null
  let email: string | null = null

  const emailMatch = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/)
  if (emailMatch) email = emailMatch[0].toLowerCase()

  const namePatterns = [
    /(?:me chamo|meu nome [eé]|sou (?:o |a )?)\s*([A-ZÀ-Ú][a-zà-ú]+(?:\s+[A-ZÀ-Ú][a-zà-ú]+)*)/i,
    /(?:nome|name)\s*[:=]?\s*([A-ZÀ-Ú][a-zà-ú]+(?:\s+[A-ZÀ-Ú][a-zà-ú]+)*)/i,
  ]
  for (const pattern of namePatterns) {
    const match = text.match(pattern)
    if (match?.[1]) {
      name = match[1].trim()
      break
    }
  }

  return { name, email }
}

export function extractReferralSource(messageText: string): string | null {
  const text = messageText.trim()
  const lower = text.toLowerCase()

  const referralPatterns = [
    /\b(?:vi|vim|achei|encontrei|conheci|soube|descobri|cheguei)\s+(?:voc[eê]s?|a\s+cb|a\s+empresa)?\s*(?:pelo|pela|por|no|na|atrav[eé]s\s+do|atrav[eé]s\s+da)\s+([a-záàâãéèêíïóôõöúçñ\s]{2,40})/i,
    /\b(?:me\s+indicaram|fui\s+indicad[oa]|indicaç[aã]o\s+de|indicado\s+por|indicada\s+por)\s+([a-záàâãéèêíïóôõöúçñ\s]{2,50})/i,
    /\b(?:instagram|google|facebook|tiktok|tik\s*tok|youtube|site|internet|whatsapp|amigo|amiga)\b/i,
  ]

  const match = referralPatterns.map(pattern => lower.match(pattern)).find(Boolean)
  if (!match) return null

  const rawValue = (match[1] || match[0]).replace(/\b(?:de|do|da|dos|das|um|uma|meu|minha|pelo|pela|por|no|na)\b/gi, ' ').trim()
  const normalized = rawValue.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

  const knownSources: Record<string, string> = {
    instagram: 'Instagram', google: 'Google', facebook: 'Facebook',
    tiktok: 'TikTok', 'tik tok': 'TikTok', youtube: 'YouTube',
    site: 'Site', internet: 'Internet', whatsapp: 'WhatsApp',
    amigo: 'Indicação de amigo', amiga: 'Indicação de amiga',
  }

  for (const [key, label] of Object.entries(knownSources)) {
    if (normalized.includes(key)) return label
  }

  return rawValue
    .split(/\s+/)
    .filter(Boolean)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ')
}

export async function extractAndSuggestContactData(
  supabase: ReturnType<typeof createClient>,
  contactId: string,
  messageText: string,
  apiKey: string,
): Promise<void> {
  if (!messageText || messageText.length < 5) return

  if (/^(ok|sim|não|nao|obrigad|oi|olá|hola|hello|bonjour|👍|✅)[\s!?.]*$/i.test(messageText.trim())) return

  const deterministicReferral = extractReferralSource(messageText)

  const prompt = `Analise a mensagem do cliente e extraia APENAS dados pessoais explicitamente mencionados.
Retorne um JSON com SOMENTE os campos que foram claramente informados na mensagem. Não invente dados.

Campos possíveis:
- full_name (nome completo)
- nationality (nacionalidade)
- country_of_origin (país de origem)
- birth_date (data de nascimento, formato YYYY-MM-DD)
- civil_status (solteiro, casado, divorciado, viuvo, uniao_estavel)
- profession (profissão)
- email (e-mail)
- cpf (CPF brasileiro, apenas dígitos, 11 caracteres - aceite formatos como "123.456.789-00", "12345678900", "123 456 789 00")
- document_number (número do documento de identidade/NIE/passaporte/DNI, se NÃO for CPF)
- address (endereço)
- spain_arrival_date (data de chegada na Espanha, formato YYYY-MM-DD)
- education_level (escolaridade)
- birth_city (cidade natal)
- birth_state (estado natal)
- is_empadronado (true/false)
- empadronamiento_city (cidade do empadronamiento)
- empadronamiento_since (data desde quando, formato YYYY-MM-DD)
- has_job_offer (true/false)
- works_remotely (true/false)
- has_eu_family_member (true/false)
- referral_name (como conheceu a empresa / quem indicou — ex.: "Instagram", "Google", "Facebook", "TikTok", "YouTube", "Indicação de amigo", "João Silva". Capture quando o cliente disser frases como "vi no Instagram", "achei no Google", "fui indicado por X", "me indicaram", "conheci pelo Facebook")

REGRA CPF: Sempre normalize o CPF removendo pontos, traços e espaços. Retorne apenas os 11 dígitos. Se o cliente informar menos ou mais que 11 dígitos, NÃO inclua o campo.

REGRA REFERRAL: Para referral_name, normalize redes sociais para o nome próprio capitalizado (ex.: "instagram" → "Instagram", "google" → "Google"). Se for nome de pessoa, mantenha em formato Title Case. Não inclua o campo se o cliente apenas mencionar a rede sem dizer que foi por onde conheceu.

REGRAS DE NORMALIZAÇÃO DE DATAS (MUITO IMPORTANTE):
Sempre converta QUALQUER formato de data informado pelo cliente para o padrão YYYY-MM-DD.
Aceite e interprete variações em português, espanhol, inglês e francês, incluindo:
- Numéricas: "02/05/1990", "2-5-90", "02.05.1990", "1990/05/02", "5/2/1990" (assuma DD/MM quando ambíguo, pois clientes são PT/ES)
- Por extenso: "2 de maio de 1990", "dois de maio de mil novecentos e noventa", "02 de mayo de 1990", "May 2nd 1990", "2 mai 1990"
- Abreviadas: "2 mai 90", "02-mai-1990", "2/mai/90"
- Relativas (use a data de hoje = ${new Date().toISOString().slice(0,10)} como referência):
  * "hoje" → data de hoje
  * "ontem" → data de hoje - 1
  * "amanhã" / "mañana" → data de hoje + 1
  * "semana passada" → data de hoje - 7
  * "mês passado" → mesmo dia, mês anterior
  * "no mês que vem dia 10" → próximo mês, dia 10
  * "cheguei há 3 meses" → data de hoje - 3 meses (use o dia 1)
- Anos com 2 dígitos: se ≤ ano atual atual (ex.: "90") assuma 19YY para datas de nascimento; para datas recentes/futuras assuma 20YY.
- Meses por nome (PT/ES/EN/FR): janeiro/enero/january/janvier=01, fevereiro/febrero/february/février=02, março/marzo/march/mars=03, abril/abril/april/avril=04, maio/mayo/may/mai=05, junho/junio/june/juin=06, julho/julio/july/juillet=07, agosto/agosto/august/août=08, setembro/septiembre/september/septembre=09, outubro/octubre/october/octobre=10, novembro/noviembre/november/novembre=11, dezembro/diciembre/december/décembre=12.

Se faltar o ANO em uma data de nascimento OU na data de entrada/chegada na Espanha (spain_arrival_date), NÃO inclua o campo e não assuma ano atual. A data de entrada na Espanha só é válida com ano explícito (ex.: "20 de abril de 2024" ou "20/04/2024"). Para outras datas futuras, se faltar ano, assuma o ano atual; se a data resultante já passou e o contexto for futuro (chegada/agendamento), assuma o próximo ano.

Se a mensagem não contém nenhum dado pessoal extraível, retorne: {}

Mensagem do cliente: "${messageText}"

Responda APENAS com o JSON, sem markdown, sem explicação.`

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: 500 },
        }),
      },
    )

    if (!response.ok && !deterministicReferral) return

    const data = response.ok ? await response.json() : null
    const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || ''

    const jsonMatch = rawText.replace(/```json?\s*/g, '').replace(/```/g, '').trim()
    if (!jsonMatch || jsonMatch === '{}') {
      if (!deterministicReferral) return
    }

    let extracted: Record<string, string>
    try {
      extracted = jsonMatch && jsonMatch !== '{}' ? JSON.parse(jsonMatch) : {}
    } catch {
      console.warn('Failed to parse extraction JSON:', rawText.substring(0, 200))
      extracted = {}
    }

    if (deterministicReferral && !extracted.referral_name) {
      extracted.referral_name = deterministicReferral
    }

    if (Object.keys(extracted).length === 0) return

    const { data: currentContact } = await supabase
      .from('contacts')
      .select('*')
      .eq('id', contactId)
      .single()

    if (!currentContact) return

    const referralValue = extracted.referral_name ? String(extracted.referral_name).trim() : ''
    const currentReferral = (currentContact as Record<string, any>).referral_name

    if (referralValue && String(currentReferral || '').trim()) {
      delete extracted.referral_name
    }

    const suggestions: Array<{ contact_id: string; field_name: string; suggested_value: string; current_value: string | null }> = []

    for (const [field, value] of Object.entries(extracted)) {
      if (!value || typeof value !== 'string' && typeof value !== 'boolean' && typeof value !== 'number') continue
      const strValue = String(value)
      const currentValue = (currentContact as Record<string, any>)[field]
      const currentStr = currentValue != null ? String(currentValue) : null

      if (currentStr === strValue) continue
      if (field === 'full_name' && currentStr && !currentStr.startsWith('WhatsApp ')) continue
      if (field === 'email' && currentStr) continue

      suggestions.push({
        contact_id: contactId,
        field_name: field,
        suggested_value: strValue,
        current_value: currentStr,
      })
    }

    if (suggestions.length > 0) {
      const { data: existingPending } = await supabase
        .from('contact_data_suggestions')
        .select('field_name, suggested_value')
        .eq('contact_id', contactId)
        .eq('status', 'pending')

      const existingSet = new Set((existingPending || []).map(e => `${e.field_name}:${e.suggested_value}`))
      const newSuggestions = suggestions.filter(s => !existingSet.has(`${s.field_name}:${s.suggested_value}`))

      if (newSuggestions.length > 0) {
        await supabase.from('contact_data_suggestions').insert(newSuggestions)
        console.log(`Inserted ${newSuggestions.length} data suggestions for contact ${contactId}`)
      }
    }
  } catch (err) {
    console.error('Data extraction failed:', err instanceof Error ? err.message : err)
  }
}
