import { useState, useEffect, useCallback } from 'react';
import { toast } from '@/hooks/use-toast';

export type NotificationPermission = 'granted' | 'denied' | 'default';

interface NotificationOptions {
  title: string;
  body: string;
  icon?: string;
  tag?: string;
  requireInteraction?: boolean;
  onClick?: () => void;
}

export function useBrowserNotifications() {
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [isSupported, setIsSupported] = useState(false);

  useEffect(() => {
    // Check if notifications are supported
    const supported = 'Notification' in window;
    setIsSupported(supported);

    if (supported) {
      setPermission(Notification.permission as NotificationPermission);
    }
  }, []);

  const requestPermission = useCallback(async () => {
    if (!isSupported) {
      toast({
        title: 'Notificações não suportadas',
        description: 'Seu navegador não suporta notificações push.',
        variant: 'destructive',
      });
      return false;
    }

    try {
      const result = await Notification.requestPermission();
      setPermission(result as NotificationPermission);

      if (result === 'granted') {
        toast({
          title: 'Notificações ativadas',
          description: 'Você receberá alertas em tempo real.',
        });
        
        // Show a test notification
        new Notification('CB Asesoria', {
          body: 'Notificações ativadas com sucesso!',
          icon: '/favicon.ico',
        });
        
        return true;
      } else if (result === 'denied') {
        toast({
          title: 'Notificações bloqueadas',
          description: 'Você bloqueou as notificações. Altere nas configurações do navegador.',
          variant: 'destructive',
        });
        return false;
      }
      
      return false;
    } catch (error) {
      console.error('Error requesting notification permission:', error);
      return false;
    }
  }, [isSupported]);

  const showNotification = useCallback(
    ({ title, body, icon = '/favicon.ico', tag, requireInteraction = false, onClick }: NotificationOptions) => {
      if (!isSupported || permission !== 'granted') {
        // Fallback to toast
        toast({
          title,
          description: body,
        });
        return null;
      }

      try {
        const notification = new Notification(title, {
          body,
          icon,
          tag,
          requireInteraction,
        });

        if (onClick) {
          notification.onclick = () => {
            window.focus();
            onClick();
            notification.close();
          };
        }

        // Auto-close after 5 seconds if not requiring interaction
        if (!requireInteraction) {
          setTimeout(() => notification.close(), 5000);
        }

        return notification;
      } catch (error) {
        console.error('Error showing notification:', error);
        // Fallback to toast
        toast({
          title,
          description: body,
        });
        return null;
      }
    },
    [isSupported, permission]
  );

  return {
    permission,
    isSupported,
    isEnabled: permission === 'granted',
    requestPermission,
    showNotification,
  };
}

// Notification event labels
export const NOTIFICATION_TITLES: Record<string, Record<string, string>> = {
  leads: {
    INSERT: 'Novo Lead',
    UPDATE: 'Lead Atualizado',
    DELETE: 'Lead Removido',
  },
  opportunities: {
    INSERT: 'Nova Oportunidade',
    UPDATE: 'Oportunidade Atualizada',
    DELETE: 'Oportunidade Removida',
  },
  payments: {
    INSERT: 'Novo Pagamento',
    UPDATE: 'Pagamento Atualizado',
    DELETE: 'Pagamento Removido',
  },
  service_cases: {
    INSERT: 'Novo Caso',
    UPDATE: 'Caso Atualizado',
    DELETE: 'Caso Removido',
  },
  tasks: {
    INSERT: 'Nova Tarefa',
    UPDATE: 'Tarefa Atualizada',
    DELETE: 'Tarefa Removida',
  },
  contracts: {
    INSERT: 'Novo Contrato',
    UPDATE: 'Contrato Atualizado',
    DELETE: 'Contrato Removido',
  },
};

export const NOTIFICATION_BODIES: Record<string, Record<string, string>> = {
  leads: {
    INSERT: 'Um novo lead foi registrado no sistema.',
    UPDATE: 'Um lead foi atualizado.',
    DELETE: 'Um lead foi removido do sistema.',
  },
  opportunities: {
    INSERT: 'Uma nova oportunidade foi criada.',
    UPDATE: 'Uma oportunidade foi atualizada.',
    DELETE: 'Uma oportunidade foi removida.',
  },
  payments: {
    INSERT: 'Um novo pagamento foi registrado.',
    UPDATE: 'Um pagamento foi atualizado.',
    DELETE: 'Um pagamento foi removido.',
  },
  service_cases: {
    INSERT: 'Um novo caso técnico foi aberto.',
    UPDATE: 'Um caso técnico foi atualizado.',
    DELETE: 'Um caso técnico foi fechado.',
  },
  tasks: {
    INSERT: 'Uma nova tarefa foi criada.',
    UPDATE: 'Uma tarefa foi atualizada.',
    DELETE: 'Uma tarefa foi removida.',
  },
  contracts: {
    INSERT: 'Um novo contrato foi criado.',
    UPDATE: 'Um contrato foi atualizado.',
    DELETE: 'Um contrato foi removido.',
  },
};
