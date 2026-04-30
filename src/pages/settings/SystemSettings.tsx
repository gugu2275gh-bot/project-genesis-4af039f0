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
import { Settings, Save, Globe, Brain } from 'lucide-react';
import KnowledgeBaseManager from '@/components/settings/KnowledgeBaseManager';
import { useSuperuser } from '@/hooks/useSuperuser';

interface SystemConfig {
  key: string;
  value: string;
  label: string;
  description: string;
  type: 'text' | 'textarea' | 'boolean' | 'number';
  category: 'general' | 'integration' | 'reactivation';
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
    key: 'kb_strict_mode',
    value: 'false',
    label: 'Modo Estrito (Base de Conhecimento)',
    description: 'Quando ativado, o agente responde APENAS com base na Base de Conhecimento. Sem correspondência → envia mensagem padrão.',
    type: 'boolean',
    category: 'integration',
  },
  {
    key: 'kb_strict_fallback_message',
    value: 'Obrigado pela sua mensagem! Não tenho essa informação no momento. Vou encaminhar para um de nossos atendentes que entrará em contato em breve. 🙏',
    label: 'Mensagem padrão (Modo Estrito)',
    description: 'Mensagem enviada quando nenhuma resposta é encontrada na Base de Conhecimento.',
    type: 'textarea',
    category: 'messaging',
  },
  {
    key: 'email_notifications_enabled',
    value: 'true',
    label: 'Notificações por Email',
    description: 'Enviar notificações por email para a equipe',
    type: 'boolean',
    category: 'integration',
  },
  // Reactivation settings
  {
    key: 'enable_smart_reactivation',
    value: 'true',
    label: 'Reativação Inteligente',
    description: 'Habilita o motor de reativação inteligente de sessões expiradas',
    type: 'boolean',
    category: 'reactivation',
  },
  {
    key: 'active_session_timeout_minutes',
    value: '120',
    label: 'Timeout da Sessão (minutos)',
    description: 'Tempo em minutos sem interação para considerar a sessão expirada',
    type: 'number',
    category: 'reactivation',
  },
  {
    key: 'llm_confidence_threshold_direct_route',
    value: '0.90',
    label: 'Threshold Roteamento Direto',
    description: 'Confiança mínima (0-1) para rotear diretamente sem pedir confirmação',
    type: 'number',
    category: 'reactivation',
  },
  {
    key: 'llm_confidence_threshold_confirmation',
    value: '0.70',
    label: 'Threshold Confirmação',
    description: 'Confiança mínima (0-1) para pedir confirmação ao cliente',
    type: 'number',
    category: 'reactivation',
  },
  {
    key: 'reactivation_context_message_limit',
    value: '5',
    label: 'Limite de Mensagens de Contexto',
    description: 'Número máximo de mensagens recentes por pendência enviadas à LLM',
    type: 'number',
    category: 'reactivation',
  },
];

export default function SystemSettings() {
  const { isSuperuser } = useSuperuser();

  const SENSITIVE_KEYS = ['openai_api_key', 'gemini_api_key', 'uazapi_url', 'uazapi_token'];

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
      case 'number':
        return (
          <Input
            id={config.key}
            type="number"
            step="any"
            value={currentValue}
            onChange={(e) => handleChange(config.key, e.target.value)}
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
  
  const integrationConfigs = SYSTEM_CONFIGS.filter(c => c.category === 'integration')
    .filter(c => isSuperuser || !SENSITIVE_KEYS.includes(c.key));

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

      {/* Smart Reactivation */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Brain className="h-5 w-5" />
            Reativação Inteligente
          </CardTitle>
          <CardDescription>
            Configuração do motor de reativação de sessões expiradas com IA
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {SYSTEM_CONFIGS.filter(c => c.category === 'reactivation').map((config) => (
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

      {/* Knowledge Base */}
      <KnowledgeBaseManager />

      {/* Bottom Save Button */}
      <div className="flex justify-end pt-4">
        <Button 
          onClick={handleSave} 
          disabled={!hasChanges || saveMutation.isPending}
          size="lg"
        >
          <Save className="h-4 w-4 mr-2" />
          Salvar Modificações
        </Button>
      </div>
    </div>
  );
}
