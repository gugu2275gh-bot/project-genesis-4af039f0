import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";

export type LeadIntakeStatus = 'PENDENTE' | 'PROCESSADO' | 'ERRO' | 'DESCARTADO' | 'DUPLICADO';

export interface LeadIntake {
  id: string;
  phone: string;
  full_name: string | null;
  email: string | null;
  preferred_language: string | null;
  origin_channel: string | null;
  service_interest: string | null;
  message_summary: string | null;
  source_system: string | null;
  external_reference_id: string | null;
  raw_payload: Record<string, unknown> | null;
  status: LeadIntakeStatus;
  processed_at: string | null;
  processed_by_user_id: string | null;
  contact_id: string | null;
  lead_id: string | null;
  processing_notes: string | null;
  error_message: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export function useLeadIntakes(statusFilter?: LeadIntakeStatus) {
  return useQuery({
    queryKey: ["lead-intakes", statusFilter],
    queryFn: async () => {
      let query = supabase
        .from("lead_intake")
        .select("*")
        .order("created_at", { ascending: false });

      if (statusFilter) {
        query = query.eq("status", statusFilter);
      }

      const { data, error } = await query;

      if (error) throw error;
      return data as LeadIntake[];
    },
  });
}

export function useLeadIntake(id: string) {
  return useQuery({
    queryKey: ["lead-intake", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lead_intake")
        .select("*")
        .eq("id", id)
        .maybeSingle();

      if (error) throw error;
      return data as LeadIntake | null;
    },
    enabled: !!id,
  });
}

export function useLeadIntakeMutations() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();

  const processIntake = useMutation({
    mutationFn: async ({ id, notes }: { id: string; notes?: string }) => {
      // Get the intake data
      const { data: intake, error: fetchError } = await supabase
        .from("lead_intake")
        .select("*")
        .eq("id", id)
        .single();

      if (fetchError) throw fetchError;

      // Normalize phone - remove non-digits except leading +
      const normalizedPhone = intake.phone.replace(/\s+/g, "").replace(/[^+\d]/g, "");
      // Convert to number for database query (remove + sign for numeric comparison)
      const phoneNumber = parseInt(normalizedPhone.replace(/^\+/, ""), 10);

      // Check if contact exists
      const { data: existingContact } = await supabase
        .from("contacts")
        .select("id")
        .eq("phone", phoneNumber)
        .maybeSingle();

      let contactId: string;

      if (existingContact) {
        contactId = existingContact.id;
        // Update contact if new data provided
        const updateData: Record<string, unknown> = {};
        if (intake.full_name) updateData.full_name = intake.full_name;
        if (intake.email) updateData.email = intake.email;
        if (intake.preferred_language) {
          const validLangs = ['pt', 'es', 'en', 'fr', 'ca'];
          if (validLangs.includes(intake.preferred_language)) {
            updateData.preferred_language = intake.preferred_language as 'pt' | 'es' | 'en' | 'fr' | 'ca';
          }
        }
        if (Object.keys(updateData).length > 0) {
          await supabase
            .from("contacts")
            .update(updateData)
            .eq("id", contactId);
        }
      } else {
        // Create new contact
        const validLangs = ['pt', 'es', 'en', 'fr', 'ca'];
        const preferredLang = intake.preferred_language && validLangs.includes(intake.preferred_language)
          ? intake.preferred_language as 'pt' | 'es' | 'en' | 'fr' | 'ca'
          : 'pt';
        
        const validChannels = ['WHATSAPP', 'SITE', 'INSTAGRAM', 'FACEBOOK', 'EMAIL', 'INDICACAO', 'OUTRO'];
        const originChannel = intake.origin_channel && validChannels.includes(intake.origin_channel)
          ? intake.origin_channel as 'WHATSAPP' | 'SITE' | 'INSTAGRAM' | 'FACEBOOK' | 'EMAIL' | 'INDICACAO' | 'OUTRO'
          : 'WHATSAPP';

        const { data: newContact, error: contactError } = await supabase
          .from("contacts")
          .insert({
            full_name: intake.full_name || `Cliente ${normalizedPhone}`,
            phone: phoneNumber,
            email: intake.email || null,
            preferred_language: preferredLang,
            origin_channel: originChannel,
          })
          .select("id")
          .single();

        if (contactError) throw contactError;
        contactId = newContact.id;
      }

      // Check if lead exists for this contact
      const { data: existingLead } = await supabase
        .from("leads")
        .select("id")
        .eq("contact_id", contactId)
        .neq("status", "ARQUIVADO_SEM_RETORNO")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      let leadId: string;

      if (existingLead) {
        leadId = existingLead.id;
        if (intake.message_summary) {
          await supabase
            .from("leads")
            .update({
              notes: intake.message_summary,
            })
            .eq("id", leadId);
        }
      } else {
        const { data: newLead, error: leadError } = await supabase
          .from("leads")
          .insert({
            contact_id: contactId,
            service_interest: (intake.service_interest as any) || "OUTRO",
            status: "NOVO",
            notes: intake.message_summary || null,
          })
          .select("id")
          .single();

        if (leadError) throw leadError;
        leadId = newLead.id;
      }

      // Update intake as processed
      const { error: updateError } = await supabase
        .from("lead_intake")
        .update({
          status: "PROCESSADO",
          processed_at: new Date().toISOString(),
          processed_by_user_id: user?.id,
          contact_id: contactId,
          lead_id: leadId,
          processing_notes: notes || null,
        })
        .eq("id", id);

      if (updateError) throw updateError;

      return { contactId, leadId };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lead-intakes"] });
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      queryClient.invalidateQueries({ queryKey: ["contacts"] });
      toast({ title: "Intake processado com sucesso" });
    },
    onError: (error) => {
      toast({
        title: "Erro ao processar intake",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const updateStatus = useMutation({
    mutationFn: async ({ 
      id, 
      status, 
      notes 
    }: { 
      id: string; 
      status: LeadIntakeStatus; 
      notes?: string;
    }) => {
      const { error } = await supabase
        .from("lead_intake")
        .update({
          status,
          processing_notes: notes,
          processed_at: new Date().toISOString(),
          processed_by_user_id: user?.id,
        })
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lead-intakes"] });
      toast({ title: "Status atualizado" });
    },
    onError: (error) => {
      toast({
        title: "Erro ao atualizar status",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  return { processIntake, updateStatus };
}

export function useLeadIntakeStats() {
  return useQuery({
    queryKey: ["lead-intake-stats"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lead_intake")
        .select("status, created_at");

      if (error) throw error;

      const today = new Date().toISOString().split("T")[0];
      const stats = {
        total: data.length,
        pendente: data.filter(i => i.status === "PENDENTE").length,
        processado: data.filter(i => i.status === "PROCESSADO").length,
        erro: data.filter(i => i.status === "ERRO").length,
        descartado: data.filter(i => i.status === "DESCARTADO").length,
        duplicado: data.filter(i => i.status === "DUPLICADO").length,
        todayTotal: data.filter(i => i.created_at?.startsWith(today)).length,
      };

      return stats;
    },
  });
}
