import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { Settings, Save, Mail, MessageSquare, Globe } from 'lucide-react';
import KnowledgeBaseManager from '@/components/settings/KnowledgeBaseManager';

interface SystemConfig {
  key: string;
  value: string;
  label: string;
  description: string;
  type: 'text' | 'textarea' | 'boolean';
  category: 'general' | 'messaging' | 'integration';
}

const SYSTEM_CONFIGS: SystemConfig[] = [
  {
    key: 'company_name',
    value: 'CB Asesoria',
    label: 'Nome da Empresa',
    description: 'Nome exibido no sistema e comunicações',
    type: 'text',
    category: 'general',
  },
  {
    key: 'company_email',
    value: 'contato@cbasesoria.com',
    label: 'Email da Empresa',
    description: 'Email principal para comunicações',
    type: 'text',
    category: 'general',
  },
  {
    key: 'company_phone',
    value: '+34 XXX XXX XXX',
    label: 'Telefone da Empresa',
    description: 'Telefone exibido nas comunicações',
    type: 'text',
    category: 'general',
  },
  {
    key: 'welcome_message_template',
    value: 'Olá {nome}! 👋 Bem-vindo à CB Asesoria. Somos especialistas em assessoria de imigração na Espanha. Como podemos ajudá-lo?',
    label: 'Mensagem de Boas-vindas',
    description: 'Mensagem automática enviada a novos leads. Use {nome} para personalizar.',
    type: 'textarea',
    category: 'messaging',
  },
  {
    key: 'reengagement_message_template',
    value: 'Olá {nome}! Notamos que você entrou em contato conosco. Podemos ajudá-lo com seu processo de imigração? Estamos à disposição!',
    label: 'Mensagem de Reengajamento',
    description: 'Mensagem enviada para leads sem resposta',
    type: 'textarea',
    category: 'messaging',
  },
  {
    key: 'contract_reminder_template',
    value: 'Olá {nome}! Seu contrato está aguardando assinatura. Clique no link para assinar: {link}',
    label: 'Lembrete de Contrato',
    description: 'Mensagem de lembrete para assinatura de contrato',
    type: 'textarea',
    category: 'messaging',
  },
  {
    key: 'payment_reminder_template',
    value: 'Olá {nome}! Identificamos um pagamento pendente de {valor}. Acesse o link para efetuar o pagamento: {link}',
    label: 'Lembrete de Pagamento',
    description: 'Mensagem de lembrete para pagamentos pendentes',
    type: 'textarea',
    category: 'messaging',
  },
  {
    key: 'submission_confirmation_template',
    value: 'Ótimas notícias, {nome}! 🎉 Seu processo foi submetido ao órgão competente. Número de protocolo: {protocolo}. Prazo estimado: {prazo}.',
    label: 'Confirmação de Submissão',
    description: 'Mensagem enviada após submissão do processo',
    type: 'textarea',
    category: 'messaging',
  },
  {
    key: 'nps_survey_template',
    value: 'Olá {nome}! Seu processo foi finalizado. Gostaríamos muito de saber sua opinião! Em uma escala de 0 a 10, o quanto você recomendaria nossos serviços?',
    label: 'Pesquisa NPS',
    description: 'Mensagem para coleta de feedback pós-serviço',
    type: 'textarea',
    category: 'messaging',
  },
  {
    key: 'openai_api_key',
    value: '',
    label: 'OpenAI API Key',
    description: 'Chave de API da OpenAI para o agente de IA (GPT-4o-mini)',
    type: 'text',
    category: 'integration',
  },
  {
    key: 'gemini_api_key',
    value: '',
    label: 'Google Gemini API Key',
    description: 'Chave de API do Google Gemini para funcionalidades de IA',
    type: 'text',
    category: 'integration',
  },
  {
    key: 'uazapi_url',
    value: '',
    label: 'WhatsApp API - URL',
    description: 'URL base da API de envio de mensagens WhatsApp',
    type: 'text',
    category: 'integration',
  },
  {
    key: 'uazapi_token',
    value: '',
    label: 'WhatsApp API - Token',
    description: 'Token de autenticação da API WhatsApp',
    type: 'text',
    category: 'integration',
  },
  {
    key: 'whatsapp_bot_system_prompt',
    value: '',
    label: 'Prompt do Agente IA (WhatsApp)',
    description: 'Instruções personalizadas para o agente de IA. Deixe vazio para usar o prompt padrão. Use {nome} para o nome do cliente.',
    type: 'textarea',
    category: 'integration',
  },
  {
    key: 'whatsapp_bot_enabled',
    value: 'false',
    label: 'Bot WhatsApp Ativado',
    description: 'Habilita respostas automáticas via WhatsApp',
    type: 'boolean',
    category: 'integration',
  },
  {
    key: 'email_notifications_enabled',
    value: 'true',
    label: 'Notificações por Email',
    description: 'Enviar notificações por email para a equipe',
    type: 'boolean',
    category: 'integration',
  },
];

