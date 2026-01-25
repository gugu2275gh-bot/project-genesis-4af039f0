import { useState } from "react";
import { useContractNotes } from "@/hooks/useContractNotes";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Plus, FileText, RefreshCw, StickyNote, Trash2, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

interface ContractNotesSectionProps {
  contractId: string;
}

const noteTypeConfig = {
  ACORDO: {
    label: 'Acordo',
    icon: RefreshCw,
    color: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  },
  OBSERVACAO: {
    label: 'Observação',
    icon: StickyNote,
    color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  },
  HISTORICO: {
    label: 'Histórico',
    icon: FileText,
    color: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200',
  },
};

export function ContractNotesSection({ contractId }: ContractNotesSectionProps) {
  const { notes, isLoading, addNote, deleteNote } = useContractNotes(contractId);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [newNote, setNewNote] = useState("");
  const [noteType, setNoteType] = useState<'ACORDO' | 'OBSERVACAO' | 'HISTORICO'>('ACORDO');

  const handleAddNote = () => {
    if (!newNote.trim()) return;
    
    addNote.mutate(
      { note: newNote, noteType },
      {
        onSuccess: () => {
          setNewNote("");
          setNoteType('ACORDO');
          setIsDialogOpen(false);
        },
      }
    );
  };

  const handleDeleteNote = (noteId: string) => {
    if (confirm("Tem certeza que deseja remover esta nota?")) {
      deleteNote.mutate(noteId);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
        <CardTitle className="text-lg flex items-center gap-2">
          <FileText className="h-5 w-5" />
          Histórico de Acordos
        </CardTitle>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="h-4 w-4 mr-1" />
              Adicionar Nota
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Nova Nota de Acordo</DialogTitle>
              <DialogDescription>
                Registre acordos, observações ou alterações contratuais.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Tipo</label>
                <Select value={noteType} onValueChange={(v) => setNoteType(v as typeof noteType)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ACORDO">🔄 Acordo (Reparcelamento, Ajuste)</SelectItem>
                    <SelectItem value="OBSERVACAO">📝 Observação (Prorrogação, Solicitação)</SelectItem>
                    <SelectItem value="HISTORICO">📋 Histórico (Registro geral)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Descrição</label>
                <Textarea
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                  placeholder="Ex: Parcelamento reajustado em 10/10/2025: 2ª parcela dividida em duas de €375,00 com vencimentos em 15/11 e 15/12."
                  rows={4}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={handleAddNote} disabled={!newNote.trim() || addNote.isPending}>
                {addNote.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                    Salvando...
                  </>
                ) : (
                  "Salvar Nota"
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : notes.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <StickyNote className="h-12 w-12 mx-auto mb-2 opacity-50" />
            <p>Nenhuma nota registrada.</p>
            <p className="text-sm">Clique em "Adicionar Nota" para registrar acordos ou observações.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {notes.map((note) => {
              const config = noteTypeConfig[note.note_type];
              const Icon = config.icon;
              
              return (
                <div
                  key={note.id}
                  className="border rounded-lg p-4 bg-muted/30"
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Badge className={config.color}>
                        <Icon className="h-3 w-3 mr-1" />
                        {config.label}
                      </Badge>
                      <span className="text-sm text-muted-foreground">
                        {note.created_at && format(new Date(note.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                      </span>
                      {note.profiles?.full_name && (
                        <span className="text-sm text-muted-foreground">
                          - {note.profiles.full_name}
                        </span>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-destructive"
                      onClick={() => handleDeleteNote(note.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  <p className="text-sm whitespace-pre-wrap">{note.note}</p>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
