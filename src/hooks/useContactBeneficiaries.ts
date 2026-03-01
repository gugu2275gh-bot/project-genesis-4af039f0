import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

interface BeneficiaryLink {
  id: string;
  full_name: string;
  relationship: string | null;
  contact_id: string | null;
  is_primary: boolean;
  contract_id?: string;
}

interface TitularLink {
  full_name: string;
  contact_id: string | null;
  contract_id?: string;
}

export function useContactBeneficiaries(contactId?: string) {
  // Find beneficiaries where this contact is the titular (primary) — via contract_beneficiaries
  const contractBeneficiariesQuery = useQuery({
    queryKey: ['contact-beneficiaries-contract', contactId],
    queryFn: async () => {
      if (!contactId) return [];
      const { data: primaryEntries, error: pe } = await supabase
        .from('contract_beneficiaries')
        .select('contract_id')
        .eq('contact_id', contactId)
        .eq('is_primary', true);
      if (pe) throw pe;
      if (!primaryEntries || primaryEntries.length === 0) return [];
      const contractIds = primaryEntries.map(e => e.contract_id);
      const { data: dependents, error: de } = await supabase
        .from('contract_beneficiaries')
        .select('id, full_name, relationship, contact_id, is_primary, contract_id')
        .in('contract_id', contractIds)
        .eq('is_primary', false);
      if (de) throw de;
      return (dependents || []) as BeneficiaryLink[];
    },
    enabled: !!contactId,
  });

  // Find direct beneficiaries linked via linked_principal_contact_id
  const directBeneficiariesQuery = useQuery({
    queryKey: ['contact-beneficiaries-direct', contactId],
    queryFn: async () => {
      if (!contactId) return [];
      const { data, error } = await supabase
        .from('contacts')
        .select('id, full_name')
        .eq('is_beneficiary', true)
        .eq('linked_principal_contact_id', contactId);
      if (error) throw error;
      return (data || []).map(c => ({
        id: c.id,
        full_name: c.full_name,
        relationship: null,
        contact_id: c.id,
        is_primary: false,
      })) as BeneficiaryLink[];
    },
    enabled: !!contactId,
  });

  // Find titular via contract_beneficiaries
  const contractTitularQuery = useQuery({
    queryKey: ['contact-titular-contract', contactId],
    queryFn: async () => {
      if (!contactId) return null;
      const { data: myEntries, error: me } = await supabase
        .from('contract_beneficiaries')
        .select('contract_id')
        .eq('contact_id', contactId)
        .eq('is_primary', false);
      if (me) throw me;
      if (!myEntries || myEntries.length === 0) return null;
      const contractIds = myEntries.map(e => e.contract_id);
      const { data: primaries, error: pre } = await supabase
        .from('contract_beneficiaries')
        .select('full_name, contact_id, contract_id')
        .in('contract_id', contractIds)
        .eq('is_primary', true)
        .limit(1)
        .single();
      if (pre && pre.code !== 'PGRST116') throw pre;
      return primaries as TitularLink | null;
    },
    enabled: !!contactId,
  });

  // Find direct titular via linked_principal_contact_id on this contact
  const directTitularQuery = useQuery({
    queryKey: ['contact-titular-direct', contactId],
    queryFn: async () => {
      if (!contactId) return null;
      const { data: self, error: se } = await supabase
        .from('contacts')
        .select('is_beneficiary, linked_principal_contact_id')
        .eq('id', contactId)
        .single();
      if (se || !self?.is_beneficiary || !self?.linked_principal_contact_id) return null;
      const { data: titular, error: te } = await supabase
        .from('contacts')
        .select('id, full_name')
        .eq('id', self.linked_principal_contact_id)
        .single();
      if (te) return null;
      return { full_name: titular.full_name, contact_id: titular.id } as TitularLink;
    },
    enabled: !!contactId,
  });

  // Merge contract-based and direct beneficiaries, deduplicate by contact_id
  const allBeneficiaries = [...(contractBeneficiariesQuery.data ?? []), ...(directBeneficiariesQuery.data ?? [])];
  const seen = new Set<string>();
  const uniqueBeneficiaries = allBeneficiaries.filter(b => {
    const key = b.contact_id || b.id;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const titular = contractTitularQuery.data ?? directTitularQuery.data ?? null;

  return {
    beneficiaries: uniqueBeneficiaries,
    titular,
    isLoading: contractBeneficiariesQuery.isLoading || directBeneficiariesQuery.isLoading || contractTitularQuery.isLoading || directTitularQuery.isLoading,
  };
}
