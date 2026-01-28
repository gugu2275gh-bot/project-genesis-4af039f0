import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { 
  StickyNote, 
  Plus, 
  Trash2,
  MessageSquare,
  AlertTriangle,
  Info,
  CheckCircle
} from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useCaseNotes } from '@/hooks/useCaseNotes';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

const NOTE_TYPES = {
  GENERAL: { label: 'Geral', icon: MessageSquare, color: 'bg-muted text-muted-foreground' },
  IMPORTANT: { label: 'Importante', icon: AlertTriangle, color: 'bg-amber-100 text-amber-800' },
  INFO: { label: 'Informação', icon: Info, color: 'bg-blue-100 text-blue-800' },
  RESOLVED: { label: 'Resolvido', icon: CheckCircle, color: 'bg-green-100 text-green-800' },
};

interface TechnicalNotesSectionProps {
  serviceCaseId: string;
}

export function TechnicalNotesSection({ serviceCaseId }: TechnicalNotesSectionProps) {
  const [isAdding, setIsAdding] = useState(false);
  const [newNote, setNewNote] = useState('');
  const [noteType, setNoteType] = useState<string>('GENERAL');
  
  const { notes, isLoading, createNote, deleteNote } = useCaseNotes(serviceCaseId);

  const handleAddNote = async () => {
    if (!newNote.trim()) return;
    
    await createNote.mutateAsync({ note: newNote, note_type: noteType });
    setNewNote('');
    setNoteType('GENERAL');
    setIsAdding(false);
  };

  const handleDeleteNote = async (id: string) => {
    await deleteNote.mutateAsync(id);
  };

  const getNoteTypeConfig = (type: string | null) => {
    return NOTE_TYPES[type as keyof typeof NOTE_TYPES] || NOTE_TYPES.GENERAL;
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <StickyNote className="h-4 w-4 text-muted-foreground" />
          Notas do Técnico
          {notes.length > 0 && (
            <Badge variant="secondary" className="ml-1">{notes.length}</Badge>
          )}
        </CardTitle>
        {!isAdding && (
          <Button variant="ghost" size="sm" onClick={() => setIsAdding(true)}>
            <Plus className="h-4 w-4" />
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {isAdding && (
          <div className="space-y-3 mb-4 p-3 bg-muted/50 rounded-lg">
            <Textarea
              placeholder="Adicionar anotação sobre o caso..."
              value={newNote}
              onChange={(e) => setNewNote(e.target.value)}
              className="min-h-[80px] resize-none"
            />
            <div className="flex items-center justify-between gap-2">
              <Select value={noteType} onValueChange={setNoteType}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="Tipo" />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(NOTE_TYPES).map(([key, config]) => (
                    <SelectItem key={key} value={key}>
                      <div className="flex items-center gap-2">
                        <config.icon className="h-3 w-3" />
                        {config.label}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="flex gap-2">
                <Button 
                  variant="ghost" 
                  size="sm"
                  onClick={() => {
                    setIsAdding(false);
                    setNewNote('');
                  }}
                >
                  Cancelar
                </Button>
                <Button 
                  size="sm"
                  onClick={handleAddNote}
                  disabled={!newNote.trim() || createNote.isPending}
                >
                  {createNote.isPending ? 'Salvando...' : 'Salvar'}
                </Button>
              </div>
            </div>
          </div>
        )}

        <ScrollArea className="h-[200px]">
          {isLoading ? (
            <div className="flex items-center justify-center h-full">
              <div className="animate-spin h-5 w-5 border-2 border-primary border-t-transparent rounded-full" />
            </div>
          ) : notes.length === 0 ? (
            <div className="text-center py-8">
              <StickyNote className="h-8 w-8 mx-auto text-muted-foreground/50 mb-2" />
              <p className="text-sm text-muted-foreground">
                Nenhuma nota registrada
              </p>
              {!isAdding && (
                <Button 
                  variant="link" 
                  size="sm" 
                  onClick={() => setIsAdding(true)}
                  className="mt-1"
                >
                  Adicionar nota
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-3 pr-4">
              {notes.map((note) => {
                const typeConfig = getNoteTypeConfig(note.note_type);
                const Icon = typeConfig.icon;
                
                return (
                  <div 
                    key={note.id}
                    className="group relative p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
                  >
                    <div className="flex items-start gap-2">
                      <Badge variant="outline" className={`${typeConfig.color} shrink-0`}>
                        <Icon className="h-3 w-3" />
                      </Badge>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm whitespace-pre-wrap break-words">
                          {note.note}
                        </p>
                        <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                          <span>
                            {note.created_at && format(new Date(note.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                          </span>
                          {note.created_by_profile?.full_name && (
                            <>
                              <span>•</span>
                              <span>{note.created_by_profile.full_name}</span>
                            </>
                          )}
                        </div>
                      </div>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button 
                            variant="ghost" 
                            size="icon"
                            className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                          >
                            <Trash2 className="h-3 w-3 text-muted-foreground hover:text-destructive" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Remover nota</AlertDialogTitle>
                            <AlertDialogDescription>
                              Esta ação não pode ser desfeita. Deseja realmente remover esta nota?
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                            <AlertDialogAction onClick={() => handleDeleteNote(note.id)}>
                              Remover
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
