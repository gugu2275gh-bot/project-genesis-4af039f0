import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
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
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { toast } from "sonner";
import {
  Plus,
  Pencil,
  Trash2,
  FileText,
  Globe,
  Stamp,
  CheckCircle,
  XCircle,
} from "lucide-react";
import { SERVICE_INTEREST_LABELS } from "@/types/database";
import type { Database } from "@/integrations/supabase/types";

type ServiceInterest = Database["public"]["Enums"]["service_interest"];
type DocumentType = Database["public"]["Tables"]["service_document_types"]["Row"];

interface DocumentTypeForm {
  name: string;
  description: string;
  service_type: ServiceInterest;
  is_required: boolean;
  needs_apostille: boolean;
  needs_translation: boolean;
}

const initialForm: DocumentTypeForm = {
  name: "",
  description: "",
  service_type: "VISTO_ESTUDANTE",
  is_required: true,
  needs_apostille: false,
  needs_translation: false,
};

export default function DocumentTypesManagement() {
  const { roles } = useAuth();
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingDoc, setEditingDoc] = useState<DocumentType | null>(null);
  const [form, setForm] = useState<DocumentTypeForm>(initialForm);

  const isAdmin = roles.includes("ADMIN");

  const { data: documentTypes, isLoading } = useQuery({
    queryKey: ["document-types"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("service_document_types")
        .select("*")
        .order("service_type")
        .order("name");

      if (error) throw error;
      return data as DocumentType[];
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: DocumentTypeForm) => {
      const { error } = await supabase.from("service_document_types").insert(data);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["document-types"] });
      toast.success("Tipo de documento criado com sucesso");
      handleCloseDialog();
    },
    onError: (error) => {
      toast.error(`Erro ao criar tipo de documento: ${error.message}`);
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: DocumentTypeForm }) => {
      const { error } = await supabase
        .from("service_document_types")
        .update(data)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["document-types"] });
      toast.success("Tipo de documento atualizado com sucesso");
      handleCloseDialog();
    },
    onError: (error) => {
      toast.error(`Erro ao atualizar tipo de documento: ${error.message}`);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("service_document_types")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["document-types"] });
      toast.success("Tipo de documento excluído com sucesso");
    },
    onError: (error) => {
      toast.error(`Erro ao excluir tipo de documento: ${error.message}`);
    },
  });

  const handleCloseDialog = () => {
    setIsDialogOpen(false);
    setEditingDoc(null);
    setForm(initialForm);
  };

  const handleEdit = (doc: DocumentType) => {
    setEditingDoc(doc);
    setForm({
      name: doc.name,
      description: doc.description || "",
      service_type: doc.service_type as ServiceInterest,
      is_required: doc.is_required ?? true,
      needs_apostille: doc.needs_apostille ?? false,
      needs_translation: doc.needs_translation ?? false,
    });
    setIsDialogOpen(true);
  };

  const handleSubmit = () => {
    if (!form.name.trim()) {
      toast.error("Nome é obrigatório");
      return;
    }

    if (editingDoc) {
      updateMutation.mutate({ id: editingDoc.id, data: form });
    } else {
      createMutation.mutate(form);
    }
  };

  const handleDelete = (id: string) => {
    if (confirm("Tem certeza que deseja excluir este tipo de documento?")) {
      deleteMutation.mutate(id);
    }
  };

  // Group documents by service type
  const groupedDocuments = documentTypes?.reduce(
    (acc, doc) => {
      const serviceType = doc.service_type as ServiceInterest;
      if (!acc[serviceType]) {
        acc[serviceType] = [];
      }
      acc[serviceType].push(doc);
      return acc;
    },
    {} as Record<ServiceInterest, DocumentType[]>
  );

  const serviceTypes: ServiceInterest[] = [
    "VISTO_ESTUDANTE",
    "VISTO_TRABALHO",
    "REAGRUPAMENTO",
    "RENOVACAO_RESIDENCIA",
    "NACIONALIDADE_RESIDENCIA",
    "NACIONALIDADE_CASAMENTO",
    "OUTRO",
  ];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Tipos de Documentos</h2>
          <p className="text-muted-foreground">
            Gerencie os documentos necessários para cada tipo de serviço
          </p>
        </div>
        {isAdmin && (
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={() => setForm(initialForm)}>
                <Plus className="h-4 w-4 mr-2" />
                Novo Documento
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>
                  {editingDoc ? "Editar Tipo de Documento" : "Novo Tipo de Documento"}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Nome *</Label>
                  <Input
                    id="name"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="Ex: Passaporte válido"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="description">Descrição</Label>
                  <Textarea
                    id="description"
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    placeholder="Instruções ou detalhes sobre o documento"
                    rows={3}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="service_type">Tipo de Serviço *</Label>
                  <Select
                    value={form.service_type}
                    onValueChange={(value) =>
                      setForm({ ...form, service_type: value as ServiceInterest })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {serviceTypes.map((type) => (
                        <SelectItem key={type} value={type}>
                          {SERVICE_INTEREST_LABELS[type]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-4 pt-2">
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>Obrigatório</Label>
                      <p className="text-sm text-muted-foreground">
                        O documento é obrigatório para o processo
                      </p>
                    </div>
                    <Switch
                      checked={form.is_required}
                      onCheckedChange={(checked) =>
                        setForm({ ...form, is_required: checked })
                      }
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>Requer Apostilamento</Label>
                      <p className="text-sm text-muted-foreground">
                        Documento precisa de Apostila de Haia
                      </p>
                    </div>
                    <Switch
                      checked={form.needs_apostille}
                      onCheckedChange={(checked) =>
                        setForm({ ...form, needs_apostille: checked })
                      }
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>Requer Tradução</Label>
                      <p className="text-sm text-muted-foreground">
                        Documento precisa de tradução juramentada
                      </p>
                    </div>
                    <Switch
                      checked={form.needs_translation}
                      onCheckedChange={(checked) =>
                        setForm({ ...form, needs_translation: checked })
                      }
                    />
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={handleCloseDialog}>
                  Cancelar
                </Button>
                <Button
                  onClick={handleSubmit}
                  disabled={createMutation.isPending || updateMutation.isPending}
                >
                  {editingDoc ? "Salvar" : "Criar"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <Accordion type="multiple" className="space-y-4" defaultValue={serviceTypes}>
        {serviceTypes.map((serviceType) => {
          const docs = groupedDocuments?.[serviceType] || [];
          const requiredCount = docs.filter((d) => d.is_required).length;

          return (
            <AccordionItem
              key={serviceType}
              value={serviceType}
              className="border rounded-lg px-4"
            >
              <AccordionTrigger className="hover:no-underline">
                <div className="flex items-center gap-4">
                  <FileText className="h-5 w-5 text-primary" />
                  <div className="text-left">
                    <span className="font-semibold">
                      {SERVICE_INTEREST_LABELS[serviceType]}
                    </span>
                    <div className="flex gap-2 mt-1">
                      <Badge variant="secondary">{docs.length} documentos</Badge>
                      <Badge variant="outline">{requiredCount} obrigatórios</Badge>
                    </div>
                  </div>
                </div>
              </AccordionTrigger>
              <AccordionContent>
                {docs.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p>Nenhum documento cadastrado para este serviço</p>
                    {isAdmin && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="mt-2"
                        onClick={() => {
                          setForm({ ...initialForm, service_type: serviceType });
                          setIsDialogOpen(true);
                        }}
                      >
                        <Plus className="h-4 w-4 mr-2" />
                        Adicionar documento
                      </Button>
                    )}
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Nome</TableHead>
                        <TableHead>Descrição</TableHead>
                        <TableHead className="text-center">Obrigatório</TableHead>
                        <TableHead className="text-center">Apostila</TableHead>
                        <TableHead className="text-center">Tradução</TableHead>
                        {isAdmin && <TableHead className="text-right">Ações</TableHead>}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {docs.map((doc) => (
                        <TableRow key={doc.id}>
                          <TableCell className="font-medium">{doc.name}</TableCell>
                          <TableCell className="text-muted-foreground max-w-xs truncate">
                            {doc.description || "-"}
                          </TableCell>
                          <TableCell className="text-center">
                            {doc.is_required ? (
                              <CheckCircle className="h-4 w-4 text-green-500 mx-auto" />
                            ) : (
                              <XCircle className="h-4 w-4 text-muted-foreground mx-auto" />
                            )}
                          </TableCell>
                          <TableCell className="text-center">
                            {doc.needs_apostille ? (
                              <Stamp className="h-4 w-4 text-amber-500 mx-auto" />
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </TableCell>
                          <TableCell className="text-center">
                            {doc.needs_translation ? (
                              <Globe className="h-4 w-4 text-blue-500 mx-auto" />
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </TableCell>
                          {isAdmin && (
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-2">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => handleEdit(doc)}
                                >
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => handleDelete(doc.id)}
                                  disabled={deleteMutation.isPending}
                                >
                                  <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                              </div>
                            </TableCell>
                          )}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </AccordionContent>
            </AccordionItem>
          );
        })}
      </Accordion>
    </div>
  );
}
