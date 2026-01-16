import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, stripe-signature',
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

    const payload = await req.text()
    const signature = req.headers.get('stripe-signature')

    // Log the webhook
    await supabase.from('webhook_logs').insert({
      source: 'PAGAMENTO',
      raw_payload: JSON.parse(payload),
      processed: false,
    })

    // For production, verify Stripe signature
    const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET')
    if (webhookSecret && signature) {
      // In production, use Stripe SDK to verify signature
      // For now, we'll trust the payload
      console.log('Webhook signature present, should verify in production')
    }

    const event = JSON.parse(payload)
    console.log('Stripe event type:', event.type)

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object
      const paymentId = session.metadata?.payment_id

      if (paymentId) {
        // Update payment status
        const { error: updateError } = await supabase
          .from('payments')
          .update({ 
            status: 'CONFIRMADO',
            paid_at: new Date().toISOString(),
            transaction_id: session.payment_intent || session.id,
          })
          .eq('id', paymentId)

        if (updateError) {
          console.error('Error updating payment:', updateError)
          throw updateError
        }

        // Get payment details to update opportunity
        const { data: payment } = await supabase
          .from('payments')
          .select('opportunity_id')
          .eq('id', paymentId)
          .single()

        if (payment?.opportunity_id) {
          // Update opportunity status
          await supabase
            .from('opportunities')
            .update({ status: 'FECHADA_GANHA' })
            .eq('id', payment.opportunity_id)

          // Check if service case exists, if not create one
          const { data: existingCase } = await supabase
            .from('service_cases')
            .select('id')
            .eq('opportunity_id', payment.opportunity_id)
            .single()

          if (!existingCase) {
            // Get opportunity details to create case
            const { data: opportunity } = await supabase
              .from('opportunities')
              .select(`
                id,
                leads!inner (
                  service_interest,
                  contacts!inner (
                    id
                  )
                )
              `)
              .eq('id', payment.opportunity_id)
              .single()

            if (opportunity) {
              const leadData = opportunity.leads as unknown as { 
                service_interest: string | null; 
                contacts: { id: string } 
              }
              
              // Map service_interest to sector
              const sectorMap: Record<string, string> = {
                'VISTO_ESTUDANTE': 'ESTUDANTE',
                'VISTO_TRABALHO': 'TRABALHO',
                'REAGRUPAMENTO': 'REAGRUPAMENTO',
                'RENOVACAO_RESIDENCIA': 'RENOVACAO',
                'NACIONALIDADE_RESIDENCIA': 'NACIONALIDADE',
                'NACIONALIDADE_CASAMENTO': 'NACIONALIDADE',
              }

              await supabase.from('service_cases').insert({
                opportunity_id: payment.opportunity_id,
                service_type: leadData.service_interest || 'OUTRO',
                sector: sectorMap[leadData.service_interest || ''] || 'ESTUDANTE',
                technical_status: 'CONTATO_INICIAL',
              })
            }
          }

          // Notify relevant users
          const { data: caseData } = await supabase
            .from('service_cases')
            .select('assigned_to_user_id, client_user_id')
            .eq('opportunity_id', payment.opportunity_id)
            .single()

          if (caseData?.assigned_to_user_id) {
            await supabase.from('notifications').insert({
              user_id: caseData.assigned_to_user_id,
              title: 'Pagamento confirmado',
              message: 'Um pagamento foi confirmado via Stripe.',
              type: 'payment_confirmed',
            })
          }

          if (caseData?.client_user_id) {
            await supabase.from('notifications').insert({
              user_id: caseData.client_user_id,
              title: 'Pagamento confirmado',
              message: 'Seu pagamento foi confirmado com sucesso!',
              type: 'payment_confirmed',
            })
          }
        }

        // Update webhook log as processed
        await supabase
          .from('webhook_logs')
          .update({ processed: true })
          .eq('raw_payload', event)
      }
    } else if (event.type === 'checkout.session.expired') {
      const session = event.data.object
      const paymentId = session.metadata?.payment_id

      if (paymentId) {
        // Payment session expired, could send reminder
        console.log('Payment session expired for:', paymentId)
      }
    }

    return new Response(
      JSON.stringify({ received: true }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    console.error('Stripe webhook error:', errorMessage)
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
