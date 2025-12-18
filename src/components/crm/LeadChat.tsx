import { useState, useRef, useEffect } from 'react';
import { useLeadMessages } from '@/hooks/useLeadMessages';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Send, MessageCircle, RefreshCw } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { useQueryClient } from '@tanstack/react-query';

interface LeadChatProps {
  leadId: string;
  contactPhone: string | number | null;
}

export function LeadChat({ leadId, contactPhone }: LeadChatProps) {
  const { messages, isLoading, sendMessage } = useLeadMessages(leadId, contactPhone);
  const [newMessage, setNewMessage] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = async () => {
    if (!newMessage.trim()) return;
    
    await sendMessage.mutateAsync({ leadId, message: newMessage });
    setNewMessage('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ['lead-messages', leadId] });
  };

  const getSenderLabel = (type: 'client' | 'system', origem: string | null) => {
    if (type === 'client') {
      return 'Cliente';
    }
    if (origem === 'SISTEMA') {
      return 'Atendente';
    }
    return 'Agente IA';
  };

  // Transform messages into chat format (each row can have client and/or AI message)
  const chatMessages = messages.flatMap((msg) => {
    const items = [];
    
    // Client message
    if (msg.mensagem_cliente) {
      items.push({
        id: `${msg.id}-client`,
        type: 'client' as const,
        content: msg.mensagem_cliente,
        timestamp: msg.created_at,
        origem: msg.origem,
      });
    }
    
    // AI/System message
    if (msg.mensagem_IA) {
      items.push({
        id: `${msg.id}-ai`,
        type: 'system' as const,
        content: msg.mensagem_IA,
        timestamp: msg.created_at,
        origem: msg.origem,
      });
    }
    
    return items;
  });

  return (
    <Card className="flex flex-col h-[500px]">
      <CardHeader className="pb-3 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MessageCircle className="h-5 w-5 text-green-600" />
            <CardTitle className="text-lg">Conversa WhatsApp</CardTitle>
          </div>
          <Button variant="ghost" size="icon" onClick={handleRefresh}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      
      <CardContent className="flex-1 flex flex-col p-0 overflow-hidden">
        {/* Messages Area */}
        <ScrollArea className="flex-1 px-4" ref={scrollRef}>
          <div className="space-y-3 py-4">
            {isLoading ? (
              <div className="text-center text-muted-foreground py-8">
                Carregando mensagens...
              </div>
            ) : chatMessages.length === 0 ? (
              <div className="text-center text-muted-foreground py-8">
                Nenhuma mensagem ainda
              </div>
            ) : (
              chatMessages.map((msg) => (
                <div
                  key={msg.id}
                  className={cn(
                    'flex',
                    msg.type === 'client' ? 'justify-start' : 'justify-end'
                  )}
                >
                  <div
                    className={cn(
                      'max-w-[75%] rounded-lg px-3 py-2 shadow-sm',
                      msg.type === 'client'
                        ? 'bg-green-100 dark:bg-green-900/30 text-green-900 dark:text-green-100 rounded-bl-none'
                        : 'bg-primary/10 text-foreground rounded-br-none'
                    )}
                  >
                    <p className={cn(
                      'text-[10px] font-medium mb-1',
                      msg.type === 'client'
                        ? 'text-green-700 dark:text-green-300'
                        : 'text-primary/70'
                    )}>
                      {getSenderLabel(msg.type, msg.origem)}
                    </p>
                    <p className="text-sm whitespace-pre-wrap break-words">{msg.content}</p>
                    <p
                      className={cn(
                        'text-[10px] mt-1',
                        msg.type === 'client'
                          ? 'text-green-600 dark:text-green-400'
                          : 'text-muted-foreground'
                      )}
                    >
                      {format(new Date(msg.timestamp), 'HH:mm', { locale: ptBR })}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </ScrollArea>

        {/* Input Area */}
        <div className="p-4 border-t bg-muted/30 flex-shrink-0">
          <div className="flex gap-2">
            <Input
              placeholder="Digite sua mensagem..."
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              onKeyDown={handleKeyDown}
              className="flex-1"
              disabled={sendMessage.isPending}
            />
            <Button
              onClick={handleSend}
              disabled={!newMessage.trim() || sendMessage.isPending}
              size="icon"
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
