import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Hash, Save, Loader2, ExternalLink, Send } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface ExpedienteNumberInputProps {
  serviceCaseId: string;
  expedienteNumber: string | null;
  clientName: string;
  clientPhone: number | null;
  clientUserId: string | null;
  serviceType: string;
  onSaveSuccess?: () => void;
}

export function ExpedienteNumberInput({
  serviceCaseId,
  expedienteNumber,
  clientName,
  clientPhone,
  clientUserId,
  serviceType,
  onSaveSuccess,
}: ExpedienteNumberInputProps) {
  const [value, setValue] = useState(expedienteNumber || '');
  const [isSaving, setIsSaving] = useState(false);
  const [isSendingWhatsApp, setIsSendingWhatsApp] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const handleSave = async () => {
    if (!value.trim()) {
      toast({
        title: 'Número vazio',
        description: 'Por favor, insira o número de expediente.',
        variant: 'destructive',
      });
      return;
    }

    setIsSaving(true);

    try {
      // Update the expediente number
      const { error } = await supabase
        .from('service_cases')
        .update({ expediente_number: value.trim() })
        .eq('id', serviceCaseId);

      if (error) throw error;

      // Create notification for client
      if (clientUserId) {
        await supabase.from('notifications').insert({
          user_id: clientUserId,
          type: 'expediente_registered',
          title: 'Número de Expediente Registrado',
          message: `Seu número de expediente é ${value.trim()}. Você pode usá-lo para acompanhar o processo.`,
        });
      }

      toast({
        title: 'Expediente salvo!',
        description: 'O número foi registrado com sucesso.',
      });

      queryClient.invalidateQueries({ queryKey: ['service-cases'] });
      onSaveSuccess?.();

      // Offer to send WhatsApp with instructions
      if (clientPhone) {
        setShowConfirmDialog(true);
      }
    } catch (error: any) {
      console.error('Erro ao salvar expediente:', error);
      toast({
        title: 'Erro ao salvar',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleSendWhatsAppInstructions = async () => {
    if (!clientPhone) return;

    setIsSendingWhatsApp(true);

    const message = `Olá ${clientName}! 📋

Seu processo de ${serviceType} foi protocolado com sucesso!

📋 Número do Expediente: ${value}

Para acompanhar o andamento, acesse:
🔗 https://sede.administracionespublicas.gob.es

Passo a passo:
1. Acesse o link acima
2. Clique em "Consulta del estado de expedientes"
3. Insira seu número de expediente: ${value}
4. Preencha seus dados pessoais

Continuaremos acompanhando e avisaremos sobre qualquer atualização!`;

    try {
      const { error } = await supabase.functions.invoke('send-whatsapp', {
        body: {
          numero: String(clientPhone).replace(/\D/g, ''),
          mensagem: message,
        },
      });

      if (error) throw error;

      toast({
        title: 'Instruções enviadas!',
        description: 'O cliente recebeu as instruções de acompanhamento.',
      });
    } catch (error: any) {
      console.error('Erro ao enviar WhatsApp:', error);
      toast({
        title: 'Erro ao enviar WhatsApp',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setIsSendingWhatsApp(false);
      setShowConfirmDialog(false);
    }
  };

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Hash className="h-4 w-4" />
            Número de Expediente
          </CardTitle>
          <CardDescription>
            ID do processo no sistema da Extranjería
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {expedienteNumber ? (
            // Display saved number
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                <div>
                  <Badge variant="outline" className="text-lg font-mono">
                    {expedienteNumber}
                  </Badge>
                  <p className="text-xs text-muted-foreground mt-1">
                    Este é o ID do processo do cliente
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  asChild
                >
                  <a 
                    href="https://sede.administracionespublicas.gob.es" 
                    target="_blank" 
                    rel="noopener noreferrer"
                  >
                    <ExternalLink className="h-4 w-4 mr-1" />
                    Consultar
                  </a>
                </Button>
              </div>

              {/* Option to send instructions via WhatsApp */}
              {clientPhone && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowConfirmDialog(true)}
                  className="w-full"
                >
                  <Send className="h-4 w-4 mr-2" />
                  Enviar Instruções de Acompanhamento
                </Button>
              )}

              {/* Edit mode */}
              <div className="pt-2 border-t">
                <Label className="text-xs text-muted-foreground">Editar número</Label>
                <div className="flex gap-2 mt-1">
                  <Input
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    placeholder="Ex: E/2024/12345"
                    className="font-mono"
                  />
                  <Button
                    onClick={handleSave}
                    disabled={isSaving || value === expedienteNumber}
                    size="sm"
                  >
                    {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            // Input form for new number
            <div className="space-y-3">
              <div>
                <Label htmlFor="expediente">Número do Expediente</Label>
                <Input
                  id="expediente"
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  placeholder="Ex: E/2024/12345"
                  className="font-mono mt-1"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Insira o número recebido por e-mail da autoridade competente
                </p>
              </div>
              <Button
                onClick={handleSave}
                disabled={isSaving || !value.trim()}
                className="w-full"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Salvando...
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4 mr-2" />
                    Salvar Expediente
                  </>
                )}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Confirmation dialog for sending WhatsApp */}
      <Dialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Enviar instruções ao cliente?</DialogTitle>
            <DialogDescription>
              Deseja enviar as instruções de acompanhamento do expediente via WhatsApp para {clientName}?
            </DialogDescription>
          </DialogHeader>
          <div className="p-3 bg-muted rounded-lg text-sm">
            <p className="font-medium mb-2">Mensagem que será enviada:</p>
            <p className="text-muted-foreground whitespace-pre-line text-xs">
              Instruções de como consultar o expediente {value} no site da Extranjería...
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowConfirmDialog(false)}>
              Não enviar
            </Button>
            <Button onClick={handleSendWhatsAppInstructions} disabled={isSendingWhatsApp}>
              {isSendingWhatsApp ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Enviando...
                </>
              ) : (
                <>
                  <Send className="h-4 w-4 mr-2" />
                  Enviar WhatsApp
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
