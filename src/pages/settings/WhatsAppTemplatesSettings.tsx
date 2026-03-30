import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Send, RefreshCw, Edit, AlertCircle, CheckCircle2, Clock, XCircle, FileText } from 'lucide-react';
import { useWhatsAppTemplates } from '@/hooks/useWhatsAppTemplates';

const STATUS_CONFIG: Record<string, { label: string; badgeClass: string; dotClass: string; icon: typeof Clock }> = {
  draft: { label: 'Rascunho', badgeClass: 'bg-blue-50 text-blue-600 border border-blue-200', dotClass: 'bg-blue-500', icon: FileText },
  pending: { label: 'Pendente', badgeClass: 'bg-blue-100 text-blue-700 border border-blue-300', dotClass: 'bg-blue-500', icon: Clock },
  approved: { label: 'Aprovado', badgeClass: 'bg-green-100 text-green-700 border border-green-300', dotClass: 'bg-green-500', icon: CheckCircle2 },
  rejected: { label: 'Rejeitado', badgeClass: 'bg-red-100 text-red-700 border border-red-300', dotClass: 'bg-red-500', icon: XCircle },
  error: { label: 'Erro', badgeClass: 'bg-red-100 text-red-700 border border-red-300', dotClass: 'bg-red-500', icon: AlertCircle },
};

const AUTOMATION_LABELS: Record<string, string> = {
  welcome: 'Boas-vindas',
  reengagement: 'Reengajamento',
  contract_reminder: 'Lembrete de Contrato',
  payment_pre_7d: 'Pagamento D-7',
  payment_pre_48h: 'Pagamento D-2',
  payment_due_today: 'Pagamento Hoje',
  payment_post_d1: 'Cobrança D+1',
  payment_post_d3: 'Cobrança D+3',
  document_reminder: 'Documento Pendente',
  onboarding_reminder: 'Onboarding',
  tie_pickup: 'Retirada TIE',
  huellas_reminder: 'Huellas',
};

export default function WhatsAppTemplatesSettings() {
  const { templates, isLoading, submitTemplates, checkStatus, updateTemplate } = useWhatsAppTemplates();
  const [editingTemplate, setEditingTemplate] = useState<any>(null);
  const [editBody, setEditBody] = useState('');

  const handleEdit = (template: any) => {
    setEditingTemplate(template);
    setEditBody(template.body_text);
  };

  const handleSaveEdit = () => {
    if (editingTemplate) {
      updateTemplate.mutate({ id: editingTemplate.id, body_text: editBody });
      setEditingTemplate(null);
    }
  };

  const handleToggleActive = (id: string, currentActive: boolean) => {
    updateTemplate.mutate({ id, is_active: !currentActive });
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Send className="h-5 w-5" />
                Templates de WhatsApp
              </CardTitle>
              <CardDescription>
                Gerencie os templates de mensagem para automações SLA. Templates precisam ser aprovados pela Meta antes do uso.
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => checkStatus.mutate()}
                disabled={checkStatus.isPending}
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${checkStatus.isPending ? 'animate-spin' : ''}`} />
                Verificar Status
              </Button>
              <Button
                size="sm"
                onClick={() => submitTemplates.mutate('ALL')}
                disabled={submitTemplates.isPending}
              >
                <Send className="h-4 w-4 mr-2" />
                Submeter Todos
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-muted-foreground">Carregando...</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Template</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Content SID</TableHead>
                  <TableHead>Ativo</TableHead>
                  <TableHead>Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {templates?.map((template) => {
                  const statusConfig = STATUS_CONFIG[template.status] || STATUS_CONFIG.draft;
                  const StatusIcon = statusConfig.icon;
                  return (
                    <TableRow key={template.id}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <div className={`w-2 h-2 rounded-full shrink-0 ${statusConfig.dotClass}`} />
                          {AUTOMATION_LABELS[template.automation_type] || template.automation_type}
                        </div>
                      </TableCell>
                      <TableCell className="max-w-[300px] truncate text-muted-foreground text-xs">
                        {template.body_text}
                      </TableCell>
                      <TableCell>
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${statusConfig.badgeClass}`}>
                          <StatusIcon className="h-3 w-3" />
                          {statusConfig.label}
                        </span>
                        {template.rejection_reason && (
                          <p className="text-xs text-destructive mt-1">{template.rejection_reason}</p>
                        )}
                      </TableCell>
                      <TableCell className="text-xs font-mono text-muted-foreground">
                        {template.content_sid || '—'}
                      </TableCell>
                      <TableCell>
                        <Switch
                          checked={template.is_active}
                          onCheckedChange={() => handleToggleActive(template.id, template.is_active)}
                        />
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" onClick={() => handleEdit(template)}>
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => submitTemplates.mutate(template.automation_type)}
                            disabled={submitTemplates.isPending}
                          >
                            <Send className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Como funciona</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>1. <strong>Edite</strong> o texto dos templates conforme necessário. Use {'{{1}}'}, {'{{2}}'}, etc. para variáveis.</p>
          <p>2. <strong>Submeta</strong> os templates clicando em "Submeter Todos" ou individualmente.</p>
          <p>3. <strong>Aguarde aprovação</strong> da Meta (24-48h). Clique em "Verificar Status" para atualizar.</p>
          <p>4. Templates <strong>aprovados</strong> serão usados automaticamente pelas automações de SLA.</p>
          <p>5. Templates não aprovados manterão o envio via mensagem livre (funciona apenas na janela de 24h).</p>
        </CardContent>
      </Card>

      <Dialog open={!!editingTemplate} onOpenChange={(open) => !open && setEditingTemplate(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Template: {editingTemplate && (AUTOMATION_LABELS[editingTemplate.automation_type] || editingTemplate.automation_type)}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Variáveis disponíveis:</label>
              <div className="flex gap-1 mt-1 flex-wrap">
                {editingTemplate?.variables?.map((v: string, i: number) => (
                  <Badge key={v} variant="outline">{`{{${i + 1}}} = ${v}`}</Badge>
                ))}
              </div>
            </div>
            <Textarea
              value={editBody}
              onChange={(e) => setEditBody(e.target.value)}
              rows={4}
              placeholder="Texto do template..."
            />
            <p className="text-xs text-muted-foreground">
              Nota: Alterar o texto após aprovação requer nova submissão.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingTemplate(null)}>Cancelar</Button>
            <Button onClick={handleSaveEdit} disabled={updateTemplate.isPending}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
