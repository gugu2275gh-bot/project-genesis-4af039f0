import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Database } from 'lucide-react';

/** Rótulo amigável + destino real no banco para cada `field_mapping` do fluxo. */
const FIELD_INFO: Record<string, { label: string; target: string }> = {
  'contact.full_name': { label: 'Nome completo', target: 'contacts.full_name' },
  'contact.email': { label: 'E-mail', target: 'contacts.email' },
  'contact.phone': { label: 'Telefone', target: 'contacts.phone' },
  'contact.birth_date': { label: 'Data de nascimento', target: 'contacts.birth_date' },
  'contact.age': { label: 'Idade', target: 'contacts.age' },
  'contact.residence_country': { label: 'País onde mora', target: 'contacts.residence_country' },
  'contact.city': { label: 'Cidade', target: 'contacts.city' },
  'contact.is_in_spain': { label: 'Está na Espanha', target: 'contacts.is_in_spain' },
  'contact.is_empadronado': { label: 'Empadronado', target: 'contacts.is_empadronado' },
  'contact.empadronamiento_city': { label: 'Cidade do empadronamiento', target: 'contacts.empadronamiento_city' },
  'contact.empadronamiento_since': { label: 'Empadronado desde', target: 'contacts.empadronamiento_since' },
  'contact.spain_arrival_date': { label: 'Data de entrada na Espanha', target: 'contacts.spain_arrival_date' },
  'contact.education_level': { label: 'Formação superior', target: 'contacts.education_level' },
  'contact.works_remotely': { label: 'Trabalha remoto', target: 'contacts.works_remotely' },
  'contact.has_european_family': { label: 'Familiar europeu', target: 'contacts.has_european_family' },
  'contact.was_in_europe_6m': { label: 'Esteve na Europa (6 meses)', target: 'contacts.was_in_europe_6m' },
  'contact.nationality': { label: 'Nacionalidade', target: 'contacts.nationality' },
  'lead.service_interest': { label: 'Serviço de interesse', target: 'leads.service_interest' },
  'lead.service_type_id': { label: 'Serviço (catálogo)', target: 'leads.service_type_id' },
  'lead.notes': { label: 'Observações', target: 'leads.notes' },
  'lead.objective': { label: 'Objetivo na Espanha', target: 'leads.notes' },
};

function info(field: string) {
  const known = FIELD_INFO[field];
  if (known) return known;
  const [prefix, ...rest] = field.split('.');
  const column = rest.join('.') || field;
  const table = prefix === 'contact' ? 'contacts' : prefix === 'lead' ? 'leads' : prefix;
  return { label: column.replace(/_/g, ' '), target: `${table}.${column}` };
}

interface Props {
  captured: Record<string, string>;
}

export function CapturedFieldsCard({ captured }: Props) {
  const entries = Object.entries(captured || {}).filter(([, v]) => String(v || '').trim());

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Database className="h-4 w-4" /> Dados reconhecidos
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          O que seria gravado na ficha do cliente fora do ambiente de testes. Nada é salvo durante o teste.
        </p>
      </CardHeader>
      <CardContent>
        {entries.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum dado reconhecido ainda.</p>
        ) : (
          <div className="space-y-2">
            {entries.map(([field, value]) => {
              const meta = info(field);
              return (
                <div
                  key={field}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-muted/30 px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium capitalize truncate">{meta.label}</p>
                    <p className="text-[11px] text-muted-foreground font-mono">{meta.target}</p>
                  </div>
                  <Badge variant="secondary" className="max-w-[55%] truncate">{value}</Badge>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
