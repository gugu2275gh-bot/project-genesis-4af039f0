import { useContactSuggestions, getFieldLabel } from '@/hooks/useContactSuggestions';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Check, X, MessageSquare } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface DataSuggestionsPanelProps {
  contactId: string;
}

export default function DataSuggestionsPanel({ contactId }: DataSuggestionsPanelProps) {
  const { suggestions, isLoading, acceptSuggestion, rejectSuggestion } = useContactSuggestions(contactId);

  if (isLoading || suggestions.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <MessageSquare className="h-4 w-4" />
            Sugestões do Chat
          </CardTitle>
          <Badge variant="secondary" className="text-xs">
            {suggestions.length} pendente{suggestions.length > 1 ? 's' : ''}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {suggestions.map((s) => (
          <div
            key={s.id}
            className="flex items-center justify-between gap-2 p-2.5 rounded-md border bg-muted/30 text-sm"
          >
            <div className="flex-1 min-w-0">
              <p className="text-xs text-muted-foreground">{getFieldLabel(s.field_name)}</p>
              <div className="flex items-center gap-1.5 mt-0.5">
                {s.current_value && (
                  <>
                    <span className="text-muted-foreground line-through truncate max-w-[100px]">
                      {s.current_value}
                    </span>
                    <span className="text-muted-foreground">→</span>
                  </>
                )}
                <span className="font-medium truncate">{s.suggested_value}</span>
              </div>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                {formatDistanceToNow(new Date(s.created_at), { addSuffix: true, locale: ptBR })}
              </p>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground hover:text-green-600"
                onClick={() => acceptSuggestion.mutate({ suggestion: s })}
                disabled={acceptSuggestion.isPending}
              >
                <Check className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground hover:text-destructive"
                onClick={() => rejectSuggestion.mutate(s.id)}
                disabled={rejectSuggestion.isPending}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
