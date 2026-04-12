import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ALLOWED_ROLES = new Set([
  "ADMIN",
  "MANAGER",
  "SUPERVISOR",
  "ATENCAO_CLIENTE",
  "JURIDICO",
]);

const PROTECTED_CONTRACT_STATUSES = new Set(["APROVADO", "ASSINADO", "CANCELADO"]);

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    if (!serviceRoleKey) {
      throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured");
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      throw new Error("Authorization required");
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);

    if (userError || !userData.user) {
      throw new Error("Invalid authorization token");
    }

    const { data: callerRoles, error: rolesError } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", userData.user.id);

    if (rolesError) {
      throw new Error(`Failed to verify roles: ${rolesError.message}`);
    }

    const canManageServices = (callerRoles ?? []).some((roleRow) => ALLOWED_ROLES.has(roleRow.role));
    if (!canManageServices) {
      throw new Error("Você não tem permissão para excluir este serviço");
    }

    const { lead_id } = await req.json();

    if (!lead_id) {
      throw new Error("lead_id is required");
    }

    const { data: lead, error: leadError } = await supabaseAdmin
      .from("leads")
      .select("id")
      .eq("id", lead_id)
      .maybeSingle();

    if (leadError) {
      throw new Error(`Erro ao localizar serviço: ${leadError.message}`);
    }

    if (!lead) {
      throw new Error("Serviço não encontrado");
    }

    const { data: linkedContracts, error: linkedContractsError } = await supabaseAdmin
      .from("contract_leads")
      .select("contract_id, contracts(status)")
      .eq("lead_id", lead_id);

    if (linkedContractsError) {
      throw new Error(`Erro ao verificar contratos vinculados: ${linkedContractsError.message}`);
    }

    const { data: opportunities, error: opportunitiesError } = await supabaseAdmin
      .from("opportunities")
      .select("id")
      .eq("lead_id", lead_id);

    if (opportunitiesError) {
      throw new Error(`Erro ao localizar oportunidades: ${opportunitiesError.message}`);
    }

    const opportunityIds = (opportunities ?? []).map((opportunity) => opportunity.id);

    let directContracts: Array<{ id: string; status: string | null }> = [];
    if (opportunityIds.length > 0) {
      const { data, error } = await supabaseAdmin
        .from("contracts")
        .select("id, status")
        .in("opportunity_id", opportunityIds);

      if (error) {
        throw new Error(`Erro ao verificar contratos do serviço: ${error.message}`);
      }

      directContracts = data ?? [];
    }

    const allContractStatuses = [
      ...directContracts.map((contract) => contract.status),
      ...(linkedContracts ?? []).map((row: any) => row.contracts?.status ?? null),
    ].filter(Boolean);

    const hasProtectedContract = allContractStatuses.some((status) =>
      PROTECTED_CONTRACT_STATUSES.has(String(status)),
    );

    if (hasProtectedContract) {
      const { error } = await supabaseAdmin
        .from("leads")
        .update({
          status: "ARQUIVADO_SEM_RETORNO",
          updated_by_user_id: userData.user.id,
        })
        .eq("id", lead_id);

      if (error) {
        throw new Error(`Erro ao arquivar serviço: ${error.message}`);
      }

      return new Response(
        JSON.stringify({ success: true, action: "archived" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
      );
    }

    const deleteWhereEq = async (table: string, column: string, value: string) => {
      const { error } = await supabaseAdmin.from(table).delete().eq(column, value);
      if (error) {
        throw new Error(`Erro ao limpar ${table}: ${error.message}`);
      }
    };

    const deleteWhereIn = async (table: string, column: string, values: string[]) => {
      if (!values.length) return;
      const { error } = await supabaseAdmin.from(table).delete().in(column, values);
      if (error) {
        throw new Error(`Erro ao limpar ${table}: ${error.message}`);
      }
    };

    let serviceCaseIds: string[] = [];
    if (opportunityIds.length > 0) {
      const { data, error } = await supabaseAdmin
        .from("service_cases")
        .select("id")
        .in("opportunity_id", opportunityIds);

      if (error) {
        throw new Error(`Erro ao localizar trâmites do serviço: ${error.message}`);
      }

      serviceCaseIds = (data ?? []).map((serviceCase) => serviceCase.id);
    }

    await deleteWhereEq("contract_leads", "lead_id", lead_id);
    await deleteWhereEq("interactions", "lead_id", lead_id);
    await deleteWhereEq("tasks", "related_lead_id", lead_id);
    await deleteWhereEq("mensagens_cliente", "id_lead", lead_id);
    await deleteWhereEq("customer_sector_pending_items", "lead_id", lead_id);
    await deleteWhereEq("lead_intake", "lead_id", lead_id);
    await deleteWhereEq("log_webhooks_falhados", "lead_id", lead_id);

    if (serviceCaseIds.length > 0) {
      const { error: clearPreviousCaseError } = await supabaseAdmin
        .from("service_cases")
        .update({ previous_case_id: null })
        .in("previous_case_id", serviceCaseIds);

      if (clearPreviousCaseError) {
        throw new Error(`Erro ao desvincular trâmites anteriores: ${clearPreviousCaseError.message}`);
      }

      await deleteWhereIn("case_notes", "service_case_id", serviceCaseIds);
      await deleteWhereIn("contract_beneficiaries", "service_case_id", serviceCaseIds);
      await deleteWhereIn("customer_sector_pending_items", "service_case_id", serviceCaseIds);
      await deleteWhereIn("document_reminders", "service_case_id", serviceCaseIds);
      await deleteWhereIn("generated_documents", "service_case_id", serviceCaseIds);
      await deleteWhereIn("huellas_reminders", "service_case_id", serviceCaseIds);
      await deleteWhereIn("initial_contact_reminders", "service_case_id", serviceCaseIds);
      await deleteWhereIn("nps_surveys", "service_case_id", serviceCaseIds);
      await deleteWhereIn("portal_messages", "service_case_id", serviceCaseIds);
      await deleteWhereIn("requirements_from_authority", "service_case_id", serviceCaseIds);
      await deleteWhereIn("service_documents", "service_case_id", serviceCaseIds);
      await deleteWhereIn("tasks", "related_service_case_id", serviceCaseIds);
      await deleteWhereIn("tie_pickup_reminders", "service_case_id", serviceCaseIds);
      await deleteWhereIn("service_cases", "id", serviceCaseIds);
    }

    if (opportunityIds.length > 0) {
      await deleteWhereIn("payments", "opportunity_id", opportunityIds);
      await deleteWhereIn("tasks", "related_opportunity_id", opportunityIds);
      await deleteWhereIn("contracts", "opportunity_id", opportunityIds);
      await deleteWhereIn("opportunities", "id", opportunityIds);
    }

    // Preserve the lead but reset its service state
    const { error: resetLeadError } = await supabaseAdmin
      .from("leads")
      .update({
        interest_confirmed: false,
        status: "NOVO",
        updated_by_user_id: userData.user.id,
      })
      .eq("id", lead_id);

    if (resetLeadError) {
      throw new Error(`Erro ao resetar serviço: ${resetLeadError.message}`);
    }

    return new Response(
      JSON.stringify({ success: true, action: "deleted" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
    console.error("Error in delete-service:", errorMessage);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
