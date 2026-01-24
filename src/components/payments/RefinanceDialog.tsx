import { useState, useMemo } from "react";
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
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format, addMonths } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface RefinanceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  outstandingBalance: number;
  opportunityId: string;
  contractId?: string | null;
  clientName: string;
  pendingPaymentIds: string[];
}

export function RefinanceDialog({
  open,
  onOpenChange,
  outstandingBalance,
  opportunityId,
  contractId,
  clientName,
  pendingPaymentIds,
}: RefinanceDialogProps) {
  const [numberOfInstallments, setNumberOfInstallments] = useState(3);
  const [firstDueDate, setFirstDueDate] = useState<Date | undefined>(addMonths(new Date(), 1));
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Generate installment preview
  const installmentPreview = useMemo(() => {
    if (!firstDueDate || numberOfInstallments < 1) return [];

    const installmentAmount = outstandingBalance / numberOfInstallments;
    const installments = [];

    for (let i = 0; i < numberOfInstallments; i++) {
      installments.push({
        number: i + 1,
        amount: installmentAmount,
        dueDate: addMonths(firstDueDate, i),
      });
    }

    return installments;
  }, [outstandingBalance, numberOfInstallments, firstDueDate]);

  const handleRefinance = async () => {
    if (!firstDueDate || numberOfInstallments < 1) {
      toast({ title: "Preencha todos os campos", variant: "destructive" });
      return;
    }

    setIsLoading(true);
    try {
      // 1. Cancel pending payments by updating the reason (status handled separately)
      const { error: cancelError } = await supabase
        .from("payments")
        .update({
          rescheduled_reason: "Reparcelamento - Parcela cancelada para reparcelamento",
          rescheduled_at: new Date().toISOString(),
        })
        .in("id", pendingPaymentIds);

      if (cancelError) throw cancelError;

      // 2. Create new installments
      const installmentAmount = outstandingBalance / numberOfInstallments;
      const newPayments = [];

      for (let i = 0; i < numberOfInstallments; i++) {
        newPayments.push({
          opportunity_id: opportunityId,
          contract_id: contractId,
          amount: parseFloat(installmentAmount.toFixed(2)),
          due_date: format(addMonths(firstDueDate, i), "yyyy-MM-dd"),
          installment_number: i + 1,
          status: "PENDENTE" as const,
          payment_method: "OUTRO" as const,
        });
      }

      const { error: insertError } = await supabase.from("payments").insert(newPayments);

      if (insertError) throw insertError;

      toast({ title: "Reparcelamento realizado com sucesso" });
      queryClient.invalidateQueries({ queryKey: ["payments"] });
      onOpenChange(false);
    } catch (error: any) {
      toast({ title: "Erro ao reparcelar", description: error.message, variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Reparcelar Pagamento</DialogTitle>
          <DialogDescription>
            Dividir o saldo devedor de {clientName} em novas parcelas
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Saldo Devedor</Label>
              <Input value={`€${outstandingBalance.toFixed(2)}`} disabled />
            </div>

            <div className="space-y-2">
              <Label>Número de Parcelas</Label>
              <Input
                type="number"
                min={2}
                max={12}
                value={numberOfInstallments}
                onChange={(e) => setNumberOfInstallments(parseInt(e.target.value) || 2)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Data do Primeiro Vencimento</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-full justify-start text-left font-normal",
                    !firstDueDate && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {firstDueDate ? format(firstDueDate, "PPP", { locale: ptBR }) : "Selecione uma data"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={firstDueDate}
                  onSelect={setFirstDueDate}
                  locale={ptBR}
                  disabled={(date) => date < new Date()}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          </div>

          {installmentPreview.length > 0 && (
            <div className="space-y-2">
              <Label>Preview das Novas Parcelas</Label>
              <div className="border rounded-md max-h-[200px] overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Parcela</TableHead>
                      <TableHead>Valor</TableHead>
                      <TableHead>Vencimento</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {installmentPreview.map((installment) => (
                      <TableRow key={installment.number}>
                        <TableCell>{installment.number}/{numberOfInstallments}</TableCell>
                        <TableCell>€{installment.amount.toFixed(2)}</TableCell>
                        <TableCell>{format(installment.dueDate, "dd/MM/yyyy")}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}

          <div className="bg-muted p-3 rounded-md text-sm">
            <p className="font-medium">Atenção:</p>
            <ul className="list-disc list-inside text-muted-foreground mt-1">
              <li>As parcelas pendentes atuais serão canceladas</li>
              <li>Novas parcelas serão criadas com vencimento mensal</li>
              <li>Os lembretes de cobrança serão reconfigurados automaticamente</li>
            </ul>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleRefinance} disabled={isLoading}>
            {isLoading ? "Processando..." : "Confirmar Reparcelamento"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
