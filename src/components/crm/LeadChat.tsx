import { useState, useRef, useEffect } from 'react';
import { useLeadMessages } from '@/hooks/useLeadMessages';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Send, MessageCircle, RefreshCw, CheckCircle2 } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { useQueryClient } from '@tanstack/react-query';

interface LeadChatProps {
  leadId: string;
  contactPhone: string | number | null;
}

// Parse WhatsApp interactive messages (multiple formats)
function parseWhatsAppFlowMessage(content: string) {
  try {
    const parsed = JSON.parse(content);
    
    // Formato 1: NativeFlowMessage (existente)
    if (parsed.NativeFlowMessage) {
      const { buttons, body, selectedIndex } = parsed.NativeFlowMessage;
      const bodyText = body?.text || 'Opções:';
      
      const options = buttons?.map((btn: { buttonParamsJSON: string }) => {
        try {
          const params = JSON.parse(btn.buttonParamsJSON);
          return params.display_text;
        } catch {
          return null;
        }
      }).filter(Boolean) || [];
      
      return {
        isFlowMessage: true,
        bodyText,
        options,
        selectedIndex,
        selectedOption: typeof selectedIndex === 'number' ? options[selectedIndex] : null
      };
    }
    
    // Formato 2: Array de botões direto (quick_reply buttons)
    if (Array.isArray(parsed)) {
      const options = parsed
        .filter((item: { buttonParamsJSON?: string; display_text?: string }) => 
          item.buttonParamsJSON || item.display_text
        )
        .map((item: { buttonParamsJSON?: string; display_text?: string }) => {
          if (item.buttonParamsJSON) {
            try {
              const params = JSON.parse(item.buttonParamsJSON);
              return params.display_text;
            } catch {
              return null;
            }
          }
          return item.display_text;
        })
        .filter(Boolean);
      
      if (options.length > 0) {
        return { 
          isFlowMessage: true, 
          bodyText: 'Opções:', 
          options, 
          selectedIndex: null, 
          selectedOption: null 
        };
      }
    }
    
    // Formato 3: Objeto com body.text e buttons no root
    if (parsed.body?.text || parsed.buttons) {
      const bodyText = parsed.body?.text || 'Opções:';
      const buttons = parsed.buttons || [];
      const options = buttons.map((btn: { buttonParamsJSON?: string; display_text?: string }) => {
        if (btn.buttonParamsJSON) {
          try { 
            return JSON.parse(btn.buttonParamsJSON).display_text; 
          } catch { 
            return btn.display_text || null; 
          }
        }
        return btn.display_text || null;
      }).filter(Boolean);
      
      const selectedIndex = parsed.selectedIndex;
      return {
        isFlowMessage: true,
        bodyText,
        options,
        selectedIndex,
        selectedOption: typeof selectedIndex === 'number' ? options[selectedIndex] : null
      };
    }
    
    // Formato 4: Resposta de quick reply com quotedMessage aninhado
    // Estrutura: { selectedDisplayText, selectedID, contextInfo.quotedMessage.interactiveMessage.InteractiveMessage }
    const interactive = parsed?.contextInfo?.quotedMessage?.interactiveMessage?.InteractiveMessage;
    if (interactive || parsed.selectedDisplayText) {
      const native = interactive?.NativeFlowMessage;
      const bodyText = interactive?.body?.text || 'Opções:';
      
      // Extrair opções dos botões
      const options: string[] = [];
      if (native?.buttons) {
        for (const btn of native.buttons) {
          if (btn.buttonParamsJSON) {
            try {
              const params = JSON.parse(btn.buttonParamsJSON);
              if (params.display_text) {
                options.push(params.display_text);
              }
            } catch {
              // Ignorar botões inválidos
            }
          }
        }
      }
      
      // Determinar a opção selecionada
      const selectedOption = parsed.selectedDisplayText || 
        (typeof parsed.selectedIndex === 'number' && options[parsed.selectedIndex]) ||
        (typeof native?.selectedIndex === 'number' && options[native.selectedIndex]) ||
        null;
      
      return {
        isFlowMessage: true,
        bodyText,
        options,
        selectedIndex: null,
        selectedOption
      };
    }
    
  } catch {
    // Not JSON, return null
  }
  return null;
}

export function LeadChat({ leadId, contactPhone }: LeadChatProps) {
  const { messages, isLoading, sendMessage } = useLeadMessages(leadId, contactPhone);
  const [newMessage, setNewMessage] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'auto' });
    }
  }, [messages]);

  // Auto-refresh messages every 60 seconds when user is not typing
  useEffect(() => {
    const intervalId = setInterval(() => {
      if (!newMessage.trim()) {
        queryClient.invalidateQueries({ queryKey: ['lead-messages', leadId] });
      }
    }, 60000);

    return () => clearInterval(intervalId);
  }, [newMessage, leadId, queryClient]);

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
        <ScrollArea className="flex-1 px-4">
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
                    {(() => {
                      const flowData = parseWhatsAppFlowMessage(msg.content);
                      if (flowData) {
                        return (
                          <div className="space-y-1.5">
                            <p className="text-sm font-medium">{flowData.bodyText}</p>
                            {flowData.options.length > 0 ? (
                              <div className="space-y-1">
                                {flowData.options.map((option, idx) => {
                                  const isSelected = flowData.selectedOption === option;
                                  return (
                                    <div 
                                      key={idx} 
                                      className={cn(
                                        "flex items-center gap-1.5 text-sm rounded px-2 py-0.5",
                                        isSelected && "bg-white/50 dark:bg-white/10 font-medium"
                                      )}
                                    >
                                      {isSelected ? (
                                        <CheckCircle2 className="h-3.5 w-3.5 text-green-600 dark:text-green-400 flex-shrink-0" />
                                      ) : (
                                        <span className="w-3.5 h-3.5 flex items-center justify-center text-muted-foreground flex-shrink-0">○</span>
                                      )}
                                      <span>{option}</span>
                                    </div>
                                  );
                                })}
                              </div>
                            ) : flowData.selectedOption ? (
                              <div className="flex items-center gap-1.5 bg-white/50 dark:bg-white/10 rounded px-2 py-1">
                                <CheckCircle2 className="h-3.5 w-3.5 text-green-600 dark:text-green-400 flex-shrink-0" />
                                <span className="text-sm font-medium">{flowData.selectedOption}</span>
                              </div>
                            ) : null}
                          </div>
                        );
                      }
                      return <p className="text-sm whitespace-pre-wrap break-words">{msg.content}</p>;
                    })()}
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
            <div ref={messagesEndRef} />
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
