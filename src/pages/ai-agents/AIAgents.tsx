import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { PageHeader } from '@/components/ui/page-header';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Bot, Plus, MoreHorizontal, Eye, Pencil, Copy, Power, PowerOff, FlaskConical, Workflow, RefreshCw } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useAIAgents, useDuplicateAgent, useSyncAgentDefaults, useToggleAgentStatus } from '@/hooks/useAIAgents';
import { AgentFormDialog } from '@/components/ai-agents/AgentFormDialog';
import { FlowsManagement } from '@/components/ai-agents/FlowsManagement';
import { AgentSandbox } from '@/components/ai-agents/AgentSandbox';
import type { AIAgent } from '@/types/ai-agents';

function statusVariant(status: string) {
  if (status === 'ATIVO') return 'default' as const;
  if (status === 'INATIVO') return 'secondary' as const;
  return 'outline' as const;
}

export default function AIAgents({ embedded = false }: { embedded?: boolean } = {}) {
  const { hasRole, loading, user } = useAuth();
  const { data: agents, isLoading } = useAIAgents();
  const toggleStatus = useToggleAgentStatus();
  const duplicate = useDuplicateAgent();
  const syncDefaults = useSyncAgentDefaults();

  const [tab, setTab] = useState('agentes');
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [readOnly, setReadOnly] = useState(false);
  const [editing, setEditing] = useState<AIAgent | null>(null);
  const [sandboxAgentId, setSandboxAgentId] = useState<string | null>(null);

  // Só bloqueia a tela na primeira carga; revalidações de sessão não podem
  // desmontar o editor de fluxos e perder o rascunho.
  if (loading && !user) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!loading && !hasRole('ADMIN')) return <Navigate to="/dashboard" replace />;


  const filtered = (agents || []).filter((a) =>
    a.name.toLowerCase().includes(search.toLowerCase()) ||
    (a.description || '').toLowerCase().includes(search.toLowerCase()),
  );

  const openNew = () => { setEditing(null); setReadOnly(false); setDialogOpen(true); };
  const openEdit = (a: AIAgent, ro = false) => { setEditing(a); setReadOnly(ro); setDialogOpen(true); };
  const openTest = (a: AIAgent) => { setSandboxAgentId(a.id); setTab('sandbox'); };

  return (
    <div className="space-y-6">
      {!embedded && (
        <PageHeader
          title="Agentes de IA"
          description="Gerencie os agentes de inteligência artificial, seus comportamentos, fluxos e versões"
        />
      )}

      <Tabs value={tab} onValueChange={setTab} className="space-y-6">
        <TabsList>
          <TabsTrigger value="agentes" className="gap-2"><Bot className="h-4 w-4" /> Agentes</TabsTrigger>
          <TabsTrigger value="fluxos" className="gap-2"><Workflow className="h-4 w-4" /> Fluxo de atendimento</TabsTrigger>
          <TabsTrigger value="sandbox" className="gap-2"><FlaskConical className="h-4 w-4" /> Teste</TabsTrigger>
        </TabsList>

        <TabsContent value="agentes">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-4">
              <CardTitle>Agentes cadastrados</CardTitle>
              <div className="flex items-center gap-2">
                <Input
                  placeholder="Buscar agente…"
                  className="w-56"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                <Button
                  variant="outline"
                  onClick={() => syncDefaults.mutate()}
                  disabled={syncDefaults.isPending}
                  title="Importa o prompt e os textos que o agente do WhatsApp executa hoje"
                >
                  <RefreshCw className={`h-4 w-4 mr-1 ${syncDefaults.isPending ? 'animate-spin' : ''}`} />
                  Sincronizar com produção
                </Button>
                <Button onClick={openNew}><Plus className="h-4 w-4 mr-1" /> Novo agente</Button>
              </div>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <p className="text-sm text-muted-foreground">Carregando…</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Nome</TableHead>
                        <TableHead>Descrição</TableHead>
                        <TableHead>Modelo</TableHead>
                        <TableHead>Provedor</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Versão</TableHead>
                        <TableHead>Última atualização</TableHead>
                        <TableHead>Criado em</TableHead>
                        <TableHead className="text-right">Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filtered.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={9} className="text-center text-muted-foreground">
                            Nenhum agente cadastrado
                          </TableCell>
                        </TableRow>
                      )}
                      {filtered.map((a) => (
                        <TableRow key={a.id}>
                          <TableCell className="font-medium max-w-[200px] truncate" title={a.name}>
                            <div className="flex items-center gap-2">
                              <span className="truncate">{a.name}</span>
                              {a.is_production && <Badge variant="default">Produção</Badge>}
                            </div>
                          </TableCell>
                          <TableCell className="max-w-[240px] truncate" title={a.description || ''}>{a.description || '—'}</TableCell>
                          <TableCell className="font-mono text-xs">{a.model}</TableCell>
                          <TableCell>{a.provider}</TableCell>
                          <TableCell><Badge variant={statusVariant(a.status)}>{a.status}</Badge></TableCell>
                          <TableCell>v{a.current_version}</TableCell>
                          <TableCell>{new Date(a.updated_at).toLocaleDateString('pt-BR')}</TableCell>
                          <TableCell>{new Date(a.created_at).toLocaleDateString('pt-BR')}</TableCell>
                          <TableCell className="text-right">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon"><MoreHorizontal className="h-4 w-4" /></Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => openEdit(a, true)}>
                                  <Eye className="h-4 w-4 mr-2" /> Visualizar
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => openEdit(a)}>
                                  <Pencil className="h-4 w-4 mr-2" /> Editar
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => duplicate.mutate(a)}>
                                  <Copy className="h-4 w-4 mr-2" /> Duplicar
                                </DropdownMenuItem>
                                {a.status !== 'ATIVO' ? (
                                  <DropdownMenuItem onClick={() => toggleStatus.mutate({ id: a.id, status: 'ATIVO' })}>
                                    <Power className="h-4 w-4 mr-2" /> Ativar
                                  </DropdownMenuItem>
                                ) : (
                                  <DropdownMenuItem onClick={() => toggleStatus.mutate({ id: a.id, status: 'INATIVO' })}>
                                    <PowerOff className="h-4 w-4 mr-2" /> Desativar
                                  </DropdownMenuItem>
                                )}
                                <DropdownMenuItem onClick={() => openTest(a)}>
                                  <FlaskConical className="h-4 w-4 mr-2" /> Testar
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="fluxos">
          <FlowsManagement />
        </TabsContent>

        <TabsContent value="sandbox">
          <AgentSandbox initialAgentId={sandboxAgentId} />
        </TabsContent>
      </Tabs>

      <AgentFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        agent={editing}
        readOnly={readOnly}
      />
    </div>
  );
}
