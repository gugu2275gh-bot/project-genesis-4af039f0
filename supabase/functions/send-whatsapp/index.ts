import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const WEBHOOK_URL = 'https://webhook.robertobarros.ai/webhook/enviamsgccse';

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const { mensagem, numero } = await req.json()

    console.log('Received request:', { mensagem, numero })

    if (!mensagem || !numero) {
      console.error('Missing parameters:', { mensagem, numero })
      return new Response(
        JSON.stringify({ error: 'Parâmetros mensagem e numero são obrigatórios' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Call the N8N webhook
    console.log('Calling webhook:', WEBHOOK_URL)
    const response = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mensagem, numero: String(numero) })
    })

    console.log('Webhook response status:', response.status)

    if (!response.ok) {
      const errorText = await response.text()
      console.error('Webhook error:', errorText)
      throw new Error(`Webhook retornou status ${response.status}: ${errorText}`)
    }

    const responseData = await response.text()
    console.log('Webhook response:', responseData)

    return new Response(
      JSON.stringify({ success: true, webhookResponse: responseData }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error in send-whatsapp function:', errorMessage)
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
