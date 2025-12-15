import { cn } from '@/lib/utils';
import { Button } from './button';
import { LucideIcon, Plus } from 'lucide-react';

interface PageHeaderProps {
  title: string | React.ReactNode;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
    icon?: LucideIcon;
  };
  actions?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}

export function PageHeader({
  title,
  description,
  action,
  actions,
  children,
  className,
}: PageHeaderProps) {
  return (
    <div className={cn('flex items-start justify-between gap-4', className)}>
      <div className="space-y-1">
        {typeof title === 'string' ? (
          <h1 className="font-display text-2xl font-bold tracking-tight">{title}</h1>
        ) : (
          <h1 className="font-display text-2xl font-bold tracking-tight flex items-center gap-2">{title}</h1>
        )}
        {description && (
          <p className="text-muted-foreground">{description}</p>
        )}
      </div>
      <div className="flex items-center gap-2">
        {children}
        {actions}
        {action && (
          <Button onClick={action.onClick}>
            {action.icon ? (
              <action.icon className="mr-2 h-4 w-4" />
            ) : (
              <Plus className="mr-2 h-4 w-4" />
            )}
            {action.label}
          </Button>
        )}
      </div>
    </div>
  );
}