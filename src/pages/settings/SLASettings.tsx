import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { Clock, Save, AlertTriangle } from 'lucide-react';

interface SLAConfig {
  key: string;
  value: string;
  label: string;
  description: string;
  unit: string;
}

const DEFAULT_SLAS: SLAConfig[] = [
  // Gestão de Leads
  {
    key: 'sla_first_response_hours',
    value: '2',
    label: 'Primeira Resposta ao Lead',
    description: 'Tempo máximo para primeira resposta humana a um novo lead',
    unit: 'horas',
  },
  {
    key: 'sla_welcome_message_minutes',
    value: '15',
    label: 'Mensagem de Boas-vindas',
    description: 'Tempo para envio automático de mensagem de boas-vindas',
    unit: 'minutos',
  },
  {
    key: 'sla_incomplete_data_reengagement_days',
    value: '1',
    label: 'Reengajamento (Dados Incompletos)',
    description: 'Dias após primeiro contato para reengajar leads com dados incompletos',
    unit: 'dias',
  },
  {
    key: 'sla_no_response_archive_days',
    value: '3',
    label: 'Arquivamento sem Retorno',
    description: 'Dias sem resposta para arquivar lead automaticamente',
    unit: 'dias',
  },
  
  // Contratos - SLAs de Assinatura (conforme tabela do usuário)
  {
    key: 'sla_contract_reminder_d_hours',
    value: '24',
    label: 'Lembrete D (Contrato)',
    description: 'Primeira notificação ao cliente após envio do contrato',
    unit: 'horas',
  },
  {
    key: 'sla_contract_reminder_d1_hours',
    value: '48',
    label: 'Lembrete D+1 (Contrato)',
    description: 'Segunda notificação + alerta ao atendente',
    unit: 'horas',
  },
  {
    key: 'sla_contract_reminder_d3_hours',
    value: '72',
    label: 'Lembrete D+3 (Contrato)',
    description: 'Terceira notificação + alerta ao atendente',
    unit: 'horas',
  },
  {
    key: 'sla_contract_escalation_days',
    value: '5',
    label: 'Escalação ao Gerente',
    description: 'Dias sem assinatura para escalar ao gerente',
    unit: 'dias',
  },
  {
    key: 'sla_contract_cancellation_notice_days',
    value: '7',
    label: 'Aviso de Cancelamento',
    description: 'Dias para notificar sobre cancelamento iminente',
    unit: 'dias',
  },
  {
    key: 'sla_contract_auto_cancel_days',
    value: '8',
    label: 'Cancelamento Automático',
    description: 'Dias para cancelar contrato automaticamente sem assinatura',
    unit: 'dias',
  },
  
  // Pagamentos - SLAs de Cobrança por Vencimento
  {
    key: 'sla_payment_overdue_d1_hours',
    value: '24',
    label: 'Lembrete D+1 (Pagamento)',
    description: 'Notificação ao cliente 24h após vencimento',
    unit: 'horas',
  },
  {
    key: 'sla_payment_overdue_d3_hours',
    value: '72',
    label: 'Lembrete D+3 (Pagamento)',
    description: 'Notificação cliente + alerta ao financeiro',
    unit: 'horas',
  },
  {
    key: 'sla_payment_overdue_escalation_days',
    value: '7',
    label: 'Escalação D+7 (Pagamento)',
    description: 'Alerta ao cliente + gerente, possível cancelamento',
    unit: 'dias',
  },
  {
    key: 'sla_payment_overdue_cancel_days',
    value: '8',
    label: 'Cancelamento Automático',
    description: 'Cancelar contrato após dias sem pagamento',
    unit: 'dias',
  },
  
  // Operação Técnica
  {
    key: 'sla_authority_requirement_response_hours',
    value: '48',
    label: 'Resposta a Exigência',
    description: 'Prazo interno para responder exigências de órgãos',
    unit: 'horas',
  },
  {
    key: 'sla_document_review_hours',
    value: '24',
    label: 'Conferência de Documentos',
    description: 'Tempo máximo para conferência de documentos enviados',
    unit: 'horas',
  },
];

