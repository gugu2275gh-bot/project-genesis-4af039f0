import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

interface BeneficiaryLink {
  id: string;
  full_name: string;
  relationship: string | null;
  contact_id: string | null;
  is_primary: boolean;
  contract_id: string;
}

interface TitularLink {
  full_name: string;
  contact_id: string | null;
  contract_id: string;
}

export function useContactBeneficiaries(contactId?: string) {
  // Find beneficiaries where this contact is the titular (primary)
  const beneficiariesQuery = useQuery({
    queryKey: ['contact-beneficiaries', contactId],
    queryFn: async () => {
      if (!contactId) return [];

      // Find contracts where this contact is the primary beneficiary
      const { data: primaryEntries, error: pe } = await supabase
        .from('contract_beneficiaries')
        .select('contract_id')
        .eq('contact_id', contactId)
        .eq('is_primary', true);

      if (pe) throw pe;
      if (!primaryEntries || primaryEntries.length === 0) return [];

      const contractIds = primaryEntries.map(e => e.contract_id);

      // Find non-primary beneficiaries on those contracts
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

  // Find titular if this contact is a beneficiary (non-primary)
  const titularQuery = useQuery({
    queryKey: ['contact-titular', contactId],
    queryFn: async () => {
      if (!contactId) return null;

      // Find contract_beneficiaries entries where this contact is non-primary
      const { data: myEntries, error: me } = await supabase
        .from('contract_beneficiaries')
        .select('contract_id')
        .eq('contact_id', contactId)
        .eq('is_primary', false);

      if (me) throw me;
      if (!myEntries || myEntries.length === 0) return null;

      const contractIds = myEntries.map(e => e.contract_id);

      // Find the primary beneficiary on those contracts
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

  return {
    beneficiaries: beneficiariesQuery.data ?? [],
    titular: titularQuery.data ?? null,
    isLoading: beneficiariesQuery.isLoading || titularQuery.isLoading,
  };
}
