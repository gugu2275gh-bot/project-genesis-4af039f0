import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

interface BeneficiaryLink {
  id: string;
  full_name: string;
  relationship: string | null;
  contact_id: string | null;
  is_primary: boolean;
}

interface TitularLink {
  full_name: string;
  contact_id: string | null;
}

export function useContactBeneficiaries(contactId?: string) {
  // Single query: find all beneficiaries (contract-based + direct)
  const beneficiariesQuery = useQuery({
    queryKey: ['contact-beneficiaries', contactId],
    queryFn: async () => {
      if (!contactId) return [];

      const results: BeneficiaryLink[] = [];
      const seenIds = new Set<string>();

      // 1) Contract-based beneficiaries
      const { data: primaryEntries } = await supabase
        .from('contract_beneficiaries')
        .select('contract_id')
        .eq('contact_id', contactId)
        .eq('is_primary', true);

      if (primaryEntries && primaryEntries.length > 0) {
        const contractIds = primaryEntries.map(e => e.contract_id);
        const { data: dependents } = await supabase
          .from('contract_beneficiaries')
          .select('id, full_name, relationship, contact_id, is_primary')
          .in('contract_id', contractIds)
          .eq('is_primary', false);

        for (const d of dependents || []) {
          const key = d.contact_id || d.id;
          if (!seenIds.has(key)) {
            seenIds.add(key);
            results.push(d as BeneficiaryLink);
          }
        }
      }

      // 2) Direct beneficiaries via linked_principal_contact_id
      const { data: directBens } = await supabase
        .from('contacts')
        .select('id, full_name')
        .eq('is_beneficiary', true)
        .eq('linked_principal_contact_id', contactId);

      for (const c of directBens || []) {
        if (!seenIds.has(c.id)) {
          seenIds.add(c.id);
          results.push({
            id: c.id,
            full_name: c.full_name,
            relationship: null,
            contact_id: c.id,
            is_primary: false,
          });
        }
      }

      return results;
    },
    enabled: !!contactId,
  });

  // Single query: find titular (contract-based or direct)
  const titularQuery = useQuery({
    queryKey: ['contact-titular', contactId],
    queryFn: async () => {
      if (!contactId) return null;

      // 1) Check direct titular via linked_principal_contact_id
      const { data: self } = await supabase
        .from('contacts')
        .select('is_beneficiary, linked_principal_contact_id')
        .eq('id', contactId)
        .single();

      if (self?.is_beneficiary && self?.linked_principal_contact_id) {
        const { data: titular } = await supabase
          .from('contacts')
          .select('id, full_name')
          .eq('id', self.linked_principal_contact_id)
          .single();
        if (titular) {
          return { full_name: titular.full_name, contact_id: titular.id } as TitularLink;
        }
      }

      // 2) Contract-based titular
      const { data: myEntries } = await supabase
        .from('contract_beneficiaries')
        .select('contract_id')
        .eq('contact_id', contactId)
        .eq('is_primary', false);

      if (myEntries && myEntries.length > 0) {
        const contractIds = myEntries.map(e => e.contract_id);
        const { data: primaries } = await supabase
          .from('contract_beneficiaries')
          .select('full_name, contact_id')
          .in('contract_id', contractIds)
          .eq('is_primary', true)
          .limit(1)
          .maybeSingle();
        if (primaries) {
          return primaries as TitularLink;
        }
      }

      return null;
    },
    enabled: !!contactId,
  });

  return {
    beneficiaries: beneficiariesQuery.data ?? [],
    titular: titularQuery.data ?? null,
    isLoading: beneficiariesQuery.isLoading || titularQuery.isLoading,
  };
}
