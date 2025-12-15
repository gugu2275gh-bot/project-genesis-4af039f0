import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { 
  MessageSquare, 
  Send,
  User,
  Clock
} from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

// Mock messages for demonstration
const mockMessages = [
  {
    id: '1',
    content: 'Olá! Bem-vindo à CB Asesoria. Como podemos ajudá-lo?',
    sender: 'staff',
    senderName: 'Equipe CB Asesoria',
    createdAt: new Date('2024-01-15T10:00:00'),
  },
  {
    id: '2',
    content: 'Obrigado! Tenho uma dúvida sobre o andamento do meu processo.',
    sender: 'client',
    senderName: 'Você',
    createdAt: new Date('2024-01-15T10:05:00'),
  },
  {
    id: '3',
    content: 'Claro! Seu processo está em fase de análise documental. Todos os documentos foram recebidos e estão sendo verificados. Atualizaremos você assim que houver novidades.',
    sender: 'staff',
    senderName: 'Equipe CB Asesoria',
    createdAt: new Date('2024-01-15T10:10:00'),
  },
];

export default function PortalMessages() {
  const { user, profile } = useAuth();
  const [newMessage, setNewMessage] = useState('');
  const [messages, setMessages] = useState(mockMessages);

  const handleSendMessage = () => {
    if (!newMessage.trim()) return;

    const message = {
      id: Date.now().toString(),
      content: newMessage,
      sender: 'client' as const,
      senderName: profile?.full_name || 'Você',
      createdAt: new Date(),
    };

    setMessages([...messages, message]);
    setNewMessage('');

    // In a real implementation, you would:
    // 1. Send the message to the server
    // 2. Create an interaction record linked to the client's case
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-display font-bold">Mensagens</h1>
        <p className="text-muted-foreground">
          Comunique-se diretamente com nossa equipe
        </p>
      </div>

      <Card className="flex flex-col h-[calc(100vh-16rem)]">
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
          {messages.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <MessageSquare className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Nenhuma mensagem ainda.</p>
              <p className="text-sm">Envie uma mensagem para iniciar a conversa.</p>
            </div>
          ) : (
            messages.map((message) => (
              <div
                key={message.id}
                className={`flex ${message.sender === 'client' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[80%] rounded-lg p-4 ${
                    message.sender === 'client'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <User className="h-3 w-3" />
                    <span className="text-xs font-medium">{message.senderName}</span>
                  </div>
                  <p className="text-sm">{message.content}</p>
                  <div className="flex items-center gap-1 mt-2 opacity-70">
                    <Clock className="h-3 w-3" />
                    <span className="text-xs">
                      {format(message.createdAt, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                    </span>
                  </div>
                </div>
              </div>
            ))
          )}
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
            />
            <Button 
              onClick={handleSendMessage}
              className="self-end"
              disabled={!newMessage.trim()}
            >
              <Send className="h-4 w-4" />
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
