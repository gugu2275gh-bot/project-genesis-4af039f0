import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format, addDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

interface RescheduleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  payment: {
    id: string;
    amount: number;
    due_date: string | null;
    opportunities?: {
      leads?: {
        contacts?: {
          full_name: string;
          phone?: number | null;
        } | null;
      };
    };
  };
}

export function RescheduleDialog({ open, onOpenChange, payment }: RescheduleDialogProps) {
  const [newDueDate, setNewDueDate] = useState<Date | undefined>(
    payment.due_date ? new Date(payment.due_date) : addDays(new Date(), 7)
  );
  const [reason, setReason] = useState("");
  const [notifyClient, setNotifyClient] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const clientName = payment.opportunities?.leads?.contacts?.full_name || "Cliente";

  const handleReschedule = async () => {
    if (!newDueDate) {
      toast({ title: "Selecione uma nova data", variant: "destructive" });
      return;
    }

    setIsLoading(true);
    try {
      const { error } = await supabase
        .from("payments")
        .update({
          original_due_date: payment.due_date,
          due_date: format(newDueDate, "yyyy-MM-dd"),
          rescheduled_at: new Date().toISOString(),
          rescheduled_reason: reason || null,
        })
        .eq("id", payment.id);

      if (error) throw error;

      // TODO: Send WhatsApp notification if notifyClient is true
      if (notifyClient) {
        console.log("Would send notification to client about rescheduled payment");
      }

      toast({ title: "Pagamento prorrogado com sucesso" });
      queryClient.invalidateQueries({ queryKey: ["payments"] });
      onOpenChange(false);
    } catch (error: any) {
      toast({ title: "Erro ao prorrogar pagamento", description: error.message, variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Prorrogar Pagamento</DialogTitle>
          <DialogDescription>
            Alterar a data de vencimento para {clientName} - €{payment.amount.toFixed(2)}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Data Original</Label>
            <Input
              value={payment.due_date ? format(new Date(payment.due_date), "dd/MM/yyyy") : "Não definida"}
              disabled
            />
          </div>

          <div className="space-y-2">
            <Label>Nova Data de Vencimento</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-full justify-start text-left font-normal",
                    !newDueDate && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {newDueDate ? format(newDueDate, "PPP", { locale: ptBR }) : "Selecione uma data"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={newDueDate}
                  onSelect={setNewDueDate}
                  locale={ptBR}
                  disabled={(date) => date < new Date()}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          </div>

          <div className="space-y-2">
            <Label>Motivo da Prorrogação</Label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Ex: Cliente solicitou prazo adicional devido a dificuldades financeiras temporárias"
              rows={3}
            />
          </div>

          <div className="flex items-center space-x-2">
            <Checkbox
              id="notify"
              checked={notifyClient}
              onCheckedChange={(checked) => setNotifyClient(checked as boolean)}
            />
            <Label htmlFor="notify" className="text-sm font-normal">
              Enviar notificação ao cliente via WhatsApp
            </Label>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleReschedule} disabled={isLoading}>
            {isLoading ? "Salvando..." : "Confirmar Prorrogação"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
