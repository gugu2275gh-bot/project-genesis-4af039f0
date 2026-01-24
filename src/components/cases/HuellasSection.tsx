import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { 
  Fingerprint, 
  Calendar, 
  MapPin, 
  Clock, 
  CheckCircle,
  AlertCircle,
  FileText
} from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface HuellasSectionProps {
  serviceCase: {
    id: string;
    huellas_date?: string | null;
    huellas_time?: string | null;
    huellas_location?: string | null;
    huellas_completed?: boolean;
    technical_status?: string;
  };
  onUpdate: (data: {
    huellas_date?: string;
    huellas_time?: string;
    huellas_location?: string;
    huellas_completed?: boolean;
  }) => void;
  isUpdating?: boolean;
}

export function HuellasSection({ serviceCase, onUpdate, isUpdating }: HuellasSectionProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [formData, setFormData] = useState({
    huellas_date: serviceCase.huellas_date || '',
    huellas_time: serviceCase.huellas_time || '',
    huellas_location: serviceCase.huellas_location || '',
  });

  const isScheduled = !!serviceCase.huellas_date;
  const isCompleted = serviceCase.huellas_completed;
  const isPastDate = serviceCase.huellas_date && new Date(serviceCase.huellas_date) < new Date();

  const handleSchedule = () => {
    onUpdate(formData);
    setIsDialogOpen(false);
  };

  const handleMarkCompleted = () => {
    onUpdate({ huellas_completed: true });
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-lg flex items-center gap-2">
          <Fingerprint className="h-5 w-5 text-primary" />
          Tomada de Huellas
        </CardTitle>
        {isCompleted ? (
          <Badge className="bg-green-100 text-green-800">
            <CheckCircle className="h-3 w-3 mr-1" />
            Realizada
          </Badge>
        ) : isScheduled ? (
          <Badge variant="secondary">
            <Calendar className="h-3 w-3 mr-1" />
            Agendada
          </Badge>
        ) : (
          <Badge variant="outline">
            <AlertCircle className="h-3 w-3 mr-1" />
            Pendente
          </Badge>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {isScheduled ? (
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-4">
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">Data</p>
                  <p className="font-medium">
                    {format(new Date(serviceCase.huellas_date!), 'dd/MM/yyyy', { locale: ptBR })}
                  </p>
                </div>
              </div>
              
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">Horário</p>
                  <p className="font-medium">{serviceCase.huellas_time || 'Não definido'}</p>
                </div>
              </div>
              
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">Local</p>
                  <p className="font-medium">{serviceCase.huellas_location || 'Não definido'}</p>
                </div>
              </div>
            </div>

            {!isCompleted && (
              <div className="flex gap-2 pt-2">
                <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                  <DialogTrigger asChild>
                    <Button variant="outline" size="sm">
                      Reagendar
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Agendar Tomada de Huellas</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 pt-4">
                      <div className="space-y-2">
                        <Label>Data *</Label>
                        <Input
                          type="date"
                          value={formData.huellas_date}
                          onChange={(e) => setFormData({ ...formData, huellas_date: e.target.value })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Horário</Label>
                        <Input
                          type="time"
                          value={formData.huellas_time}
                          onChange={(e) => setFormData({ ...formData, huellas_time: e.target.value })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Local</Label>
                        <Input
                          value={formData.huellas_location}
                          onChange={(e) => setFormData({ ...formData, huellas_location: e.target.value })}
                          placeholder="Endereço da delegacia"
                        />
                      </div>
                      <Button onClick={handleSchedule} className="w-full" disabled={isUpdating}>
                        {isUpdating ? 'Salvando...' : 'Confirmar Agendamento'}
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>

                {isPastDate && (
                  <Button size="sm" onClick={handleMarkCompleted} disabled={isUpdating}>
                    <CheckCircle className="h-4 w-4 mr-2" />
                    Marcar como Realizada
                  </Button>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="text-center py-4">
            <p className="text-muted-foreground mb-4">
              Aguardando aprovação do processo para agendar a tomada de huellas.
            </p>
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Calendar className="h-4 w-4 mr-2" />
                  Agendar Huellas
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Agendar Tomada de Huellas</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 pt-4">
                  <div className="space-y-2">
                    <Label>Data *</Label>
                    <Input
                      type="date"
                      value={formData.huellas_date}
                      onChange={(e) => setFormData({ ...formData, huellas_date: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Horário</Label>
                    <Input
                      type="time"
                      value={formData.huellas_time}
                      onChange={(e) => setFormData({ ...formData, huellas_time: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Local</Label>
                    <Input
                      value={formData.huellas_location}
                      onChange={(e) => setFormData({ ...formData, huellas_location: e.target.value })}
                      placeholder="Endereço da delegacia"
                    />
                  </div>
                  <Button onClick={handleSchedule} className="w-full" disabled={isUpdating || !formData.huellas_date}>
                    {isUpdating ? 'Salvando...' : 'Confirmar Agendamento'}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        )}

        {isScheduled && !isCompleted && (
          <>
            <Separator />
            <div className="space-y-2">
              <h4 className="text-sm font-medium flex items-center gap-2">
                <FileText className="h-4 w-4" />
                Documentos para levar
              </h4>
              <ul className="text-sm text-muted-foreground space-y-1 ml-6 list-disc">
                <li>Passaporte original</li>
                <li>Resguardo da solicitud</li>
                <li>Formulário EX17 preenchido</li>
                <li>Comprovante de pagamento Taxa 790/012</li>
                <li>Foto 3x4 fundo branco (2 unidades)</li>
              </ul>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
