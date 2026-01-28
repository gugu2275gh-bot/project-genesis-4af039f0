import { Badge } from '@/components/ui/badge';
import { Clock, AlertTriangle, AlertCircle } from 'lucide-react';
import { differenceInHours } from 'date-fns';

interface InitialContactSLABadgeProps {
  createdAt: string;
  firstContactAt?: string | null;
  technicalStatus?: string | null;
}

export function InitialContactSLABadge({ 
  createdAt, 
  firstContactAt, 
  technicalStatus 
}: InitialContactSLABadgeProps) {
  // Only show for cases awaiting initial contact
  if (technicalStatus !== 'CONTATO_INICIAL') {
    return null;
  }

  // If first contact was made, don't show
  if (firstContactAt) {
    return null;
  }

  const hoursWaiting = differenceInHours(new Date(), new Date(createdAt));

  // < 24h: Green (on track)
  if (hoursWaiting < 24) {
    return (
      <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
        <Clock className="h-3 w-3 mr-1" />
        {hoursWaiting}h aguardando contato
      </Badge>
    );
  }

  // 24-72h: Yellow (warning for technician)
  if (hoursWaiting < 72) {
    return (
      <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
        <AlertTriangle className="h-3 w-3 mr-1" />
        {hoursWaiting}h aguardando contato
      </Badge>
    );
  }

  // > 72h: Red (escalated)
  return (
    <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">
      <AlertCircle className="h-3 w-3 mr-1" />
      {hoursWaiting}h sem contato - Escalonado
    </Badge>
  );
}
