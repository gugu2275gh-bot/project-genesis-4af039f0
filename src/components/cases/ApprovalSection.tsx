import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Check, CalendarIcon, PartyPopper, Phone, ChevronRight } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { ServiceCaseWithDetails } from '@/hooks/useCases';

interface ApprovalSectionProps {
  serviceCase: ServiceCaseWithDetails;
  onRegisterApproval: (approvalDate: string, residenciaValidityDate?: string) => Promise<void>;
  onConfirmClientContact: () => Promise<void>;
  isLoading?: boolean;
}

export function ApprovalSection({
  serviceCase,
  onRegisterApproval,
  onConfirmClientContact,
  isLoading = false,
}: ApprovalSectionProps) {
  const [showRegisterDialog, setShowRegisterDialog] = useState(false);
  const [approvalDate, setApprovalDate] = useState<Date | undefined>(undefined);
  const [residenciaValidityDate, setResidenciaValidityDate] = useState<Date | undefined>(undefined);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleRegisterApproval = async () => {
    if (!approvalDate) return;
    setIsSubmitting(true);
    try {
      await onRegisterApproval(
        format(approvalDate, 'yyyy-MM-dd'),
        residenciaValidityDate ? format(residenciaValidityDate, 'yyyy-MM-dd') : undefined
      );
      setShowRegisterDialog(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConfirmContact = async () => {
    setIsSubmitting(true);
    try {
      await onConfirmClientContact();
    } finally {
      setIsSubmitting(false);
    }
  };

  const isApprovedInternally = serviceCase.technical_status === 'APROVADO_INTERNAMENTE';
  const hasApprovalData = !!(serviceCase as any).approval_date;
  const clientNotified = (serviceCase as any).approval_notified_client;

  // Determine which phase we're in
  const showNextSteps = [
    'APROVADO_INTERNAMENTE',
    'AGENDAR_HUELLAS',
    'AGUARDANDO_CITA_HUELLAS',
    'HUELLAS_REALIZADO',
    'DISPONIVEL_RETIRADA_TIE',
    'AGUARDANDO_CITA_RETIRADA',
    'TIE_RETIRADO',
    'ENCERRADO_APROVADO'
  ].includes(serviceCase.technical_status || '');

  if (!showNextSteps && !['PROTOCOLADO', 'EM_ACOMPANHAMENTO'].includes(serviceCase.technical_status || '')) {
    return null;
  }

  // Check steps completion
  const steps = [
    { 
      id: 'approval', 
      label: 'Resolução favorável recebida', 
      completed: hasApprovalData 
    },
    { 
      id: 'contact', 
      label: 'Cliente contactado', 
      completed: clientNotified 
    },
    { 
      id: 'huellas', 
      label: 'Tomada de huellas agendada', 
      completed: ['AGUARDANDO_CITA_HUELLAS', 'HUELLAS_REALIZADO', 'DISPONIVEL_RETIRADA_TIE', 'AGUARDANDO_CITA_RETIRADA', 'TIE_RETIRADO', 'ENCERRADO_APROVADO'].includes(serviceCase.technical_status || '')
    },
    { 
      id: 'huellas_done', 
      label: 'Huellas realizadas', 
      completed: ['HUELLAS_REALIZADO', 'DISPONIVEL_RETIRADA_TIE', 'AGUARDANDO_CITA_RETIRADA', 'TIE_RETIRADO', 'ENCERRADO_APROVADO'].includes(serviceCase.technical_status || '')
    },
    { 
      id: 'tie', 
      label: 'TIE retirado', 
      completed: ['TIE_RETIRADO', 'ENCERRADO_APROVADO'].includes(serviceCase.technical_status || '')
    },
  ];

  return (
    <Card className="border-green-200 bg-gradient-to-br from-green-50 to-emerald-50">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2 text-green-800">
          <PartyPopper className="h-5 w-5" />
          {hasApprovalData ? 'Processo Aprovado!' : 'Registrar Aprovação'}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Approval Data Display */}
        {hasApprovalData && (
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 bg-white/60 rounded-lg">
              <p className="text-xs text-muted-foreground">Data da Aprovação</p>
              <p className="font-semibold text-green-700">
                {format(new Date((serviceCase as any).approval_date), 'dd/MM/yyyy', { locale: ptBR })}
              </p>
            </div>
            {(serviceCase as any).residencia_validity_date && (
              <div className="p-3 bg-white/60 rounded-lg">
                <p className="text-xs text-muted-foreground">Validade da Residência</p>
                <p className="font-semibold text-green-700">
                  {format(new Date((serviceCase as any).residencia_validity_date), 'dd/MM/yyyy', { locale: ptBR })}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Progress Steps */}
        {showNextSteps && (
          <div className="space-y-2">
            <p className="text-sm font-medium text-green-800">Próximas etapas:</p>
            <div className="space-y-1">
              {steps.map((step) => (
                <div 
                  key={step.id} 
                  className={cn(
                    "flex items-center gap-2 text-sm py-1 px-2 rounded",
                    step.completed ? "text-green-700" : "text-muted-foreground"
                  )}
                >
                  {step.completed ? (
                    <Check className="h-4 w-4 text-green-600" />
                  ) : (
                    <ChevronRight className="h-4 w-4" />
                  )}
                  <span className={step.completed ? "line-through" : ""}>
                    {step.label}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2 pt-2">
          {/* Register Approval Button - show for PROTOCOLADO/EM_ACOMPANHAMENTO */}
          {!hasApprovalData && ['PROTOCOLADO', 'EM_ACOMPANHAMENTO'].includes(serviceCase.technical_status || '') && (
            <Dialog open={showRegisterDialog} onOpenChange={setShowRegisterDialog}>
              <DialogTrigger asChild>
                <Button className="bg-green-600 hover:bg-green-700">
                  <Check className="h-4 w-4 mr-2" />
                  Registrar Aprovação
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Registrar Aprovação do Processo</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Data da Resolução Favorável *</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className={cn(
                            "w-full justify-start text-left font-normal",
                            !approvalDate && "text-muted-foreground"
                          )}
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {approvalDate 
                            ? format(approvalDate, 'dd/MM/yyyy', { locale: ptBR })
                            : "Selecionar data"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={approvalDate}
                          onSelect={setApprovalDate}
                          initialFocus
                          className="p-3 pointer-events-auto"
                        />
                      </PopoverContent>
                    </Popover>
                  </div>

                  <div className="space-y-2">
                    <Label>Validade da Residência (opcional)</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className={cn(
                            "w-full justify-start text-left font-normal",
                            !residenciaValidityDate && "text-muted-foreground"
                          )}
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {residenciaValidityDate 
                            ? format(residenciaValidityDate, 'dd/MM/yyyy', { locale: ptBR })
                            : "Selecionar validade"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={residenciaValidityDate}
                          onSelect={setResidenciaValidityDate}
                          initialFocus
                          className="p-3 pointer-events-auto"
                        />
                      </PopoverContent>
                    </Popover>
                    <p className="text-xs text-muted-foreground">
                      Data até quando o status de residente está concedido
                    </p>
                  </div>

                  <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={() => setShowRegisterDialog(false)}>
                      Cancelar
                    </Button>
                    <Button 
                      onClick={handleRegisterApproval} 
                      disabled={!approvalDate || isSubmitting}
                      className="bg-green-600 hover:bg-green-700"
                    >
                      {isSubmitting ? 'Registrando...' : 'Confirmar Aprovação'}
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          )}

          {/* Confirm Client Contact - show for APROVADO_INTERNAMENTE */}
          {isApprovedInternally && !clientNotified && (
            <Button 
              onClick={handleConfirmContact}
              disabled={isSubmitting}
              className="bg-green-600 hover:bg-green-700"
            >
              <Phone className="h-4 w-4 mr-2" />
              {isSubmitting ? 'Processando...' : 'Cliente Contactado - Avançar'}
            </Button>
          )}
        </div>

        {/* Contact confirmation note */}
        {isApprovedInternally && !clientNotified && (
          <p className="text-xs text-muted-foreground">
            Após confirmar que o cliente foi contactado, o status avançará para "Agendar Huellas" 
            e uma mensagem de parabéns será enviada automaticamente via WhatsApp.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
