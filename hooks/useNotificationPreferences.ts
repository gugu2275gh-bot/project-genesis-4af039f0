import { useState, useEffect, useCallback } from 'react';

export type NotificationEventType = 
  | 'leads'
  | 'opportunities'
  | 'payments'
  | 'service_cases'
  | 'tasks'
  | 'contracts';

export type NotificationEventAction = 'INSERT' | 'UPDATE' | 'DELETE';

export interface NotificationPreference {
  enabled: boolean;
  actions: {
    INSERT: boolean;
    UPDATE: boolean;
    DELETE: boolean;
  };
}

export type NotificationPreferences = Record<NotificationEventType, NotificationPreference>;

const STORAGE_KEY = 'notification_preferences';

const DEFAULT_PREFERENCES: NotificationPreferences = {
  leads: {
    enabled: true,
    actions: { INSERT: true, UPDATE: true, DELETE: true },
  },
  opportunities: {
    enabled: true,
    actions: { INSERT: true, UPDATE: true, DELETE: true },
  },
  payments: {
    enabled: true,
    actions: { INSERT: true, UPDATE: true, DELETE: true },
  },
  service_cases: {
    enabled: true,
    actions: { INSERT: true, UPDATE: true, DELETE: true },
  },
  tasks: {
    enabled: true,
    actions: { INSERT: true, UPDATE: true, DELETE: true },
  },
  contracts: {
    enabled: true,
    actions: { INSERT: true, UPDATE: true, DELETE: true },
  },
};

export const EVENT_TYPE_LABELS: Record<NotificationEventType, string> = {
  leads: 'Leads',
  opportunities: 'Oportunidades',
  payments: 'Pagamentos',
  service_cases: 'Casos Técnicos',
  tasks: 'Tarefas',
  contracts: 'Contratos',
};

export const EVENT_ACTION_LABELS: Record<NotificationEventAction, string> = {
  INSERT: 'Criação',
  UPDATE: 'Atualização',
  DELETE: 'Remoção',
};

export function useNotificationPreferences() {
  const [preferences, setPreferences] = useState<NotificationPreferences>(DEFAULT_PREFERENCES);
  const [isLoaded, setIsLoaded] = useState(false);

  // Load preferences from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        // Merge with defaults to handle new event types
        setPreferences({ ...DEFAULT_PREFERENCES, ...parsed });
      }
    } catch (error) {
      console.error('Error loading notification preferences:', error);
    }
    setIsLoaded(true);
  }, []);

  // Save preferences to localStorage
  const savePreferences = useCallback((newPreferences: NotificationPreferences) => {
    setPreferences(newPreferences);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newPreferences));
    } catch (error) {
      console.error('Error saving notification preferences:', error);
    }
  }, []);

  // Toggle entire event type
  const toggleEventType = useCallback((eventType: NotificationEventType) => {
    const newPreferences = {
      ...preferences,
      [eventType]: {
        ...preferences[eventType],
        enabled: !preferences[eventType].enabled,
      },
    };
    savePreferences(newPreferences);
  }, [preferences, savePreferences]);

  // Toggle specific action for an event type
  const toggleEventAction = useCallback(
    (eventType: NotificationEventType, action: NotificationEventAction) => {
      const newPreferences = {
        ...preferences,
        [eventType]: {
          ...preferences[eventType],
          actions: {
            ...preferences[eventType].actions,
            [action]: !preferences[eventType].actions[action],
          },
        },
      };
      savePreferences(newPreferences);
    },
    [preferences, savePreferences]
  );

  // Check if a notification should be shown
  const shouldNotify = useCallback(
    (eventType: NotificationEventType, action: NotificationEventAction): boolean => {
      const pref = preferences[eventType];
      return pref.enabled && pref.actions[action];
    },
    [preferences]
  );

  // Enable all notifications
  const enableAll = useCallback(() => {
    const newPreferences = { ...DEFAULT_PREFERENCES };
    savePreferences(newPreferences);
  }, [savePreferences]);

  // Disable all notifications
  const disableAll = useCallback(() => {
    const newPreferences: NotificationPreferences = {} as NotificationPreferences;
    for (const key of Object.keys(DEFAULT_PREFERENCES) as NotificationEventType[]) {
      newPreferences[key] = {
        enabled: false,
        actions: { INSERT: false, UPDATE: false, DELETE: false },
      };
    }
    savePreferences(newPreferences);
  }, [savePreferences]);

  return {
    preferences,
    isLoaded,
    toggleEventType,
    toggleEventAction,
    shouldNotify,
    enableAll,
    disableAll,
  };
}
