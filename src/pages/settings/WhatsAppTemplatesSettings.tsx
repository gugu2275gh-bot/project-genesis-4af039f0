import { useState } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Send, RefreshCw, Edit, AlertCircle, CheckCircle2, Clock, XCircle, FileText, Plus, X, ChevronDown, ChevronRight, ScrollText, Trash2, Save } from 'lucide-react';
import { useWhatsAppTemplates } from '@/hooks/useWhatsAppTemplates';

const STATUS_CONFIG: Record<string, { label: string; badgeClass: string; dotClass: string; icon: typeof Clock }> = {
  draft: { label: 'Rascunho', badgeClass: 'bg-blue-50 text-blue-600 border border-blue-200', dotClass: 'bg-blue-500', icon: FileText },
  pending: { label: 'Pendente', badgeClass: 'bg-yellow-100 text-yellow-700 border border-yellow-300', dotClass: 'bg-yellow-500', icon: Clock },
  approved: { label: 'Aprovado', badgeClass: 'bg-green-100 text-green-700 border border-green-300', dotClass: 'bg-green-500', icon: CheckCircle2 },
  rejected: { label: 'Rejeitado', badgeClass: 'bg-red-100 text-red-700 border border-red-300', dotClass: 'bg-red-500', icon: XCircle },
  paused: { label: 'Pausado', badgeClass: 'bg-orange-100 text-orange-700 border border-orange-300', dotClass: 'bg-orange-500', icon: Clock },
  disabled: { label: 'Desabilitado', badgeClass: 'bg-gray-100 text-gray-500 border border-gray-300', dotClass: 'bg-gray-400', icon: XCircle },
  unsubmitted: { label: 'Não Submetido', badgeClass: 'bg-gray-50 text-gray-500 border border-gray-200', dotClass: 'bg-gray-300', icon: FileText },
  received: { label: 'Recebido', badgeClass: 'bg-blue-100 text-blue-700 border border-blue-300', dotClass: 'bg-blue-500', icon: Clock },
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

const LANGUAGE_OPTIONS = [
  { value: 'pt_BR', label: 'Português (BR)' },
  { value: 'es', label: 'Español' },
  { value: 'en_US', label: 'English (US)' },
  { value: 'fr', label: 'Français' },
];

export default function WhatsAppTemplatesSettings() {
  const { templates, isLoading, submitTemplates, checkStatus, syncFromTwilio, forceResubmit, updateTemplate, createTemplate, deleteTemplate, templateLogs, logsLoading } = useWhatsAppTemplates();
  const [showForceResubmitConfirm, setShowForceResubmitConfirm] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<any>(null);
  const [editBody, setEditBody] = useState('');
  const [editCategory, setEditCategory] = useState<'sla' | 'operational'>('sla');
  const [editMetaCategory, setEditMetaCategory] = useState<'UTILITY' | 'MARKETING' | 'AUTHENTICATION'>('UTILITY');
  const [editAutomationType, setEditAutomationType] = useState('');
  const [editLanguage, setEditLanguage] = useState('pt_BR');
  const [editVariable, setEditVariable] = useState('');
  const [editVariables, setEditVariables] = useState<string[]>([]);
  const [showEditConfirm, setShowEditConfirm] = useState(false);
  const [showNewDialog, setShowNewDialog] = useState(false);
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);
  const [logFilter, setLogFilter] = useState<string>('all');
  const [deletingTemplateId, setDeletingTemplateId] = useState<string | null>(null);
  const [variablesOpen, setVariablesOpen] = useState(false);
  const [logsOpen, setLogsOpen] = useState(false);

  // Pending category changes for batch save
  const [pendingCategoryChanges, setPendingCategoryChanges] = useState<Record<string, 'sla' | 'operational'>>({});

  // New template form state
  const [newName, setNewName] = useState('');
  const [newCategory, setNewCategory] = useState<'sla' | 'operational'>('sla');
  const [newMetaCategory, setNewMetaCategory] = useState<'UTILITY' | 'MARKETING' | 'AUTHENTICATION'>('UTILITY');
  const [newAutomationType, setNewAutomationType] = useState('');
  const [newLanguage, setNewLanguage] = useState('pt_BR');
  const [newBody, setNewBody] = useState('');
  const [newVariable, setNewVariable] = useState('');
  const [newVariables, setNewVariables] = useState<string[]>([]);

  const handleEdit = (template: any) => {
    setEditingTemplate(template);
    setEditBody(template.body_text);
    setEditCategory(template.template_category || 'sla');
    setEditMetaCategory((template as any).meta_category || 'UTILITY');
    setEditAutomationType(template.automation_type || '');
    setEditLanguage((template as any).language || 'pt_BR');
    setEditVariables(template.variables || []);
    setEditVariable('');
  };

  const handleSaveEdit = () => {
    setShowEditConfirm(true);
  };

  const handleConfirmSaveEdit = () => {
    if (editingTemplate) {
      updateTemplate.mutate({
        id: editingTemplate.id,
        body_text: editBody,
        template_category: editCategory,
        meta_category: editMetaCategory,
        automation_type: editAutomationType || editingTemplate.automation_type,
        language: editLanguage,
        variables: editVariables,
        status: 'draft',
        is_active: false,
      });
      setShowEditConfirm(false);
      setEditingTemplate(null);
    }
  };

  const addEditVariable = () => {
    const trimmed = editVariable.trim();
    if (trimmed && !editVariables.includes(trimmed)) {
      setEditVariables([...editVariables, trimmed]);
      setEditVariable('');
    }
  };

  const removeEditVariable = (v: string) => {
    setEditVariables(editVariables.filter((x) => x !== v));
  };

  const handleToggleActive = (id: string, currentActive: boolean) => {
    updateTemplate.mutate({ id, is_active: !currentActive });
  };

  const resetNewForm = () => {
    setNewName('');
    setNewCategory('sla');
    setNewMetaCategory('UTILITY');
    setNewAutomationType('');
    setNewLanguage('pt_BR');
    setNewBody('');
    setNewVariable('');
    setNewVariables([]);
  };

  const handleCreateTemplate = () => {
    if (!newName || !newBody) return;
    if (newCategory === 'sla' && !newAutomationType) return;
    createTemplate.mutate(
      {
        automation_type: newAutomationType || newName,
        template_name: newName,
        body_text: newBody,
        variables: newVariables,
        template_category: newCategory,
        meta_category: newMetaCategory,
        language: newLanguage,
      },
      {
        onSuccess: () => {
          setShowNewDialog(false);
          resetNewForm();
        },
      }
    );
  };

  const hasPendingChanges = Object.keys(pendingCategoryChanges).length > 0;

  const handleSaveCategoryChanges = async () => {
    const promises = Object.entries(pendingCategoryChanges).map(([id, category]) =>
      updateTemplate.mutateAsync({ id, template_category: category })
    );
    await Promise.all(promises);
    setPendingCategoryChanges({});
  };

  const addVariable = () => {
    const trimmed = newVariable.trim();
    if (trimmed && !newVariables.includes(trimmed)) {
      setNewVariables([...newVariables, trimmed]);
      setNewVariable('');
    }
  };

  const removeVariable = (v: string) => {
    setNewVariables(newVariables.filter((x) => x !== v));
  };

  const isValidName = /^[a-z0-9_]+$/.test(newName);
  const bodyCharCount = newBody.length;

  // Duplicate validation
  const automationTypeToCheck = newCategory === 'sla' ? newAutomationType : (newAutomationType || newName);
  const duplicateTemplate = automationTypeToCheck
    ? templates?.find(t => t.automation_type === automationTypeToCheck && t.language === newLanguage)
    : null;
  const duplicateNameTemplate = newName
    ? templates?.find(t => t.template_name === newName)
    : null;

  // Build preview text
  const previewText = newBody.replace(/\{\{(\d+)\}\}/g, (_, idx) => {
    const i = parseInt(idx) - 1;
    return newVariables[i] ? `[${newVariables[i]}]` : `{{${idx}}}`;
  });

  const editPreviewText = editBody.replace(/\{\{(\d+)\}\}/g, (_, idx) => {
    const i = parseInt(idx) - 1;
    return editVariables[i] ? `[${editVariables[i]}]` : `{{${idx}}}`;
  });
  const editBodyCharCount = editBody.length;

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
                onClick={() => setShowNewDialog(true)}
              >
                <Plus className="h-4 w-4 mr-2" />
                Novo Template
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => checkStatus.mutate(true)}
                disabled={checkStatus.isPending}
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${checkStatus.isPending ? 'animate-spin' : ''}`} />
                Verificar Status
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => syncFromTwilio.mutate()}
                disabled={syncFromTwilio.isPending}
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${syncFromTwilio.isPending ? 'animate-spin' : ''}`} />
                Sincronizar Twilio
              </Button>
              <Button
                size="sm"
                onClick={() => submitTemplates.mutate('ALL')}
                disabled={submitTemplates.isPending}
              >
                <Send className="h-4 w-4 mr-2" />
                Submeter Todos
              </Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={() => setShowForceResubmitConfirm(true)}
                disabled={forceResubmit.isPending}
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${forceResubmit.isPending ? 'animate-spin' : ''}`} />
                Resubmeter Todos
              </Button>
              {hasPendingChanges && (
                <Button
                  size="sm"
                  variant="default"
                  className="bg-green-600 hover:bg-green-700"
                  onClick={handleSaveCategoryChanges}
                  disabled={updateTemplate.isPending}
                >
                  <Save className="h-4 w-4 mr-2" />
                  Salvar Alterações
                </Button>
              )}
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
                 <TableHead>Categoria</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Template</TableHead>
                  <TableHead>Meta</TableHead>
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
                      <TableCell>
                        <Select
                          value={pendingCategoryChanges[template.id] || template.template_category || 'sla'}
                          onValueChange={(val: 'sla' | 'operational') => {
                            if (val === (template.template_category || 'sla')) {
                              setPendingCategoryChanges(prev => {
                                const next = { ...prev };
                                delete next[template.id];
                                return next;
                              });
                            } else {
                              setPendingCategoryChanges(prev => ({ ...prev, [template.id]: val }));
                            }
                          }}
                        >
                          <SelectTrigger className="w-[120px] h-8 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="sla">SLA</SelectItem>
                            <SelectItem value="operational">Operacional</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
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
                        <Badge variant="outline" className="text-xs">
                          {(template as any).meta_category || 'UTILITY'}
                        </Badge>
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
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-destructive hover:text-destructive"
                            onClick={() => setDeletingTemplateId(template.id)}
                            disabled={deleteTemplate.isPending}
                          >
                            <Trash2 className="h-4 w-4" />
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

      {/* Variables Reference */}
      <Collapsible open={variablesOpen} onOpenChange={setVariablesOpen}>
        <Card>
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
              <CardTitle className="flex items-center gap-2 text-base">
                {variablesOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                📋 Variáveis Disponíveis por Tipo de Automação
              </CardTitle>
              <CardDescription>Referência rápida dos campos disponíveis para cada template</CardDescription>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent>
              <p className="text-xs text-muted-foreground mb-3">
                Use <code className="bg-muted px-1 rounded">{'{{1}}'}</code> para a 1ª variável, <code className="bg-muted px-1 rounded">{'{{2}}'}</code> para a 2ª, e assim por diante. A ordem segue o array de variáveis cadastrado no template.
              </p>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tipo de Automação</TableHead>
                    <TableHead>Variáveis</TableHead>
                    <TableHead>Placeholders</TableHead>
                    <TableHead>Descrição</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {[
                    { type: 'welcome', vars: ['nombre'], desc: 'Nome do cliente' },
                    { type: 'reengagement', vars: ['nombre'], desc: 'Nome do cliente' },
                    { type: 'contract_reminder', vars: ['nombre'], desc: 'Nome do cliente' },
                    { type: 'onboarding_reminder', vars: ['nombre'], desc: 'Nome do cliente' },
                    { type: 'payment_pre_7d', vars: ['nombre', 'valor', 'fecha'], desc: 'Nome, valor da parcela, data de vencimento' },
                    { type: 'payment_pre_48h', vars: ['nombre', 'valor', 'fecha'], desc: 'Nome, valor da parcela, data de vencimento' },
                    { type: 'payment_due_today', vars: ['nombre', 'valor'], desc: 'Nome, valor da parcela' },
                    { type: 'payment_post_d1', vars: ['nombre', 'valor'], desc: 'Nome, valor em atraso' },
                    { type: 'payment_post_d3', vars: ['nombre', 'valor'], desc: 'Nome, valor em atraso' },
                    { type: 'document_reminder', vars: ['nombre', 'documento'], desc: 'Nome, nome do documento pendente' },
                    { type: 'tie_pickup', vars: ['nombre', 'fecha'], desc: 'Nome, prazo de retirada' },
                    { type: 'huellas_reminder', vars: ['nombre', 'fecha'], desc: 'Nome, data da cita' },
                  ].map((row) => (
                    <TableRow key={row.type}>
                      <TableCell className="font-medium text-xs">
                        <Badge variant="outline" className="text-xs">{AUTOMATION_LABELS[row.type] || row.type}</Badge>
                        <span className="text-muted-foreground ml-1 text-[10px]">({row.type})</span>
                      </TableCell>
                      <TableCell className="text-xs">
                        {row.vars.map((v, i) => (
                          <Badge key={v} variant="secondary" className="mr-1 text-xs">{v}</Badge>
                        ))}
                      </TableCell>
                      <TableCell className="text-xs font-mono">
                        {row.vars.map((_, i) => `{{${i + 1}}}`).join(', ')}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{row.desc}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      {/* Edit Dialog */}
      <Dialog open={!!editingTemplate} onOpenChange={(open) => !open && setEditingTemplate(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar Template: {editingTemplate?.template_name}</DialogTitle>
            <DialogDescription>Edite os campos abaixo. Alterações exigirão nova aprovação da Meta.</DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Form */}
            <div className="space-y-4">
              <div>
                <Label>Nome do Template</Label>
                <Input value={editingTemplate?.template_name || ''} disabled className="mt-1 bg-muted" />
                <p className="text-xs text-muted-foreground mt-1">O nome não pode ser alterado</p>
              </div>

              <div>
                <Label>Categoria *</Label>
                <Select value={editCategory} onValueChange={(v: 'sla' | 'operational') => setEditCategory(v)}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sla">SLA — Automação vinculada a regra</SelectItem>
                    <SelectItem value="operational">Operacional — Disponível no chat</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {editCategory === 'sla' ? (
                <div>
                  <Label>Tipo de Automação (Regra SLA) *</Label>
                  <Select value={editAutomationType} onValueChange={setEditAutomationType}>
                    <SelectTrigger className="mt-1"><SelectValue placeholder="Selecione a regra..." /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(AUTOMATION_LABELS).map(([key, label]) => (
                        <SelectItem key={key} value={key}>{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : (
                <div>
                  <Label>Identificador (opcional)</Label>
                  <Input
                    value={editAutomationType}
                    onChange={(e) => setEditAutomationType(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                    placeholder="ex: contato_geral"
                    className="mt-1"
                  />
                </div>
              )}

              <div>
                <Label>Idioma</Label>
                <Select value={editLanguage} onValueChange={setEditLanguage}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {LANGUAGE_OPTIONS.map((l) => (
                      <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Categoria Meta *</Label>
                <Select value={editMetaCategory} onValueChange={(v: 'UTILITY' | 'MARKETING' | 'AUTHENTICATION') => setEditMetaCategory(v)}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="UTILITY">UTILITY — Transacional</SelectItem>
                    <SelectItem value="MARKETING">MARKETING — Promoções</SelectItem>
                    <SelectItem value="AUTHENTICATION">AUTHENTICATION — Verificação</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Corpo da Mensagem *</Label>
                <Textarea
                  value={editBody}
                  onChange={(e) => setEditBody(e.target.value.slice(0, 1024))}
                  rows={5}
                  placeholder="Olá {{1}}, seu pagamento de {{2}} vence em {{3}}."
                  className="mt-1"
                />
                <div className="flex justify-between mt-1">
                  <p className="text-xs text-muted-foreground">Use {'{{1}}'}, {'{{2}}'} para variáveis</p>
                  <p className={`text-xs ${editBodyCharCount > 1000 ? 'text-destructive' : 'text-muted-foreground'}`}>
                    {editBodyCharCount}/1024
                  </p>
                </div>
              </div>

              <div>
                <Label>Variáveis</Label>
                <div className="flex gap-2 mt-1">
                  <Input
                    value={editVariable}
                    onChange={(e) => setEditVariable(e.target.value)}
                    placeholder="Nome da variável"
                    onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addEditVariable())}
                  />
                  <Button type="button" variant="outline" size="sm" onClick={addEditVariable}>
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
                <div className="flex gap-1 mt-2 flex-wrap">
                  {editVariables.map((v, i) => (
                    <Badge key={v} variant="secondary" className="gap-1">
                      {`{{${i + 1}}} = ${v}`}
                      <button onClick={() => removeEditVariable(v)} className="hover:text-destructive">
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
                {editVariables.length > 0 && (
                  <div className="mt-2 p-2 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded text-xs text-blue-700 dark:text-blue-300">
                    <p className="font-medium flex items-center gap-1">ℹ️ Valores de exemplo enviados ao WhatsApp:</p>
                    <p className="mt-1">
                      {editVariables.map((_, i) => {
                        const samples = ['Jorge', '9,99', '31/12/2050'];
                        return `{{${i + 1}}} → ${samples[i] || `exemplo_${i + 1}`}`;
                      }).join('  |  ')}
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Preview */}
            <div className="space-y-2">
              <Label>Preview</Label>
              <div className="bg-[#e5ddd5] rounded-lg p-4 min-h-[200px]">
                <div className="bg-white rounded-lg p-3 shadow-sm max-w-[280px]">
                  <p className="text-sm whitespace-pre-wrap">{editPreviewText || 'Escreva o corpo da mensagem...'}</p>
                  <p className="text-[10px] text-muted-foreground text-right mt-1">
                    {new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
              </div>
              <div className="text-xs text-muted-foreground space-y-1 mt-3">
                <p className="font-medium">Dicas para aprovação Meta:</p>
                <ul className="list-disc pl-4 space-y-0.5">
                  <li>Não inclua URLs encurtadas</li>
                  <li>Evite linguagem agressiva de cobrança</li>
                  <li>Inclua opt-out quando obrigatório</li>
                  <li>Use variáveis para dados pessoais</li>
                  <li>Máximo 1024 caracteres no corpo</li>
                </ul>
              </div>
            </div>
          </div>

          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setEditingTemplate(null)}>Cancelar</Button>
            <Button onClick={handleSaveEdit} disabled={!editBody || updateTemplate.isPending}>
              Salvar Alterações
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Confirmation Alert */}
      <AlertDialog open={showEditConfirm} onOpenChange={setShowEditConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-amber-500" />
              Atenção — Re-submissão Obrigatória
            </AlertDialogTitle>
            <AlertDialogDescription className="text-sm space-y-2">
              <p>
                Ao alterar este template, ele deverá ser <strong>submetido novamente para aprovação da Meta</strong>.
              </p>
              <p>
                O prazo de retorno é de <strong>até 48 horas</strong>. Durante esse período, o template anterior deixará de funcionar e as automações associadas usarão mensagem livre (válida apenas na janela de 24h).
              </p>
              <p className="font-medium">Deseja continuar?</p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmSaveEdit}>
              Sim, salvar e re-submeter
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* New Template Dialog */}
      <Dialog open={showNewDialog} onOpenChange={(open) => { if (!open) { setShowNewDialog(false); resetNewForm(); } }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Novo Template de WhatsApp</DialogTitle>
            <DialogDescription>Preencha os campos abaixo seguindo as normas da Meta para aprovação.</DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Form */}
            <div className="space-y-4">
              <div>
                <Label htmlFor="tpl-name">Nome do Template *</Label>
                <Input
                  id="tpl-name"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                  placeholder="ex: payment_reminder_7d"
                  className="mt-1"
                />
                {newName && !isValidName && (
                  <p className="text-xs text-destructive mt-1">Apenas letras minúsculas, números e underscore</p>
                )}
                <p className="text-xs text-muted-foreground mt-1">snake_case, sem espaços ou caracteres especiais</p>
                {duplicateNameTemplate && (
                  <p className="text-xs text-destructive mt-1 flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" />
                    Já existe um template com o nome "{newName}"
                  </p>
                )}
              </div>

              <div>
                <Label>Categoria *</Label>
                <Select value={newCategory} onValueChange={(v: 'sla' | 'operational') => setNewCategory(v)}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sla">SLA — Automação vinculada a regra</SelectItem>
                    <SelectItem value="operational">Operacional — Disponível no chat</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-1">
                  {newCategory === 'sla' 
                    ? 'Templates SLA são usados automaticamente pelas automações' 
                    : 'Templates operacionais ficam disponíveis no chat para envio manual fora da janela de 24h'}
                </p>
              </div>

              {newCategory === 'sla' ? (
                <div>
                  <Label>Tipo de Automação (Regra SLA) *</Label>
                  <Select value={newAutomationType} onValueChange={setNewAutomationType}>
                    <SelectTrigger className="mt-1">
                      <SelectValue placeholder="Selecione a regra..." />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(AUTOMATION_LABELS).map(([key, label]) => (
                        <SelectItem key={key} value={key}>{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground mt-1">Regra SLA vinculada a este template</p>
                  {duplicateTemplate && (
                    <p className="text-xs text-amber-600 mt-1 flex items-center gap-1">
                      <AlertCircle className="h-3 w-3" />
                      Já existe um template para "{AUTOMATION_LABELS[newAutomationType] || newAutomationType}" no idioma {newLanguage}
                    </p>
                  )}
                </div>
              ) : (
                <div>
                  <Label htmlFor="tpl-automation-op">Identificador (opcional)</Label>
                  <Input
                    id="tpl-automation-op"
                    value={newAutomationType}
                    onChange={(e) => setNewAutomationType(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                    placeholder="ex: contato_geral"
                    className="mt-1"
                  />
                  <p className="text-xs text-muted-foreground mt-1">Identificador livre para organização interna</p>
                </div>
              )}

              <div>
                <Label>Idioma</Label>
                <Select value={newLanguage} onValueChange={setNewLanguage}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {LANGUAGE_OPTIONS.map((l) => (
                      <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Categoria Meta *</Label>
                <Select value={newMetaCategory} onValueChange={(v: 'UTILITY' | 'MARKETING' | 'AUTHENTICATION') => setNewMetaCategory(v)}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="UTILITY">UTILITY — Transacional (aprovação mais rápida)</SelectItem>
                    <SelectItem value="MARKETING">MARKETING — Promoções e ofertas</SelectItem>
                    <SelectItem value="AUTHENTICATION">AUTHENTICATION — Códigos de verificação</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-1">Categoria exigida pela Meta para aprovação do template</p>
              </div>

              <div>
                <Label htmlFor="tpl-body">Corpo da Mensagem *</Label>
                <Textarea
                  id="tpl-body"
                  value={newBody}
                  onChange={(e) => setNewBody(e.target.value.slice(0, 1024))}
                  rows={5}
                  placeholder="Olá {{1}}, seu pagamento de {{2}} vence em {{3}}."
                  className="mt-1"
                />
                <div className="flex justify-between mt-1">
                  <p className="text-xs text-muted-foreground">Use {'{{1}}'}, {'{{2}}'} para variáveis</p>
                  <p className={`text-xs ${bodyCharCount > 1000 ? 'text-destructive' : 'text-muted-foreground'}`}>
                    {bodyCharCount}/1024
                  </p>
                </div>
              </div>

              <div>
                <Label>Variáveis</Label>
                <div className="flex gap-2 mt-1">
                  <Input
                    value={newVariable}
                    onChange={(e) => setNewVariable(e.target.value)}
                    placeholder="Nome da variável (ex: nome_cliente)"
                    onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addVariable())}
                  />
                  <Button type="button" variant="outline" size="sm" onClick={addVariable}>
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
                <div className="flex gap-1 mt-2 flex-wrap">
                  {newVariables.map((v, i) => (
                    <Badge key={v} variant="secondary" className="gap-1">
                      {`{{${i + 1}}} = ${v}`}
                      <button onClick={() => removeVariable(v)} className="hover:text-destructive">
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
                {newVariables.length > 0 && (
                  <div className="mt-2 p-2 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded text-xs text-blue-700 dark:text-blue-300">
                    <p className="font-medium flex items-center gap-1">ℹ️ Valores de exemplo enviados ao WhatsApp:</p>
                    <p className="mt-1">
                      {newVariables.map((_, i) => {
                        const samples = ['Jorge', '9,99', '31/12/2050'];
                        return `{{${i + 1}}} → ${samples[i] || `exemplo_${i + 1}`}`;
                      }).join('  |  ')}
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Preview */}
            <div className="space-y-2">
              <Label>Preview</Label>
              <div className="bg-[#e5ddd5] rounded-lg p-4 min-h-[200px]">
                <div className="bg-white rounded-lg p-3 shadow-sm max-w-[280px]">
                  <p className="text-sm whitespace-pre-wrap">{previewText || 'Escreva o corpo da mensagem...'}</p>
                  <p className="text-[10px] text-muted-foreground text-right mt-1">
                    {new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
              </div>
              <div className="text-xs text-muted-foreground space-y-1 mt-3">
                <p className="font-medium">Dicas para aprovação Meta:</p>
                <ul className="list-disc pl-4 space-y-0.5">
                  <li>Não inclua URLs encurtadas</li>
                  <li>Evite linguagem agressiva de cobrança</li>
                  <li>Inclua opt-out quando obrigatório</li>
                  <li>Use variáveis para dados pessoais</li>
                  <li>Máximo 1024 caracteres no corpo</li>
                </ul>
              </div>
            </div>
          </div>

          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => { setShowNewDialog(false); resetNewForm(); }}>Cancelar</Button>
            <Button
              onClick={handleCreateTemplate}
              disabled={!newName || !isValidName || !newBody || (newCategory === 'sla' && !newAutomationType) || !!duplicateNameTemplate || createTemplate.isPending}
            >
              {createTemplate.isPending ? 'Criando...' : 'Criar Template'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Logs Section */}
      <Collapsible open={logsOpen} onOpenChange={setLogsOpen}>
        <Card>
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-base">
                  {logsOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  <ScrollText className="h-5 w-5" />
                  Logs de Envio
                </CardTitle>
              </div>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="px-6 pb-2">
              <Select value={logFilter} onValueChange={setLogFilter}>
                <SelectTrigger className="w-[140px] h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="success">Sucesso</SelectItem>
                  <SelectItem value="error">Erro</SelectItem>
                  <SelectItem value="skipped">Ignorado</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <CardContent>
              {logsLoading ? (
                <p className="text-muted-foreground text-sm">Carregando logs...</p>
              ) : !templateLogs?.length ? (
                <p className="text-muted-foreground text-sm">Nenhum log encontrado.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-8"></TableHead>
                      <TableHead>Data/Hora</TableHead>
                      <TableHead>Template</TableHead>
                      <TableHead>Ação</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>HTTP</TableHead>
                      <TableHead>Content SID</TableHead>
                      <TableHead>Erro</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {templateLogs
                      .filter((log) => logFilter === 'all' || log.status === logFilter)
                      .map((log) => {
                        const isExpanded = expandedLogId === log.id;
                        const statusColor = log.status === 'success'
                          ? 'text-green-600'
                          : log.status === 'error'
                            ? 'text-red-600'
                            : 'text-blue-600';
                        return (
                          <>
                            <TableRow
                              key={log.id}
                              className="cursor-pointer hover:bg-muted/50"
                              onClick={() => setExpandedLogId(isExpanded ? null : log.id)}
                            >
                              <TableCell className="p-2">
                                {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                              </TableCell>
                              <TableCell className="text-xs whitespace-nowrap">
                                {new Date(log.created_at).toLocaleString('pt-BR')}
                              </TableCell>
                              <TableCell className="text-xs font-medium">{log.template_name}</TableCell>
                              <TableCell>
                                <Badge variant="outline" className="text-xs">{log.action}</Badge>
                              </TableCell>
                              <TableCell>
                                <span className={`text-xs font-semibold ${statusColor}`}>{log.status}</span>
                              </TableCell>
                              <TableCell className="text-xs font-mono">{log.twilio_status_code || '—'}</TableCell>
                              <TableCell className="text-xs font-mono text-muted-foreground max-w-[120px] truncate">
                                {log.content_sid || '—'}
                              </TableCell>
                              <TableCell className="text-xs text-destructive max-w-[200px] truncate">
                                {log.error_message || '—'}
                              </TableCell>
                            </TableRow>
                            {isExpanded && (
                              <TableRow key={`${log.id}-detail`}>
                                <TableCell colSpan={8} className="bg-muted/30 p-4">
                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                      <p className="text-xs font-semibold mb-1">Request Payload</p>
                                      <pre className="text-xs bg-background p-3 rounded-md overflow-auto max-h-[200px] border">
                                        {log.request_payload ? JSON.stringify(log.request_payload, null, 2) : 'N/A'}
                                      </pre>
                                    </div>
                                    <div>
                                      <p className="text-xs font-semibold mb-1">Response Payload</p>
                                      <pre className="text-xs bg-background p-3 rounded-md overflow-auto max-h-[200px] border">
                                        {log.response_payload ? JSON.stringify(log.response_payload, null, 2) : 'N/A'}
                                      </pre>
                                    </div>
                                  </div>
                                </TableCell>
                              </TableRow>
                            )}
                          </>
                        );
                      })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>
      <AlertDialog open={deletingTemplateId !== null} onOpenChange={(open) => !open && setDeletingTemplateId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir template</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir este template? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (deletingTemplateId) {
                  deleteTemplate.mutate(deletingTemplateId);
                  setDeletingTemplateId(null);
                }
              }}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
