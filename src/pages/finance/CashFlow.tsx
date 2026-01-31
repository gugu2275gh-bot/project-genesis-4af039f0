import { useState } from 'react';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DataTable, Column } from '@/components/ui/data-table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  Plus, 
  TrendingUp, 
  TrendingDown, 
  Wallet,
  ArrowUpCircle,
  ArrowDownCircle,
  Calendar
} from 'lucide-react';
import { useCashFlow, CashFlowEntry, CashFlowInsert } from '@/hooks/useCashFlow';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const PAYMENT_ACCOUNTS = [
  { value: 'BRUCKSCHEN_ES', label: 'Bruckschen (Espanha)' },
  { value: 'PIX_BR', label: 'PIX (Brasil)' },
  { value: 'PAYPAL', label: 'PayPal' },
  { value: 'DINHEIRO', label: 'Dinheiro' },
  { value: 'OUTRO', label: 'Outro' },
];

const ENTRY_CATEGORIES = [
  { value: 'SERVICOS', label: 'Serviços' },
  { value: 'COMISSAO_RECEBIDA', label: 'Comissão Recebida' },
  { value: 'APORTE', label: 'Aporte de Capital' },
  { value: 'OUTROS', label: 'Outros' },
];

const EXIT_CATEGORIES = [
  { value: 'DESPESA_FIXA', label: 'Despesa Fixa' },
  { value: 'DESPESA_VARIAVEL', label: 'Despesa Variável' },
  { value: 'COMISSAO_PAGA', label: 'Comissão Paga' },
  { value: 'TAXA_OFICIAL', label: 'Taxa Oficial' },
  { value: 'OUTROS', label: 'Outros' },
];