export default function SLASettings() {
  const { toast } = useToast();
  const { hasRole } = useAuth();
  const queryClient = useQueryClient();
  const isAdmin = hasRole('ADMIN');

  const [slaValues, setSlaValues] = useState<Record<string, string>>({});
  const [hasChanges, setHasChanges] = useState(false);

  // Fetch existing SLA configs
  const { data: configData, isLoading } = useQuery({
    queryKey: ['system-config-sla'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('system_config')
        .select('*')
        .like('key', 'sla_%');

      if (error) throw error;
      return data;
    },
    select: (data) => {
      const configMap: Record<string, string> = {};
      data.forEach(item => {
        configMap[item.key] = item.value || '';
      });
      return configMap;
    },
  });

  // Initialize local state when data loads
  useState(() => {
    if (configData) {
      const initialValues: Record<string, string> = {};
      DEFAULT_SLAS.forEach(sla => {
        initialValues[sla.key] = configData[sla.key] || sla.value;
      });
      setSlaValues(initialValues);
    }
  });

  // Get current value (from local state or config or default)
  const getValue = (key: string, defaultValue: string) => {
    if (slaValues[key] !== undefined) return slaValues[key];
    if (configData?.[key] !== undefined) return configData[key];
    return defaultValue;
  };

  // Save mutation
  const saveMutation = useMutation({
    mutationFn: async (values: Record<string, string>) => {
      const upserts = Object.entries(values).map(([key, value]) => {
        const sla = DEFAULT_SLAS.find(s => s.key === key);
        return {
          key,
          value,
          description: sla?.description || '',
        };
      });

      for (const item of upserts) {
        const { error } = await supabase
          .from('system_config')
          .upsert(
            { key: item.key, value: item.value, description: item.description },
            { onConflict: 'key' }
          );
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['system-config-sla'] });
      toast({ title: 'SLAs salvos com sucesso' });
      setHasChanges(false);
    },
    onError: (error: Error) => {
      toast({ 
        title: 'Erro ao salvar SLAs', 
        description: error.message,
        variant: 'destructive' 
      });
    },
  });

  const handleChange = (key: string, value: string) => {
    setSlaValues(prev => ({ ...prev, [key]: value }));
    setHasChanges(true);
  };

  const handleSave = () => {
    const valuesToSave: Record<string, string> = {};
    DEFAULT_SLAS.forEach(sla => {
      valuesToSave[sla.key] = getValue(sla.key, sla.value);
    });
    saveMutation.mutate(valuesToSave);
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

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Configuração de SLAs
            </CardTitle>
            <CardDescription>
              Defina os prazos e alertas automáticos do sistema
            </CardDescription>
          </div>
          {isAdmin && hasChanges && (
            <Button onClick={handleSave} disabled={saveMutation.isPending}>
              <Save className="h-4 w-4 mr-2" />
              Salvar Alterações
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-8">
          {/* Lead Management SLAs */}
          <div>
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-info" />
              Gestão de Leads
            </h3>
            <div className="grid gap-4 md:grid-cols-2">
              {DEFAULT_SLAS.filter(sla => 
                sla.key.includes('first_response') || 
                sla.key.includes('welcome') ||
                sla.key.includes('incomplete') ||
                sla.key.includes('archive')
              ).map((sla) => (
                <div key={sla.key} className="space-y-2 p-4 rounded-lg border bg-card">
                  <Label htmlFor={sla.key} className="font-medium">
                    {sla.label}
                  </Label>
                  <div className="flex items-center gap-2">
                    <Input
                      id={sla.key}
                      type="number"
                      min="1"
                      value={getValue(sla.key, sla.value)}
                      onChange={(e) => handleChange(sla.key, e.target.value)}
                      className="w-24"
                      disabled={!isAdmin}
                    />
                    <span className="text-sm text-muted-foreground">{sla.unit}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">{sla.description}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Contract & Payment SLAs */}
          <div>
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-success" />
              Contratos e Pagamentos
            </h3>
            <div className="grid gap-4 md:grid-cols-2">
              {DEFAULT_SLAS.filter(sla => 
                sla.key.includes('contract') || 
                sla.key.includes('payment')
              ).map((sla) => (
                <div key={sla.key} className="space-y-2 p-4 rounded-lg border bg-card">
                  <Label htmlFor={sla.key} className="font-medium">
                    {sla.label}
                  </Label>
                  <div className="flex items-center gap-2">
                    <Input
                      id={sla.key}
                      type="number"
                      min="1"
                      value={getValue(sla.key, sla.value)}
                      onChange={(e) => handleChange(sla.key, e.target.value)}
                      className="w-24"
                      disabled={!isAdmin}
                    />
                    <span className="text-sm text-muted-foreground">{sla.unit}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">{sla.description}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Technical SLAs */}
          <div>
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-warning" />
              Operação Técnica
            </h3>
            <div className="grid gap-4 md:grid-cols-2">
              {DEFAULT_SLAS.filter(sla => 
                sla.key.includes('authority') || 
                sla.key.includes('document_review')
              ).map((sla) => (
                <div key={sla.key} className="space-y-2 p-4 rounded-lg border bg-card">
                  <Label htmlFor={sla.key} className="font-medium">
                    {sla.label}
                  </Label>
                  <div className="flex items-center gap-2">
                    <Input
                      id={sla.key}
                      type="number"
                      min="1"
                      value={getValue(sla.key, sla.value)}
                      onChange={(e) => handleChange(sla.key, e.target.value)}
                      className="w-24"
                      disabled={!isAdmin}
                    />
                    <span className="text-sm text-muted-foreground">{sla.unit}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">{sla.description}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Info Alert */}
          <div className="flex items-start gap-3 p-4 rounded-lg bg-warning/10 border border-warning/30">
            <AlertTriangle className="h-5 w-5 text-warning shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-sm">Sobre os SLAs</p>
              <p className="text-sm text-muted-foreground">
                Ao estourar um SLA, o sistema enviará alertas automáticos ao responsável e ao gestor. 
                Certifique-se de configurar valores realistas para sua operação.
              </p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
