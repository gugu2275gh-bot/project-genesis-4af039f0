import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { 
  CreditCard, 
  Calendar, 
  CheckCircle,
  AlertCircle,
  Clock,
  Package
} from 'lucide-react';
import { format, addYears } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface TiePickupSectionProps {
  serviceCase: {
    id: string;
    tie_lot_number?: string | null;
    tie_validity_date?: string | null;
    tie_pickup_date?: string | null;
    tie_picked_up?: boolean;
    huellas_completed?: boolean;
    technical_status?: string;
  };
  onUpdate: (data: {
    tie_lot_number?: string;
    tie_validity_date?: string;
    tie_pickup_date?: string;
    tie_picked_up?: boolean;
  }) => void;
  isUpdating?: boolean;
}

export function TiePickupSection({ serviceCase, onUpdate, isUpdating }: TiePickupSectionProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isPickupDialogOpen, setIsPickupDialogOpen] = useState(false);
  const [formData, setFormData] = useState({
    tie_lot_number: serviceCase.tie_lot_number || '',
    tie_validity_date: serviceCase.tie_validity_date || '',
  });
  const [pickupDate, setPickupDate] = useState(format(new Date(), 'yyyy-MM-dd'));

  const isAvailable = !!serviceCase.tie_lot_number;
  const isPickedUp = serviceCase.tie_picked_up;
  const huellasCompleted = serviceCase.huellas_completed;

  const handleRegisterTie = () => {
    // Se não tiver data de validade, assume 1 ano a partir de hoje
    const validityDate = formData.tie_validity_date || format(addYears(new Date(), 1), 'yyyy-MM-dd');
    onUpdate({
      tie_lot_number: formData.tie_lot_number,
      tie_validity_date: validityDate,
    });
    setIsDialogOpen(false);
  };

  const handleConfirmPickup = () => {
    onUpdate({
      tie_pickup_date: pickupDate,
      tie_picked_up: true,
    });
    setIsPickupDialogOpen(false);
  };

  if (!huellasCompleted) {
    return (
      <Card className="opacity-60">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-lg flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-muted-foreground" />
            Retirada do TIE
          </CardTitle>
          <Badge variant="outline">
            <Clock className="h-3 w-3 mr-1" />
            Aguardando Huellas
          </Badge>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground text-center py-4">
            A retirada do TIE ficará disponível após a realização da tomada de huellas.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-lg flex items-center gap-2">
          <CreditCard className="h-5 w-5 text-primary" />
          Retirada do TIE
        </CardTitle>
        {isPickedUp ? (
          <Badge className="bg-green-100 text-green-800">
            <CheckCircle className="h-3 w-3 mr-1" />
            Retirado
          </Badge>
        ) : isAvailable ? (
          <Badge className="bg-amber-100 text-amber-800">
            <Package className="h-3 w-3 mr-1" />
            Disponível
          </Badge>
        ) : (
          <Badge variant="outline">
            <AlertCircle className="h-3 w-3 mr-1" />
            Aguardando
          </Badge>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {isAvailable ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="p-3 bg-muted rounded-lg">
                <p className="text-xs text-muted-foreground">Número do Lote</p>
                <p className="font-mono font-semibold">{serviceCase.tie_lot_number}</p>
              </div>
              
              <div className="p-3 bg-muted rounded-lg">
                <p className="text-xs text-muted-foreground">Validade</p>
                <p className="font-semibold">
                  {serviceCase.tie_validity_date 
                    ? format(new Date(serviceCase.tie_validity_date), 'dd/MM/yyyy', { locale: ptBR })
                    : 'Não informada'}
                </p>
              </div>
            </div>

            {isPickedUp ? (
              <div className="p-4 bg-green-50 dark:bg-green-950 rounded-lg border border-green-200 dark:border-green-800">
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-5 w-5 text-green-600" />
                  <div>
                    <p className="font-medium text-green-800 dark:text-green-200">TIE Retirado</p>
                    <p className="text-sm text-green-600 dark:text-green-400">
                      {serviceCase.tie_pickup_date 
                        ? `Em ${format(new Date(serviceCase.tie_pickup_date), 'dd/MM/yyyy', { locale: ptBR })}`
                        : 'Data não registrada'}
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <Dialog open={isPickupDialogOpen} onOpenChange={setIsPickupDialogOpen}>
                <DialogTrigger asChild>
                  <Button className="w-full">
                    <CheckCircle className="h-4 w-4 mr-2" />
                    Confirmar Retirada
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Confirmar Retirada do TIE</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4 pt-4">
                    <p className="text-sm text-muted-foreground">
                      Confirme a data em que o cliente retirou o TIE.
                    </p>
                    <div className="space-y-2">
                      <Label>Data da Retirada</Label>
                      <Input
                        type="date"
                        value={pickupDate}
                        onChange={(e) => setPickupDate(e.target.value)}
                      />
                    </div>
                    <div className="bg-muted p-3 rounded-md space-y-1">
                      <p className="text-sm"><strong>Lote:</strong> {serviceCase.tie_lot_number}</p>
                      <p className="text-sm">
                        <strong>Validade:</strong> {serviceCase.tie_validity_date 
                          ? format(new Date(serviceCase.tie_validity_date), 'dd/MM/yyyy', { locale: ptBR })
                          : 'N/A'}
                      </p>
                    </div>
                    <Button onClick={handleConfirmPickup} className="w-full" disabled={isUpdating}>
                      {isUpdating ? 'Salvando...' : 'Confirmar Retirada'}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            )}
          </div>
        ) : (
          <div className="text-center py-4">
            <p className="text-muted-foreground mb-4">
              Aguardando confirmação de disponibilidade do TIE.
            </p>
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Package className="h-4 w-4 mr-2" />
                  Registrar TIE Disponível
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Registrar Disponibilidade do TIE</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 pt-4">
                  <div className="space-y-2">
                    <Label>Número do Lote *</Label>
                    <Input
                      value={formData.tie_lot_number}
                      onChange={(e) => setFormData({ ...formData, tie_lot_number: e.target.value })}
                      placeholder="Ex: LOT-2024-12345"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Data de Validade</Label>
                    <Input
                      type="date"
                      value={formData.tie_validity_date}
                      onChange={(e) => setFormData({ ...formData, tie_validity_date: e.target.value })}
                    />
                    <p className="text-xs text-muted-foreground">
                      Se não informada, será considerada validade de 1 ano.
                    </p>
                  </div>
                  <Button 
                    onClick={handleRegisterTie} 
                    className="w-full" 
                    disabled={isUpdating || !formData.tie_lot_number}
                  >
                    {isUpdating ? 'Salvando...' : 'Registrar TIE'}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
