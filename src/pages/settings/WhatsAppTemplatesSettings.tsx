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

const LANGUAGE_OPTIONS = [
  { value: 'pt_BR', label: 'Português (BR)' },
  { value: 'es', label: 'Español' },
  { value: 'en_US', label: 'English (US)' },
  { value: 'fr', label: 'Français' },
];

export default function WhatsAppTemplatesSettings() {
  const { templates, isLoading, submitTemplates, checkStatus, updateTemplate, createTemplate, deleteTemplate, templateLogs, logsLoading } = useWhatsAppTemplates();
  const [editingTemplate, setEditingTemplate] = useState<any>(null);
  const [editBody, setEditBody] = useState('');
  const [showNewDialog, setShowNewDialog] = useState(false);
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);
  const [logFilter, setLogFilter] = useState<string>('all');
  const [deletingTemplateId, setDeletingTemplateId] = useState<string | null>(null);

  // Pending category changes for batch save
  const [pendingCategoryChanges, setPendingCategoryChanges] = useState<Record<string, 'sla' | 'operational'>>({});

  // New template form state
  const [newName, setNewName] = useState('');
  const [newCategory, setNewCategory] = useState<'sla' | 'operational'>('sla');
  const [newAutomationType, setNewAutomationType] = useState('');
  const [newLanguage, setNewLanguage] = useState('pt_BR');
  const [newBody, setNewBody] = useState('');
  const [newVariable, setNewVariable] = useState('');
  const [newVariables, setNewVariables] = useState<string[]>([]);

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

  const resetNewForm = () => {
    setNewName('');
    setNewCategory('sla');
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

      {/* Edit Dialog */}
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
              disabled={!newName || !isValidName || !newBody || (newCategory === 'sla' && !newAutomationType) || createTemplate.isPending}
            >
              {createTemplate.isPending ? 'Criando...' : 'Criar Template'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Logs Section */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <ScrollText className="h-5 w-5" />
              Logs de Envio
            </CardTitle>
            <div className="flex gap-2">
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
          </div>
        </CardHeader>
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
      </Card>
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