export default function CashFlow() {
  const today = new Date();
  const [startDate, setStartDate] = useState(format(startOfMonth(today), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(format(endOfMonth(today), 'yyyy-MM-dd'));
  
  const { 
    entries, 
    categories,
    isLoading, 
    createEntry,
    deleteEntry,
    totalEntradas,
    totalSaidas,
    saldo,
    byCategory,
  } = useCashFlow(startDate, endDate);
  
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [formData, setFormData] = useState<CashFlowInsert>({
    type: 'ENTRADA',
    category: '',
    amount: 0,
    description: '',
    payment_account: '',
    reference_date: format(today, 'yyyy-MM-dd'),
  });

  const handleSubmit = () => {
    createEntry.mutate(formData, {
      onSuccess: () => {
        setIsDialogOpen(false);
        setFormData({
          type: 'ENTRADA',
          category: '',
          amount: 0,
          description: '',
          payment_account: '',
          reference_date: format(today, 'yyyy-MM-dd'),
        });
      },
    });
  };

  const columns: Column<CashFlowEntry>[] = [
    {
      key: 'reference_date',
      header: 'Data',
      cell: (item) => format(new Date(item.reference_date), 'dd/MM/yyyy', { locale: ptBR }),
    },
    {
      key: 'type',
      header: 'Tipo',
      cell: (item) => (
        <Badge variant={item.type === 'ENTRADA' ? 'default' : 'destructive'}>
          {item.type === 'ENTRADA' ? (
            <><ArrowUpCircle className="h-3 w-3 mr-1" /> Entrada</>
          ) : (
            <><ArrowDownCircle className="h-3 w-3 mr-1" /> Saída</>
          )}
        </Badge>
      ),
    },
    {
      key: 'category',
      header: 'Categoria',
      cell: (item) => (
        <div>
          <p className="font-medium">{item.category}</p>
          {item.subcategory && (
            <p className="text-xs text-muted-foreground">{item.subcategory}</p>
          )}
        </div>
      ),
    },
    {
      key: 'description',
      header: 'Descrição',
      cell: (item) => item.description || '-',
    },
    {
      key: 'payment_account',
      header: 'Conta',
      cell: (item) => {
        const account = PAYMENT_ACCOUNTS.find(a => a.value === item.payment_account);
        return account?.label || item.payment_account || '-';
      },
    },
    {
      key: 'is_invoiced',
      header: 'Faturado',
      cell: (item) => (
        item.type === 'ENTRADA' ? (
          item.is_invoiced 
            ? <Badge className="bg-success text-success-foreground">{item.invoice_number}</Badge>
            : <Badge variant="secondary">{item.invoice_number || 'Não'}</Badge>
        ) : (
          <span className="text-muted-foreground">-</span>
        )
      ),
    },
    {
      key: 'amount',
      header: 'Valor',
      cell: (item) => (
        <span className={item.type === 'ENTRADA' ? 'text-green-600 font-semibold' : 'text-destructive font-semibold'}>
          {item.type === 'ENTRADA' ? '+' : '-'}€{item.amount.toFixed(2)}
        </span>
      ),
    },
  ];

  // Dados para gráfico por categoria
  const categoryData = byCategory.map(cat => ({
    name: cat.category,
    value: cat.total,
    type: cat.type,
  }));

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-48" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Fluxo de Caixa"
        description="Controle de entradas e saídas financeiras"
      >
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Novo Lançamento
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Novo Lançamento</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Tipo</Label>
                  <Select 
                    value={formData.type} 
                    onValueChange={(v: 'ENTRADA' | 'SAIDA') => 
                      setFormData({ ...formData, type: v, category: '' })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ENTRADA">Entrada</SelectItem>
                      <SelectItem value="SAIDA">Saída</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Data</Label>
                  <Input
                    type="date"
                    value={formData.reference_date}
                    onChange={(e) => setFormData({ ...formData, reference_date: e.target.value })}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Categoria</Label>
                <Select 
                  value={formData.category} 
                  onValueChange={(v) => setFormData({ ...formData, category: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    {(formData.type === 'ENTRADA' ? ENTRY_CATEGORIES : EXIT_CATEGORIES).map((cat) => (
                      <SelectItem key={cat.value} value={cat.value}>
                        {cat.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {formData.type === 'SAIDA' && formData.category === 'DESPESA_FIXA' && (
                <div className="space-y-2">
                  <Label>Subcategoria</Label>
                  <Select 
                    value={formData.subcategory || ''} 
                    onValueChange={(v) => setFormData({ ...formData, subcategory: v })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent>
                      {categories.filter(c => c.type === 'FIXA').map((cat) => (
                        <SelectItem key={cat.id} value={cat.name}>
                          {cat.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="space-y-2">
                <Label>Descrição</Label>
                <Input
                  value={formData.description || ''}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Descrição do lançamento"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Valor (€)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={formData.amount}
                    onChange={(e) => setFormData({ ...formData, amount: parseFloat(e.target.value) || 0 })}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Conta</Label>
                  <Select 
                    value={formData.payment_account || ''} 
                    onValueChange={(v) => setFormData({ ...formData, payment_account: v })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent>
                      {PAYMENT_ACCOUNTS.map((acc) => (
                        <SelectItem key={acc.value} value={acc.value}>
                          {acc.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <Button onClick={handleSubmit} className="w-full" disabled={createEntry.isPending}>
                {createEntry.isPending ? 'Salvando...' : 'Registrar Lançamento'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </PageHeader>

      {/* Filtro de período */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-4">
            <Calendar className="h-5 w-5 text-muted-foreground" />
            <div className="flex items-center gap-2">
              <Label>De:</Label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-40"
              />
            </div>
            <div className="flex items-center gap-2">
              <Label>Até:</Label>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-40"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Entradas</CardTitle>
            <TrendingUp className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">€{totalEntradas.toFixed(2)}</div>
            <p className="text-xs text-muted-foreground">
              {entries.filter(e => e.type === 'ENTRADA').length} lançamentos
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Saídas</CardTitle>
            <TrendingDown className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">€{totalSaidas.toFixed(2)}</div>
            <p className="text-xs text-muted-foreground">
              {entries.filter(e => e.type === 'SAIDA').length} lançamentos
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Saldo do Período</CardTitle>
            <Wallet className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${saldo >= 0 ? 'text-green-600' : 'text-destructive'}`}>
              €{saldo.toFixed(2)}
            </div>
            <p className="text-xs text-muted-foreground">
              {saldo >= 0 ? 'Lucro' : 'Prejuízo'} no período
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Resumo por categoria */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Entradas por Categoria</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {categoryData.filter(c => c.type === 'ENTRADA').map((cat, i) => (
                <div key={i} className="flex justify-between items-center">
                  <span className="text-sm">{cat.name}</span>
                  <span className="font-semibold text-green-600">€{cat.value.toFixed(2)}</span>
                </div>
              ))}
              {categoryData.filter(c => c.type === 'ENTRADA').length === 0 && (
                <p className="text-sm text-muted-foreground">Nenhuma entrada no período</p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Saídas por Categoria</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {categoryData.filter(c => c.type === 'SAIDA').map((cat, i) => (
                <div key={i} className="flex justify-between items-center">
                  <span className="text-sm">{cat.name}</span>
                  <span className="font-semibold text-destructive">€{cat.value.toFixed(2)}</span>
                </div>
              ))}
              {categoryData.filter(c => c.type === 'SAIDA').length === 0 && (
                <p className="text-sm text-muted-foreground">Nenhuma saída no período</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabela de lançamentos */}
      <Tabs defaultValue="all">
        <TabsList>
          <TabsTrigger value="all">Todos ({entries.length})</TabsTrigger>
          <TabsTrigger value="entradas">
            Entradas ({entries.filter(e => e.type === 'ENTRADA').length})
          </TabsTrigger>
          <TabsTrigger value="saidas">
            Saídas ({entries.filter(e => e.type === 'SAIDA').length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="all" className="mt-4">
          <DataTable columns={columns} data={entries} emptyMessage="Nenhum lançamento no período" />
        </TabsContent>

        <TabsContent value="entradas" className="mt-4">
          <DataTable 
            columns={columns} 
            data={entries.filter(e => e.type === 'ENTRADA')} 
            emptyMessage="Nenhuma entrada no período" 
          />
        </TabsContent>

        <TabsContent value="saidas" className="mt-4">
          <DataTable 
            columns={columns} 
            data={entries.filter(e => e.type === 'SAIDA')} 
            emptyMessage="Nenhuma saída no período" 
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
