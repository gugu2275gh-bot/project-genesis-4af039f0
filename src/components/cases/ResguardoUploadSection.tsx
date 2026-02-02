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
  FileText, 
  ExternalLink,
  CheckCircle,
  Clock,
  Package,
  Send
} from 'lucide-react';
import { format, addMonths } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface ResguardoUploadSectionProps {
  serviceCase: {
    id: string;
    huellas_resguardo_url?: string | null;
    tie_lot_number?: string | null;
    tie_validity_date?: string | null;
    tie_estimated_ready_date?: string | null;
    tie_pickup_requires_appointment?: boolean | null;
    tie_ready_notification_sent?: boolean | null;
    huellas_completed?: boolean;
    technical_status?: string;
  };
  clientName?: string;
  clientPhone?: number | null;
  onRegisterTieAvailable: (data: {
    tie_lot_number: string;
    tie_validity_date?: string;
    tie_estimated_ready_date?: string;
    tie_pickup_requires_appointment: boolean;
  }) => void;
  onNotifyClient?: () => void;
  isUpdating?: boolean;
}

export function ResguardoUploadSection({ 
  serviceCase, 
  clientName,
  onRegisterTieAvailable, 
  onNotifyClient,
  isUpdating 
}: ResguardoUploadSectionProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [formData, setFormData] = useState({
    tie_lot_number: serviceCase.tie_lot_number || '',
    tie_validity_date: serviceCase.tie_validity_date || '',
    tie_estimated_ready_date: serviceCase.tie_estimated_ready_date || '',
    tie_pickup_requires_appointment: serviceCase.tie_pickup_requires_appointment || false,
  });

  const hasResguardo = !!serviceCase.huellas_resguardo_url;
  const hasTieRegistered = !!serviceCase.tie_lot_number;
  const huellasCompleted = serviceCase.huellas_completed;

  // Only show this section after huellas is completed
  if (!huellasCompleted && serviceCase.technical_status !== 'HUELLAS_REALIZADO') {
    return null;
  }

  const handleRegister = () => {
    // Default validity to 5 years if not provided
    const validityDate = formData.tie_validity_date || 
      format(addMonths(new Date(), 60), 'yyyy-MM-dd');
    
    // Default estimated ready date to 45 days if not provided
    const estimatedDate = formData.tie_estimated_ready_date || 
      format(addMonths(new Date(), 1.5), 'yyyy-MM-dd');

    onRegisterTieAvailable({
      tie_lot_number: formData.tie_lot_number,
      tie_validity_date: validityDate,
      tie_estimated_ready_date: estimatedDate,
      tie_pickup_requires_appointment: formData.tie_pickup_requires_appointment,
    });
    setIsDialogOpen(false);
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-lg flex items-center gap-2">
          <FileText className="h-5 w-5 text-primary" />
          Resguardo e Lote do TIE
        </CardTitle>
        {hasTieRegistered ? (
          <Badge className="bg-green-100 text-green-800">
            <CheckCircle className="h-3 w-3 mr-1" />
            TIE Registrado
          </Badge>
        ) : hasResguardo ? (
          <Badge className="bg-amber-100 text-amber-800">
            <Clock className="h-3 w-3 mr-1" />
            Pendente Registro
          </Badge>
        ) : (
          <Badge variant="outline">
            <Clock className="h-3 w-3 mr-1" />
            Aguardando Resguardo
          </Badge>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Resguardo do Cliente */}
        <div className="p-3 bg-muted rounded-lg">
          <p className="text-sm font-medium mb-2">Resguardo do Cliente:</p>
          {hasResguardo ? (
            <div className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-green-600" />
              <Button variant="link" className="p-0 h-auto" asChild>
                <a href={serviceCase.huellas_resguardo_url!} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-4 w-4 mr-1" />
                  Ver Documento
                </a>
              </Button>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Aguardando envio pelo cliente no portal.
            </p>
          )}
        </div>

        {/* Informações do TIE se já registrado */}
        {hasTieRegistered ? (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
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
            
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 bg-muted rounded-lg">
                <p className="text-xs text-muted-foreground">Previsão de Disponibilidade</p>
                <p className="font-semibold">
                  {serviceCase.tie_estimated_ready_date 
                    ? format(new Date(serviceCase.tie_estimated_ready_date), 'dd/MM/yyyy', { locale: ptBR })
                    : 'Não informada'}
                </p>
              </div>
              <div className="p-3 bg-muted rounded-lg">
                <p className="text-xs text-muted-foreground">Requer Agendamento</p>
                <p className="font-semibold">
                  {serviceCase.tie_pickup_requires_appointment ? 'Sim' : 'Não'}
                </p>
              </div>
            </div>

            {/* Botão para notificar cliente */}
            {!serviceCase.tie_ready_notification_sent && onNotifyClient && (
              <Button 
                variant="outline" 
                className="w-full"
                onClick={onNotifyClient}
                disabled={isUpdating}
              >
                <Send className="h-4 w-4 mr-2" />
                Notificar Cliente (TIE Disponível)
              </Button>
            )}

            {serviceCase.tie_ready_notification_sent && (
              <div className="flex items-center gap-2 text-sm text-green-600">
                <CheckCircle className="h-4 w-4" />
                Cliente notificado sobre disponibilidade
              </div>
            )}
          </div>
        ) : (
          /* Formulário para registrar TIE */
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button className="w-full" disabled={!hasResguardo}>
                <Package className="h-4 w-4 mr-2" />
                Registrar TIE Disponível
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Registrar Disponibilidade do TIE</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-4">
                <p className="text-sm text-muted-foreground">
                  Extraia as informações do resguardo enviado pelo cliente {clientName}.
                </p>

                <div className="space-y-2">
                  <Label>Número do Lote *</Label>
                  <Input
                    value={formData.tie_lot_number}
                    onChange={(e) => setFormData({ ...formData, tie_lot_number: e.target.value })}
                    placeholder="Ex: LOT-2024-12345"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Data de Validade do TIE</Label>
                  <Input
                    type="date"
                    value={formData.tie_validity_date}
                    onChange={(e) => setFormData({ ...formData, tie_validity_date: e.target.value })}
                  />
                  <p className="text-xs text-muted-foreground">
                    Se não informada, será considerada 5 anos.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label>Data Estimada de Disponibilidade</Label>
                  <Input
                    type="date"
                    value={formData.tie_estimated_ready_date}
                    onChange={(e) => setFormData({ ...formData, tie_estimated_ready_date: e.target.value })}
                  />
                  <p className="text-xs text-muted-foreground">
                    Prazo indicado no resguardo para retirada.
                  </p>
                </div>

                <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                  <div>
                    <p className="font-medium text-sm">Requer agendamento para retirada?</p>
                    <p className="text-xs text-muted-foreground">
                      Alguns locais exigem cita prévia
                    </p>
                  </div>
                  <Switch
                    checked={formData.tie_pickup_requires_appointment}
                    onCheckedChange={(checked) => 
                      setFormData({ ...formData, tie_pickup_requires_appointment: checked })
                    }
                  />
                </div>

                <Button 
                  onClick={handleRegister} 
                  className="w-full" 
                  disabled={isUpdating || !formData.tie_lot_number}
                >
                  {isUpdating ? 'Salvando...' : 'Registrar TIE'}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        )}

        {!hasResguardo && (
          <p className="text-xs text-muted-foreground text-center">
            O botão será habilitado quando o cliente enviar o resguardo pelo portal.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
