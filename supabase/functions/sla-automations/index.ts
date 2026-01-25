import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface SLAConfig {
  key: string;
  value: string;
}

// N8N Webhook URL for WhatsApp
const WHATSAPP_WEBHOOK_URL = 'https://webhook.robertobarros.ai/webhook/enviamsgccse'

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const now = new Date()
    const today = now.toISOString().split('T')[0]
    const results = {
      welcomeMessages: 0,
      reengagements: 0,
      archived: 0,
      contractReminders: 0,
      paymentPreReminders: 0,
      paymentPostReminders: 0,
      documentReminders: 0,
      onboardingReminders: 0,
      tiePickupReminders: 0,
      contractsCancelled: 0,
      technicalReviewAlerts: 0,
      sendToLegalAlerts: 0,
      requirementAlerts: 0,
      preProtocolReminders: 0,
      postProtocolAlerts: 0,
      protocolInstructionsSent: 0,
    }

    // Fetch SLA configurations
    const { data: slaConfigs } = await supabase
      .from('system_config')
      .select('key, value')
      .like('key', 'sla_%')

    const slaMap: Record<string, number> = {
      // Leads
      sla_welcome_message_minutes: 15,
      sla_incomplete_data_reengagement_days: 1,
      sla_no_response_archive_days: 3,
      // Contracts
      sla_contract_signature_reminder_1_days: 1,
      sla_contract_signature_reminder_2_days: 2,
      sla_contract_signature_reminder_3_days: 3,
      sla_contract_cancellation_days: 7,
      // Payments - Pre-due
      sla_payment_pre_reminder_7_days: 7,
      sla_payment_pre_reminder_2_days: 2,
      // Payments - Post-due
      sla_payment_reminder_1_days: 1,
      sla_payment_reminder_2_days: 3,
      sla_payment_manager_alert_days: 7,
      sla_payment_cancellation_days: 8,
      // Documents
      sla_document_reminder_normal_days: 5,
      sla_document_reminder_urgent_hours: 24,
      // TIE
      sla_tie_pickup_reminder_days: 3,
      // Onboarding
      sla_onboarding_reminder_hours: 24,
    }

    slaConfigs?.forEach((config: SLAConfig) => {
      if (config.value) {
        slaMap[config.key] = parseInt(config.value)
      }
    })

    // Fetch message templates
    const { data: templates } = await supabase
      .from('system_config')
      .select('key, value')
      .like('key', 'template_%')

    const templateMap: Record<string, string> = {
      template_welcome_message: 'Olá {nome}! Obrigado por entrar em contato com CB Asesoría. Em breve um de nossos especialistas irá atendê-lo.',
      template_reengagement_message: 'Olá {nome}! Notamos que seu cadastro está incompleto. Podemos ajudá-lo a completar suas informações?',
      template_contract_reminder: 'Olá {nome}! Seu contrato está aguardando assinatura. Acesse o portal para finalizar.',
      template_payment_pre_reminder_7d: 'Olá {nome}! 📅 Sua parcela de €{valor} vence em 7 dias ({data}). Lembre-se de efetuar o pagamento.',
      template_payment_pre_reminder_48h: 'Olá {nome}! ⏰ Sua parcela de €{valor} vence em 2 dias ({data}). Por favor, efetue o pagamento.',
      template_payment_due_today: 'Olá {nome}! 🔔 Hoje vence sua parcela de €{valor}. Efetue o pagamento até o final do dia.',
      template_payment_reminder: 'Olá {nome}! Você tem um pagamento de €{valor} em atraso. Regularize para evitar cancelamento.',
      template_document_reminder_normal: 'Olá {nome}! 📄 Estamos aguardando documentos para seu processo. Por favor, envie pelo portal.',
      template_document_reminder_urgent: 'Olá {nome}! ⚠️ URGENTE: Precisamos dos documentos pendentes. Envie hoje pelo portal.',
      template_tie_available: 'Olá {nome}! 🎊 Seu TIE está disponível para retirada. Agende sua ida ao escritório.',
      template_onboarding_reminder: 'Olá {nome}! 📝 Complete seu cadastro no portal para iniciarmos seu processo.',
    }

    templates?.forEach((t: { key: string; value: string | null }) => {
      if (t.value) templateMap[t.key] = t.value
    })

    // Helper to send WhatsApp directly (no auth needed for cron jobs)
    async function sendWhatsApp(phone: string | number, message: string, leadId?: string) {
      try {
        const phoneStr = String(phone).replace(/\D/g, '')
        
        const response = await fetch(WHATSAPP_WEBHOOK_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mensagem: message, numero: phoneStr })
        })
        
        if (!response.ok) {
          console.error('WhatsApp webhook error:', await response.text())
          return false
        }
        
        console.log('WhatsApp sent successfully to:', phoneStr.slice(-4))
        
        // Register message in mensagens_cliente for CRM chat history
        if (leadId) {
          await supabase.from('mensagens_cliente').insert({
            id_lead: leadId,
            mensagem_IA: message,
            origem: 'SISTEMA',
          })
          console.log('Message registered in mensagens_cliente for lead:', leadId)
        }
        
        return true
      } catch (e) {
        console.error('WhatsApp send failed:', e)
        return false
      }
    }

    // Helper to check reminder already sent
    async function reminderAlreadySent(table: string, recordId: string, reminderType: string): Promise<boolean> {
      const { data } = await supabase
        .from(table)
        .select('id')
        .eq(table === 'payment_reminders' ? 'payment_id' : 'contract_id', recordId)
        .eq('reminder_type', reminderType)
        .maybeSingle()
      return !!data
    }

    // =====================================================
    // 1. WELCOME MESSAGES - New leads without interaction
    // =====================================================
    const welcomeDeadline = new Date(now.getTime() - slaMap.sla_welcome_message_minutes * 60 * 1000)
    const { data: newLeads } = await supabase
      .from('leads')
      .select(`id, created_at, contacts!inner (id, full_name, phone)`)
      .eq('status', 'NOVO')
      .lt('created_at', welcomeDeadline.toISOString())

    for (const lead of newLeads || []) {
      const contact = lead.contacts as unknown as { id: string; full_name: string; phone: number | null }
      
      const { data: existingInteraction } = await supabase
        .from('interactions')
        .select('id')
        .eq('lead_id', lead.id)
        .eq('channel', 'WHATSAPP')
        .eq('direction', 'OUTBOUND')
        .limit(1)
        .maybeSingle()

      if (!existingInteraction && contact.phone) {
        const message = templateMap.template_welcome_message.replace('{nome}', contact.full_name)

        await supabase.from('interactions').insert({
          lead_id: lead.id,
          contact_id: contact.id,
          channel: 'WHATSAPP',
          direction: 'OUTBOUND',
          content: message,
          origin_bot: true,
        })

        await sendWhatsApp(contact.phone, message, lead.id)
        results.welcomeMessages++
      }
    }

    // =====================================================
    // 2. REENGAGEMENT - Leads with incomplete data
    // =====================================================
    const reengagementDeadline = new Date(now.getTime() - slaMap.sla_incomplete_data_reengagement_days * 24 * 60 * 60 * 1000)
    const { data: incompleteLeads } = await supabase
      .from('leads')
      .select(`id, updated_at, contacts!inner (id, full_name, phone)`)
      .eq('status', 'DADOS_INCOMPLETOS')
      .lt('updated_at', reengagementDeadline.toISOString())

    for (const lead of incompleteLeads || []) {
      const contact = lead.contacts as unknown as { id: string; full_name: string; phone: number | null }
      const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000)

      const { data: recentInteraction } = await supabase
        .from('interactions')
        .select('id')
        .eq('lead_id', lead.id)
        .eq('origin_bot', true)
        .gt('created_at', last24h.toISOString())
        .limit(1)
        .maybeSingle()

      if (!recentInteraction && contact.phone) {
        const message = templateMap.template_reengagement_message.replace('{nome}', contact.full_name)

        await supabase.from('interactions').insert({
          lead_id: lead.id,
          contact_id: contact.id,
          channel: 'WHATSAPP',
          direction: 'OUTBOUND',
          content: message,
          origin_bot: true,
        })

        await sendWhatsApp(contact.phone, message, lead.id)
        results.reengagements++
      }
    }

    // =====================================================
    // 3. AUTO-ARCHIVE - Leads without response
    // =====================================================
    const archiveDeadline = new Date(now.getTime() - slaMap.sla_no_response_archive_days * 24 * 60 * 60 * 1000)
    const { data: staleLeads } = await supabase
      .from('leads')
      .select('id, updated_at')
      .in('status', ['NOVO', 'DADOS_INCOMPLETOS', 'INTERESSE_PENDENTE'])
      .lt('updated_at', archiveDeadline.toISOString())

    for (const lead of staleLeads || []) {
      const { data: inboundInteraction } = await supabase
        .from('interactions')
        .select('id')
        .eq('lead_id', lead.id)
        .eq('direction', 'INBOUND')
        .gt('created_at', archiveDeadline.toISOString())
        .limit(1)
        .maybeSingle()

      if (!inboundInteraction) {
        await supabase.from('leads').update({ status: 'ARQUIVADO_SEM_RETORNO' }).eq('id', lead.id)
        results.archived++
      }
    }

    // =====================================================
    // 4. CONTRACT REMINDERS (D+1, D+2, D+3) + Auto-cancel D+7
    // =====================================================
    const { data: pendingContracts } = await supabase
      .from('contracts')
      .select(`
        id, created_at, opportunity_id,
        opportunities!inner (
          id,
          leads!inner (id, contacts!inner (full_name, phone))
        )
      `)
      .eq('status', 'ENVIADO')

    for (const contract of pendingContracts || []) {
      const createdAt = new Date(contract.created_at)
      const daysSinceCreated = Math.floor((now.getTime() - createdAt.getTime()) / (24 * 60 * 60 * 1000))
      const oppData = contract.opportunities as unknown as { id: string; leads: { id: string; contacts: { full_name: string; phone: number | null } } }
      const contact = oppData?.leads?.contacts
      const leadId = oppData?.leads?.id

      // Day 1 reminder
      if (daysSinceCreated >= slaMap.sla_contract_signature_reminder_1_days) {
        if (!(await reminderAlreadySent('contract_reminders', contract.id, 'D1'))) {
          await supabase.from('contract_reminders').insert({ contract_id: contract.id, reminder_type: 'D1' })
          if (contact?.phone) {
            await sendWhatsApp(contact.phone, templateMap.template_contract_reminder.replace('{nome}', contact.full_name), leadId)
          }
          results.contractReminders++
        }
      }

      // Day 2 reminder
      if (daysSinceCreated >= slaMap.sla_contract_signature_reminder_2_days) {
        if (!(await reminderAlreadySent('contract_reminders', contract.id, 'D2'))) {
          await supabase.from('contract_reminders').insert({ contract_id: contract.id, reminder_type: 'D2' })
          if (contact?.phone) {
            await sendWhatsApp(contact.phone, templateMap.template_contract_reminder.replace('{nome}', contact.full_name), leadId)
          }
          results.contractReminders++
        }
      }

      // Day 3 reminder
      if (daysSinceCreated >= slaMap.sla_contract_signature_reminder_3_days) {
        if (!(await reminderAlreadySent('contract_reminders', contract.id, 'D3'))) {
          await supabase.from('contract_reminders').insert({ contract_id: contract.id, reminder_type: 'D3' })
          if (contact?.phone) {
            await sendWhatsApp(contact.phone, templateMap.template_contract_reminder.replace('{nome}', contact.full_name), leadId)
          }
          results.contractReminders++
        }
      }

      // Auto-cancel at Day 7
      if (daysSinceCreated >= slaMap.sla_contract_cancellation_days) {
        await supabase.from('contracts').update({ 
          status: 'CANCELADO', 
          cancellation_reason: 'Cancelado automaticamente por falta de assinatura' 
        }).eq('id', contract.id)
        
        await supabase.from('opportunities').update({ 
          status: 'FECHADA_PERDIDA', 
          reason_lost: 'Contrato não assinado no prazo' 
        }).eq('id', contract.opportunity_id)
        
        results.contractsCancelled++
      }
    }

    // =====================================================
    // 5. PAYMENT PRE-REMINDERS (D-7, D-2, D0)
    // =====================================================
    const { data: upcomingPayments } = await supabase
      .from('payments')
      .select(`
        id, due_date, amount, currency,
        opportunities!inner (leads!inner (id, contacts!inner (full_name, phone)))
      `)
      .eq('status', 'PENDENTE')
      .gte('due_date', today)

    for (const payment of upcomingPayments || []) {
      if (!payment.due_date) continue
      const oppData = payment.opportunities as unknown as { leads: { id: string; contacts: { full_name: string; phone: number | null } } }
      const contact = oppData?.leads?.contacts
      const leadId = oppData?.leads?.id
      if (!contact?.phone) continue

      const dueDate = new Date(payment.due_date)
      const daysUntilDue = Math.floor((dueDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000))

      // 7 days before
      if (daysUntilDue <= 7 && daysUntilDue > 2) {
        if (!(await reminderAlreadySent('payment_reminders', payment.id, 'PRE_7D'))) {
          await supabase.from('payment_reminders').insert({ payment_id: payment.id, reminder_type: 'PRE_7D' })
          const msg = templateMap.template_payment_pre_reminder_7d
            .replace('{nome}', contact.full_name)
            .replace('{valor}', String(payment.amount))
            .replace('{data}', payment.due_date)
          await sendWhatsApp(contact.phone, msg, leadId)
          results.paymentPreReminders++
        }
      }

      // 2 days before
      if (daysUntilDue <= 2 && daysUntilDue > 0) {
        if (!(await reminderAlreadySent('payment_reminders', payment.id, 'PRE_48H'))) {
          await supabase.from('payment_reminders').insert({ payment_id: payment.id, reminder_type: 'PRE_48H' })
          const msg = templateMap.template_payment_pre_reminder_48h
            .replace('{nome}', contact.full_name)
            .replace('{valor}', String(payment.amount))
            .replace('{data}', payment.due_date)
          await sendWhatsApp(contact.phone, msg, leadId)
          results.paymentPreReminders++
        }
      }

      // Due today (at 9h - check if time is around 9:00)
      if (daysUntilDue === 0 && now.getHours() >= 9 && now.getHours() < 10) {
        if (!(await reminderAlreadySent('payment_reminders', payment.id, 'DUE_TODAY'))) {
          await supabase.from('payment_reminders').insert({ payment_id: payment.id, reminder_type: 'DUE_TODAY' })
          const msg = templateMap.template_payment_due_today
            .replace('{nome}', contact.full_name)
            .replace('{valor}', String(payment.amount))
          await sendWhatsApp(contact.phone, msg, leadId)
          results.paymentPreReminders++
        }
      }
    }

    // =====================================================
    // 6. PAYMENT POST-DUE REMINDERS (D+1, D+3, D+7) + Cancel D+8
    // =====================================================
    const { data: overduePayments } = await supabase
      .from('payments')
      .select(`
        id, due_date, amount, currency, contract_id, opportunity_id,
        opportunities!inner (leads!inner (id, contacts!inner (full_name, phone)))
      `)
      .eq('status', 'PENDENTE')
      .lt('due_date', today)

    for (const payment of overduePayments || []) {
      if (!payment.due_date) continue
      const dueDate = new Date(payment.due_date)
      const daysOverdue = Math.floor((now.getTime() - dueDate.getTime()) / (24 * 60 * 60 * 1000))
      const oppData = payment.opportunities as unknown as { leads: { id: string; contacts: { full_name: string; phone: number | null } } }
      const contact = oppData?.leads?.contacts
      const leadId = oppData?.leads?.id

      // D+1 reminder
      if (daysOverdue >= 1 && daysOverdue < 3) {
        if (!(await reminderAlreadySent('payment_reminders', payment.id, 'POST_D1'))) {
          await supabase.from('payment_reminders').insert({ payment_id: payment.id, reminder_type: 'POST_D1' })
          if (contact?.phone) {
            const msg = templateMap.template_payment_reminder
              .replace('{nome}', contact.full_name)
              .replace('{valor}', String(payment.amount))
            await sendWhatsApp(contact.phone, msg, leadId)
          }
          results.paymentPostReminders++
        }
      }

      // D+3 reminder + alert manager
      if (daysOverdue >= 3 && daysOverdue < 7) {
        if (!(await reminderAlreadySent('payment_reminders', payment.id, 'POST_D3'))) {
          await supabase.from('payment_reminders').insert({ payment_id: payment.id, reminder_type: 'POST_D3' })
          if (contact?.phone) {
            const msg = templateMap.template_payment_reminder
              .replace('{nome}', contact.full_name)
              .replace('{valor}', String(payment.amount))
            await sendWhatsApp(contact.phone, msg, leadId)
          }
          // Alert managers
          const { data: managers } = await supabase.from('user_roles').select('user_id').eq('role', 'MANAGER')
          for (const mgr of managers || []) {
            await supabase.from('notifications').insert({
              user_id: mgr.user_id,
              title: 'Pagamento atrasado D+3',
              message: `Pagamento de €${payment.amount} está 3 dias atrasado.`,
              type: 'payment_overdue',
            })
          }
          results.paymentPostReminders++
        }
      }

      // D+7 alert admin
      if (daysOverdue >= 7 && daysOverdue < 8) {
        if (!(await reminderAlreadySent('payment_reminders', payment.id, 'POST_D7'))) {
          await supabase.from('payment_reminders').insert({ payment_id: payment.id, reminder_type: 'POST_D7' })
          // Alert admins
          const { data: admins } = await supabase.from('user_roles').select('user_id').eq('role', 'ADMIN')
          for (const admin of admins || []) {
            await supabase.from('notifications').insert({
              user_id: admin.user_id,
              title: 'Pagamento atrasado D+7 - Cancelamento iminente',
              message: `Pagamento de €${payment.amount} está 7 dias atrasado. Será cancelado em 24h.`,
              type: 'payment_overdue',
            })
          }
          results.paymentPostReminders++
        }
      }

      // D+8 auto-cancel
      if (daysOverdue >= slaMap.sla_payment_cancellation_days) {
        if (payment.contract_id) {
          await supabase.from('contracts').update({
            status: 'CANCELADO',
            cancellation_reason: 'Cancelado automaticamente por inadimplência',
          }).eq('id', payment.contract_id)
        }
        if (payment.opportunity_id) {
          await supabase.from('opportunities').update({
            status: 'FECHADA_PERDIDA',
            reason_lost: 'Inadimplência',
          }).eq('id', payment.opportunity_id)
        }
        await supabase.from('payments').update({ status: 'CANCELADO' }).eq('id', payment.id)
        results.contractsCancelled++
      }
    }

    // =====================================================
    // 7. DOCUMENT REMINDERS
    // =====================================================
    const { data: pendingDocuments } = await supabase
      .from('service_documents')
      .select(`
        id, status, updated_at,
        service_cases!inner (
          id, is_urgent, client_user_id,
          opportunities!inner (leads!inner (id, contacts!inner (full_name, phone)))
        )
      `)
      .eq('status', 'PENDENTE')

    for (const doc of pendingDocuments || []) {
      const caseData = doc.service_cases as unknown as { 
        id: string; 
        is_urgent: boolean; 
        client_user_id: string | null;
        opportunities: { leads: { id: string; contacts: { full_name: string; phone: number | null } } }
      }
      const contact = caseData?.opportunities?.leads?.contacts
      const leadId = caseData?.opportunities?.leads?.id
      if (!contact?.phone) continue

      const updatedAt = new Date(doc.updated_at || doc.id)
      const hoursSinceUpdate = (now.getTime() - updatedAt.getTime()) / (60 * 60 * 1000)
      const daysSinceUpdate = hoursSinceUpdate / 24

      const shouldRemind = caseData.is_urgent 
        ? hoursSinceUpdate >= slaMap.sla_document_reminder_urgent_hours
        : daysSinceUpdate >= slaMap.sla_document_reminder_normal_days

      if (shouldRemind) {
        const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000)
        const { data: recentNotif } = await supabase
          .from('notifications')
          .select('id')
          .eq('type', 'document_reminder')
          .gt('created_at', last24h.toISOString())
          .limit(1)
          .maybeSingle()

        if (!recentNotif) {
          const template = caseData.is_urgent ? templateMap.template_document_reminder_urgent : templateMap.template_document_reminder_normal
          const msg = template.replace('{nome}', contact.full_name)
          await sendWhatsApp(contact.phone, msg, leadId)

          if (caseData.client_user_id) {
            await supabase.from('notifications').insert({
              user_id: caseData.client_user_id,
              title: 'Lembrete de Documentos',
              message: 'Você possui documentos pendentes para envio.',
              type: 'document_reminder',
            })
          }
          results.documentReminders++
        }
      }
    }

    // =====================================================
    // 8. ONBOARDING REMINDERS
    // =====================================================
    const { data: incompleteOnboarding } = await supabase
      .from('contacts')
      .select('id, full_name, phone, updated_at')
      .eq('onboarding_completed', false)

    for (const contact of incompleteOnboarding || []) {
      if (!contact.phone) continue
      const updatedAt = new Date(contact.updated_at || contact.id)
      const hoursSinceUpdate = (now.getTime() - updatedAt.getTime()) / (60 * 60 * 1000)

      if (hoursSinceUpdate >= slaMap.sla_onboarding_reminder_hours) {
        const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000)
        
        const { data: recentInteraction } = await supabase
          .from('interactions')
          .select('id')
          .eq('contact_id', contact.id)
          .eq('origin_bot', true)
          .gt('created_at', last24h.toISOString())
          .limit(1)
          .maybeSingle()

        if (!recentInteraction) {
          const msg = templateMap.template_onboarding_reminder.replace('{nome}', contact.full_name)
          await sendWhatsApp(contact.phone, msg)
          
          await supabase.from('interactions').insert({
            contact_id: contact.id,
            channel: 'WHATSAPP',
            direction: 'OUTBOUND',
            content: msg,
            origin_bot: true,
          })
          results.onboardingReminders++
        }
      }
    }

    // =====================================================
    // 9. TIE PICKUP REMINDERS
    // =====================================================
    const { data: tieReady } = await supabase
      .from('service_cases')
      .select(`
        id, tie_pickup_date, tie_picked_up, client_user_id,
        opportunities!inner (leads!inner (id, contacts!inner (full_name, phone)))
      `)
      .not('tie_pickup_date', 'is', null)
      .eq('tie_picked_up', false)

    for (const sc of tieReady || []) {
      if (!sc.tie_pickup_date) continue
      const pickupDate = new Date(sc.tie_pickup_date)
      const daysSinceReady = Math.floor((now.getTime() - pickupDate.getTime()) / (24 * 60 * 60 * 1000))

      if (daysSinceReady >= slaMap.sla_tie_pickup_reminder_days) {
        const caseData = sc as unknown as { 
          opportunities: { leads: { id: string; contacts: { full_name: string; phone: number | null } } };
          client_user_id: string | null;
        }
        const contact = caseData?.opportunities?.leads?.contacts
        const leadId = caseData?.opportunities?.leads?.id
        if (!contact?.phone) continue

        const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000)
        const { data: recentNotif } = await supabase
          .from('notifications')
          .select('id')
          .eq('type', 'tie_pickup')
          .gt('created_at', last24h.toISOString())
          .limit(1)
          .maybeSingle()

        if (!recentNotif) {
          const msg = templateMap.template_tie_available.replace('{nome}', contact.full_name)
          await sendWhatsApp(contact.phone, msg, leadId)

          if (sc.client_user_id) {
            await supabase.from('notifications').insert({
              user_id: sc.client_user_id,
              title: 'TIE disponível',
              message: 'Seu TIE está disponível para retirada.',
              type: 'tie_pickup',
            })
          }
          results.tiePickupReminders++
        }
      }
    }

    // =====================================================
    // 10. TECHNICAL REVIEW ALERTS (Cases pending > 48h)
    // =====================================================
    const techReviewDeadline = new Date(now.getTime() - 48 * 60 * 60 * 1000)
    const { data: pendingTechReview } = await supabase
      .from('service_cases')
      .select('id, updated_at, assigned_to_user_id')
      .eq('technical_status', 'PENDENTE')
      .lt('updated_at', techReviewDeadline.toISOString())

    for (const sc of pendingTechReview || []) {
      const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000)
      const { data: recentNotif } = await supabase
        .from('notifications')
        .select('id')
        .eq('type', 'technical_review_overdue')
        .gt('created_at', last24h.toISOString())
        .limit(1)
        .maybeSingle()

      if (!recentNotif) {
        const { data: managers } = await supabase.from('user_roles').select('user_id').eq('role', 'MANAGER')
        for (const mgr of managers || []) {
          await supabase.from('notifications').insert({
            user_id: mgr.user_id,
            title: 'Revisão Técnica Atrasada',
            message: `Caso ${sc.id.slice(0, 8)} aguarda revisão técnica há mais de 48h.`,
            type: 'technical_review_overdue',
          })
        }
        results.technicalReviewAlerts++
      }
    }

    // =====================================================
    // 11. SEND TO LEGAL ALERTS (Approved but not sent > 24h)
    // =====================================================
    const legalDeadline = new Date(now.getTime() - 24 * 60 * 60 * 1000)
    const { data: approvedNotSent } = await supabase
      .from('service_cases')
      .select('id, technical_approved_at, assigned_to_user_id')
      .eq('technical_status', 'APROVADO')
      .is('sent_to_legal_at', null)
      .lt('technical_approved_at', legalDeadline.toISOString())

    for (const sc of approvedNotSent || []) {
      const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000)
      const { data: recentNotif } = await supabase
        .from('notifications')
        .select('id')
        .eq('type', 'send_to_legal_overdue')
        .gt('created_at', last24h.toISOString())
        .limit(1)
        .maybeSingle()

      if (!recentNotif && sc.assigned_to_user_id) {
        await supabase.from('notifications').insert({
          user_id: sc.assigned_to_user_id,
          title: 'Enviar ao Jurídico',
          message: `Caso ${sc.id.slice(0, 8)} aprovado há mais de 24h e ainda não enviado ao jurídico.`,
          type: 'send_to_legal_overdue',
        })
        results.sendToLegalAlerts++
      }
    }

    // =====================================================
    // 12. REQUIREMENT DEADLINE ALERTS
    // =====================================================
    const { data: urgentRequirements } = await supabase
      .from('requirements_from_authority')
      .select(`
        id, description, internal_deadline_date, official_deadline_date,
        service_cases!inner (assigned_to_user_id, client_user_id, opportunities!inner (leads!inner (id, contacts!inner (full_name, phone))))
      `)
      .eq('status', 'PENDENTE')

    for (const req of urgentRequirements || []) {
      const caseData = req.service_cases as unknown as { 
        assigned_to_user_id: string | null; 
        client_user_id: string | null;
        opportunities: { leads: { id: string; contacts: { full_name: string; phone: number | null } } };
      }
      const internalDeadline = req.internal_deadline_date ? new Date(req.internal_deadline_date) : null
      const officialDeadline = req.official_deadline_date ? new Date(req.official_deadline_date) : null

      const daysToInternal = internalDeadline ? Math.floor((internalDeadline.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)) : null
      const daysToOfficial = officialDeadline ? Math.floor((officialDeadline.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)) : null

      // Alert if internal deadline is in 2 days or less
      if (daysToInternal !== null && daysToInternal <= 2 && daysToInternal >= 0) {
        if (caseData.assigned_to_user_id) {
          const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000)
          const { data: recentNotif } = await supabase
            .from('notifications')
            .select('id')
            .eq('type', 'requirement_deadline')
            .gt('created_at', last24h.toISOString())
            .limit(1)
            .maybeSingle()

          if (!recentNotif) {
            await supabase.from('notifications').insert({
              user_id: caseData.assigned_to_user_id,
              title: 'Prazo de Exigência Próximo',
              message: `Exigência "${req.description.slice(0, 50)}..." vence em ${daysToInternal} dia(s).`,
              type: 'requirement_deadline',
            })
            results.requirementAlerts++
          }
        }
      }

      // Alert if official deadline is in 5 days or less
      if (daysToOfficial !== null && daysToOfficial <= 5 && daysToOfficial >= 0) {
        const { data: managers } = await supabase.from('user_roles').select('user_id').eq('role', 'MANAGER')
        const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000)
        const { data: recentNotif } = await supabase
          .from('notifications')
          .select('id')
          .eq('type', 'requirement_official_deadline')
          .gt('created_at', last24h.toISOString())
          .limit(1)
          .maybeSingle()

        if (!recentNotif) {
          for (const mgr of managers || []) {
            await supabase.from('notifications').insert({
              user_id: mgr.user_id,
              title: 'Prazo Oficial de Exigência',
              message: `Exigência com prazo oficial em ${daysToOfficial} dia(s).`,
              type: 'requirement_official_deadline',
            })
          }
          results.requirementAlerts++
        }
      }
    }

    // =====================================================
    // 13. PRE-PROTOCOL REMINDERS (Expected protocol date approaching)
    // =====================================================
    const { data: preProtocolCases } = await supabase
      .from('service_cases')
      .select(`
        id, expected_protocol_date, protocol_instructions_sent, assigned_to_user_id, client_user_id,
        opportunities!inner (leads!inner (id, contacts!inner (full_name, phone)))
      `)
      .not('expected_protocol_date', 'is', null)
      .is('submission_date', null)

    for (const sc of preProtocolCases || []) {
      if (!sc.expected_protocol_date) continue
      const expectedDate = new Date(sc.expected_protocol_date)
      const daysUntil = Math.floor((expectedDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000))

      // Send instructions 3 days before if not sent
      if (daysUntil <= 3 && daysUntil >= 0 && !sc.protocol_instructions_sent) {
        const caseData = sc as unknown as { 
          opportunities: { leads: { id: string; contacts: { full_name: string; phone: number | null } } };
          client_user_id: string | null;
          assigned_to_user_id: string | null;
        }
        const contact = caseData?.opportunities?.leads?.contacts
        const leadId = caseData?.opportunities?.leads?.id

        if (contact?.phone) {
          const msg = `Olá ${contact.full_name}! 📋 Seu protocolo está agendado para ${sc.expected_protocol_date}. Em breve enviaremos as instruções de preparação.`
          await sendWhatsApp(contact.phone, msg, leadId)
        }

        await supabase.from('service_cases').update({ protocol_instructions_sent: true }).eq('id', sc.id)
        results.protocolInstructionsSent++
      }

      // Alert staff 2 days before
      if (daysUntil === 2 && sc.assigned_to_user_id) {
        const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000)
        const { data: recentNotif } = await supabase
          .from('notifications')
          .select('id')
          .eq('type', 'pre_protocol_reminder')
          .gt('created_at', last24h.toISOString())
          .limit(1)
          .maybeSingle()

        if (!recentNotif) {
          await supabase.from('notifications').insert({
            user_id: sc.assigned_to_user_id,
            title: 'Protocolo em 2 dias',
            message: `Caso ${sc.id.slice(0, 8)} tem protocolo previsto em 2 dias.`,
            type: 'pre_protocol_reminder',
          })
          results.preProtocolReminders++
        }
      }
    }

    // =====================================================
    // 14. POST-PROTOCOL ALERTS (Submitted but no decision > 30 days)
    // =====================================================
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
    const { data: pendingDecision } = await supabase
      .from('service_cases')
      .select('id, submission_date, assigned_to_user_id')
      .not('submission_date', 'is', null)
      .is('decision_date', null)
      .lt('submission_date', thirtyDaysAgo.toISOString())

    for (const sc of pendingDecision || []) {
      const last7Days = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
      const { data: recentNotif } = await supabase
        .from('notifications')
        .select('id')
        .eq('type', 'post_protocol_alert')
        .gt('created_at', last7Days.toISOString())
        .limit(1)
        .maybeSingle()

      if (!recentNotif) {
        const { data: managers } = await supabase.from('user_roles').select('user_id').eq('role', 'MANAGER')
        for (const mgr of managers || []) {
          await supabase.from('notifications').insert({
            user_id: mgr.user_id,
            title: 'Decisão pendente > 30 dias',
            message: `Caso ${sc.id.slice(0, 8)} protocolado há mais de 30 dias sem decisão.`,
            type: 'post_protocol_alert',
          })
        }
        results.postProtocolAlerts++
      }
    }

    console.log('SLA Automations completed:', results)

    return new Response(JSON.stringify({
      success: true,
      timestamp: now.toISOString(),
      results,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (error: unknown) {
    console.error('SLA Automations error:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
