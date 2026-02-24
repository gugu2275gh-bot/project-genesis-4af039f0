import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface ContactDocument {
  id: string;
  status: string;
  file_url: string | null;
  rejection_reason: string | null;
  uploaded_at: string | null;
  uploaded_by_user_id: string | null;
  created_at: string | null;
  service_case_id: string;
  document_type_name: string;
  document_type_description: string | null;
  is_required: boolean;
  service_type: string;
  case_protocol_number: string | null;
  uploaded_by_name: string | null;
}

export function useContactDocuments(contactId?: string) {
  return useQuery({
    queryKey: ['contact-documents', contactId],
    queryFn: async () => {
      if (!contactId) return [];

      // 1. Get leads for this contact
      const { data: leads, error: leadsError } = await supabase
        .from('leads')
        .select('id')
        .eq('contact_id', contactId);

      if (leadsError) throw leadsError;
      if (!leads || leads.length === 0) return [];

      const leadIds = leads.map(l => l.id);

      // 2. Get opportunities for those leads
      const { data: opps, error: oppsError } = await supabase
        .from('opportunities')
        .select('id')
        .in('lead_id', leadIds);

      if (oppsError) throw oppsError;
      if (!opps || opps.length === 0) return [];

      const oppIds = opps.map(o => o.id);

      // 3. Get service_cases for those opportunities
      const { data: cases, error: casesError } = await supabase
        .from('service_cases')
        .select('id, protocol_number, service_type')
        .in('opportunity_id', oppIds);

      if (casesError) throw casesError;
      if (!cases || cases.length === 0) return [];

      const caseIds = cases.map(c => c.id);
      const caseMap = new Map(cases.map(c => [c.id, c]));

      // 4. Get documents for those cases
      const { data: docs, error: docsError } = await supabase
        .from('service_documents')
        .select(`
          *,
          service_document_types (name, description, is_required, service_type)
        `)
        .in('service_case_id', caseIds)
        .order('created_at', { ascending: true });

      if (docsError) throw docsError;
      if (!docs || docs.length === 0) return [];

      // 5. Get uploader profiles
      const uploaderIds = [...new Set(docs.filter(d => d.uploaded_by_user_id).map(d => d.uploaded_by_user_id!))];
      let profileMap = new Map<string, string>();
      if (uploaderIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, full_name')
          .in('id', uploaderIds);
        if (profiles) {
          profileMap = new Map(profiles.map(p => [p.id, p.full_name]));
        }
      }

      // 6. Map to result
      return docs.map((doc): ContactDocument => {
        const sc = caseMap.get(doc.service_case_id);
        const dt = doc.service_document_types as any;
        return {
          id: doc.id,
          status: doc.status || 'NAO_ENVIADO',
          file_url: doc.file_url,
          rejection_reason: doc.rejection_reason,
          uploaded_at: doc.uploaded_at,
          uploaded_by_user_id: doc.uploaded_by_user_id,
          created_at: doc.updated_at,
          service_case_id: doc.service_case_id,
          document_type_name: dt?.name || 'Documento',
          document_type_description: dt?.description,
          is_required: dt?.is_required ?? false,
          service_type: sc?.service_type || '',
          case_protocol_number: sc?.protocol_number || null,
          uploaded_by_name: doc.uploaded_by_user_id ? profileMap.get(doc.uploaded_by_user_id) || null : null,
        };
      });
    },
    enabled: !!contactId,
  });
}
