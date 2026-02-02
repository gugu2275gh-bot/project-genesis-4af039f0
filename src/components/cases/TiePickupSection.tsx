import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { 
  CreditCard, 
  Calendar, 
  CheckCircle,
  AlertCircle,
  Clock,
  Package,
  MapPin
} from 'lucide-react';
import { format, addYears, addDays, isBefore } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useToast } from '@/hooks/use-toast';

interface TiePickupSectionProps {
  serviceCase: {
    id: string;
    tie_lot_number?: string | null;
    tie_validity_date?: string | null;
    tie_pickup_date?: string | null;
    tie_picked_up?: boolean;
    tie_pickup_requires_appointment?: boolean | null;
    tie_pickup_appointment_date?: string | null;
    tie_pickup_appointment_time?: string | null;
    tie_pickup_location?: string | null;
    tie_estimated_ready_date?: string | null;
    huellas_completed?: boolean;
    technical_status?: string;
  };
  onUpdate: (data: {
    tie_lot_number?: string;
    tie_validity_date?: string;
    tie_pickup_date?: string;
    tie_picked_up?: boolean;
    tie_pickup_requires_appointment?: boolean;
    tie_pickup_appointment_date?: string;
    tie_pickup_appointment_time?: string;
    tie_pickup_location?: string;
  }) => void;
  onScheduleAppointment?: (data: {
    date: string;
    time: string;
    location: string;
  }) => void;
  isUpdating?: boolean;
}

