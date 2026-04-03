import { useState, useRef, useEffect, useMemo } from 'react';
import { useLeadMessages } from '@/hooks/useLeadMessages';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Send, MessageCircle, RefreshCw, CheckCircle2, Image, FileText, Mic, Video, Download, Bot, BotOff, ExternalLink, LayoutTemplate, Clock, AlertTriangle, Paperclip, X, Loader2 } from 'lucide-react';
import { ProxiedMedia } from './ProxiedMedia';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { supabase } from '@/integrations/supabase/client';
import { useWhatsAppTemplates } from '@/hooks/useWhatsAppTemplates';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { toast } from 'sonner';

interface LeadChatProps {
  leadId: string;
  contactPhone: string | number | null;
  contactId?: string;
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

export function LeadChat({ leadId, contactPhone, contactId }: LeadChatProps) {
  const { messages, isLoading, sendMessage, resumeAI, userSectorName, hasGlobalView } = useLeadMessages(leadId, contactPhone, contactId);
  const { operationalTemplates } = useWhatsAppTemplates();
  const [newMessage, setNewMessage] = useState('');
  const [sendingTemplate, setSendingTemplate] = useState(false);
  const [attachedFile, setAttachedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  // Fetch active sectors for this contact
  const { data: chatContext } = useQuery({
    queryKey: ['chat-context', contactId],
    queryFn: async () => {
      if (!contactId) return null;
      const { data } = await supabase
        .from('customer_chat_context')
        .select('ultimo_setor, setores_ativos, ultima_interacao')
        .eq('contact_id', contactId)
        .single();
      return data;
    },
    enabled: !!contactId,
    refetchInterval: 30000,
  });

  const activeSetores = useMemo(() => {
    if (!chatContext?.setores_ativos) return [];
    const timeoutMs = 60 * 60 * 1000; // 1h default
    const now = Date.now();
    return (chatContext.setores_ativos as Array<{ setor: string; last_sent_at: string }>)
      .filter(s => now - new Date(s.last_sent_at).getTime() < timeoutMs)
      .map(s => s.setor);
  }, [chatContext]);

  // Detect if AI is paused (last outgoing message is from SISTEMA)
  const isAIPaused = useMemo(() => {
    const outgoing = messages.filter(m => m.mensagem_IA);
    if (outgoing.length === 0) return false;
    return outgoing[outgoing.length - 1].origem === 'SISTEMA';
  }, [messages]);

  // Detect 24h window status based on last inbound customer message
  const windowStatus = useMemo(() => {
    const inboundOrigins = new Set(['CLIENTE', 'WHATSAPP']);
    const clientMessages = messages.filter((message) => {
      if (!message.mensagem_cliente) return false;
      const normalizedOrigin = (message.origem || '').trim().toUpperCase();
      return inboundOrigins.has(normalizedOrigin);
    });

    if (clientMessages.length === 0) return { isOutside: true, hoursAgo: null };

    const lastClientMsg = clientMessages[clientMessages.length - 1];
    const hoursAgo = Math.round((Date.now() - new Date(lastClientMsg.created_at).getTime()) / (1000 * 60 * 60));
    return { isOutside: hoursAgo >= 24, hoursAgo };
  }, [messages]);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'auto' });
    }
  }, [messages]);

  // Auto-refresh messages every 60 seconds when user is not typing
  const cacheKey = contactId ? ['lead-messages-contact', contactId] : ['lead-messages', leadId];
  useEffect(() => {
    const intervalId = setInterval(() => {
      if (!newMessage.trim()) {
        queryClient.invalidateQueries({ queryKey: cacheKey });
      }
    }, 60000);

    return () => clearInterval(intervalId);
  }, [newMessage, cacheKey, queryClient]);

  const handleSend = async () => {
    if (!newMessage.trim() && !attachedFile) return;
    
    let mediaUrl: string | undefined;
    let mediaType: string | undefined;
    let mediaFilename: string | undefined;
    let mediaMimetype: string | undefined;

    if (attachedFile) {
      setIsUploading(true);
      try {
        const fileExt = attachedFile.name.split('.').pop();
        const filePath = `agent-uploads/${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
        
        const { error: uploadError } = await supabase.storage
          .from('whatsapp-media')
          .upload(filePath, attachedFile);

        if (uploadError) throw uploadError;

        const { data: publicUrlData } = supabase.storage
          .from('whatsapp-media')
          .getPublicUrl(filePath);

        mediaUrl = publicUrlData.publicUrl;
        mediaMimetype = attachedFile.type;
        mediaFilename = attachedFile.name;
        
        if (attachedFile.type.startsWith('image/')) {
          mediaType = 'image';
        } else if (attachedFile.type.startsWith('video/')) {
          mediaType = 'video';
        } else if (attachedFile.type.startsWith('audio/')) {
          mediaType = 'audio';
        } else {
          mediaType = 'document';
        }
      } catch (err: any) {
        toast.error('Erro ao fazer upload: ' + err.message);
        setIsUploading(false);
        return;
      } finally {
        setIsUploading(false);
      }
    }

    await sendMessage.mutateAsync({ 
      leadId, 
      message: newMessage || (attachedFile ? `📎 ${attachedFile.name}` : ''),
      mediaUrl,
      mediaType,
      mediaFilename,
      mediaMimetype,
    });
    setNewMessage('');
    setAttachedFile(null);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    // Max 16MB for WhatsApp
    if (file.size > 16 * 1024 * 1024) {
      toast.error('Arquivo muito grande. Máximo 16MB.');
      return;
    }
    setAttachedFile(file);
    // Reset input so the same file can be re-selected
    e.target.value = '';
  };

  const handleSendTemplate = async (template: { id: string; template_name: string; content_sid: string | null; body_text: string; variables: string[] }) => {
    if (!contactPhone || !template.content_sid) {
      toast.error('Template sem Content SID aprovado ou telefone não disponível');
      return;
    }
    setSendingTemplate(true);
    try {
      const { error } = await supabase.functions.invoke('send-whatsapp', {
        body: {
          to: String(contactPhone),
          contentSid: template.content_sid,
          leadId,
        },
      });
      if (error) throw error;
      toast.success(`Template "${template.template_name}" enviado`);
      queryClient.invalidateQueries({ queryKey: cacheKey });
    } catch (err: any) {
      toast.error('Erro ao enviar template: ' + (err.message || 'Erro desconhecido'));
    } finally {
      setSendingTemplate(false);
    }
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
        setor: msg.setor,
        media_type: msg.media_type,
        media_url: msg.media_url,
        media_filename: msg.media_filename,
        media_mimetype: msg.media_mimetype,
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
        setor: msg.setor,
        media_type: null,
        media_url: null,
        media_filename: null,
        media_mimetype: null,
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
            {!hasGlobalView && userSectorName && (
              <Badge variant="outline" className="text-blue-600 border-blue-300 bg-blue-50 dark:bg-blue-900/20 gap-1">
                📂 {userSectorName}
              </Badge>
            )}
            {hasGlobalView && (
              <Badge variant="outline" className="text-purple-600 border-purple-300 bg-purple-50 dark:bg-purple-900/20 gap-1">
                👁 Todos os setores
              </Badge>
            )}
            {isAIPaused ? (
              <Badge variant="outline" className="text-orange-600 border-orange-300 bg-orange-50 dark:bg-orange-900/20 gap-1">
                <BotOff className="h-3 w-3" />
                IA Pausada
              </Badge>
            ) : (
              <Badge variant="outline" className="text-green-600 border-green-300 bg-green-50 dark:bg-green-900/20 gap-1">
                <Bot className="h-3 w-3" />
                IA Ativa
              </Badge>
            )}
            {windowStatus.isOutside ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge variant="outline" className="text-destructive border-destructive/30 bg-destructive/10 gap-1 cursor-help">
                    <AlertTriangle className="h-3 w-3" />
                    Fora da janela 24h
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>
                  {windowStatus.hoursAgo !== null 
                    ? `Última mensagem do cliente há ${windowStatus.hoursAgo}h. Use um template para reabrir a conversa.`
                    : 'Nenhuma mensagem do cliente encontrada. Use um template para iniciar.'}
                </TooltipContent>
              </Tooltip>
            ) : windowStatus.hoursAgo !== null && windowStatus.hoursAgo >= 20 ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge variant="outline" className="text-warning border-warning/30 bg-warning/10 gap-1 cursor-help">
                    <Clock className="h-3 w-3" />
                    Janela fecha em {24 - windowStatus.hoursAgo}h
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>
                  A janela de 24h está prestes a expirar. Após isso, apenas templates poderão ser enviados.
                </TooltipContent>
              </Tooltip>
            ) : null}
          </div>
          {activeSetores.length > 0 && (
            <div className="flex items-center gap-1 flex-wrap">
              <span className="text-[10px] text-muted-foreground">Setores ativos:</span>
              {activeSetores.map(setor => (
                <Badge key={setor} variant="secondary" className="text-[10px] px-1.5 py-0">
                  {setor}
                </Badge>
              ))}
            </div>
          )}
          <div className="flex items-center gap-1">
            {isAIPaused && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => resumeAI.mutate(leadId)}
                    disabled={resumeAI.isPending}
                    className="text-green-600 border-green-300 hover:bg-green-50 gap-1"
                  >
                    <Bot className="h-4 w-4" />
                    Retomar IA
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Retomar respostas automáticas da IA</TooltipContent>
              </Tooltip>
            )}
            <Button variant="ghost" size="icon" onClick={handleRefresh}>
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
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
                    <div className="flex items-center gap-1 mb-1">
                      <p className={cn(
                        'text-[10px] font-medium',
                        msg.type === 'client'
                          ? 'text-green-700 dark:text-green-300'
                          : 'text-primary/70'
                      )}>
                        {getSenderLabel(msg.type, msg.origem)}
                      </p>
                      {hasGlobalView && msg.setor && (
                        <span className="text-[9px] bg-muted px-1 rounded text-muted-foreground">
                          {msg.setor}
                        </span>
                      )}
                    </div>
                    {/* Media content */}
                    {msg.media_url && (
                      <div className="mb-1.5 space-y-1.5">
                        {msg.media_type === 'image' || msg.media_type === 'sticker' || msg.media_mimetype?.startsWith('image/') ? (
                          <>
                            <a href={msg.media_url} target="_blank" rel="noopener noreferrer">
                              <img
                                src={msg.media_url}
                                alt="Imagem recebida"
                                className="max-w-[240px] rounded-md cursor-pointer hover:opacity-90 transition"
                                loading="lazy"
                              />
                            </a>
                            <div className="flex items-center gap-2">
                              <a
                                href={msg.media_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-xs text-foreground/80 hover:text-foreground underline underline-offset-2"
                              >
                                <ExternalLink className="h-3 w-3" />
                                Visualizar
                              </a>
                              <a
                                href={msg.media_url}
                                download={msg.media_filename || 'imagem'}
                                className="inline-flex items-center gap-1 text-xs text-foreground/80 hover:text-foreground underline underline-offset-2"
                              >
                                <Download className="h-3 w-3" />
                                Baixar
                              </a>
                            </div>
                          </>
                        ) : msg.media_type === 'video' ? (
                          <>
                            <video
                              src={msg.media_url}
                              controls
                              className="max-w-[240px] rounded-md"
                            />
                            <div className="flex items-center gap-2">
                              <a
                                href={msg.media_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-xs text-foreground/80 hover:text-foreground underline underline-offset-2"
                              >
                                <ExternalLink className="h-3 w-3" />
                                Abrir em nova aba
                              </a>
                              <a
                                href={msg.media_url}
                                download={msg.media_filename || 'video'}
                                className="inline-flex items-center gap-1 text-xs text-foreground/80 hover:text-foreground underline underline-offset-2"
                              >
                                <Download className="h-3 w-3" />
                                Baixar
                              </a>
                            </div>
                          </>
                        ) : (msg.media_type === 'audio' || msg.media_type === 'ptt') ? (
                          <div className="space-y-1">
                            <div className="flex items-center gap-1.5 text-xs font-medium text-foreground/70 mb-1">
                              <Mic className="h-3.5 w-3.5" />
                              <span>{msg.media_type === 'ptt' ? 'Nota de voz' : 'Áudio'}</span>
                            </div>
                            <audio src={msg.media_url} controls className="max-w-[240px]" />
                            <a
                              href={msg.media_url}
                              download={msg.media_filename || 'audio'}
                              className="inline-flex items-center gap-1 text-xs text-foreground/80 hover:text-foreground underline underline-offset-2"
                            >
                              <Download className="h-3 w-3" />
                              Baixar áudio
                            </a>
                          </div>
                        ) : msg.media_type === 'document' ? (
                          <div className="space-y-1">
                            <a
                              href={msg.media_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-2 bg-background/50 rounded-md p-2 hover:bg-background/80 transition"
                            >
                              <FileText className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                              <span className="text-sm truncate">{msg.media_filename || 'Documento'}</span>
                              <ExternalLink className="h-4 w-4 text-muted-foreground flex-shrink-0 ml-auto" />
                            </a>
                            <a
                              href={msg.media_url}
                              download={msg.media_filename || 'documento'}
                              className="inline-flex items-center gap-1 text-xs text-foreground/80 hover:text-foreground underline underline-offset-2"
                            >
                              <Download className="h-3 w-3" />
                              Baixar documento
                            </a>
                          </div>
                        ) : (
                          <a
                            href={msg.media_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs text-foreground/80 hover:text-foreground underline underline-offset-2"
                          >
                            <ExternalLink className="h-3 w-3" />
                            Abrir mídia em nova aba
                          </a>
                        )}
                      </div>
                    )}
                    {/* Text content - show transcription label for audio */}
                    {msg.content && !(msg.media_url && msg.content.match(/^\[(image|audio|video|document|sticker|ptt)\]$/)) && (() => {
                      const isAudioTranscription = (msg.media_type === 'audio' || msg.media_type === 'ptt') && msg.media_url;
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
                      if (isAudioTranscription) {
                        return (
                          <div className="space-y-1">
                            <div className="flex items-center gap-1.5 text-xs font-medium text-foreground/60 italic">
                              <Mic className="h-3 w-3" />
                              <span>Transcrição do áudio:</span>
                            </div>
                            <p className="text-sm whitespace-pre-wrap break-words italic">{msg.content}</p>
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
          {windowStatus.isOutside ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs text-destructive">
                <AlertTriangle className="h-3.5 w-3.5" />
                <span>Janela de 24h expirada. Envie um template aprovado para reabrir a conversa.</span>
              </div>
              {operationalTemplates.length > 0 ? (
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className="w-full gap-2 border-destructive/30 text-destructive hover:bg-destructive/10"
                      disabled={sendingTemplate}
                    >
                      <LayoutTemplate className="h-4 w-4" />
                      Selecionar Template Aprovado
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-80 p-2" align="start">
                    <p className="text-xs font-medium text-muted-foreground mb-2 px-2">Templates Operacionais Aprovados</p>
                    <div className="space-y-1 max-h-[250px] overflow-y-auto">
                      {operationalTemplates.map((tpl) => (
                        <button
                          key={tpl.id}
                          className="w-full text-left px-3 py-2 rounded-md hover:bg-accent text-sm transition-colors"
                          onClick={() => handleSendTemplate(tpl as any)}
                          disabled={sendingTemplate}
                        >
                          <p className="font-medium text-xs">{tpl.template_name}</p>
                          <p className="text-[11px] text-muted-foreground line-clamp-2">{tpl.body_text}</p>
                        </button>
                      ))}
                    </div>
                  </PopoverContent>
                </Popover>
              ) : (
                <p className="text-xs text-muted-foreground text-center py-1">
                  Nenhum template operacional aprovado disponível. Crie e submeta templates em Configurações.
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              {/* Attached file preview */}
              {attachedFile && (
                <div className="flex items-center gap-2 bg-accent/50 rounded-md px-3 py-2 text-sm">
                  {attachedFile.type.startsWith('image/') ? (
                    <Image className="h-4 w-4 text-muted-foreground shrink-0" />
                  ) : (
                    <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                  )}
                  <span className="truncate flex-1">{attachedFile.name}</span>
                  <span className="text-xs text-muted-foreground shrink-0">
                    {(attachedFile.size / 1024).toFixed(0)}KB
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 shrink-0"
                    onClick={() => setAttachedFile(null)}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              )}
              <div className="flex gap-2">
                {operationalTemplates.length > 0 && (
                  <Popover>
                    <PopoverTrigger asChild>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="outline"
                            size="icon"
                            disabled={sendingTemplate}
                            className="shrink-0"
                          >
                            <LayoutTemplate className="h-4 w-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Enviar template operacional</TooltipContent>
                      </Tooltip>
                    </PopoverTrigger>
                    <PopoverContent className="w-72 p-2" align="start">
                      <p className="text-xs font-medium text-muted-foreground mb-2 px-2">Templates Operacionais</p>
                      <div className="space-y-1 max-h-[200px] overflow-y-auto">
                        {operationalTemplates.map((tpl) => (
                          <button
                            key={tpl.id}
                            className="w-full text-left px-2 py-1.5 rounded-md hover:bg-accent text-sm transition-colors"
                            onClick={() => handleSendTemplate(tpl as any)}
                            disabled={sendingTemplate}
                          >
                            <p className="font-medium text-xs">{tpl.template_name}</p>
                            <p className="text-[11px] text-muted-foreground truncate">{tpl.body_text}</p>
                          </button>
                        ))}
                      </div>
                    </PopoverContent>
                  </Popover>
                )}
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileSelect}
                  accept="image/*,video/*,application/pdf,.doc,.docx,.xls,.xlsx"
                  className="hidden"
                />
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="icon"
                      className="shrink-0"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isUploading || sendMessage.isPending}
                    >
                      <Paperclip className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Anexar imagem ou documento</TooltipContent>
                </Tooltip>
                <Input
                  placeholder={attachedFile ? "Legenda (opcional)..." : "Digite sua mensagem..."}
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  onKeyDown={handleKeyDown}
                  className="flex-1"
                  disabled={sendMessage.isPending || isUploading}
                />
                <Button
                  onClick={handleSend}
                  disabled={(!newMessage.trim() && !attachedFile) || sendMessage.isPending || isUploading}
                  size="icon"
                >
                  {isUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
