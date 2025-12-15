import { useState } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { DataTable, Column } from "@/components/ui/data-table";
import { StatusBadge } from "@/components/ui/status-badge";
import { StatsCard } from "@/components/ui/stats-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  useLeadIntakes,
  useLeadIntakeMutations,
  useLeadIntakeStats,
  LeadIntake,
  LeadIntakeStatus,
} from "@/hooks/useLeadIntake";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Search,
  Inbox,
  CheckCircle,
  AlertCircle,
  XCircle,
  Copy,
  Play,
  Eye,
  Trash2,
} from "lucide-react";

const statusConfig: Record<LeadIntakeStatus, { label: string; variant: "default" | "success" | "warning" | "destructive" | "info" | "accent" | "primary" }> = {
  PENDENTE: { label: "Pendente", variant: "warning" },
  PROCESSADO: { label: "Processado", variant: "success" },
  ERRO: { label: "Erro", variant: "destructive" },
  DESCARTADO: { label: "Descartado", variant: "default" },
  DUPLICADO: { label: "Duplicado", variant: "info" },
};

export default function LeadIntakePage() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<LeadIntakeStatus | "all">("all");
  const [selectedIntake, setSelectedIntake] = useState<LeadIntake | null>(null);
  const [showDetailDialog, setShowDetailDialog] = useState(false);
  const [showProcessDialog, setShowProcessDialog] = useState(false);
  const [processingNotes, setProcessingNotes] = useState("");

  const { data: intakes, isLoading } = useLeadIntakes(
    statusFilter === "all" ? undefined : statusFilter
  );
  const { data: stats } = useLeadIntakeStats();
  const { processIntake, updateStatus } = useLeadIntakeMutations();

  const filteredIntakes = intakes?.filter((intake) => {
    if (!search) return true;
    const searchLower = search.toLowerCase();
    return (
      intake.phone?.toLowerCase().includes(searchLower) ||
      intake.full_name?.toLowerCase().includes(searchLower) ||
      intake.email?.toLowerCase().includes(searchLower) ||
      intake.message_summary?.toLowerCase().includes(searchLower)
    );
  });

  const handleProcess = () => {
    if (selectedIntake) {
      processIntake.mutate(
        { id: selectedIntake.id, notes: processingNotes },
        {
          onSuccess: () => {
            setShowProcessDialog(false);
            setSelectedIntake(null);
            setProcessingNotes("");
          },
        }
      );
    }
  };

  const handleDiscard = (intake: LeadIntake) => {
    updateStatus.mutate({
      id: intake.id,
      status: "DESCARTADO",
      notes: "Descartado manualmente",
    });
  };

  const handleMarkDuplicate = (intake: LeadIntake) => {
    updateStatus.mutate({
      id: intake.id,
      status: "DUPLICADO",
      notes: "Marcado como duplicado",
    });
  };

  const columns: Column<LeadIntake>[] = [
    {
      key: "phone",
      header: "Telefone",
      cell: (intake) => (
        <span className="font-mono text-sm">{intake.phone}</span>
      ),
    },
    {
      key: "full_name",
      header: "Nome",
      cell: (intake) => intake.full_name || "—",
    },
    {
      key: "origin_channel",
      header: "Canal",
      cell: (intake) => intake.origin_channel || "—",
    },
    {
      key: "service_interest",
      header: "Interesse",
      cell: (intake) => intake.service_interest || "—",
    },
    {
      key: "status",
      header: "Status",
      cell: (intake) => {
        const config = statusConfig[intake.status];
        return <StatusBadge variant={config.variant}>{config.label}</StatusBadge>;
      },
    },
    {
      key: "created_at",
      header: "Recebido",
      cell: (intake) =>
        intake.created_at
          ? format(new Date(intake.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })
          : "—",
    },
    {
      key: "actions",
      header: "Ações",
      cell: (intake) => (
        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={(e) => {
              e.stopPropagation();
              setSelectedIntake(intake);
              setShowDetailDialog(true);
            }}
            title="Ver detalhes"
          >
            <Eye className="h-4 w-4" />
          </Button>
          {intake.status === "PENDENTE" && (
            <>
              <Button
                variant="ghost"
                size="icon"
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedIntake(intake);
                  setShowProcessDialog(true);
                }}
                title="Processar"
              >
                <Play className="h-4 w-4 text-primary" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={(e) => {
                  e.stopPropagation();
                  handleMarkDuplicate(intake);
                }}
                title="Marcar como duplicado"
              >
                <Copy className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={(e) => {
                  e.stopPropagation();
                  handleDiscard(intake);
                }}
                title="Descartar"
              >
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </>
          )}
          {intake.status === "ERRO" && (
            <Button
              variant="ghost"
              size="icon"
              onClick={(e) => {
                e.stopPropagation();
                setSelectedIntake(intake);
                setShowProcessDialog(true);
              }}
              title="Reprocessar"
            >
              <Play className="h-4 w-4 text-warning" />
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Lead Intake"
        description="Gerenciar leads recebidos do bot de WhatsApp e outros canais"
      />

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-5">
        <StatsCard
          title="Total Hoje"
          value={stats?.todayTotal ?? 0}
          icon={Inbox}
        />
        <StatsCard
          title="Pendentes"
          value={stats?.pendente ?? 0}
          icon={AlertCircle}
        />
        <StatsCard
          title="Processados"
          value={stats?.processado ?? 0}
          icon={CheckCircle}
        />
        <StatsCard
          title="Erros"
          value={stats?.erro ?? 0}
          icon={XCircle}
        />
        <StatsCard
          title="Descartados"
          value={stats?.descartado ?? 0}
          icon={Trash2}
        />
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-4 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar por telefone, nome, email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select
          value={statusFilter}
          onValueChange={(value) => setStatusFilter(value as LeadIntakeStatus | "all")}
        >
          <SelectTrigger className="w-full sm:w-[180px]">
            <SelectValue placeholder="Filtrar por status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="PENDENTE">Pendentes</SelectItem>
            <SelectItem value="PROCESSADO">Processados</SelectItem>
            <SelectItem value="ERRO">Erros</SelectItem>
            <SelectItem value="DESCARTADO">Descartados</SelectItem>
            <SelectItem value="DUPLICADO">Duplicados</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <DataTable
        columns={columns}
        data={filteredIntakes ?? []}
        loading={isLoading}
        emptyMessage="Nenhum lead intake encontrado"
      />

      {/* Detail Dialog */}
      <Dialog open={showDetailDialog} onOpenChange={setShowDetailDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Detalhes do Lead Intake</DialogTitle>
            <DialogDescription>
              Informações completas recebidas do sistema de captação
            </DialogDescription>
          </DialogHeader>
          {selectedIntake && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-muted-foreground">Telefone</Label>
                  <p className="font-mono">{selectedIntake.phone}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Nome</Label>
                  <p>{selectedIntake.full_name || "—"}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Email</Label>
                  <p>{selectedIntake.email || "—"}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Idioma</Label>
                  <p>{selectedIntake.preferred_language || "—"}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Canal de Origem</Label>
                  <p>{selectedIntake.origin_channel || "—"}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Interesse</Label>
                  <p>{selectedIntake.service_interest || "—"}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Sistema Fonte</Label>
                  <p>{selectedIntake.source_system || "—"}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Status</Label>
                  <StatusBadge variant={statusConfig[selectedIntake.status].variant}>
                    {statusConfig[selectedIntake.status].label}
                  </StatusBadge>
                </div>
              </div>
              {selectedIntake.message_summary && (
                <div>
                  <Label className="text-muted-foreground">Resumo da Mensagem</Label>
                  <p className="mt-1 rounded-md bg-muted p-3 text-sm">
                    {selectedIntake.message_summary}
                  </p>
                </div>
              )}
              {selectedIntake.processing_notes && (
                <div>
                  <Label className="text-muted-foreground">Notas de Processamento</Label>
                  <p className="mt-1 rounded-md bg-muted p-3 text-sm">
                    {selectedIntake.processing_notes}
                  </p>
                </div>
              )}
              {selectedIntake.error_message && (
                <div>
                  <Label className="text-muted-foreground">Mensagem de Erro</Label>
                  <p className="mt-1 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                    {selectedIntake.error_message}
                  </p>
                </div>
              )}
              {selectedIntake.raw_payload && (
                <div>
                  <Label className="text-muted-foreground">Payload Completo (JSON)</Label>
                  <pre className="mt-1 max-h-48 overflow-auto rounded-md bg-muted p-3 text-xs">
                    {JSON.stringify(selectedIntake.raw_payload, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDetailDialog(false)}>
              Fechar
            </Button>
            {selectedIntake?.status === "PENDENTE" && (
              <Button
                onClick={() => {
                  setShowDetailDialog(false);
                  setShowProcessDialog(true);
                }}
              >
                Processar
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Process Dialog */}
      <Dialog open={showProcessDialog} onOpenChange={setShowProcessDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Processar Lead Intake</DialogTitle>
            <DialogDescription>
              Isso criará ou atualizará o contato e lead no sistema principal.
            </DialogDescription>
          </DialogHeader>
          {selectedIntake && (
            <div className="space-y-4">
              <div className="rounded-md bg-muted p-4">
                <p className="font-medium">{selectedIntake.full_name || selectedIntake.phone}</p>
                <p className="text-sm text-muted-foreground">{selectedIntake.phone}</p>
                {selectedIntake.email && (
                  <p className="text-sm text-muted-foreground">{selectedIntake.email}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="notes">Notas (opcional)</Label>
                <Textarea
                  id="notes"
                  placeholder="Adicione notas sobre o processamento..."
                  value={processingNotes}
                  onChange={(e) => setProcessingNotes(e.target.value)}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowProcessDialog(false);
                setProcessingNotes("");
              }}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleProcess}
              disabled={processIntake.isPending}
            >
              {processIntake.isPending ? "Processando..." : "Processar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
