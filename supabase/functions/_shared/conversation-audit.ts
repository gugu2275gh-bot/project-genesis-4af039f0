// @ts-nocheck
/**
 * Auditoria documental do período de testes.
 *
 * Grava, em tabelas que NÃO são apagadas pela limpeza de base:
 *  - `whatsapp_conversation_archive` (mensagens — via trigger no banco);
 *  - `whatsapp_conversation_fields`  (campos identificados pelo agente).
 *
 * Nada aqui é lido de volta pelo atendimento: qualquer falha é engolida e o
 * fluxo continua normalmente.
 */

export interface AuditCapturedField {
  step_code?: string
  field: string
  value: string
}

/** Rótulos amigáveis para a tela de logs. */
const FIELD_LABELS: Record<string, string> = {
  'contact.full_name': 'Nome completo',
  'contact.email': 'E-mail',
  'contact.birth_date': 'Data de nascimento',
  'contact.residence_country': 'País onde mora',
  'contact.spain_arrival_date': 'Data de chegada na Espanha',
  'contact.is_empadronado': 'Está empadronado',
  'contact.empadronamiento_city': 'Cidade do empadronamento',
  'contact.empadronamiento_since': 'Empadronado desde',
  'contact.education_level': 'Formação superior',
  'contact.works_remotely': 'Trabalha remoto',
  'contact.has_eu_family_member': 'Familiar europeu',
  'contact.eu_entry_last_6_months': 'Esteve na Europa (6 meses)',
  'funnel.interest_confirmed': 'Objetivo/serviço',
  'funnel.location_known': 'Está na Espanha',
  'funnel.entry_date_confirmed': 'Data de entrada na Espanha',
  'funnel.empadronado_confirmed': 'Está empadronado',
  'funnel.empadronado_city': 'Cidade de empadronamento',
  'lead.service_interest': 'Serviço de interesse',
  'outside.age': 'Idade',
  'outside.europe_6m': 'Esteve na Europa (6 meses)',
  'outside.eu_family': 'Familiar europeu',
  'outside.remote_work': 'Trabalha remoto',
}

export function fieldLabel(field: string): string {
  return FIELD_LABELS[field] || field
}

/** Lê as chaves de configuração da auditoria (ligada? qual rodada?). */
export async function loadAuditConfig(
  supabase: any,
): Promise<{ enabled: boolean; session: number }> {
  try {
    const { data } = await supabase
      .from('system_config')
      .select('key, value')
      .in('key', ['whatsapp_conversation_logging_enabled', 'whatsapp_conversation_log_session'])
    const map: Record<string, string> = {}
    for (const row of data || []) map[row.key] = String(row.value ?? '')
    return {
      enabled: (map.whatsapp_conversation_logging_enabled || 'false').trim() === 'true',
      session: Number(map.whatsapp_conversation_log_session || '1') || 1,
    }
  } catch {
    return { enabled: false, session: 1 }
  }
}

/**
 * Registra os campos identificados no turno. Nunca lança exceção.
 */
export async function archiveCapturedFields(
  supabase: any,
  params: {
    leadId?: string | null
    contactId?: string | null
    phone?: string | null
    flowId?: string | null
    captured: AuditCapturedField[]
  },
): Promise<void> {
  try {
    const captured = (params.captured || []).filter((c) => c && c.field && String(c.value ?? '').trim())
    if (!captured.length) return

    const cfg = await loadAuditConfig(supabase)
    if (!cfg.enabled) return

    let phone = params.phone ? String(params.phone) : null
    if (!phone && params.contactId) {
      const { data } = await supabase.from('contacts').select('phone').eq('id', params.contactId).maybeSingle()
      phone = data?.phone ? String(data.phone) : null
    }

    const now = new Date().toISOString()
    const rows = captured.map((c) => ({
      session_seq: cfg.session,
      phone,
      lead_id: params.leadId ?? null,
      contact_id: params.contactId ?? null,
      field_key: c.field,
      field_label: fieldLabel(c.field),
      value_text: String(c.value ?? '').slice(0, 2000),
      value_raw: { value: c.value, step_code: c.step_code ?? null },
      crm_target: c.field,
      flow_id: params.flowId ?? null,
      step_code: c.step_code ?? null,
      captured_at: now,
    }))

    await supabase.from('whatsapp_conversation_fields').insert(rows)
  } catch (err) {
    console.warn('[CONV_AUDIT] falha ao gravar campos (não bloqueante):',
      err instanceof Error ? err.message : err)
  }
}
