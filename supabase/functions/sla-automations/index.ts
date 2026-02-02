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

// Automation types available for filtering
type AutomationType = 
  | 'ALL'
  | 'WELCOME'
  | 'REENGAGEMENT'
  | 'ARCHIVE'
  | 'CONTRACT_REMINDERS'
  | 'PAYMENT_PRE'
  | 'PAYMENT_POST'
  | 'DAILY_COLLECTION'
  | 'DOCUMENT_REMINDERS'
  | 'ONBOARDING'
  | 'TIE_PICKUP'
  | 'TECHNICAL'
  | 'LEGAL'
  | 'REQUIREMENTS'
  | 'PROTOCOL'
  | 'INITIAL_CONTACT'
  | 'POST_PROTOCOL_DOCS'
  | 'HUELLAS'

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    // Parse request body to get automation_type filter
    const body = await req.json().catch(() => ({}))
    const automationType: AutomationType = body.automation_type || 'ALL'
    
    console.log(`SLA Automations starting with filter: ${automationType}`)
    
    // Helper to check if a specific automation should run
    const shouldRun = (type: AutomationType): boolean => {
      return automationType === 'ALL' || automationType === type
    }

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
      dailyCollections: 0,
      initialContactReminders: 0,
      postProtocolDocsAlerts: 0,
      huellasScheduleReminders: 0,
      huellasPreCitaReminders: 0,
      huellasEmpadReminders: 0,
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
    if (shouldRun('WELCOME')) {
      console.log('Running WELCOME automation...')
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
    }

    // =====================================================
    // 2. REENGAGEMENT - Leads with incomplete data
    // =====================================================
    if (shouldRun('REENGAGEMENT')) {
      console.log('Running REENGAGEMENT automation...')
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
    }

    // =====================================================
    // 3. AUTO-ARCHIVE - Leads without response
    // =====================================================
    if (shouldRun('ARCHIVE')) {
      console.log('Running ARCHIVE automation...')
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
    }

    // =====================================================
    // 4. CONTRACT REMINDERS (D+1, D+2, D+3) + Auto-cancel D+7
    // =====================================================
    if (shouldRun('CONTRACT_REMINDERS')) {
      console.log('Running CONTRACT_REMINDERS automation...')
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
    }

    // =====================================================
    // 5. PAYMENT PRE-REMINDERS (D-7, D-2, D0)
    // =====================================================
    if (shouldRun('PAYMENT_PRE')) {
      console.log('Running PAYMENT_PRE automation...')
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
            
            // Notify FINANCEIRO team about upcoming payment
            const { data: financeUsers } = await supabase
              .from('user_roles')
              .select('user_id')
              .eq('role', 'FINANCEIRO')
            
            for (const user of financeUsers || []) {
              await supabase.from('notifications').insert({
                user_id: user.user_id,
                title: 'Parcela vence em 48h',
                message: `Pagamento de €${payment.amount} de ${contact.full_name} vence em ${payment.due_date}.`,
                type: 'payment_pending',
              })
            }
            
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
    }

    // =====================================================
    // 6. PAYMENT POST-DUE REMINDERS (D+1, D+3, D+7) + Cancel D+8
    // =====================================================
    if (shouldRun('PAYMENT_POST')) {
      console.log('Running PAYMENT_POST automation...')
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
    }

    // =====================================================
    // 7. DOCUMENT REMINDERS (ENHANCED)
    // =====================================================
    if (shouldRun('DOCUMENT_REMINDERS')) {
      console.log('Running DOCUMENT_REMINDERS automation (enhanced)...')
      
      // Add new SLA configs to map
      slaMap.sla_document_tech_alert_hours = slaMap.sla_document_tech_alert_hours || 48
      slaMap.sla_document_coord_alert_days = slaMap.sla_document_coord_alert_days || 5
      slaMap.sla_document_admin_alert_hours = slaMap.sla_document_admin_alert_hours || 48
      slaMap.sla_document_waiting_first_reminder_days = slaMap.sla_document_waiting_first_reminder_days || 30

      // Add new templates
      templateMap.template_document_waiting = templateMap.template_document_waiting || 
        'Olá {nome}! 📅 Faltam {dias} dias para a data prevista do seu protocolo. Por favor, comece a reunir os documentos pendentes e envie pelo portal.'
      templateMap.template_document_confirmation = templateMap.template_document_confirmation ||
        'Olá {nome}! ✅ Recebemos toda a sua documentação, que agora está em fase de revisão pelo técnico responsável. O processo de análise pode levar até 5 dias úteis.'
      
      // Helper to check if document reminder was already sent
      async function docReminderSent(caseId: string, reminderType: string): Promise<boolean> {
        const { data } = await supabase
          .from('document_reminders')
          .select('id')
          .eq('service_case_id', caseId)
          .eq('reminder_type', reminderType)
          .maybeSingle()
        return !!data
      }
      
      // Helper to record document reminder
      async function recordDocReminder(caseId: string, reminderType: string, recipientType: string = 'CLIENT') {
        await supabase.from('document_reminders').insert({
          service_case_id: caseId,
          reminder_type: reminderType,
          recipient_type: recipientType
        })
      }
      
      // Helper to handle documents complete
      async function handleDocumentsComplete(serviceCase: any) {
        console.log(`All documents submitted for case ${serviceCase.id}, triggering completion flow...`)
        
        // 1. Update case status
        await supabase.from('service_cases').update({
          documents_completed_at: new Date().toISOString(),
          technical_status: 'DOCUMENTOS_EM_CONFERENCIA'
        }).eq('id', serviceCase.id)
        
        // 2. Notify technician
        if (serviceCase.assigned_to_user_id) {
          await supabase.from('notifications').insert({
            user_id: serviceCase.assigned_to_user_id,
            type: 'documents_complete',
            title: 'Documentação Completa',
            message: `O cliente enviou todos os documentos. Caso pronto para conferência.`
          })
        }
        
        // 3. Send confirmation to client via WhatsApp
        const contact = serviceCase.opportunities?.leads?.contacts
        const leadId = serviceCase.opportunities?.leads?.id
        if (contact?.phone) {
          const msg = templateMap.template_document_confirmation.replace('{nome}', contact.full_name)
          await sendWhatsApp(contact.phone, msg, leadId)
        }
        
        // 4. Notify client in portal
        if (serviceCase.client_user_id) {
          await supabase.from('notifications').insert({
            user_id: serviceCase.client_user_id,
            type: 'documents_complete',
            title: 'Documentação Recebida',
            message: 'Recebemos toda a sua documentação. Ela será analisada em até 5 dias úteis.'
          })
        }
        
        results.documentReminders++
        console.log(`Documents completion flow completed for case ${serviceCase.id}`)
      }
      
      // Fetch cases waiting for documents (not completed)
      const { data: casesWithPendingDocs } = await supabase
        .from('service_cases')
        .select(`
          id, is_urgent, case_priority, expected_protocol_date,
          assigned_to_user_id, client_user_id, first_contact_at, created_at,
          technical_status, documents_completed_at,
          opportunities!inner (leads!inner (id, contacts!inner (full_name, phone)))
        `)
        .eq('technical_status', 'AGUARDANDO_DOCUMENTOS')
        .is('documents_completed_at', null)
      
      console.log(`Found ${casesWithPendingDocs?.length || 0} cases awaiting documents`)
      
      for (const sc of casesWithPendingDocs || []) {
        // Check pending documents count
        const { count: pendingCount } = await supabase
          .from('service_documents')
          .select('*', { count: 'exact', head: true })
          .eq('service_case_id', sc.id)
          .in('status', ['NAO_ENVIADO', 'REJEITADO'])
        
        // If no pending docs, all were submitted - trigger completion
        if (!pendingCount || pendingCount === 0) {
          await handleDocumentsComplete(sc)
          continue
        }
        
        const contact = (sc.opportunities as any)?.leads?.contacts
        const leadId = (sc.opportunities as any)?.leads?.id
        const clientName = contact?.full_name || 'Cliente'
        const caseShortId = sc.id.slice(0, 8)
        const firstContactAt = new Date(sc.first_contact_at || sc.created_at)
        const hoursSinceRelease = (now.getTime() - firstContactAt.getTime()) / (60 * 60 * 1000)
        const daysSinceRelease = hoursSinceRelease / 24
        
        // Determine priority type
        const priorityType = sc.is_urgent ? 'URGENT' 
          : sc.case_priority === 'EM_ESPERA' ? 'WAITING' 
          : 'NORMAL'
        
        console.log(`Case ${caseShortId}: priority=${priorityType}, pendingDocs=${pendingCount}, daysSinceRelease=${daysSinceRelease.toFixed(1)}`)
        
        // ========================
        // URGENT CASES - 24h cycle
        // ========================
        if (priorityType === 'URGENT') {
          const urgentCycleNumber = Math.floor(hoursSinceRelease / slaMap.sla_document_reminder_urgent_hours)
          const reminderKey = `URGENT_CLIENT_${urgentCycleNumber}`
          
          if (urgentCycleNumber >= 1 && !(await docReminderSent(sc.id, reminderKey))) {
            // Client WhatsApp reminder
            if (contact?.phone) {
              const msg = templateMap.template_document_reminder_urgent.replace('{nome}', clientName)
              await sendWhatsApp(contact.phone, msg, leadId)
            }
            await recordDocReminder(sc.id, reminderKey, 'CLIENT')
            
            // Technician notification (every 24h)
            if (sc.assigned_to_user_id) {
              await supabase.from('notifications').insert({
                user_id: sc.assigned_to_user_id,
                type: 'document_pending_urgent',
                title: '⚠️ Documentos Pendentes (Urgente)',
                message: `Caso ${caseShortId} de ${clientName} aguarda documentos há ${Math.floor(hoursSinceRelease)}h (URGENTE).`
              })
            }
            results.documentReminders++
          }
        }
        
        // ========================
        // NORMAL CASES - D+2, D+5 internal, D+5, D+10, D+15... client
        // ========================
        if (priorityType === 'NORMAL') {
          // D+2 (48h) - Alert technician + admin
          if (hoursSinceRelease >= slaMap.sla_document_tech_alert_hours) {
            if (!(await docReminderSent(sc.id, 'TECH_D2'))) {
              if (sc.assigned_to_user_id) {
                await supabase.from('notifications').insert({
                  user_id: sc.assigned_to_user_id,
                  type: 'document_pending_tech',
                  title: 'Documentos Pendentes há 48h',
                  message: `Caso ${caseShortId} de ${clientName} aguarda documentos há mais de 48h.`
                })
              }
              await recordDocReminder(sc.id, 'TECH_D2', 'TECH')
              results.documentReminders++
            }
            
            // Admin alert also at 48h
            if (!(await docReminderSent(sc.id, 'ADMIN_D2'))) {
              const { data: admins } = await supabase.from('user_roles').select('user_id').eq('role', 'ADMIN')
              for (const admin of admins || []) {
                await supabase.from('notifications').insert({
                  user_id: admin.user_id,
                  type: 'document_pending_admin',
                  title: 'Caso com Documentos Pendentes',
                  message: `Caso ${caseShortId} de ${clientName} aguarda documentos há mais de 48h.`
                })
              }
              await recordDocReminder(sc.id, 'ADMIN_D2', 'ADMIN')
            }
          }
          
          // D+5 - Alert coordinator + first client reminder
          if (daysSinceRelease >= slaMap.sla_document_coord_alert_days) {
            // Coordinator alert
            if (!(await docReminderSent(sc.id, 'COORD_D5'))) {
              const { data: managers } = await supabase.from('user_roles').select('user_id').eq('role', 'MANAGER')
              for (const mgr of managers || []) {
                await supabase.from('notifications').insert({
                  user_id: mgr.user_id,
                  type: 'document_pending_coord',
                  title: 'Documentos Pendentes há 5 dias',
                  message: `Caso ${caseShortId} de ${clientName} aguarda documentos há mais de 5 dias.`
                })
              }
              await recordDocReminder(sc.id, 'COORD_D5', 'COORD')
            }
            
            // Client reminders every 5 days: D5, D10, D15, D20...
            const reminderCycle = Math.floor(daysSinceRelease / slaMap.sla_document_reminder_normal_days)
            const clientReminderKey = `CLIENT_D${reminderCycle * slaMap.sla_document_reminder_normal_days}`
            
            if (!(await docReminderSent(sc.id, clientReminderKey))) {
              if (contact?.phone) {
                const msg = templateMap.template_document_reminder_normal.replace('{nome}', clientName)
                await sendWhatsApp(contact.phone, msg, leadId)
              }
              
              if (sc.client_user_id) {
                await supabase.from('notifications').insert({
                  user_id: sc.client_user_id,
                  type: 'document_reminder',
                  title: 'Lembrete de Documentos',
                  message: 'Você possui documentos pendentes para envio.'
                })
              }
              await recordDocReminder(sc.id, clientReminderKey, 'CLIENT')
              results.documentReminders++
            }
          }
        }
        
        // ========================
        // WAITING CASES (EM_ESPERA) - Based on expected_protocol_date
        // ========================
        if (priorityType === 'WAITING' && sc.expected_protocol_date) {
          const expectedDate = new Date(sc.expected_protocol_date)
          const daysUntilProtocol = Math.floor((expectedDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000))
          
          console.log(`Case ${caseShortId} (WAITING): ${daysUntilProtocol} days until protocol`)
          
          // Start reminders 30 days before, then every 5 days
          if (daysUntilProtocol <= slaMap.sla_document_waiting_first_reminder_days && daysUntilProtocol > 0) {
            // Calculate which reminder cycle we're in
            const daysFromFirst = slaMap.sla_document_waiting_first_reminder_days - daysUntilProtocol
            const reminderCycle = Math.floor(daysFromFirst / 5)
            const waitingReminderKey = `WAITING_D${daysUntilProtocol}`
            
            // Only send if this specific day reminder wasn't sent
            if (!(await docReminderSent(sc.id, waitingReminderKey))) {
              if (contact?.phone) {
                const msg = templateMap.template_document_waiting
                  .replace('{nome}', clientName)
                  .replace('{dias}', String(daysUntilProtocol))
                await sendWhatsApp(contact.phone, msg, leadId)
              }
              
              if (sc.client_user_id) {
                await supabase.from('notifications').insert({
                  user_id: sc.client_user_id,
                  type: 'document_reminder_waiting',
                  title: 'Lembrete: Data de Protocolo se Aproxima',
                  message: `Faltam ${daysUntilProtocol} dias para a data prevista do seu protocolo.`
                })
              }
              await recordDocReminder(sc.id, waitingReminderKey, 'CLIENT')
              results.documentReminders++
            }
          }
          
          // If within 5 days of protocol date, switch to urgent mode
          if (daysUntilProtocol <= 5 && daysUntilProtocol > 0) {
            const urgentWaitingKey = `WAITING_URGENT_D${daysUntilProtocol}`
            if (!(await docReminderSent(sc.id, urgentWaitingKey))) {
              if (contact?.phone) {
                const msg = templateMap.template_document_reminder_urgent.replace('{nome}', clientName)
                await sendWhatsApp(contact.phone, msg, leadId)
              }
              
              // Alert technician about approaching deadline
              if (sc.assigned_to_user_id) {
                await supabase.from('notifications').insert({
                  user_id: sc.assigned_to_user_id,
                  type: 'document_deadline_urgent',
                  title: '🚨 Prazo de Protocolo Próximo',
                  message: `Caso ${caseShortId} tem protocolo em ${daysUntilProtocol} dias e ainda há documentos pendentes!`
                })
              }
              await recordDocReminder(sc.id, urgentWaitingKey, 'CLIENT')
              results.documentReminders++
            }
          }
        }
      }
      console.log(`Document reminders automation completed. Sent: ${results.documentReminders}`)
    }

    // =====================================================
    // 8. ONBOARDING REMINDERS
    // =====================================================
    if (shouldRun('ONBOARDING')) {
      console.log('Running ONBOARDING automation...')
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
    }

    // =====================================================
    // 9. TIE PICKUP REMINDERS (Enhanced with 3-day cycle reminders)
    // =====================================================
    if (shouldRun('TIE_PICKUP')) {
      console.log('Running TIE_PICKUP automation (enhanced)...')
      
      // Helper to check if TIE reminder was already sent
      async function tieReminderSent(caseId: string, reminderType: string): Promise<boolean> {
        const { data } = await supabase
          .from('tie_pickup_reminders')
          .select('id')
          .eq('service_case_id', caseId)
          .eq('reminder_type', reminderType)
          .maybeSingle()
        return !!data
      }
      
      // Fetch cases with TIE ready for direct pickup (no appointment required)
      const { data: tieReady } = await supabase
        .from('service_cases')
        .select(`
          id, tie_estimated_ready_date, tie_lot_number, tie_picked_up, 
          tie_pickup_requires_appointment, tie_ready_notification_sent, 
          client_user_id, assigned_to_user_id, updated_at,
          opportunities!inner (leads!inner (id, contacts!inner (full_name, phone)))
        `)
        .eq('technical_status', 'DISPONIVEL_RETIRADA_TIE')
        .eq('tie_pickup_requires_appointment', false)
        .eq('tie_picked_up', false)

      for (const sc of tieReady || []) {
        const caseData = sc as unknown as { 
          id: string;
          tie_estimated_ready_date: string | null;
          updated_at: string;
          tie_ready_notification_sent: boolean | null;
          client_user_id: string | null;
          assigned_to_user_id: string | null;
          opportunities: { leads: { id: string; contacts: { full_name: string; phone: number | null } } };
        }
        
        const contact = caseData?.opportunities?.leads?.contacts
        const leadId = caseData?.opportunities?.leads?.id
        if (!contact?.phone) continue
        
        const clientName = contact.full_name
        const caseShortId = sc.id.slice(0, 8)
        
        // Reference date: tie_estimated_ready_date or case updated_at
        const referenceDate = caseData.tie_estimated_ready_date 
          ? new Date(caseData.tie_estimated_ready_date) 
          : new Date(caseData.updated_at)
        const daysSinceReady = Math.floor((now.getTime() - referenceDate.getTime()) / (24 * 60 * 60 * 1000))
        
        console.log(`TIE case ${caseShortId}: ${daysSinceReady} days since ready`)
        
        // Calculate reminder cycle (every 3 days: D3, D6, D9, D12, D15...)
        // Only send if at least 3 days have passed
        if (daysSinceReady >= slaMap.sla_tie_pickup_reminder_days) {
          const reminderCycle = Math.floor(daysSinceReady / slaMap.sla_tie_pickup_reminder_days)
          const reminderKey = `TIE_D${reminderCycle * slaMap.sla_tie_pickup_reminder_days}`
          
          if (!(await tieReminderSent(sc.id, reminderKey))) {
            // Get reminder template
            const reminderMsg = (templateMap['template_tie_reminder_direct'] || templateMap.template_tie_available)
              .replace('{nome}', clientName)
            
            // Send WhatsApp reminder
            await sendWhatsApp(contact.phone, reminderMsg, leadId)
            
            // Record reminder
            await supabase.from('tie_pickup_reminders').insert({
              service_case_id: sc.id,
              reminder_type: reminderKey
            })
            
            // Create portal notification
            if (caseData.client_user_id) {
              await supabase.from('notifications').insert({
                user_id: caseData.client_user_id,
                title: 'Lembrete: Retirada do TIE',
                message: 'Seu TIE continua disponível para retirada. Por favor, retire o mais breve possível.',
                type: 'tie_pickup_reminder',
              })
            }
            
            // D+12: Alert technician
            if (daysSinceReady >= (slaMap['sla_tie_pickup_tech_alert_days'] || 12)) {
              const techAlertKey = `TIE_TECH_D${daysSinceReady}`
              if (!(await tieReminderSent(sc.id, techAlertKey)) && caseData.assigned_to_user_id) {
                await supabase.from('notifications').insert({
                  user_id: caseData.assigned_to_user_id,
                  title: '⚠️ TIE Não Retirado há 12+ dias',
                  message: `O TIE do caso ${caseShortId} (${clientName}) está disponível há mais de ${daysSinceReady} dias e ainda não foi retirado.`,
                  type: 'tie_pickup_overdue',
                })
                await supabase.from('tie_pickup_reminders').insert({
                  service_case_id: sc.id,
                  reminder_type: techAlertKey
                })
              }
            }
            
            // D+15: Alert coordinator/manager
            if (daysSinceReady >= (slaMap['sla_tie_pickup_coord_alert_days'] || 15)) {
              const coordAlertKey = `TIE_COORD_D${Math.floor(daysSinceReady / 3) * 3}`
              if (!(await tieReminderSent(sc.id, coordAlertKey))) {
                const { data: managers } = await supabase.from('user_roles').select('user_id').eq('role', 'MANAGER')
                for (const mgr of managers || []) {
                  await supabase.from('notifications').insert({
                    user_id: mgr.user_id,
                    title: '🚨 TIE Não Retirado há 15+ dias',
                    message: `Caso ${caseShortId} (${clientName}) com TIE disponível há ${daysSinceReady} dias. Requer atenção.`,
                    type: 'tie_pickup_critical',
                  })
                }
                await supabase.from('tie_pickup_reminders').insert({
                  service_case_id: sc.id,
                  reminder_type: coordAlertKey
                })
              }
            }
            
            results.tiePickupReminders++
          }
        }
      }
      console.log(`TIE pickup reminders automation completed. Sent: ${results.tiePickupReminders}`)
    }

    // =====================================================
    // HELPER FUNCTIONS FOR TECHNICAL/LEGAL SECTIONS
    // =====================================================
    // Helper to check if document reminder was already sent (global scope)
    async function techDocReminderSent(caseId: string, reminderType: string): Promise<boolean> {
      const { data } = await supabase
        .from('document_reminders')
        .select('id')
        .eq('service_case_id', caseId)
        .eq('reminder_type', reminderType)
        .maybeSingle()
      return !!data
    }
    
    // Helper to record document reminder (global scope)
    async function recordTechDocReminder(caseId: string, reminderType: string, recipientType: string = 'CLIENT') {
      await supabase.from('document_reminders').insert({
        service_case_id: caseId,
        reminder_type: reminderType,
        recipient_type: recipientType
      })
    }

    // =====================================================
    // 10. TECHNICAL REVIEW ALERTS (Enhanced - D+2 tech, D+5 coord, D+7 admin)
    // =====================================================
    if (shouldRun('TECHNICAL')) {
      console.log('Running TECHNICAL automation (enhanced)...')
      
      // Cases in DOCUMENTOS_EM_CONFERENCIA with documents_completed_at
      const { data: casesInReview } = await supabase
        .from('service_cases')
        .select(`
          id, documents_completed_at, assigned_to_user_id, client_user_id,
          opportunities!inner (leads!inner (id, contacts!inner (full_name, phone)))
        `)
        .eq('technical_status', 'DOCUMENTOS_EM_CONFERENCIA')
        .not('documents_completed_at', 'is', null)
      
      for (const sc of casesInReview || []) {
        const completedAt = new Date(sc.documents_completed_at as string)
        const hoursSinceComplete = (now.getTime() - completedAt.getTime()) / (60 * 60 * 1000)
        const daysSinceComplete = hoursSinceComplete / 24
        const caseShortId = sc.id.slice(0, 8)
        const caseData = sc as unknown as { 
          opportunities: { leads: { id: string; contacts: { full_name: string; phone: number | null } } };
          assigned_to_user_id: string | null;
        }
        const clientName = caseData.opportunities?.leads?.contacts?.full_name || 'Cliente'
        
        // D+2 (48h) - Daily alerts to technician
        if (hoursSinceComplete >= (slaMap.sla_tech_review_tech_alert_hours || 48)) {
          const dayKey = Math.floor(daysSinceComplete)
          const reminderKey = `TECH_REVIEW_D${dayKey}`
          
          if (!(await techDocReminderSent(sc.id, reminderKey))) {
            if (caseData.assigned_to_user_id) {
              await supabase.from('notifications').insert({
                user_id: caseData.assigned_to_user_id,
                type: 'tech_review_pending',
                title: 'Revisão Técnica Pendente',
                message: `Caso ${caseShortId} de ${clientName} aguarda revisão há ${Math.floor(daysSinceComplete)} dias.`
              })
            }
            await recordTechDocReminder(sc.id, reminderKey, 'TECH')
            results.technicalReviewAlerts++
          }
        }
        
        // D+5 - Coordinator alert
        if (daysSinceComplete >= (slaMap.sla_tech_review_coord_alert_days || 5)) {
          if (!(await techDocReminderSent(sc.id, 'TECH_REVIEW_COORD'))) {
            const { data: managers } = await supabase.from('user_roles').select('user_id').eq('role', 'MANAGER')
            for (const mgr of managers || []) {
              await supabase.from('notifications').insert({
                user_id: mgr.user_id,
                type: 'tech_review_overdue_coord',
                title: 'Revisão Técnica Atrasada',
                message: `Caso ${caseShortId} de ${clientName} aguarda revisão há ${Math.floor(daysSinceComplete)} dias.`
              })
            }
            await recordTechDocReminder(sc.id, 'TECH_REVIEW_COORD', 'COORD')
            results.technicalReviewAlerts++
          }
        }
        
        // D+7 - Admin alert
        if (daysSinceComplete >= (slaMap.sla_tech_review_admin_alert_days || 7)) {
          if (!(await techDocReminderSent(sc.id, 'TECH_REVIEW_ADMIN'))) {
            const { data: admins } = await supabase.from('user_roles').select('user_id').eq('role', 'ADMIN')
            for (const admin of admins || []) {
              await supabase.from('notifications').insert({
                user_id: admin.user_id,
                type: 'tech_review_critical',
                title: '🚨 Revisão Técnica Crítica',
                message: `Caso ${caseShortId} de ${clientName} aguarda revisão há ${Math.floor(daysSinceComplete)} dias!`
              })
            }
            await recordTechDocReminder(sc.id, 'TECH_REVIEW_ADMIN', 'ADMIN')
            results.technicalReviewAlerts++
          }
        }
      }
      console.log(`Technical review alerts automation completed. Sent: ${results.technicalReviewAlerts}`)
    }

    // =====================================================
    // 11. SEND TO LEGAL ALERTS (Enhanced - D+3 tech, D+5 coord, D+8 admin)
    // =====================================================
    if (shouldRun('LEGAL')) {
      console.log('Running LEGAL automation (enhanced)...')
      
      // Cases approved but not sent to legal
      const { data: approvedCases } = await supabase
        .from('service_cases')
        .select(`
          id, technical_approved_at, assigned_to_user_id,
          opportunities!inner (leads!inner (id, contacts!inner (full_name, phone)))
        `)
        .in('technical_status', ['EM_ORGANIZACAO', 'PRONTO_PARA_SUBMISSAO', 'DOCUMENTACAO_PARCIAL_APROVADA'])
        .not('technical_approved_at', 'is', null)
        .is('sent_to_legal_at', null)
      
      for (const sc of approvedCases || []) {
        const approvedAt = new Date(sc.technical_approved_at as string)
        const daysSinceApproval = (now.getTime() - approvedAt.getTime()) / (24 * 60 * 60 * 1000)
        const caseShortId = sc.id.slice(0, 8)
        const caseData = sc as unknown as { 
          opportunities: { leads: { id: string; contacts: { full_name: string; phone: number | null } } };
          assigned_to_user_id: string | null;
        }
        const clientName = caseData.opportunities?.leads?.contacts?.full_name || 'Cliente'
        
        // D+3 - Daily alerts to technician (2 days before deadline)
        if (daysSinceApproval >= (slaMap.sla_send_legal_tech_alert_days || 3)) {
          const dayKey = Math.floor(daysSinceApproval)
          const reminderKey = `SEND_LEGAL_D${dayKey}`
          
          if (!(await techDocReminderSent(sc.id, reminderKey))) {
            if (caseData.assigned_to_user_id) {
              const daysRemaining = Math.max(0, 5 - Math.floor(daysSinceApproval))
              await supabase.from('notifications').insert({
                user_id: caseData.assigned_to_user_id,
                type: 'send_to_legal_reminder',
                title: 'Enviar ao Jurídico',
                message: daysRemaining > 0 
                  ? `Caso ${caseShortId} de ${clientName}: faltam ${daysRemaining} dias para enviar ao Jurídico.`
                  : `Caso ${caseShortId} de ${clientName}: prazo de envio ao Jurídico estourado!`
              })
            }
            await recordTechDocReminder(sc.id, reminderKey, 'TECH')
            results.sendToLegalAlerts++
          }
        }
        
        // D+5 - Coordinator alert
        if (daysSinceApproval >= (slaMap.sla_send_legal_coord_alert_days || 5)) {
          if (!(await techDocReminderSent(sc.id, 'SEND_LEGAL_COORD'))) {
            const { data: managers } = await supabase.from('user_roles').select('user_id').eq('role', 'MANAGER')
            for (const mgr of managers || []) {
              await supabase.from('notifications').insert({
                user_id: mgr.user_id,
                type: 'send_to_legal_overdue_coord',
                title: 'Prazo de Envio ao Jurídico Estourado',
                message: `Caso ${caseShortId} de ${clientName} aprovado há ${Math.floor(daysSinceApproval)} dias e não foi enviado ao Jurídico.`
              })
            }
            await recordTechDocReminder(sc.id, 'SEND_LEGAL_COORD', 'COORD')
            results.sendToLegalAlerts++
          }
        }
        
        // D+8 - Admin alert
        if (daysSinceApproval >= (slaMap.sla_send_legal_admin_alert_days || 8)) {
          if (!(await techDocReminderSent(sc.id, 'SEND_LEGAL_ADMIN'))) {
            const { data: admins } = await supabase.from('user_roles').select('user_id').eq('role', 'ADMIN')
            for (const admin of admins || []) {
              await supabase.from('notifications').insert({
                user_id: admin.user_id,
                type: 'send_to_legal_critical',
                title: '🚨 Atraso Crítico - Envio ao Jurídico',
                message: `Caso ${caseShortId} de ${clientName} com ${Math.floor(daysSinceApproval)} dias desde aprovação técnica!`
              })
            }
            await recordTechDocReminder(sc.id, 'SEND_LEGAL_ADMIN', 'ADMIN')
            results.sendToLegalAlerts++
          }
        }
      }
      console.log(`Send to legal alerts automation completed. Sent: ${results.sendToLegalAlerts}`)
    }

    // =====================================================
    // 12. REQUIREMENT DEADLINE ALERTS
    // =====================================================
    if (shouldRun('REQUIREMENTS')) {
      console.log('Running REQUIREMENTS automation...')
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
    }

    // =====================================================
    // 13. PRE-PROTOCOL REMINDERS (Expected protocol date approaching)
    // =====================================================
    if (shouldRun('PROTOCOL')) {
      console.log('Running PROTOCOL automation...')
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
    }

    // =====================================================
    // 16. INITIAL CONTACT SLA - Reminders for technicians
    // =====================================================
    if (shouldRun('INITIAL_CONTACT')) {
      console.log('Running INITIAL_CONTACT automation...')
      
      const { data: pendingContacts } = await supabase
        .from('service_cases')
        .select(`
          id, created_at, assigned_to_user_id, first_contact_at,
          opportunities!inner (leads!inner (contacts!inner (full_name)))
        `)
        .eq('technical_status', 'CONTATO_INICIAL')
        .is('first_contact_at', null)

      console.log(`Found ${pendingContacts?.length || 0} cases awaiting initial contact`)

      // Helper to check if reminder was already sent
      async function initialContactReminderSent(caseId: string, reminderType: string): Promise<boolean> {
        const { data } = await supabase
          .from('initial_contact_reminders')
          .select('id')
          .eq('service_case_id', caseId)
          .eq('reminder_type', reminderType)
          .maybeSingle()
        return !!data
      }

      // Helper to record reminder
      async function recordInitialContactReminder(caseId: string, reminderType: string) {
        await supabase.from('initial_contact_reminders').insert({
          service_case_id: caseId,
          reminder_type: reminderType
        })
      }

      for (const sc of pendingContacts || []) {
        const hoursWaiting = (now.getTime() - new Date(sc.created_at).getTime()) / (60 * 60 * 1000)
        const clientName = (sc.opportunities as any)?.leads?.contacts?.full_name || 'Cliente'
        const caseShortId = sc.id.slice(0, 8)

        // D1: 24h reminder to technician
        if (hoursWaiting >= 24 && !(await initialContactReminderSent(sc.id, 'D1'))) {
          if (sc.assigned_to_user_id) {
            await supabase.from('notifications').insert({
              user_id: sc.assigned_to_user_id,
              title: 'Contato Inicial Pendente',
              message: `Caso ${caseShortId} de ${clientName} aguarda contato inicial há 24h.`,
              type: 'initial_contact_reminder',
            })
          } else {
            // Notify all technicians
            const { data: technicians } = await supabase
              .from('user_roles')
              .select('user_id')
              .eq('role', 'TECNICO')
            
            for (const tech of technicians || []) {
              await supabase.from('notifications').insert({
                user_id: tech.user_id,
                title: 'Contato Inicial Pendente (Não Atribuído)',
                message: `Caso ${caseShortId} de ${clientName} aguarda contato inicial há 24h - SEM RESPONSÁVEL.`,
                type: 'initial_contact_reminder',
              })
            }
          }
          await recordInitialContactReminder(sc.id, 'D1')
          results.initialContactReminders++
        }

        // D2: 48h urgent reminder
        if (hoursWaiting >= 48 && !(await initialContactReminderSent(sc.id, 'D2'))) {
          if (sc.assigned_to_user_id) {
            await supabase.from('notifications').insert({
              user_id: sc.assigned_to_user_id,
              title: '⚠️ URGENTE: Contato Inicial Pendente',
              message: `Caso ${caseShortId} de ${clientName} aguarda contato há 48h. Ação imediata necessária.`,
              type: 'initial_contact_reminder',
            })
          }
          await recordInitialContactReminder(sc.id, 'D2')
          results.initialContactReminders++
        }

        // D3 + COORD_72H: 72h - notify technician + escalate to managers
        if (hoursWaiting >= 72) {
          // D3 - Final technician reminder
          if (!(await initialContactReminderSent(sc.id, 'D3'))) {
            if (sc.assigned_to_user_id) {
              await supabase.from('notifications').insert({
                user_id: sc.assigned_to_user_id,
                title: '🚨 ESCALONAMENTO: Contato Inicial Atrasado',
                message: `Caso ${caseShortId} de ${clientName} ultrapassou 72h sem contato. Coordenador foi notificado.`,
                type: 'initial_contact_escalation',
              })
            }
            await recordInitialContactReminder(sc.id, 'D3')
            results.initialContactReminders++
          }

          // COORD_72H - Escalate to all managers
          if (!(await initialContactReminderSent(sc.id, 'COORD_72H'))) {
            const { data: managers } = await supabase
              .from('user_roles')
              .select('user_id')
              .eq('role', 'MANAGER')
            
            for (const mgr of managers || []) {
              await supabase.from('notifications').insert({
                user_id: mgr.user_id,
                title: '🚨 ESCALONAMENTO: Caso sem Contato Inicial',
                message: `Caso ${caseShortId} de ${clientName} está há mais de 72h sem contato inicial do técnico.`,
                type: 'initial_contact_escalation',
              })
            }
            await recordInitialContactReminder(sc.id, 'COORD_72H')
            results.initialContactReminders++
          }
        }

        // ADM_5D: 120h (5 business days) - escalate to admins
        if (hoursWaiting >= 120 && !(await initialContactReminderSent(sc.id, 'ADM_5D'))) {
          const { data: admins } = await supabase
            .from('user_roles')
            .select('user_id')
            .eq('role', 'ADMIN')
          
          for (const admin of admins || []) {
            await supabase.from('notifications').insert({
              user_id: admin.user_id,
              title: '🔴 CRÍTICO: Caso sem Contato há 5 Dias',
              message: `INTERVENÇÃO NECESSÁRIA: Caso ${caseShortId} de ${clientName} está há mais de 5 dias úteis sem contato inicial.`,
              type: 'initial_contact_critical',
            })
          }
          await recordInitialContactReminder(sc.id, 'ADM_5D')
          results.initialContactReminders++
        }
      }
    }

    // =====================================================
    // 17. POST-PROTOCOL PENDING DOCUMENTS ALERTS
    // =====================================================
    if (shouldRun('POST_PROTOCOL_DOCS')) {
      console.log('Running POST_PROTOCOL_DOCS automation...')
      
      // Find documents marked as pending post-protocol
      const { data: pendingDocs } = await supabase
        .from('service_documents')
        .select(`
          id, service_case_id, document_type_id, post_protocol_pending_since, updated_at,
          service_document_types!inner (name),
          service_cases!inner (
            assigned_to_user_id,
            opportunities!inner (leads!inner (contacts!inner (full_name)))
          )
        `)
        .eq('is_post_protocol_pending', true)
        .in('status', ['NAO_ENVIADO', 'ENVIADO', 'RECUSADO'])

      console.log(`Found ${pendingDocs?.length || 0} post-protocol pending documents`)

      // Helper to check if reminder was already sent
      async function postProtoDocReminderSent(caseId: string, reminderType: string): Promise<boolean> {
        const { data } = await supabase
          .from('document_reminders')
          .select('id')
          .eq('service_case_id', caseId)
          .eq('reminder_type', reminderType)
          .maybeSingle()
        return !!data
      }

      // Helper to record reminder
      async function recordPostProtoDocReminder(caseId: string, reminderType: string, recipientType: string) {
        await supabase.from('document_reminders').insert({
          service_case_id: caseId,
          reminder_type: reminderType,
          recipient_type: recipientType
        })
      }

      for (const doc of pendingDocs || []) {
        const pendingSince = new Date(doc.post_protocol_pending_since || doc.updated_at)
        const weeksPending = (now.getTime() - pendingSince.getTime()) / (7 * 24 * 60 * 60 * 1000)
        
        const caseData = doc.service_cases as unknown as { 
          assigned_to_user_id: string | null;
          opportunities: { leads: { contacts: { full_name: string } } }
        }
        const docName = (doc.service_document_types as unknown as { name: string })?.name || 'Documento'
        const clientName = caseData?.opportunities?.leads?.contacts?.full_name || 'Cliente'
        const caseShortId = doc.service_case_id.slice(0, 8)

        // Week 2 - Alert to Technician
        if (weeksPending >= 2 && weeksPending < 3) {
          const reminderType = `POST_PROTO_W2_${doc.id}`
          if (!(await postProtoDocReminderSent(doc.service_case_id, reminderType))) {
            if (caseData.assigned_to_user_id) {
              await supabase.from('notifications').insert({
                user_id: caseData.assigned_to_user_id,
                type: 'post_protocol_doc_pending',
                title: 'Documento Pendente Pós-Protocolo',
                message: `${docName} de ${clientName} (caso ${caseShortId}) pendente há 2 semanas.`
              })
            }
            await recordPostProtoDocReminder(doc.service_case_id, reminderType, 'TECH')
            results.postProtocolDocsAlerts++
            console.log(`Week 2 alert sent for doc ${doc.id}`)
          }
        }

        // Week 3 - Escalate to Coordinator
        if (weeksPending >= 3 && weeksPending < 5) {
          const reminderType = `POST_PROTO_W3_${doc.id}`
          if (!(await postProtoDocReminderSent(doc.service_case_id, reminderType))) {
            const { data: managers } = await supabase
              .from('user_roles')
              .select('user_id')
              .eq('role', 'MANAGER')
            
            for (const mgr of managers || []) {
              await supabase.from('notifications').insert({
                user_id: mgr.user_id,
                type: 'post_protocol_doc_escalated',
                title: 'Documento Pós-Protocolo Atrasado',
                message: `${docName} de ${clientName} (caso ${caseShortId}) pendente há 3 semanas.`
              })
            }
            await recordPostProtoDocReminder(doc.service_case_id, reminderType, 'COORD')
            results.postProtocolDocsAlerts++
            console.log(`Week 3 escalation sent for doc ${doc.id}`)
          }
        }

        // Week 5 - Escalate to Admin
        if (weeksPending >= 5) {
          const reminderType = `POST_PROTO_W5_${doc.id}`
          if (!(await postProtoDocReminderSent(doc.service_case_id, reminderType))) {
            const { data: admins } = await supabase
              .from('user_roles')
              .select('user_id')
              .eq('role', 'ADMIN')
            
            for (const admin of admins || []) {
              await supabase.from('notifications').insert({
                user_id: admin.user_id,
                type: 'post_protocol_doc_critical',
                title: '🚨 Documento Pós-Protocolo Crítico',
                message: `${docName} de ${clientName} (caso ${caseShortId}) pendente há 5+ semanas!`
              })
            }
            await recordPostProtoDocReminder(doc.service_case_id, reminderType, 'ADMIN')
            results.postProtocolDocsAlerts++
            console.log(`Week 5 critical alert sent for doc ${doc.id}`)
          }
        }
      }
    }

    // =====================================================
    if (shouldRun('DAILY_COLLECTION')) {
      console.log('Running DAILY_COLLECTION automation...')
      console.log('Starting daily collection for overdue payments...')
      const { data: allOverduePayments } = await supabase
        .from('payments')
        .select(`
          id, due_date, amount, currency,
          opportunities!inner (
            lead_id,
            leads!inner (id, contacts!inner (full_name, phone))
          )
        `)
        .eq('status', 'PENDENTE')
        .lt('due_date', today)

      console.log(`Found ${allOverduePayments?.length || 0} overdue payments for daily collection`)

      for (const payment of allOverduePayments || []) {
        const oppData = payment.opportunities as unknown as { 
          lead_id: string;
          leads: { id: string; contacts: { full_name: string; phone: number | null } } 
        }
        const contact = oppData?.leads?.contacts
        const leadId = oppData?.leads?.id
        
        if (!contact?.phone) {
          console.log(`Skipping payment ${payment.id} - no phone number`)
          continue
        }

        // Check if already sent today using reminder_type with date
        const dailyReminderType = `DAILY_COLLECTION_${today}`
        if (await reminderAlreadySent('payment_reminders', payment.id, dailyReminderType)) {
          console.log(`Skipping payment ${payment.id} - already sent today`)
          continue
        }

        // Send collection message
        const message = `Olá ${contact.full_name}! Identificamos que seu pagamento está em atraso. Favor providenciar o mais rápido possível ou entre em contato com a CB Asesoria.`
        
        // Record reminder first to prevent duplicates
        await supabase.from('payment_reminders').insert({ 
          payment_id: payment.id, 
          reminder_type: dailyReminderType 
        })
        
        const sent = await sendWhatsApp(contact.phone, message, leadId)
        if (sent) {
          console.log(`Daily collection sent for payment ${payment.id} to ${String(contact.phone).slice(-4)}`)
          results.dailyCollections++
        }
      }
    }

    // =====================================================
    // 18. HUELLAS SCHEDULING REMINDERS AND ALERTS
    // =====================================================
    if (shouldRun('HUELLAS')) {
      console.log('Running HUELLAS automation...')

      // Helper to check if huellas reminder was already sent
      async function huellasReminderSent(caseId: string, reminderType: string): Promise<boolean> {
        const { data } = await supabase
          .from('huellas_reminders')
          .select('id')
          .eq('service_case_id', caseId)
          .eq('reminder_type', reminderType)
          .maybeSingle()
        return !!data
      }

      // Helper to record huellas reminder
      async function recordHuellasReminder(caseId: string, reminderType: string, recipientType: string) {
        await supabase.from('huellas_reminders').insert({
          service_case_id: caseId,
          reminder_type: reminderType,
          recipient_type: recipientType
        })
      }

      // SLA 1: Cases in AGENDAR_HUELLAS without schedule request (48h SLA)
      const { data: pendingScheduleCases } = await supabase
        .from('service_cases')
        .select(`id, technical_status, updated_at, assigned_to_user_id, opportunities!inner (leads!inner (contacts!inner (full_name)))`)
        .eq('technical_status', 'AGENDAR_HUELLAS')
        .is('huellas_requested_at', null)

      for (const sc of pendingScheduleCases || []) {
        const hoursWaiting = (now.getTime() - new Date(sc.updated_at).getTime()) / (60 * 60 * 1000)
        const oppData = sc.opportunities as unknown as { leads: { contacts: { full_name: string } } }
        const clientName = oppData?.leads?.contacts?.full_name || 'Cliente'

        if (hoursWaiting >= 48 && !(await huellasReminderSent(sc.id, 'SCHEDULE_48H'))) {
          const { data: managers } = await supabase.from('user_roles').select('user_id').eq('role', 'MANAGER')
          for (const mgr of managers || []) {
            await supabase.from('notifications').insert({
              user_id: mgr.user_id,
              title: '🚨 Huellas não Solicitado',
              message: `Caso ${sc.id.slice(0, 8)} de ${clientName} aguarda agendamento há 48h+.`,
              type: 'huellas_schedule_escalation',
            })
          }
          await recordHuellasReminder(sc.id, 'SCHEDULE_48H', 'COORD')
          results.huellasScheduleReminders++
        }
      }

      // SLA 2: Pre-cita reminders (D-3, D-1)
      const { data: scheduledHuellasCases } = await supabase
        .from('service_cases')
        .select(`id, huellas_date, huellas_time, huellas_location, opportunities!inner (leads!inner (id, contacts!inner (full_name, phone)))`)
        .not('huellas_date', 'is', null)
        .eq('huellas_completed', false)
        .gte('huellas_date', today)

      for (const sc of scheduledHuellasCases || []) {
        if (!sc.huellas_date) continue
        const daysUntil = Math.floor((new Date(sc.huellas_date).getTime() - now.getTime()) / (24 * 60 * 60 * 1000))
        const oppData = sc.opportunities as unknown as { leads: { id: string; contacts: { full_name: string; phone: number | null } } }
        const contact = oppData?.leads?.contacts
        if (!contact?.phone) continue

        if (daysUntil <= 3 && daysUntil > 1 && !(await huellasReminderSent(sc.id, 'D3_REMINDER'))) {
          await sendWhatsApp(contact.phone, `Olá ${contact.full_name}! Sua huellas é em 3 dias (${sc.huellas_date}). Organize seus documentos!`, oppData.leads.id)
          await recordHuellasReminder(sc.id, 'D3_REMINDER', 'CLIENT')
          results.huellasPreCitaReminders++
        }

        if (daysUntil === 1 && !(await huellasReminderSent(sc.id, 'D1_REMINDER'))) {
          await sendWhatsApp(contact.phone, `Olá ${contact.full_name}! AMANHÃ é sua huellas (${sc.huellas_date}). Boa sorte! 🍀`, oppData.leads.id)
          await recordHuellasReminder(sc.id, 'D1_REMINDER', 'CLIENT')
          results.huellasPreCitaReminders++
        }
      }
    }

    console.log(`SLA Automations completed with filter '${automationType}':`, results)

    return new Response(JSON.stringify({
      success: true,
      automation_type: automationType,
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
