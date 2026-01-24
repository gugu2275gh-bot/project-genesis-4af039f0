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

    // Helper to send WhatsApp
    async function sendWhatsApp(phone: string | number, message: string) {
      try {
        await supabase.functions.invoke('send-whatsapp', {
          body: { mensagem: message, numero: String(phone) }
        })
        return true
      } catch (e) {
        console.log('WhatsApp send skipped/failed:', e)
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

        await sendWhatsApp(contact.phone, message)
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

        await sendWhatsApp(contact.phone, message)
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
          leads!inner (contacts!inner (full_name, phone))
        )
      `)
      .eq('status', 'ENVIADO')

    for (const contract of pendingContracts || []) {
      const createdAt = new Date(contract.created_at)
      const daysSinceCreated = Math.floor((now.getTime() - createdAt.getTime()) / (24 * 60 * 60 * 1000))
      const oppData = contract.opportunities as unknown as { id: string; leads: { contacts: { full_name: string; phone: number | null } } }
      const contact = oppData?.leads?.contacts

      // Day 1 reminder
      if (daysSinceCreated >= slaMap.sla_contract_signature_reminder_1_days) {
        if (!(await reminderAlreadySent('contract_reminders', contract.id, 'D1'))) {
          await supabase.from('contract_reminders').insert({ contract_id: contract.id, reminder_type: 'D1' })
          if (contact?.phone) {
            await sendWhatsApp(contact.phone, templateMap.template_contract_reminder.replace('{nome}', contact.full_name))
          }
          results.contractReminders++
        }
      }

      // Day 2 reminder
      if (daysSinceCreated >= slaMap.sla_contract_signature_reminder_2_days) {
        if (!(await reminderAlreadySent('contract_reminders', contract.id, 'D2'))) {
          await supabase.from('contract_reminders').insert({ contract_id: contract.id, reminder_type: 'D2' })
          if (contact?.phone) {
            await sendWhatsApp(contact.phone, templateMap.template_contract_reminder.replace('{nome}', contact.full_name))
          }
          results.contractReminders++
        }
      }

      // Day 3 reminder
      if (daysSinceCreated >= slaMap.sla_contract_signature_reminder_3_days) {
        if (!(await reminderAlreadySent('contract_reminders', contract.id, 'D3'))) {
          await supabase.from('contract_reminders').insert({ contract_id: contract.id, reminder_type: 'D3' })
          if (contact?.phone) {
            await sendWhatsApp(contact.phone, templateMap.template_contract_reminder.replace('{nome}', contact.full_name))
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
    const in7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    const in2Days = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

    const { data: upcomingPayments } = await supabase
      .from('payments')
      .select(`
        id, due_date, amount, currency,
        opportunities!inner (leads!inner (contacts!inner (full_name, phone)))
      `)
      .eq('status', 'PENDENTE')
      .gte('due_date', today)

    for (const payment of upcomingPayments || []) {
      if (!payment.due_date) continue
      const oppData = payment.opportunities as unknown as { leads: { contacts: { full_name: string; phone: number | null } } }
      const contact = oppData?.leads?.contacts
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
          await sendWhatsApp(contact.phone, msg)
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
          await sendWhatsApp(contact.phone, msg)
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
          await sendWhatsApp(contact.phone, msg)
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
        opportunities!inner (leads!inner (contacts!inner (full_name, phone)))
      `)
      .eq('status', 'PENDENTE')
      .lt('due_date', today)

    for (const payment of overduePayments || []) {
      if (!payment.due_date) continue
      const dueDate = new Date(payment.due_date)
      const daysOverdue = Math.floor((now.getTime() - dueDate.getTime()) / (24 * 60 * 60 * 1000))
      const oppData = payment.opportunities as unknown as { leads: { contacts: { full_name: string; phone: number | null } } }
      const contact = oppData?.leads?.contacts

      // D+1 reminder
      if (daysOverdue >= 1 && daysOverdue < 3) {
        if (!(await reminderAlreadySent('payment_reminders', payment.id, 'POST_D1'))) {
          await supabase.from('payment_reminders').insert({ payment_id: payment.id, reminder_type: 'POST_D1' })
          if (contact?.phone) {
            const msg = templateMap.template_payment_reminder
              .replace('{nome}', contact.full_name)
              .replace('{valor}', String(payment.amount))
            await sendWhatsApp(contact.phone, msg)
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
            await sendWhatsApp(contact.phone, msg)
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
          const { data: admins } = await supabase.from('user_roles').select('user_id').eq('role', 'ADMIN')
          for (const adm of admins || []) {
            await supabase.from('notifications').insert({
              user_id: adm.user_id,
              title: 'URGENTE: Pagamento atrasado D+7',
              message: `Pagamento de €${payment.amount} será cancelado amanhã.`,
              type: 'payment_critical',
            })
          }
          results.paymentPostReminders++
        }
      }

      // D+8 auto-cancel contract
      if (daysOverdue >= 8) {
        if (payment.contract_id) {
          await supabase.from('contracts').update({
            status: 'CANCELADO',
            cancellation_reason: 'Cancelado automaticamente por inadimplência',
          }).eq('id', payment.contract_id)
        }
        await supabase.from('payments').update({ status: 'CANCELADO' }).eq('id', payment.id)
        if (payment.opportunity_id) {
          await supabase.from('opportunities').update({
            status: 'FECHADA_PERDIDA',
            reason_lost: 'Inadimplência',
          }).eq('id', payment.opportunity_id)
        }
        results.contractsCancelled++
      }
    }

    // =====================================================
    // 7. DOCUMENT REMINDERS (every 5 days normal, 24h urgent)
    // =====================================================
    const { data: casesWithPendingDocs } = await supabase
      .from('service_cases')
      .select(`
        id, case_priority, client_user_id, updated_at,
        opportunities!inner (leads!inner (contacts!inner (full_name, phone)))
      `)
      .in('technical_status', ['CONTATO_INICIAL', 'DOCS_PENDENTES'])

    for (const sc of casesWithPendingDocs || []) {
      const isUrgent = sc.case_priority === 'URGENTE'
      const thresholdMs = isUrgent 
        ? slaMap.sla_document_reminder_urgent_hours * 60 * 60 * 1000
        : slaMap.sla_document_reminder_normal_days * 24 * 60 * 60 * 1000
      
      const lastUpdate = new Date(sc.updated_at)
      if (now.getTime() - lastUpdate.getTime() > thresholdMs) {
        const oppData = sc.opportunities as unknown as { leads: { contacts: { full_name: string; phone: number | null } } }
        const contact = oppData?.leads?.contacts

        if (contact?.phone) {
          const msg = isUrgent 
            ? templateMap.template_document_reminder_urgent.replace('{nome}', contact.full_name)
            : templateMap.template_document_reminder_normal.replace('{nome}', contact.full_name)
          await sendWhatsApp(contact.phone, msg)
          
          // Update case to reset timer
          await supabase.from('service_cases').update({ updated_at: now.toISOString() }).eq('id', sc.id)
          results.documentReminders++
        }
      }
    }

    // =====================================================
    // 8. TIE PICKUP REMINDERS (every 3 days)
    // =====================================================
    const tieThreshold = new Date(now.getTime() - slaMap.sla_tie_pickup_reminder_days * 24 * 60 * 60 * 1000)
    const { data: tiePendingCases } = await supabase
      .from('service_cases')
      .select(`
        id, tie_lot_number, updated_at, client_user_id,
        opportunities!inner (leads!inner (contacts!inner (full_name, phone)))
      `)
      .not('tie_lot_number', 'is', null)
      .eq('tie_picked_up', false)
      .lt('updated_at', tieThreshold.toISOString())

    for (const sc of tiePendingCases || []) {
      const oppData = sc.opportunities as unknown as { leads: { contacts: { full_name: string; phone: number | null } } }
      const contact = oppData?.leads?.contacts

      if (contact?.phone) {
        const msg = templateMap.template_tie_available.replace('{nome}', contact.full_name)
        await sendWhatsApp(contact.phone, msg)
        
        // Update to reset timer
        await supabase.from('service_cases').update({ updated_at: now.toISOString() }).eq('id', sc.id)
        
        if (sc.client_user_id) {
          await supabase.from('notifications').insert({
            user_id: sc.client_user_id,
            title: 'Lembrete: TIE disponível',
            message: 'Seu TIE está disponível para retirada.',
            type: 'tie_pickup',
          })
        }
        results.tiePickupReminders++
      }
    }

    // =====================================================
    // 9. ONBOARDING REMINDERS (every 24h)
    // =====================================================
    const onboardingThreshold = new Date(now.getTime() - slaMap.sla_onboarding_reminder_hours * 60 * 60 * 1000)
    const { data: incompleteCases } = await supabase
      .from('service_cases')
      .select(`
        id, client_user_id, updated_at,
        opportunities!inner (leads!inner (
          contacts!inner (full_name, phone, onboarding_completed)
        ))
      `)
      .not('client_user_id', 'is', null)
      .lt('updated_at', onboardingThreshold.toISOString())

    for (const sc of incompleteCases || []) {
      const oppData = sc.opportunities as unknown as { leads: { contacts: { full_name: string; phone: number | null; onboarding_completed: boolean } } }
      const contact = oppData?.leads?.contacts

      if (contact && !contact.onboarding_completed && contact.phone) {
        const msg = templateMap.template_onboarding_reminder.replace('{nome}', contact.full_name)
        await sendWhatsApp(contact.phone, msg)
        
        // Update to reset timer
        await supabase.from('service_cases').update({ updated_at: now.toISOString() }).eq('id', sc.id)
        
        if (sc.client_user_id) {
          await supabase.from('notifications').insert({
            user_id: sc.client_user_id,
            title: 'Complete seu cadastro',
            message: 'Por favor, complete seu cadastro no portal para iniciarmos seu processo.',
            type: 'onboarding_reminder',
          })
        }
        results.onboardingReminders++
      }
    }

    console.log('SLA Automations completed:', results)

    return new Response(
      JSON.stringify({ 
        success: true, 
        results,
        processedAt: now.toISOString()
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    console.error('SLA Automations error:', errorMessage)
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
