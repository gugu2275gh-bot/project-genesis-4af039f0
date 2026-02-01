import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { MessageSquare, Send, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

interface MessageTemplate {
  id: string;
  label: string;
  message: string;
}

const MESSAGE_TEMPLATES: MessageTemplate[] = [
  {
    id: 'initial_contact',
    label: 'Contato Inicial',
    message: `Olá {nome}! 👋

Sou do Departamento Técnico da CB Asesoria e estou entrando em contato para iniciar o acompanhamento do seu processo de {servico}.

Para darmos continuidade, por favor acesse nosso Portal do Cliente através do link abaixo e complete seu cadastro:

🔗 {portal_link}

No portal você poderá:
✅ Enviar seus documentos
✅ Acompanhar o andamento do processo
✅ Comunicar-se com nossa equipe

Qualquer dúvida, estou à disposição!`,
  },
  {
    id: 'documents_released',
    label: 'Documentos Liberados',
    message: `Olá {nome}! 📄

A lista de documentos necessários para o seu processo de {servico} já está disponível no Portal do Cliente!

🔗 {portal_link}

Por favor, acesse e comece a enviar seus documentos. Cada documento possui instruções específicas sobre:
• Se precisa de apostilamento
• Se precisa de tradução juramentada

Estamos à disposição para ajudar!`,
  },
  {
    id: 'document_reminder',
    label: 'Lembrete de Documentos',
    message: `Olá {nome}! 📄

Notamos que ainda faltam alguns documentos para darmos continuidade ao seu processo de {servico}.

Por favor, acesse o Portal do Cliente e envie os documentos pendentes:
🔗 {portal_link}

Se tiver alguma dificuldade, estamos aqui para ajudar!`,
  },
  {
    id: 'document_rejected',
    label: 'Documento Rejeitado',
    message: `Olá {nome}! ⚠️

Identificamos um problema com um dos documentos enviados para o seu processo. Por favor, acesse o Portal do Cliente para verificar o motivo e enviar novamente:

🔗 {portal_link}

Se precisar de ajuda, entre em contato conosco!`,
  },
  {
    id: 'huellas_instructions',
    label: 'Instruções de Huellas',
    message: `📋 Instruções para sua Tomada de Huellas

Olá {nome}!

📅 Data: {huellas_date}
⏰ Horário: {huellas_time}
📍 Local: {huellas_location}

📝 DOCUMENTOS QUE VOCÊ DEVE LEVAR:
1. Resolução Favorável original
2. Passaporte original válido
3. Foto 3x4 colorida (fundo branco, recente)
4. Certificado de Empadronamento (máx. 90 dias)
5. Comprovante de pagamento da Taxa 790/012
6. Formulário EX17 impresso e assinado
7. Comprovante do agendamento (esta confirmação)

💰 PAGAMENTO DA TAXA:
• Valor: €16,08
• Pague em agência CaixaBank ou terminal automático
• Guarde o comprovante carimbado

⚠️ IMPORTANTE:
• Chegue 15 minutos antes
• Leve caneta
• Após o atendimento, tire foto do resguardo e nos envie

A CB Asesoria não acompanha presencialmente, mas estamos à disposição para qualquer dúvida!

Boa sorte! 🍀`,
  },
  {
    id: 'huellas_reminder_d3',
    label: 'Lembrete Huellas (3 dias)',
    message: `Olá {nome}! 📅

Sua tomada de huellas é daqui a 3 dias:
📅 {huellas_date} às {huellas_time}
📍 {huellas_location}

Já organizou todos os documentos?
☐ Passaporte
☐ Foto 3x4
☐ Empadronamento
☐ Taxa paga (€16,08)
☐ EX17 assinado

Qualquer dúvida, estamos aqui! 💬`,
  },
  {
    id: 'huellas_reminder_d1',
    label: 'Lembrete Huellas (1 dia)',
    message: `Olá {nome}! ⏰

AMANHÃ é sua tomada de huellas!
📅 {huellas_date} às {huellas_time}
📍 {huellas_location}

Chegue 15 minutos antes e não esqueça:
✅ Todos os documentos originais
✅ Taxa paga
✅ Caneta

Após o atendimento, envie-nos foto do resguardo!

Boa sorte! 🍀`,
  },
  {
    id: 'huellas_reminder',
    label: 'Lembrete de Huellas',
    message: `Olá {nome}! 📅

Lembramos que sua tomada de huellas está agendada para:
📅 Data: {huellas_date}
⏰ Horário: {huellas_time}
📍 Local: {huellas_location}

Não esqueça de levar:
• Passaporte original
• Resguardo da solicitud
• Comprovante de pagamento da Taxa 790

Boa sorte! 🍀`,
  },
  {
    id: 'protocol_info',
    label: 'Informação de Protocolo',
    message: `Olá {nome}! 🎉

Ótima notícia! Seu processo foi protocolado com sucesso!

📋 Número do protocolo: {protocol_number}

Você pode acompanhar o andamento em:
🔗 https://sede.administracionespublicas.gob.es

Continuaremos monitorando e informaremos sobre qualquer atualização!`,
  },
  {
    id: 'expediente_instructions',
    label: 'Instruções do Expediente',
    message: `Olá {nome}! 📋

Seu processo de {servico} foi protocolado com sucesso!

📋 Número do Expediente: {expediente_number}

Para acompanhar o andamento, acesse:
🔗 https://sede.administracionespublicas.gob.es

Passo a passo:
1. Acesse o link acima
2. Clique em "Consulta del estado de expedientes"
3. Insira seu número de expediente: {expediente_number}
4. Preencha seus dados pessoais

Continuaremos acompanhando e avisaremos sobre qualquer atualização!`,
  },
  {
    id: 'approval_congratulations',
    label: 'Parabéns pela Aprovação',
    message: `🎉 Parabéns {nome}! 🎉

Temos uma ÓTIMA notícia! Seu processo de {servico} foi APROVADO!

✅ Resolução favorável recebida
📅 Validade da residência: {residencia_validity}

Próximos passos:
1️⃣ Agendaremos sua tomada de impressões digitais (huellas)
2️⃣ Após as huellas, aguardaremos a emissão do seu TIE
3️⃣ Quando o TIE estiver pronto, avisaremos para retirada

Qualquer dúvida, estamos à disposição!

Equipe CB Asesoria 🙌`,
  },
  {
    id: 'custom',
    label: 'Mensagem Personalizada',
    message: '',
  },
];

interface SendWhatsAppButtonProps {
  phone: number | null;
  clientName: string;
  leadId?: string | null;
  serviceType?: string;
  protocolNumber?: string | null;
  expedienteNumber?: string | null;
  huellasDate?: string | null;
  huellasTime?: string | null;
  huellasLocation?: string | null;
  residenciaValidityDate?: string | null;
  serviceCaseId: string;
  onStatusUpdate?: (status: string) => void;
  variant?: 'default' | 'outline' | 'ghost';
  size?: 'default' | 'sm' | 'lg' | 'icon';
  className?: string;
}

export function SendWhatsAppButton({
  phone,
  clientName,
  leadId,
  serviceType = 'extranjería',
  protocolNumber,
  expedienteNumber,
  huellasDate,
  huellasTime,
  huellasLocation,
  residenciaValidityDate,
  serviceCaseId,
  onStatusUpdate,
  variant = 'outline',
  size = 'sm',
  className,
}: SendWhatsAppButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<string>('initial_contact');
  const [customMessage, setCustomMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const { toast } = useToast();

  const portalLink = `${window.location.origin}/portal`;

  const processMessage = (message: string) => {
    return message
      .replace(/{nome}/g, clientName)
      .replace(/{servico}/g, serviceType)
      .replace(/{portal_link}/g, portalLink)
      .replace(/{protocol_number}/g, protocolNumber || 'N/A')
      .replace(/{expediente_number}/g, expedienteNumber || 'N/A')
      .replace(/{huellas_date}/g, huellasDate || 'A definir')
      .replace(/{huellas_time}/g, huellasTime || 'A definir')
      .replace(/{huellas_location}/g, huellasLocation || 'A definir')
      .replace(/{residencia_validity}/g, residenciaValidityDate || 'A definir');
  };

  const getCurrentMessage = () => {
    if (selectedTemplate === 'custom') {
      return customMessage;
    }
    const template = MESSAGE_TEMPLATES.find(t => t.id === selectedTemplate);
    return template ? processMessage(template.message) : '';
  };

  const handleSend = async () => {
    if (!phone) {
      toast({
        title: 'Telefone não encontrado',
        description: 'O contato não possui número de telefone cadastrado.',
        variant: 'destructive',
      });
      return;
    }

    const message = getCurrentMessage();
    if (!message.trim()) {
      toast({
        title: 'Mensagem vazia',
        description: 'Por favor, escreva uma mensagem antes de enviar.',
        variant: 'destructive',
      });
      return;
    }

    setIsSending(true);
    
    // Formatar número diretamente do banco
    const phoneNumber = String(phone).replace(/\D/g, '');
    
    console.log('[WhatsApp Cases] Iniciando envio:', { 
      phone,
      phoneFormatted: phoneNumber,
      templateId: selectedTemplate,
      leadId,
    });

    try {
      const { data, error } = await supabase.functions.invoke('send-whatsapp', {
        body: {
          numero: phoneNumber,
          mensagem: message,
        },
      });

      console.log('[WhatsApp Cases] Resposta Edge Function:', { data, error });

      if (error) throw error;

      // Log the message with id_lead for proper tracking
      await supabase.from('mensagens_cliente').insert({
        id_lead: leadId,
        phone_id: parseInt(phoneNumber, 10) || null,
        mensagem_IA: message,
        origem: 'SISTEMA',
      });

      // If it's the initial contact, optionally update the case status
      if (selectedTemplate === 'initial_contact' && onStatusUpdate) {
        onStatusUpdate('AGUARDANDO_DOCUMENTOS');
      }

      toast({
        title: 'Mensagem enviada!',
        description: 'A mensagem foi enviada com sucesso via WhatsApp.',
      });

      setIsOpen(false);
    } catch (error: any) {
      console.error('[WhatsApp Cases] Erro ao enviar:', error);
      toast({
        title: 'Erro ao enviar mensagem',
        description: error.message || 'Ocorreu um erro ao enviar a mensagem.',
        variant: 'destructive',
      });
    } finally {
      setIsSending(false);
    }
  };

  if (!phone) {
    return (
      <Button variant={variant} size={size} disabled className={className}>
        <MessageSquare className="h-4 w-4 mr-2" />
        Sem telefone
      </Button>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant={variant} size={size} className={className}>
          <MessageSquare className="h-4 w-4 mr-2" />
          WhatsApp
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Enviar WhatsApp para {clientName}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Template de Mensagem</Label>
            <Select value={selectedTemplate} onValueChange={setSelectedTemplate}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MESSAGE_TEMPLATES.map((template) => (
                  <SelectItem key={template.id} value={template.id}>
                    {template.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Mensagem</Label>
            {selectedTemplate === 'custom' ? (
              <Textarea
                value={customMessage}
                onChange={(e) => setCustomMessage(e.target.value)}
                placeholder="Digite sua mensagem personalizada..."
                className="min-h-[200px]"
              />
            ) : (
              <div className="p-3 bg-muted rounded-lg text-sm whitespace-pre-wrap max-h-[300px] overflow-y-auto">
                {getCurrentMessage()}
              </div>
            )}
          </div>

          <div className="flex justify-end">
            <Button 
              onClick={handleSend} 
              disabled={isSending || !phone}
            >
              {isSending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Enviando...
                </>
              ) : (
                <>
                  <Send className="h-4 w-4 mr-2" />
                  Enviar
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
