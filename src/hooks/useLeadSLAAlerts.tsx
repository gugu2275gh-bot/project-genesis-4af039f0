import { useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useNavigate } from 'react-router-dom';
import { differenceInHours, differenceInMinutes } from 'date-fns';

const SLA_HOURS = 2;
const CHECK_INTERVAL_MS = 60000; // 60 seconds
const STORAGE_KEY = 'lead_sla_alerts_shown';

interface LeadWithContact {
  id: string;
  created_at: string;
  contacts: {
    full_name: string;
  } | null;
}

function getShownAlerts(): Record<string, number> {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return {};
    const data = JSON.parse(stored);
    // Clean up alerts older than 24 hours
    const now = Date.now();
    const cleaned: Record<string, number> = {};
    for (const [id, timestamp] of Object.entries(data)) {
      if (now - (timestamp as number) < 24 * 60 * 60 * 1000) {
        cleaned[id] = timestamp as number;
      }
    }
    return cleaned;
  } catch {
    return {};
  }
}

function markAlertShown(leadId: string) {
  const alerts = getShownAlerts();
  alerts[leadId] = Date.now();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(alerts));
}

export function useLeadSLAAlerts() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const shownAlertsRef = useRef<Set<string>>(new Set());

  const { data: overdueLeads } = useQuery({
    queryKey: ['overdue-leads-sla'],
    queryFn: async () => {
      const twoHoursAgo = new Date(Date.now() - SLA_HOURS * 60 * 60 * 1000).toISOString();
      
      const { data, error } = await supabase
        .from('leads')
        .select('id, created_at, contacts(full_name)')
        .eq('status', 'NOVO')
        .lt('created_at', twoHoursAgo)
        .order('created_at', { ascending: true });

      if (error) throw error;
      return data as LeadWithContact[];
    },
    refetchInterval: CHECK_INTERVAL_MS,
  });

  useEffect(() => {
    if (!overdueLeads || overdueLeads.length === 0) return;

    const storedAlerts = getShownAlerts();
    
    for (const lead of overdueLeads) {
      // Skip if already shown in this session or in localStorage
      if (shownAlertsRef.current.has(lead.id) || storedAlerts[lead.id]) {
        continue;
      }

      const hoursWaiting = differenceInHours(new Date(), new Date(lead.created_at));
      const minutesWaiting = differenceInMinutes(new Date(), new Date(lead.created_at));
      
      const timeText = hoursWaiting >= 1 
        ? `${hoursWaiting}h` 
        : `${minutesWaiting}min`;

      const clientName = lead.contacts?.full_name || 'Cliente';

      toast({
        title: "⚠️ Lead aguardando contato",
        description: `${clientName} está há ${timeText} aguardando primeiro contato`,
        duration: 10000,
        action: (
          <button
            onClick={() => navigate(`/crm/leads/${lead.id}`)}
            className="text-xs font-medium text-primary hover:underline"
          >
            Ver Lead
          </button>
        ),
      });

      // Mark as shown
      shownAlertsRef.current.add(lead.id);
      markAlertShown(lead.id);
    }
  }, [overdueLeads, toast, navigate]);

  return { overdueLeads };
}
