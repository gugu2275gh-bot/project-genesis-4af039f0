import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Receipt } from 'lucide-react';

export default function Receipts() {
  return (
    <div className="space-y-6">
      <PageHeader title="Recibos" description="Emissão e gestão de recibos financeiros" />
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Receipt className="h-5 w-5" /> Recibos
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Em breve: listagem, emissão e download de recibos.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
