import { useEffect, useState, useCallback, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import { useBrowserNotifications, NOTIFICATION_TITLES, NOTIFICATION_BODIES } from './useBrowserNotifications';
import { useNotificationPreferences, NotificationEventType } from './useNotificationPreferences';

type RealtimeEvent = {
  table: string;
  eventType: 'INSERT' | 'UPDATE' | 'DELETE';
  timestamp: Date;
  data?: Record<string, unknown>;
};

interface UseRealtimeDashboardOptions {
  enableNotifications?: boolean;
}

export function useRealtimeDashboard(options: UseRealtimeDashboardOptions = {}) {
  const { enableNotifications = true } = options;
  const queryClient = useQueryClient();
  const [realtimeEvents, setRealtimeEvents] = useState<RealtimeEvent[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const { showNotification, isEnabled: notificationsEnabled } = useBrowserNotifications();
  const { shouldNotify, isLoaded: preferencesLoaded } = useNotificationPreferences();
  
  // Track if this is the initial load to avoid notifications on page load
  const isInitialLoad = useRef(true);

  const addEvent = useCallback((event: RealtimeEvent) => {
    setRealtimeEvents((prev) => [event, ...prev].slice(0, 10));
    setLastUpdate(new Date());
  }, []);

  const invalidateDashboard = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['dashboard-metrics'] });
  }, [queryClient]);

  const sendNotification = useCallback(
    (table: string, eventType: 'INSERT' | 'UPDATE' | 'DELETE') => {
      // Only send notifications if enabled, not on initial load, and preferences allow it
      if (!enableNotifications || !notificationsEnabled || isInitialLoad.current || !preferencesLoaded) {
        return;
      }

      // Check user preferences for this specific event
      if (!shouldNotify(table as NotificationEventType, eventType)) {
        return;
      }

      const title = NOTIFICATION_TITLES[table]?.[eventType] || `${table} ${eventType}`;
      const body = NOTIFICATION_BODIES[table]?.[eventType] || `Houve uma alteração em ${table}`;

      showNotification({
        title,
        body,
        tag: `${table}-${eventType}`, // Prevent duplicate notifications
      });
    },
    [enableNotifications, notificationsEnabled, showNotification, shouldNotify, preferencesLoaded]
  );

  useEffect(() => {
    console.log('[Realtime] Setting up dashboard subscriptions...');
    
    // Mark initial load as complete after a short delay
    const initialLoadTimer = setTimeout(() => {
      isInitialLoad.current = false;
    }, 2000);

    const channel = supabase
      .channel('dashboard-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'leads' },
        (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
          console.log('[Realtime] Leads change:', payload.eventType);
          const eventType = payload.eventType as 'INSERT' | 'UPDATE' | 'DELETE';
          addEvent({
            table: 'leads',
            eventType,
            timestamp: new Date(),
            data: payload.new as Record<string, unknown>,
          });
          invalidateDashboard();
          sendNotification('leads', eventType);
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'opportunities' },
        (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
          console.log('[Realtime] Opportunities change:', payload.eventType);
          const eventType = payload.eventType as 'INSERT' | 'UPDATE' | 'DELETE';
          addEvent({
            table: 'opportunities',
            eventType,
            timestamp: new Date(),
            data: payload.new as Record<string, unknown>,
          });
          invalidateDashboard();
          sendNotification('opportunities', eventType);
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'payments' },
        (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
          console.log('[Realtime] Payments change:', payload.eventType);
          const eventType = payload.eventType as 'INSERT' | 'UPDATE' | 'DELETE';
          addEvent({
            table: 'payments',
            eventType,
            timestamp: new Date(),
            data: payload.new as Record<string, unknown>,
          });
          invalidateDashboard();
          sendNotification('payments', eventType);
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'service_cases' },
        (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
          console.log('[Realtime] Cases change:', payload.eventType);
          const eventType = payload.eventType as 'INSERT' | 'UPDATE' | 'DELETE';
          addEvent({
            table: 'service_cases',
            eventType,
            timestamp: new Date(),
            data: payload.new as Record<string, unknown>,
          });
          invalidateDashboard();
          sendNotification('service_cases', eventType);
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'tasks' },
        (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
          console.log('[Realtime] Tasks change:', payload.eventType);
          const eventType = payload.eventType as 'INSERT' | 'UPDATE' | 'DELETE';
          addEvent({
            table: 'tasks',
            eventType,
            timestamp: new Date(),
            data: payload.new as Record<string, unknown>,
          });
          invalidateDashboard();
          sendNotification('tasks', eventType);
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'contracts' },
        (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
          console.log('[Realtime] Contracts change:', payload.eventType);
          const eventType = payload.eventType as 'INSERT' | 'UPDATE' | 'DELETE';
          addEvent({
            table: 'contracts',
            eventType,
            timestamp: new Date(),
            data: payload.new as Record<string, unknown>,
          });
          invalidateDashboard();
          sendNotification('contracts', eventType);
        }
      )
      .subscribe((status) => {
        console.log('[Realtime] Subscription status:', status);
        setIsConnected(status === 'SUBSCRIBED');
      });

    return () => {
      console.log('[Realtime] Cleaning up dashboard subscriptions');
      clearTimeout(initialLoadTimer);
      supabase.removeChannel(channel);
    };
  }, [addEvent, invalidateDashboard, sendNotification]);

  return {
    realtimeEvents,
    isConnected,
    lastUpdate,
  };
}

// Labels for event display
export const TABLE_LABELS: Record<string, string> = {
  leads: 'Lead',
  opportunities: 'Oportunidade',
  payments: 'Pagamento',
  service_cases: 'Caso',
  tasks: 'Tarefa',
  contracts: 'Contrato',
};

export const EVENT_LABELS: Record<string, string> = {
  INSERT: 'criado',
  UPDATE: 'atualizado',
  DELETE: 'removido',
};
