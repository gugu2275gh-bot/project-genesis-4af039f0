import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useCases } from '@/hooks/useCases';
import { usePortalMessages } from '@/hooks/usePortalMessages';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { 
  MessageSquare, 
  Send,
  User,
  Clock,
  Loader2
} from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { SERVICE_INTEREST_LABELS } from '@/types/database';

export default function PortalMessages() {
  const { user, profile } = useAuth();
  const { cases, isLoading: casesLoading } = useCases();
  const [newMessage, setNewMessage] = useState('');
  const [selectedCaseId, setSelectedCaseId] = useState<string | undefined>();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  // Filter cases for current client
  const myCases = cases.filter(c => c.client_user_id === user?.id);
  
  // Set first case as default when loaded
  useEffect(() => {
    if (myCases.length > 0 && !selectedCaseId) {
      setSelectedCaseId(myCases[0].id);
    }
  }, [myCases, selectedCaseId]);

  const { messages, isLoading: messagesLoading, sendMessage } = usePortalMessages(selectedCaseId);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  const handleSendMessage = async () => {
    if (!newMessage.trim() || !selectedCaseId) return;

    await sendMessage.mutateAsync({
      content: newMessage.trim(),
      senderType: 'client',
    });
    
    setNewMessage('');
  };

  if (casesLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-[calc(100vh-16rem)]" />
      </div>
    );
  }

  if (myCases.length === 0) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-display font-bold">Mensagens</h1>
          <p className="text-muted-foreground">
            Comunique-se diretamente com nossa equipe
          </p>
        </div>
        <Card>
          <CardContent className="text-center py-12">
            <MessageSquare className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <h2 className="text-xl font-semibold">Nenhum caso encontrado</h2>
            <p className="text-muted-foreground">
              Você precisa ter um caso ativo para enviar mensagens.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-display font-bold">Mensagens</h1>
        <p className="text-muted-foreground">
          Comunique-se diretamente com nossa equipe
        </p>
      </div>

      {/* Case Selector */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
            <label className="text-sm font-medium whitespace-nowrap">
              Selecione o caso:
            </label>
            <Select
              value={selectedCaseId}
              onValueChange={setSelectedCaseId}
            >
              <SelectTrigger className="w-full sm:w-96">
                <SelectValue placeholder="Selecione um caso" />
              </SelectTrigger>
              <SelectContent>
                {myCases.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {SERVICE_INTEREST_LABELS[c.service_type]} - {c.protocol_number || 'Sem protocolo'}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Chat Interface */}
      <Card className="flex flex-col h-[calc(100vh-22rem)]">
        <CardHeader className="border-b">
          <CardTitle className="flex items-center gap-2 text-lg">
            <MessageSquare className="h-5 w-5" />
            Conversa com a Equipe
          </CardTitle>
          <CardDescription>
            Envie suas dúvidas e acompanhe as respostas
          </CardDescription>
        </CardHeader>

        <CardContent className="flex-1 overflow-y-auto p-4 space-y-4">
          {messagesLoading ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-20" />
              ))}
            </div>
          ) : messages.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <MessageSquare className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Nenhuma mensagem ainda.</p>
              <p className="text-sm">Envie uma mensagem para iniciar a conversa.</p>
            </div>
          ) : (
            messages.map((message) => (
              <div
                key={message.id}
                className={`flex ${message.sender_type === 'client' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[80%] rounded-lg p-4 ${
                    message.sender_type === 'client'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <User className="h-3 w-3" />
                    <span className="text-xs font-medium">
                      {message.sender_type === 'client' 
                        ? 'Você' 
                        : message.profiles?.full_name || 'Equipe CB Asesoria'}
                    </span>
                  </div>
                  <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                  <div className="flex items-center gap-1 mt-2 opacity-70">
                    <Clock className="h-3 w-3" />
                    <span className="text-xs">
                      {format(new Date(message.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                    </span>
                  </div>
                </div>
              </div>
            ))
          )}
          <div ref={messagesEndRef} />
        </CardContent>

        <div className="border-t p-4">
          <div className="flex gap-2">
            <Textarea
              placeholder="Digite sua mensagem..."
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              className="min-h-[60px] resize-none"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSendMessage();
                }
              }}
              disabled={sendMessage.isPending}
            />
            <Button 
              onClick={handleSendMessage}
              className="self-end"
              disabled={!newMessage.trim() || sendMessage.isPending}
            >
              {sendMessage.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Pressione Enter para enviar ou Shift+Enter para nova linha
          </p>
        </div>
      </Card>
    </div>
  );
}
