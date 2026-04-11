import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

interface BeneficiaryLink {
  id: string;
  full_name: string;
  relationship: string | null;
  contact_id: string | null;
  is_primary: boolean;
}

export interface TitularLink {
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

  // Query: find ALL titulars from beneficiary_titular_links + contract_beneficiaries
  const titularesQuery = useQuery({
    queryKey: ['contact-titulares', contactId],
    queryFn: async () => {
      if (!contactId) return [];

      const results: TitularLink[] = [];
      const seenIds = new Set<string>();

      // 1) Direct links from beneficiary_titular_links table
      const { data: directLinks } = await supabase
        .from('beneficiary_titular_links')
        .select('titular_contact_id')
        .eq('beneficiary_contact_id', contactId);

      if (directLinks && directLinks.length > 0) {
        const titularIds = directLinks.map(l => l.titular_contact_id);
        const { data: titulars } = await supabase
          .from('contacts')
          .select('id, full_name')
          .in('id', titularIds);

        for (const t of titulars || []) {
          seenIds.add(t.id);
          results.push({ full_name: t.full_name, contact_id: t.id });
        }
      }

      // 2) Contract-based titulars — find all contracts where this contact is non-primary
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
          .eq('is_primary', true);

        for (const p of primaries || []) {
          const key = p.contact_id || p.full_name;
          if (key && !seenIds.has(key)) {
            seenIds.add(key);
            results.push(p as TitularLink);
          }
        }
      }

      return results;
    },
    enabled: !!contactId,
  });

  // Backward-compatible: first titular or null
  const titular = titularesQuery.data?.[0] ?? null;

  return {
    beneficiaries: beneficiariesQuery.data ?? [],
    titular,
    titulares: titularesQuery.data ?? [],
    isLoading: beneficiariesQuery.isLoading || titularesQuery.isLoading,
  };
}
