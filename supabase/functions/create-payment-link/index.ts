import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface PaymentLinkRequest {
  paymentId: string;
  amount: number;
  currency: string;
  description?: string;
  customerEmail?: string;
  customerName?: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    )

    // Verify user authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Check if user has required role
    const { data: hasRole } = await supabase
      .rpc('has_any_role', {
        _user_id: user.id,
        _roles: ['ADMIN', 'FINANCEIRO', 'ATENCAO_CLIENTE']
      })

    if (!hasRole) {
      return new Response(
        JSON.stringify({ error: 'Forbidden - insufficient permissions' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const { paymentId, amount, currency, description, customerEmail, customerName }: PaymentLinkRequest = await req.json()

    if (!paymentId || !amount || !currency) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: paymentId, amount, currency' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY')
    
    if (!stripeSecretKey) {
      // Fallback: Generate internal payment link without Stripe
      const internalLink = `${Deno.env.get('SITE_URL') || 'https://cb-asesoria.lovable.app'}/portal/payments?pay=${paymentId}`
      
      // Update payment with internal link
      const { error: updateError } = await supabase
        .from('payments')
        .update({ payment_link: internalLink })
        .eq('id', paymentId)

      if (updateError) throw updateError

      return new Response(
        JSON.stringify({ 
          success: true, 
          paymentLink: internalLink,
          type: 'internal'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Create Stripe Checkout Session
    const stripeResponse = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${stripeSecretKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        'mode': 'payment',
        'success_url': `${Deno.env.get('SITE_URL') || 'https://cb-asesoria.lovable.app'}/portal/payments?success=true&payment_id=${paymentId}`,
        'cancel_url': `${Deno.env.get('SITE_URL') || 'https://cb-asesoria.lovable.app'}/portal/payments?canceled=true`,
        'line_items[0][price_data][currency]': currency.toLowerCase(),
        'line_items[0][price_data][product_data][name]': description || 'Serviço CB Asesoría',
        'line_items[0][price_data][unit_amount]': String(Math.round(amount * 100)),
        'line_items[0][quantity]': '1',
        ...(customerEmail && { 'customer_email': customerEmail }),
        'metadata[payment_id]': paymentId,
        'metadata[customer_name]': customerName || '',
      }),
    })

    if (!stripeResponse.ok) {
      const errorData = await stripeResponse.json()
      console.error('Stripe error:', errorData)
      throw new Error(errorData.error?.message || 'Failed to create Stripe session')
    }

    const session = await stripeResponse.json()

    // Update payment with Stripe link
    const { error: updateError } = await supabase
      .from('payments')
      .update({ 
        payment_link: session.url,
        transaction_id: session.id,
      })
      .eq('id', paymentId)

    if (updateError) throw updateError

    return new Response(
      JSON.stringify({ 
        success: true, 
        paymentLink: session.url,
        sessionId: session.id,
        type: 'stripe'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    console.error('Create payment link error:', errorMessage)
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
