import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Bell, BellOff, CheckCircle2 } from 'lucide-react';
import {
  useNotificationPreferences,
  NotificationEventType,
  NotificationEventAction,
  EVENT_TYPE_LABELS,
  EVENT_ACTION_LABELS,
} from '@/hooks/useNotificationPreferences';
import { useBrowserNotifications } from '@/hooks/useBrowserNotifications';
import { Badge } from '@/components/ui/badge';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { ChevronDown } from 'lucide-react';
import { useState } from 'react';

export default function NotificationPreferences() {
  const {
    preferences,
    isLoaded,
    toggleEventType,
    toggleEventAction,
    enableAll,
    disableAll,
  } = useNotificationPreferences();
  
  const { permission, isEnabled, requestPermission } = useBrowserNotifications();
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({});

  const toggleSection = (section: string) => {
    setOpenSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  if (!isLoaded) {
    return null;
  }

  const eventTypes = Object.keys(preferences) as NotificationEventType[];
  const actions: NotificationEventAction[] = ['INSERT', 'UPDATE', 'DELETE'];

  return (
    <div className="space-y-6">
      {/* Browser Permission Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            Permissão do Navegador
          </CardTitle>
          <CardDescription>
            Para receber notificações, é necessário permitir notificações no navegador.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Badge
                variant={isEnabled ? 'default' : permission === 'denied' ? 'destructive' : 'secondary'}
              >
                {isEnabled ? 'Ativadas' : permission === 'denied' ? 'Bloqueadas' : 'Pendente'}
              </Badge>
              <span className="text-sm text-muted-foreground">
                {isEnabled
                  ? 'As notificações estão ativas neste navegador.'
                  : permission === 'denied'
                  ? 'Desbloqueie nas configurações do navegador.'
                  : 'Clique para ativar as notificações.'}
              </span>
            </div>
            {!isEnabled && permission !== 'denied' && (
              <Button onClick={requestPermission} size="sm">
                Ativar Notificações
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Preferences Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Preferências por Tipo de Evento</CardTitle>
              <CardDescription>
                Configure quais eventos você deseja receber notificações.
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={enableAll}>
                <CheckCircle2 className="h-4 w-4 mr-2" />
                Ativar Todos
              </Button>
              <Button variant="outline" size="sm" onClick={disableAll}>
                <BellOff className="h-4 w-4 mr-2" />
                Desativar Todos
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {eventTypes.map((eventType, index) => (
            <div key={eventType}>
              {index > 0 && <Separator className="my-4" />}
              <Collapsible
                open={openSections[eventType]}
                onOpenChange={() => toggleSection(eventType)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <Switch
                      id={`event-${eventType}`}
                      checked={preferences[eventType].enabled}
                      onCheckedChange={() => toggleEventType(eventType)}
                    />
                    <Label
                      htmlFor={`event-${eventType}`}
                      className="text-base font-medium cursor-pointer"
                    >
                      {EVENT_TYPE_LABELS[eventType]}
                    </Label>
                  </div>
                  <CollapsibleTrigger asChild>
                    <Button variant="ghost" size="sm">
                      <ChevronDown
                        className={`h-4 w-4 transition-transform ${
                          openSections[eventType] ? 'rotate-180' : ''
                        }`}
                      />
                      <span className="sr-only">Expandir</span>
                    </Button>
                  </CollapsibleTrigger>
                </div>
                <CollapsibleContent className="mt-4 ml-12">
                  <div className="flex flex-wrap gap-4">
                    {actions.map((action) => (
                      <div key={action} className="flex items-center gap-2">
                        <Switch
                          id={`${eventType}-${action}`}
                          checked={preferences[eventType].actions[action]}
                          onCheckedChange={() => toggleEventAction(eventType, action)}
                          disabled={!preferences[eventType].enabled}
                        />
                        <Label
                          htmlFor={`${eventType}-${action}`}
                          className={`text-sm cursor-pointer ${
                            !preferences[eventType].enabled ? 'text-muted-foreground' : ''
                          }`}
                        >
                          {EVENT_ACTION_LABELS[action]}
                        </Label>
                      </div>
                    ))}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
