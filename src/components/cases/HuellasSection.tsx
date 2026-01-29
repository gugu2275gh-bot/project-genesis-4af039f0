import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from '@/components/ui/dialog';
import { 
  Fingerprint, 
  Calendar, 
  MapPin, 
  Clock, 
  CheckCircle,
  AlertCircle,
  AlertTriangle,
  FileText,
  Download,
  Send,
  Home,
  Loader2,
} from 'lucide-react';
import { format, addDays, differenceInDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { downloadEX17 } from '@/lib/generate-ex17';
import { downloadTaxa790 } from '@/lib/generate-taxa790';

interface HuellasSectionProps {
  serviceCase: {
    id: string;
    huellas_date?: string | null;
    huellas_time?: string | null;
    huellas_location?: string | null;
    huellas_completed?: boolean;
    huellas_requested_at?: string | null;
    huellas_scheduler_notified?: boolean;
    huellas_appointment_confirmation_url?: string | null;
    huellas_instructions_sent?: boolean;
    empadronamiento_valid?: boolean;
    empadronamiento_expected_date?: string | null;
    empadronamiento_notes?: string | null;
    technical_status?: string;
    service_type?: string;
  };
  clientData?: {
    fullName: string;
    nie?: string;
    nationality?: string;
    address?: string;
    phone?: string;
    email?: string;
  };
  onUpdate: (data: {
    huellas_date?: string;
    huellas_time?: string;
    huellas_location?: string;
    huellas_completed?: boolean;
    huellas_appointment_confirmation_url?: string;
  }) => void;
  onRequestSchedule?: (data: { preferredDate?: string }) => void;
  onUpdateEmpadronamiento?: (data: { 
    valid: boolean; 
    expectedDate?: string; 
    notes?: string;
  }) => void;
  onSendInstructions?: () => void;
  isUpdating?: boolean;
}

const MIN_ADVANCE_DAYS = 7;

export function HuellasSection({ 
  serviceCase, 
  clientData, 
  onUpdate, 
  onRequestSchedule,
  onUpdateEmpadronamiento,
  onSendInstructions,
  isUpdating 
}: HuellasSectionProps) {
  const [isScheduleDialogOpen, setIsScheduleDialogOpen] = useState(false);
  const [isEmpadDialogOpen, setIsEmpadDialogOpen] = useState(false);
  const [isConfirmDialogOpen, setIsConfirmDialogOpen] = useState(false);
  
  const [formData, setFormData] = useState({
    huellas_date: serviceCase.huellas_date || '',
    huellas_time: serviceCase.huellas_time || '',
    huellas_location: serviceCase.huellas_location || '',
    confirmation_url: serviceCase.huellas_appointment_confirmation_url || '',
  });

  const [empadData, setEmpadData] = useState({
    valid: serviceCase.empadronamiento_valid || false,
    expectedDate: serviceCase.empadronamiento_expected_date || '',
    notes: serviceCase.empadronamiento_notes || '',
  });

  const [preferredDate, setPreferredDate] = useState('');

  const isScheduled = !!serviceCase.huellas_date;
  const isCompleted = serviceCase.huellas_completed;
  const isPastDate = serviceCase.huellas_date && new Date(serviceCase.huellas_date) < new Date();
  const isWaitingForScheduler = serviceCase.technical_status === 'AGUARDANDO_CITA_HUELLAS' && !isScheduled;
  const isEmpadronamentoValid = serviceCase.empadronamiento_valid;

  // Calculate minimum allowed date (7 days from now)
  const minDate = useMemo(() => {
    const date = addDays(new Date(), MIN_ADVANCE_DAYS);
    return format(date, 'yyyy-MM-dd');
  }, []);

  // Validation for preferred date
  const validatePreferredDate = (dateStr: string): { valid: boolean; message?: string } => {
    if (!dateStr) return { valid: false, message: 'Selecione uma data' };
    const selectedDate = new Date(dateStr);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const daysDiff = differenceInDays(selectedDate, today);
    
    if (daysDiff < MIN_ADVANCE_DAYS) {
      return { 
        valid: false, 
        message: `A data deve ter no mínimo ${MIN_ADVANCE_DAYS} dias de antecedência` 
      };
    }
    return { valid: true };
  };

  const handleRequestSchedule = () => {
    if (!isEmpadronamentoValid) {
      return;
    }
    const validation = validatePreferredDate(preferredDate);
    if (!validation.valid) {
      return;
    }
    onRequestSchedule?.({ preferredDate });
    setIsScheduleDialogOpen(false);
    setPreferredDate('');
  };

  const handleConfirmAppointment = () => {
    onUpdate({
      huellas_date: formData.huellas_date,
      huellas_time: formData.huellas_time,
      huellas_location: formData.huellas_location,
      huellas_appointment_confirmation_url: formData.confirmation_url,
    });
    setIsConfirmDialogOpen(false);
  };

  const handleMarkCompleted = () => {
    onUpdate({ huellas_completed: true });
  };

  const handleSaveEmpadronamiento = () => {
    onUpdateEmpadronamiento?.({
      valid: empadData.valid,
      expectedDate: empadData.valid ? undefined : empadData.expectedDate,
      notes: empadData.notes,
    });
    setIsEmpadDialogOpen(false);
  };

  const preferredDateValidation = validatePreferredDate(preferredDate);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-lg flex items-center gap-2">
          <Fingerprint className="h-5 w-5 text-primary" />
          Tomada de Huellas
        </CardTitle>
        {isCompleted ? (
          <Badge className="bg-green-100 text-green-800">
            <CheckCircle className="h-3 w-3 mr-1" />
            Realizada
          </Badge>
        ) : isScheduled ? (
          <Badge variant="secondary">
            <Calendar className="h-3 w-3 mr-1" />
            Agendada
          </Badge>
        ) : isWaitingForScheduler ? (
          <Badge className="bg-blue-100 text-blue-800">
            <Clock className="h-3 w-3 mr-1" />
            Aguardando Cita
          </Badge>
        ) : (
          <Badge variant="outline">
            <AlertCircle className="h-3 w-3 mr-1" />
            Pendente
          </Badge>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Empadronamiento Status Section */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-medium flex items-center gap-2">
              <Home className="h-4 w-4" />
              Empadronamento
            </h4>
            <Dialog open={isEmpadDialogOpen} onOpenChange={setIsEmpadDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="ghost" size="sm">
                  Editar
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Status do Empadronamento</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 pt-4">
                  <div className="flex items-center gap-3">
                    <Checkbox
                      id="empad_valid"
                      checked={empadData.valid}
                      onCheckedChange={(checked) => 
                        setEmpadData({ ...empadData, valid: checked as boolean })
                      }
                    />
                    <Label htmlFor="empad_valid">
                      Empadronamento atualizado (válido por máx. 90 dias)
                    </Label>
                  </div>

                  {!empadData.valid && (
                    <div className="space-y-2">
                      <Label>Data Prevista para Obter Empadronamento</Label>
                      <Input
                        type="date"
                        value={empadData.expectedDate}
                        onChange={(e) => setEmpadData({ ...empadData, expectedDate: e.target.value })}
                      />
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label>Observações</Label>
                    <Textarea
                      value={empadData.notes}
                      onChange={(e) => setEmpadData({ ...empadData, notes: e.target.value })}
                      placeholder="Ex: Cliente mudou de endereço, aguardando registro..."
                    />
                  </div>

                  <Button onClick={handleSaveEmpadronamiento} className="w-full" disabled={isUpdating}>
                    {isUpdating ? 'Salvando...' : 'Salvar'}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          {isEmpadronamentoValid ? (
            <Badge className="bg-green-100 text-green-800">
              <CheckCircle className="h-3 w-3 mr-1" />
              Empadronamento Atualizado
            </Badge>
          ) : (
            <div className="space-y-2">
              <Badge variant="outline" className="border-yellow-500 text-yellow-700">
                <AlertTriangle className="h-3 w-3 mr-1" />
                Empadronamento Pendente
              </Badge>
              {serviceCase.empadronamiento_expected_date && (
                <p className="text-xs text-muted-foreground">
                  Previsão: {format(new Date(serviceCase.empadronamiento_expected_date), 'dd/MM/yyyy', { locale: ptBR })}
                </p>
              )}
              {serviceCase.empadronamiento_notes && (
                <p className="text-xs text-muted-foreground italic">
                  {serviceCase.empadronamiento_notes}
                </p>
              )}
            </div>
          )}
        </div>

        <Separator />

        {/* Main Content based on state */}
        {isScheduled ? (
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-4">
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">Data</p>
                  <p className="font-medium">
                    {format(new Date(serviceCase.huellas_date!), 'dd/MM/yyyy', { locale: ptBR })}
                  </p>
                </div>
              </div>
              
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">Horário</p>
                  <p className="font-medium">{serviceCase.huellas_time || 'Não definido'}</p>
                </div>
              </div>
              
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">Local</p>
                  <p className="font-medium">{serviceCase.huellas_location || 'Não definido'}</p>
                </div>
              </div>
            </div>

            {!isCompleted && (
              <div className="flex flex-wrap gap-2 pt-2">
                <Dialog open={isConfirmDialogOpen} onOpenChange={setIsConfirmDialogOpen}>
                  <DialogTrigger asChild>
                    <Button variant="outline" size="sm">
                      Reagendar
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Confirmar/Reagendar Cita de Huellas</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 pt-4">
                      <div className="space-y-2">
                        <Label>Data *</Label>
                        <Input
                          type="date"
                          value={formData.huellas_date}
                          onChange={(e) => setFormData({ ...formData, huellas_date: e.target.value })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Horário</Label>
                        <Input
                          type="time"
                          value={formData.huellas_time}
                          onChange={(e) => setFormData({ ...formData, huellas_time: e.target.value })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Local</Label>
                        <Input
                          value={formData.huellas_location}
                          onChange={(e) => setFormData({ ...formData, huellas_location: e.target.value })}
                          placeholder="Endereço da delegacia"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>URL do Comprovante da Cita</Label>
                        <Input
                          value={formData.confirmation_url}
                          onChange={(e) => setFormData({ ...formData, confirmation_url: e.target.value })}
                          placeholder="https://..."
                        />
                      </div>
                      <Button onClick={handleConfirmAppointment} className="w-full" disabled={isUpdating}>
                        {isUpdating ? 'Salvando...' : 'Confirmar Agendamento'}
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>

                {isPastDate && (
                  <Button size="sm" onClick={handleMarkCompleted} disabled={isUpdating}>
                    <CheckCircle className="h-4 w-4 mr-2" />
                    Marcar como Realizada
                  </Button>
                )}

                {onSendInstructions && !serviceCase.huellas_instructions_sent && (
                  <Button size="sm" variant="outline" onClick={onSendInstructions} disabled={isUpdating}>
                    <Send className="h-4 w-4 mr-2" />
                    Enviar Instruções
                  </Button>
                )}
              </div>
            )}
          </div>
        ) : isWaitingForScheduler ? (
          <div className="space-y-4">
            <Alert className="bg-blue-50 border-blue-200">
              <Clock className="h-4 w-4 text-blue-600" />
              <AlertDescription className="text-blue-800">
                Agendamento solicitado em {serviceCase.huellas_requested_at && 
                  format(new Date(serviceCase.huellas_requested_at), 'dd/MM/yyyy HH:mm', { locale: ptBR })
                }. Aguardando confirmação do agendador.
              </AlertDescription>
            </Alert>

            {/* Scheduler can confirm appointment */}
            <Dialog open={isConfirmDialogOpen} onOpenChange={setIsConfirmDialogOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Calendar className="h-4 w-4 mr-2" />
                  Confirmar Cita
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Registrar Dados da Cita</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 pt-4">
                  <div className="space-y-2">
                    <Label>Data da Cita *</Label>
                    <Input
                      type="date"
                      value={formData.huellas_date}
                      onChange={(e) => setFormData({ ...formData, huellas_date: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Horário</Label>
                    <Input
                      type="time"
                      value={formData.huellas_time}
                      onChange={(e) => setFormData({ ...formData, huellas_time: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Local</Label>
                    <Input
                      value={formData.huellas_location}
                      onChange={(e) => setFormData({ ...formData, huellas_location: e.target.value })}
                      placeholder="Endereço da Comisaría"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>URL do Comprovante</Label>
                    <Input
                      value={formData.confirmation_url}
                      onChange={(e) => setFormData({ ...formData, confirmation_url: e.target.value })}
                      placeholder="Link do PDF/email de confirmação"
                    />
                  </div>
                  <Button 
                    onClick={handleConfirmAppointment} 
                    className="w-full" 
                    disabled={isUpdating || !formData.huellas_date}
                  >
                    {isUpdating ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Salvando...
                      </>
                    ) : (
                      'Confirmar e Notificar Cliente'
                    )}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        ) : (
          <div className="space-y-4">
            {!isEmpadronamentoValid && (
              <Alert variant="destructive" className="bg-yellow-50 border-yellow-200 text-yellow-800">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  O empadronamento deve estar atualizado antes de solicitar o agendamento de huellas.
                </AlertDescription>
              </Alert>
            )}

            <div className="text-center py-2">
              <p className="text-muted-foreground mb-4 text-sm">
                Verifique os pré-requisitos e solicite o agendamento quando o cliente estiver pronto.
              </p>
              
              <Dialog open={isScheduleDialogOpen} onOpenChange={setIsScheduleDialogOpen}>
                <DialogTrigger asChild>
                  <Button disabled={!isEmpadronamentoValid}>
                    <Calendar className="h-4 w-4 mr-2" />
                    Solicitar Agendamento
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Solicitar Agendamento de Huellas</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4 pt-4">
                    <Alert>
                      <AlertTriangle className="h-4 w-4" />
                      <AlertDescription>
                        O agendamento deve ser feito com no mínimo <strong>{MIN_ADVANCE_DAYS} dias de antecedência</strong> 
                        para garantir tempo de preparação (documentos, pagamento de taxas, etc.).
                      </AlertDescription>
                    </Alert>

                    <div className="space-y-2">
                      <Label>Data Pretendida pelo Cliente</Label>
                      <Input
                        type="date"
                        value={preferredDate}
                        onChange={(e) => setPreferredDate(e.target.value)}
                        min={minDate}
                      />
                      {preferredDate && !preferredDateValidation.valid && (
                        <p className="text-xs text-destructive flex items-center gap-1">
                          <AlertTriangle className="h-3 w-3" />
                          {preferredDateValidation.message}
                        </p>
                      )}
                    </div>

                    <DialogFooter>
                      <Button 
                        onClick={handleRequestSchedule} 
                        disabled={isUpdating || !preferredDateValidation.valid}
                        className="w-full"
                      >
                        {isUpdating ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Solicitando...
                          </>
                        ) : (
                          <>
                            <Send className="h-4 w-4 mr-2" />
                            Solicitar Agendamento
                          </>
                        )}
                      </Button>
                    </DialogFooter>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          </div>
        )}

        {/* Documents Section - Show when scheduled but not completed */}
        {isScheduled && !isCompleted && (
          <>
            <Separator />
            <div className="space-y-3">
              <h4 className="text-sm font-medium flex items-center gap-2">
                <FileText className="h-4 w-4" />
                Documentos para o Dia
              </h4>
              <ul className="text-sm text-muted-foreground space-y-1 ml-6 list-disc">
                <li>Resolução Favorável original (ou visto no passaporte)</li>
                <li>Passaporte original válido</li>
                <li>Foto 3x4 colorida (fundo branco, recente)</li>
                <li>Certificado de Empadronamento (máx. 90 dias)</li>
                <li>Comprovante de pagamento Taxa 790/012</li>
                <li>Formulário EX17 impresso e assinado</li>
                <li>Comprovante da Cita</li>
                <li>TIE anterior (se renovação)</li>
              </ul>

              {/* PDF Generation Buttons */}
              <div className="flex flex-wrap gap-2 pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    if (clientData) {
                      downloadEX17({
                        fullName: clientData.fullName,
                        nie: clientData.nie,
                        nationality: clientData.nationality,
                        address: clientData.address,
                        phone: clientData.phone,
                        email: clientData.email,
                        requestType: 'INICIAL',
                        serviceType: serviceCase.service_type || 'Residencia Temporal',
                      });
                    }
                  }}
                  disabled={!clientData}
                >
                  <Download className="h-4 w-4 mr-2" />
                  Gerar EX17
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    if (clientData) {
                      downloadTaxa790({
                        fullName: clientData.fullName,
                        nie: clientData.nie,
                        address: clientData.address,
                        taxCode: '012',
                        taxAmount: 16.08,
                        concept: 'Expedición de Tarjeta de Identidad de Extranjero (TIE)',
                      });
                    }
                  }}
                  disabled={!clientData}
                >
                  <Download className="h-4 w-4 mr-2" />
                  Gerar Taxa 790
                </Button>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
