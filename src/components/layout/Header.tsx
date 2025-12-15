import { 
  Bell, 
  Search, 
  CheckCircle2, 
  FileText, 
  CreditCard, 
  AlertTriangle,
  UserPlus,
  Clock,
  FileCheck,
  FileX,
  PenTool
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useNotifications } from '@/hooks/useNotifications';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';

interface HeaderProps {
  title: string;
  subtitle?: string;
}

const notificationIcons: Record<string, React.ElementType> = {
  task_assigned: CheckCircle2,
  task_due: Clock,
  document_uploaded: FileText,
  document_approved: FileCheck,
  document_rejected: FileX,
  payment_confirmed: CreditCard,
  payment_pending: CreditCard,
  contract_signed: PenTool,
  lead_new: UserPlus,
  case_status_changed: FileText,
  requirement_new: AlertTriangle,
  sla_warning: AlertTriangle,
  general: Bell,
};

const notificationColors: Record<string, string> = {
  task_assigned: 'text-primary bg-primary/10',
  task_due: 'text-warning bg-warning/10',
  document_uploaded: 'text-info bg-info/10',
  document_approved: 'text-success bg-success/10',
  document_rejected: 'text-destructive bg-destructive/10',
  payment_confirmed: 'text-success bg-success/10',
  payment_pending: 'text-warning bg-warning/10',
  contract_signed: 'text-success bg-success/10',
  lead_new: 'text-accent bg-accent/10',
  case_status_changed: 'text-info bg-info/10',
  requirement_new: 'text-destructive bg-destructive/10',
  sla_warning: 'text-destructive bg-destructive/10',
  general: 'text-muted-foreground bg-muted',
};

export function Header({ title, subtitle }: HeaderProps) {
  const { notifications, unreadCount, markAsRead, markAllAsRead } = useNotifications();

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 px-6">
      <div>
        <h1 className="font-display text-xl font-semibold text-foreground">{title}</h1>
        {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
      </div>

      <div className="flex items-center gap-4">
        {/* Search */}
        <div className="relative hidden md:block">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar..."
            className="w-64 pl-9 bg-muted/50 border-0 focus-visible:ring-1"
          />
        </div>

        {/* Notifications */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="relative">
              <Bell className="h-5 w-5" />
              {unreadCount > 0 && (
                <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-[10px] font-medium text-destructive-foreground animate-pulse">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-96 bg-popover border shadow-lg z-50">
            <DropdownMenuLabel className="flex items-center justify-between py-3">
              <span className="font-semibold">Notificações</span>
              {unreadCount > 0 && (
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={(e) => {
                    e.preventDefault();
                    markAllAsRead();
                  }} 
                  className="h-auto py-1 px-2 text-xs text-primary hover:text-primary"
                >
                  Marcar todas como lidas
                </Button>
              )}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <ScrollArea className="max-h-[400px]">
              {notifications.length === 0 ? (
                <div className="py-8 text-center text-sm text-muted-foreground">
                  <Bell className="h-10 w-10 mx-auto mb-3 opacity-30" />
                  <p>Nenhuma notificação</p>
                  <p className="text-xs mt-1">Você está em dia!</p>
                </div>
              ) : (
                notifications.slice(0, 10).map((notification) => {
                  const IconComponent = notificationIcons[notification.type] || Bell;
                  const colorClass = notificationColors[notification.type] || notificationColors.general;
                  
                  return (
                    <DropdownMenuItem
                      key={notification.id}
                      onClick={() => markAsRead(notification.id)}
                      className={cn(
                        'flex items-start gap-3 p-4 cursor-pointer focus:bg-muted',
                        !notification.is_read && 'bg-primary/5'
                      )}
                    >
                      <div className={cn('p-2 rounded-lg shrink-0', colorClass)}>
                        <IconComponent className="h-4 w-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <span className={cn(
                            'text-sm line-clamp-1',
                            !notification.is_read ? 'font-semibold' : 'font-medium'
                          )}>
                            {notification.title}
                          </span>
                          {!notification.is_read && (
                            <span className="h-2 w-2 rounded-full bg-primary shrink-0 mt-1.5" />
                          )}
                        </div>
                        {notification.message && (
                          <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                            {notification.message}
                          </p>
                        )}
                        <p className="text-xs text-muted-foreground mt-1">
                          {formatDistanceToNow(new Date(notification.created_at), {
                            addSuffix: true,
                            locale: ptBR,
                          })}
                        </p>
                      </div>
                    </DropdownMenuItem>
                  );
                })
              )}
            </ScrollArea>
            {notifications.length > 10 && (
              <>
                <DropdownMenuSeparator />
                <div className="py-2 text-center">
                  <Button variant="ghost" size="sm" className="text-xs text-primary">
                    Ver todas as notificações
                  </Button>
                </div>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