export function TiePickupSection({ serviceCase, onUpdate, onScheduleAppointment, isUpdating }: TiePickupSectionProps) {
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isPickupDialogOpen, setIsPickupDialogOpen] = useState(false);
  const [isAppointmentDialogOpen, setIsAppointmentDialogOpen] = useState(false);
  const [formData, setFormData] = useState({
    tie_lot_number: serviceCase.tie_lot_number || '',
    tie_validity_date: serviceCase.tie_validity_date || '',
  });
  const [pickupDate, setPickupDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [appointmentData, setAppointmentData] = useState({
    date: serviceCase.tie_pickup_appointment_date || '',
    time: serviceCase.tie_pickup_appointment_time || '',
    location: serviceCase.tie_pickup_location || '',
  });

  const isAvailable = !!serviceCase.tie_lot_number;
  const isPickedUp = serviceCase.tie_picked_up;
  const huellasCompleted = serviceCase.huellas_completed;
  const requiresAppointment = serviceCase.tie_pickup_requires_appointment;
  const hasAppointment = !!serviceCase.tie_pickup_appointment_date;

  // Calculate minimum date (7 days from today)
  const minAppointmentDate = format(addDays(new Date(), 7), 'yyyy-MM-dd');

  const handleRegisterTie = () => {
    const validityDate = formData.tie_validity_date || format(addYears(new Date(), 1), 'yyyy-MM-dd');
    onUpdate({
      tie_lot_number: formData.tie_lot_number,
      tie_validity_date: validityDate,
    });
    setIsDialogOpen(false);
  };

  const handleConfirmPickup = () => {
    onUpdate({
      tie_pickup_date: pickupDate,
      tie_picked_up: true,
    });
    setIsPickupDialogOpen(false);
  };

  const handleScheduleAppointment = () => {
    // Validate minimum 7 days advance
    const appointmentDate = new Date(appointmentData.date);
    const minDate = addDays(new Date(), 7);
    
    if (isBefore(appointmentDate, minDate)) {
      toast({
        title: 'Data inválida',
        description: 'A cita deve ser agendada com no mínimo 7 dias de antecedência.',
        variant: 'destructive'
      });
      return;
    }

    if (onScheduleAppointment) {
      onScheduleAppointment({
        date: appointmentData.date,
        time: appointmentData.time,
        location: appointmentData.location,
      });
    } else {
      onUpdate({
        tie_pickup_appointment_date: appointmentData.date,
        tie_pickup_appointment_time: appointmentData.time,
        tie_pickup_location: appointmentData.location,
      });
    }
    setIsAppointmentDialogOpen(false);
  };

  if (!huellasCompleted) {
    return (
      <Card className="opacity-60">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-lg flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-muted-foreground" />
            Retirada do TIE
          </CardTitle>
          <Badge variant="outline">
            <Clock className="h-3 w-3 mr-1" />
            Aguardando Huellas
          </Badge>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground text-center py-4">
            A retirada do TIE ficará disponível após a realização da tomada de huellas.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-lg flex items-center gap-2">
          <CreditCard className="h-5 w-5 text-primary" />
          Retirada do TIE
        </CardTitle>
        {isPickedUp ? (
          <Badge className="bg-green-100 text-green-800">
            <CheckCircle className="h-3 w-3 mr-1" />
            Retirado
          </Badge>
        ) : hasAppointment ? (
          <Badge className="bg-blue-100 text-blue-800">
            <Calendar className="h-3 w-3 mr-1" />
            Cita Agendada
          </Badge>
        ) : isAvailable ? (
          <Badge className="bg-amber-100 text-amber-800">
            <Package className="h-3 w-3 mr-1" />
            Disponível
          </Badge>
        ) : (
          <Badge variant="outline">
            <AlertCircle className="h-3 w-3 mr-1" />
            Aguardando
          </Badge>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {isAvailable ? (
          <div className="space-y-4">
            {/* Info do TIE */}
            <div className="grid grid-cols-2 gap-4">
              <div className="p-3 bg-muted rounded-lg">
                <p className="text-xs text-muted-foreground">Número do Lote</p>
                <p className="font-mono font-semibold">{serviceCase.tie_lot_number}</p>
              </div>
              
              <div className="p-3 bg-muted rounded-lg">
                <p className="text-xs text-muted-foreground">Validade</p>
                <p className="font-semibold">
                  {serviceCase.tie_validity_date 
                    ? format(new Date(serviceCase.tie_validity_date), 'dd/MM/yyyy', { locale: ptBR })
                    : 'Não informada'}
                </p>
              </div>
            </div>

            {/* Info de previsão e modalidade */}
            <div className="grid grid-cols-2 gap-4">
              {serviceCase.tie_estimated_ready_date && (
                <div className="p-3 bg-muted rounded-lg">
                  <p className="text-xs text-muted-foreground">Previsão de Disponibilidade</p>
                  <p className="font-semibold">
                    {format(new Date(serviceCase.tie_estimated_ready_date), 'dd/MM/yyyy', { locale: ptBR })}
                  </p>
                </div>
              )}
              <div className="p-3 bg-muted rounded-lg">
                <p className="text-xs text-muted-foreground">Modalidade de Retirada</p>
                <p className="font-semibold">
                  {requiresAppointment ? 'Com Agendamento' : 'Retirada Direta'}
                </p>
              </div>
            </div>

            {/* Cita agendada info */}
            {hasAppointment && (
              <div className="p-4 bg-blue-50 dark:bg-blue-950 rounded-lg border border-blue-200 dark:border-blue-800">
                <div className="flex items-start gap-3">
                  <Calendar className="h-5 w-5 text-blue-600 mt-0.5" />
                  <div className="flex-1">
                    <p className="font-medium text-blue-800 dark:text-blue-200">Cita de Retirada Agendada</p>
                    <div className="mt-2 space-y-1 text-sm text-blue-700 dark:text-blue-300">
                      <p className="flex items-center gap-2">
                        <Calendar className="h-3 w-3" />
                        {format(new Date(serviceCase.tie_pickup_appointment_date!), 'dd/MM/yyyy', { locale: ptBR })}
                        {serviceCase.tie_pickup_appointment_time && (
                          <span>às {serviceCase.tie_pickup_appointment_time}</span>
                        )}
                      </p>
                      {serviceCase.tie_pickup_location && (
                        <p className="flex items-center gap-2">
                          <MapPin className="h-3 w-3" />
                          {serviceCase.tie_pickup_location}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {isPickedUp ? (
              <div className="p-4 bg-green-50 dark:bg-green-950 rounded-lg border border-green-200 dark:border-green-800">
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-5 w-5 text-green-600" />
                  <div>
                    <p className="font-medium text-green-800 dark:text-green-200">TIE Retirado</p>
                    <p className="text-sm text-green-600 dark:text-green-400">
                      {serviceCase.tie_pickup_date 
                        ? `Em ${format(new Date(serviceCase.tie_pickup_date), 'dd/MM/yyyy', { locale: ptBR })}`
                        : 'Data não registrada'}
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex gap-2">
                {/* Botão para agendar cita (se requer agendamento e ainda não tem) */}
                {requiresAppointment && !hasAppointment && (
                  <Dialog open={isAppointmentDialogOpen} onOpenChange={setIsAppointmentDialogOpen}>
                    <DialogTrigger asChild>
                      <Button variant="outline" className="flex-1">
                        <Calendar className="h-4 w-4 mr-2" />
                        Agendar Cita
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Agendar Cita de Retirada do TIE</DialogTitle>
                      </DialogHeader>
                      <div className="space-y-4 pt-4">
                        <div className="space-y-2">
                          <Label>Data da Cita *</Label>
                          <Input
                            type="date"
                            min={minAppointmentDate}
                            value={appointmentData.date}
                            onChange={(e) => setAppointmentData({ ...appointmentData, date: e.target.value })}
                          />
                          <p className="text-xs text-muted-foreground">
                            Mínimo 7 dias de antecedência para envio de lembretes automáticos
                          </p>
                        </div>
                        <div className="space-y-2">
                          <Label>Horário</Label>
                          <Input
                            type="time"
                            value={appointmentData.time}
                            onChange={(e) => setAppointmentData({ ...appointmentData, time: e.target.value })}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Local</Label>
                          <Input
                            value={appointmentData.location}
                            onChange={(e) => setAppointmentData({ ...appointmentData, location: e.target.value })}
                            placeholder="Ex: Comisaría de Policía Nacional"
                          />
                        </div>
                        <Button 
                          onClick={handleScheduleAppointment} 
                          className="w-full" 
                          disabled={isUpdating || !appointmentData.date}
                        >
                          {isUpdating ? 'Salvando...' : 'Confirmar Agendamento'}
                        </Button>
                      </div>
                    </DialogContent>
                  </Dialog>
                )}

                {/* Botão para confirmar retirada */}
                <Dialog open={isPickupDialogOpen} onOpenChange={setIsPickupDialogOpen}>
                  <DialogTrigger asChild>
                    <Button className={requiresAppointment && !hasAppointment ? 'flex-1' : 'w-full'}>
                      <CheckCircle className="h-4 w-4 mr-2" />
                      Confirmar Retirada
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Confirmar Retirada do TIE</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 pt-4">
                      <p className="text-sm text-muted-foreground">
                        Confirme a data em que o cliente retirou o TIE.
                      </p>
                      <div className="space-y-2">
                        <Label>Data da Retirada</Label>
                        <Input
                          type="date"
                          value={pickupDate}
                          onChange={(e) => setPickupDate(e.target.value)}
                        />
                      </div>
                      <div className="bg-muted p-3 rounded-md space-y-1">
                        <p className="text-sm"><strong>Lote:</strong> {serviceCase.tie_lot_number}</p>
                        <p className="text-sm">
                          <strong>Validade:</strong> {serviceCase.tie_validity_date 
                            ? format(new Date(serviceCase.tie_validity_date), 'dd/MM/yyyy', { locale: ptBR })
                            : 'N/A'}
                        </p>
                      </div>
                      <Button onClick={handleConfirmPickup} className="w-full" disabled={isUpdating}>
                        {isUpdating ? 'Salvando...' : 'Confirmar Retirada'}
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            )}
          </div>
        ) : (
          <div className="text-center py-4">
            <p className="text-muted-foreground mb-4">
              Aguardando confirmação de disponibilidade do TIE.
            </p>
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Package className="h-4 w-4 mr-2" />
                  Registrar TIE Disponível
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Registrar Disponibilidade do TIE</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 pt-4">
                  <div className="space-y-2">
                    <Label>Número do Lote *</Label>
                    <Input
                      value={formData.tie_lot_number}
                      onChange={(e) => setFormData({ ...formData, tie_lot_number: e.target.value })}
                      placeholder="Ex: LOT-2024-12345"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Data de Validade</Label>
                    <Input
                      type="date"
                      value={formData.tie_validity_date}
                      onChange={(e) => setFormData({ ...formData, tie_validity_date: e.target.value })}
                    />
                    <p className="text-xs text-muted-foreground">
                      Se não informada, será considerada validade de 1 ano.
                    </p>
                  </div>
                  <Button 
                    onClick={handleRegisterTie} 
                    className="w-full" 
                    disabled={isUpdating || !formData.tie_lot_number}
                  >
                    {isUpdating ? 'Salvando...' : 'Registrar TIE'}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
