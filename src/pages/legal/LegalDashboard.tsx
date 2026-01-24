import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DataTable } from "@/components/ui/data-table";
import { Calendar } from "@/components/ui/calendar";
import { Skeleton } from "@/components/ui/skeleton";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format, isToday, isTomorrow, addDays, isBefore } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Scale,
  Calendar as CalendarIcon,
  FileWarning,
  AlertTriangle,
  Clock,
  Eye,
  CheckCircle,
  XCircle,
  Gavel,
} from "lucide-react";

const statusLabels: Record<string, string> = {
  ENVIADO_JURIDICO: "Aguardando Revisão",
  DOCUMENTACAO_PARCIAL_APROVADA: "Docs Parciais",
  EXIGENCIA_ORGAO: "Exigência",
  EM_RECURSO: "Em Recurso",
  PROTOCOLADO: "Protocolado",
  APROVADO: "Aprovado",
  DENEGADO: "Denegado",
};

const priorityColors: Record<string, string> = {
  URGENTE: "bg-destructive text-destructive-foreground",
  ALTA: "bg-orange-500 text-white",
  NORMAL: "bg-secondary text-secondary-foreground",
  BAIXA: "bg-muted text-muted-foreground",
};

export default function LegalDashboard() {
  const navigate = useNavigate();
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());

  // Fetch all legal-relevant cases
  const { data: cases, isLoading } = useQuery({
    queryKey: ["legal-cases"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("service_cases")
        .select(`
          *,
          opportunities (
            *,
            leads (
              *,
              contacts (*)
            )
          )
        `)
        .in("technical_status", [
          "ENVIADO_JURIDICO",
          "DOCUMENTACAO_PARCIAL_APROVADA",
          "EXIGENCIA_ORGAO",
          "EM_RECURSO",
          "PROTOCOLADO",
        ])
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data;
    },
  });

  // Cases awaiting legal review
  const awaitingReview = cases?.filter(
    (c) => c.technical_status === "ENVIADO_JURIDICO"
  ) || [];

  // Cases with requirements from authority
  const withRequirements = cases?.filter(
    (c) => c.technical_status === "EXIGENCIA_ORGAO"
  ) || [];

  // Cases in appeal/resource
  const inAppeal = cases?.filter(
    (c) => c.technical_status === "EM_RECURSO"
  ) || [];

  // Cases with expected protocol date
  const pendingProtocol = cases?.filter(
    (c) => c.expected_protocol_date && c.technical_status !== "PROTOCOLADO"
  ) || [];

  // Urgent cases for today
  const urgentToday = cases?.filter((c) => {
    if (!c.expected_protocol_date) return false;
    const protocolDate = new Date(c.expected_protocol_date);
    return isToday(protocolDate) || (c.is_urgent && isBefore(protocolDate, addDays(new Date(), 2)));
  }) || [];

  // Protocol dates for calendar
  const protocolDates = pendingProtocol.map((c) => new Date(c.expected_protocol_date!));

  const getClientName = (caseItem: any) => {
    return caseItem.opportunities?.leads?.contacts?.full_name || "Cliente não identificado";
  };

  const columns = [
    {
      key: "client",
      header: "Cliente",
      cell: (item: any) => (
        <div className="font-medium">{getClientName(item)}</div>
      ),
    },
    {
      key: "service_type",
      header: "Serviço",
      cell: (item: any) => (
        <Badge variant="outline">{item.service_type}</Badge>
      ),
    },
    {
      key: "technical_status",
      header: "Status",
      cell: (item: any) => (
        <Badge>{statusLabels[item.technical_status] || item.technical_status}</Badge>
      ),
    },
    {
      key: "priority",
      header: "Prioridade",
      cell: (item: any) => {
        const priority = item.is_urgent ? "URGENTE" : item.case_priority || "NORMAL";
        return (
          <Badge className={priorityColors[priority]}>
            {priority}
          </Badge>
        );
      },
    },
    {
      key: "expected_protocol_date",
      header: "Data Protocolo",
      cell: (item: any) => {
        const date = item.expected_protocol_date;
        if (!date) return <span className="text-muted-foreground">-</span>;
        const d = new Date(date);
        const isUrgent = isToday(d) || isTomorrow(d);
        return (
          <span className={isUrgent ? "text-destructive font-semibold" : ""}>
            {format(d, "dd/MM/yyyy", { locale: ptBR })}
            {isToday(d) && " (HOJE)"}
            {isTomorrow(d) && " (Amanhã)"}
          </span>
        );
      },
    },
    {
      key: "requirement_deadline",
      header: "Prazo Exigência",
      cell: (item: any) => {
        const date = item.requirement_deadline;
        if (!date) return <span className="text-muted-foreground">-</span>;
        const d = new Date(date);
        const daysLeft = Math.ceil((d.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
        return (
          <span className={daysLeft <= 3 ? "text-destructive font-semibold" : ""}>
            {format(d, "dd/MM/yyyy")} ({daysLeft}d)
          </span>
        );
      },
    },
    {
      key: "actions",
      header: "Ações",
      cell: (item: any) => (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate(`/cases/${item.id}`)}
        >
          <Eye className="h-4 w-4 mr-1" />
          Ver
        </Button>
      ),
    },
  ];

  if (isLoading) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Dashboard Jurídico"
          description="Visão consolidada do departamento jurídico"
        />
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard Jurídico"
        description="Gestão de protocolos, revisões e recursos"
      />

      {/* Urgent Alerts */}
      {urgentToday.length > 0 && (
        <Card className="border-destructive bg-destructive/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-destructive flex items-center gap-2">
              <AlertTriangle className="h-5 w-5" />
              PROTOCOLOS URGENTES HOJE
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {urgentToday.map((c) => (
                <div
                  key={c.id}
                  className="flex items-center justify-between p-2 bg-background rounded-md"
                >
                  <div>
                    <span className="font-medium">{getClientName(c)}</span>
                    <span className="text-muted-foreground ml-2">- {c.service_type}</span>
                  </div>
                  <Button size="sm" onClick={() => navigate(`/cases/${c.id}`)}>
                    Abrir Caso
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Aguardando Revisão</CardTitle>
            <Scale className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{awaitingReview.length}</div>
            <p className="text-xs text-muted-foreground">Casos para análise jurídica</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Exigências Abertas</CardTitle>
            <FileWarning className="h-4 w-4 text-orange-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-500">{withRequirements.length}</div>
            <p className="text-xs text-muted-foreground">Prazo de 10 dias</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Recursos Pendentes</CardTitle>
            <Gavel className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">{inAppeal.length}</div>
            <p className="text-xs text-muted-foreground">Em contestação</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Protocolos Pendentes</CardTitle>
            <CalendarIcon className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">{pendingProtocol.length}</div>
            <p className="text-xs text-muted-foreground">Aguardando protocolo</p>
          </CardContent>
        </Card>
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Calendar */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <CalendarIcon className="h-5 w-5" />
              Calendário de Protocolos
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Calendar
              mode="single"
              selected={selectedDate}
              onSelect={setSelectedDate}
              locale={ptBR}
              modifiers={{
                protocol: protocolDates,
              }}
              modifiersStyles={{
                protocol: {
                  backgroundColor: "hsl(var(--primary))",
                  color: "hsl(var(--primary-foreground))",
                  borderRadius: "50%",
                },
              }}
              className="rounded-md border"
            />
            <div className="mt-4 text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-primary"></div>
                <span>Datas com protocolo previsto</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Cases Table */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-lg">Casos Jurídicos</CardTitle>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="review">
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="review" className="flex items-center gap-1">
                  <Scale className="h-4 w-4" />
                  Revisão ({awaitingReview.length})
                </TabsTrigger>
                <TabsTrigger value="requirements" className="flex items-center gap-1">
                  <FileWarning className="h-4 w-4" />
                  Exigências ({withRequirements.length})
                </TabsTrigger>
                <TabsTrigger value="appeals" className="flex items-center gap-1">
                  <Gavel className="h-4 w-4" />
                  Recursos ({inAppeal.length})
                </TabsTrigger>
                <TabsTrigger value="protocol" className="flex items-center gap-1">
                  <Clock className="h-4 w-4" />
                  Protocolo ({pendingProtocol.length})
                </TabsTrigger>
              </TabsList>

              <TabsContent value="review" className="mt-4">
                <DataTable
                  columns={columns}
                  data={awaitingReview}
                  emptyMessage="Nenhum caso aguardando revisão"
                />
              </TabsContent>

              <TabsContent value="requirements" className="mt-4">
                <DataTable
                  columns={columns}
                  data={withRequirements}
                  emptyMessage="Nenhuma exigência aberta"
                />
              </TabsContent>

              <TabsContent value="appeals" className="mt-4">
                <DataTable
                  columns={columns}
                  data={inAppeal}
                  emptyMessage="Nenhum recurso pendente"
                />
              </TabsContent>

              <TabsContent value="protocol" className="mt-4">
                <DataTable
                  columns={columns}
                  data={pendingProtocol}
                  emptyMessage="Nenhum protocolo pendente"
                />
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