export default function SystemSettings() {
  const { toast } = useToast();
  const { hasRole } = useAuth();
  const queryClient = useQueryClient();
  const isAdmin = hasRole('ADMIN');

  const [configValues, setConfigValues] = useState<Record<string, string>>({});
  const [hasChanges, setHasChanges] = useState(false);

  // Fetch existing configs
  const { data: existingConfigs, isLoading } = useQuery({
    queryKey: ['system-config-all'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('system_config')
        .select('*');

      if (error) throw error;
      
      const configMap: Record<string, string> = {};
      data.forEach(item => {
        configMap[item.key] = item.value || '';
      });
      return configMap;
    },
  });

  // Get current value
  const getValue = (key: string, defaultValue: string) => {
    if (configValues[key] !== undefined) return configValues[key];
    if (existingConfigs?.[key] !== undefined) return existingConfigs[key];
    return defaultValue;
  };

  // Save mutation
  const saveMutation = useMutation({
    mutationFn: async (values: Record<string, string>) => {
      for (const [key, value] of Object.entries(values)) {
        const config = SYSTEM_CONFIGS.find(c => c.key === key);
        const { error } = await supabase
          .from('system_config')
          .upsert(
            { key, value, description: config?.description || '' },
            { onConflict: 'key' }
          );
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['system-config-all'] });
      toast({ title: 'Configurações salvas com sucesso' });
      setHasChanges(false);
    },
    onError: (error: Error) => {
      toast({ 
        title: 'Erro ao salvar configurações', 
        description: error.message,
        variant: 'destructive' 
      });
    },
  });

  const handleChange = (key: string, value: string) => {
    setConfigValues(prev => ({ ...prev, [key]: value }));
    setHasChanges(true);
  };

  const handleSave = () => {
    const valuesToSave: Record<string, string> = {};
    SYSTEM_CONFIGS.forEach(config => {
      valuesToSave[config.key] = getValue(config.key, config.value);
    });
    saveMutation.mutate(valuesToSave);
  };

  const renderConfigInput = (config: SystemConfig) => {
    const currentValue = getValue(config.key, config.value);

    switch (config.type) {
      case 'boolean':
        return (
          <Switch
            checked={currentValue === 'true'}
            onCheckedChange={(checked) => handleChange(config.key, checked.toString())}
            disabled={!isAdmin}
          />
        );
      case 'textarea':
        return (
          <Textarea
            id={config.key}
            value={currentValue}
            onChange={(e) => handleChange(config.key, e.target.value)}
            className="min-h-[80px]"
            disabled={!isAdmin}
          />
        );
      default:
        return (
          <Input
            id={config.key}
            value={currentValue}
            onChange={(e) => handleChange(config.key, e.target.value)}
            disabled={!isAdmin}
          />
        );
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-72" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-96" />
        </CardContent>
      </Card>
    );
  }

  const generalConfigs = SYSTEM_CONFIGS.filter(c => c.category === 'general');
  const messagingConfigs = SYSTEM_CONFIGS.filter(c => c.category === 'messaging');
  const integrationConfigs = SYSTEM_CONFIGS.filter(c => c.category === 'integration');

  return (
    <div className="space-y-6">
      {/* Save Button */}
      {isAdmin && hasChanges && (
        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={saveMutation.isPending}>
            <Save className="h-4 w-4 mr-2" />
            Salvar Todas as Alterações
          </Button>
        </div>
      )}

      {/* General Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Configurações Gerais
          </CardTitle>
          <CardDescription>
            Informações básicas da empresa
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2">
            {generalConfigs.map((config) => (
              <div key={config.key} className="space-y-2">
                <Label htmlFor={config.key}>{config.label}</Label>
                {renderConfigInput(config)}
                <p className="text-xs text-muted-foreground">{config.description}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Message Templates */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            Templates de Mensagens
          </CardTitle>
          <CardDescription>
            Textos padrão para comunicações automáticas
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            {messagingConfigs.map((config) => (
              <div key={config.key} className="space-y-2">
                <Label htmlFor={config.key}>{config.label}</Label>
                {renderConfigInput(config)}
                <p className="text-xs text-muted-foreground">{config.description}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Knowledge Base */}
      <KnowledgeBaseManager />

      {/* Integrations */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Globe className="h-5 w-5" />
            Integrações
          </CardTitle>
          <CardDescription>
            Configurações de serviços externos
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {integrationConfigs.map((config) => (
              <div 
                key={config.key} 
                className="flex items-center justify-between p-4 rounded-lg border"
              >
                <div className="space-y-0.5">
                  <Label htmlFor={config.key}>{config.label}</Label>
                  <p className="text-xs text-muted-foreground">{config.description}</p>
                </div>
                {renderConfigInput(config)}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
