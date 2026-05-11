import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Order matters: children first, then parents
const TABLES_IN_ORDER = [
  // reminders / logs / webhooks tied to entities
  'contract_reminders',
  'document_reminders',
  'huellas_reminders',
  'initial_contact_reminders',
  'payment_reminders',
  'requirement_reminders',
  'tie_pickup_reminders',
  'reactivation_resolutions',
  'chat_routing_logs',
  'webhook_logs',
  'log_webhooks_falhados',
  'whatsapp_template_logs',
  'message_dedup',
  'n8n_chat_histories',
  'notifications',
  'audit_logs',
  // financial
  'commissions',
  'invoices',
  'cash_flow',
  'payments',
  // contracts
  'contract_costs',
  'contract_notes',
  'contract_beneficiaries',
  'contract_leads',
  'beneficiary_titular_links',
  // cases / requirements / docs
  'requirements_from_authority',
  'service_documents',
  'generated_documents',
  'documents',
  'case_notes',
  'service_cases',
  // tasks / interactions / messaging
  'tasks',
  'interactions',
  'portal_messages',
  'mensagens_cliente',
  'customer_chat_context',
  'customer_sector_pending_items',
  // nps / suggestions
  'nps_surveys',
  'contact_data_suggestions',
  // contracts (parent) and pipeline
  'contracts',
  'opportunities',
  'lead_intake',
  'leads',
  // contacts last
  'contacts',
];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

    // Validate caller is ADMIN
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userRes, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userRes?.user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const admin = createClient(supabaseUrl, serviceKey);
    const { data: roles } = await admin
      .from('user_roles')
      .select('role')
      .eq('user_id', userRes.user.id);
    const isAdmin = (roles || []).some((r: any) => r.role === 'ADMIN');
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: 'Apenas ADMIN pode executar limpeza' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Optional confirmation token
    const body = await req.json().catch(() => ({}));
    if (body?.confirm !== 'LIMPAR_DADOS_TESTE') {
      return new Response(JSON.stringify({ error: 'Confirmação inválida' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const results: Record<string, number | string> = {};
    for (const table of TABLES_IN_ORDER) {
      const { error, count } = await admin
        .from(table)
        .delete({ count: 'exact' })
        .not('id', 'is', null);
      if (error) {
        results[table] = `ERROR: ${error.message}`;
      } else {
        results[table] = count ?? 0;
      }
    }

    return new Response(JSON.stringify({ success: true, results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e?.message || e) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
