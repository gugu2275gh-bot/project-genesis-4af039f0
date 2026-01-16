import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useNPSCase, useNPS } from '@/hooks/useNPS';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { CheckCircle2, Star } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SERVICE_INTEREST_LABELS } from '@/types/database';

export default function NPSSurvey() {
  const { caseId } = useParams<{ caseId: string }>();
  const { data, isLoading } = useNPSCase(caseId);
  const { submitSurvey } = useNPS();
  
  const [score, setScore] = useState<number | null>(null);
  const [comment, setComment] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async () => {
    if (score === null || !caseId) return;
    
    await submitSurvey.mutateAsync({
      service_case_id: caseId,
      score,
      comment: comment || null,
    });
    
    setSubmitted(true);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-background to-muted flex items-center justify-center p-4">
        <Card className="w-full max-w-lg">
          <CardHeader className="text-center">
            <Skeleton className="h-8 w-48 mx-auto" />
            <Skeleton className="h-4 w-64 mx-auto mt-2" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-32 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!data?.case) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-background to-muted flex items-center justify-center p-4">
        <Card className="w-full max-w-lg">
          <CardHeader className="text-center">
            <CardTitle>Pesquisa não encontrada</CardTitle>
            <CardDescription>
              Esta pesquisa de satisfação não existe ou já foi respondida.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  if (data.existingSurvey || submitted) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-background to-muted flex items-center justify-center p-4">
        <Card className="w-full max-w-lg">
          <CardHeader className="text-center">
            <div className="mx-auto w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mb-4">
              <CheckCircle2 className="h-8 w-8 text-green-600 dark:text-green-400" />
            </div>
            <CardTitle className="text-2xl">Obrigado!</CardTitle>
            <CardDescription className="text-base">
              Sua avaliação foi registrada com sucesso. Agradecemos seu feedback!
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const clientName = data.case.opportunities?.leads?.contacts?.full_name || 'Cliente';
  const serviceType = SERVICE_INTEREST_LABELS[data.case.service_type as keyof typeof SERVICE_INTEREST_LABELS] || data.case.service_type;

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted flex items-center justify-center p-4">
      <Card className="w-full max-w-lg">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Pesquisa de Satisfação</CardTitle>
          <CardDescription className="text-base">
            Olá {clientName}! Gostaríamos de saber sua opinião sobre o serviço de <strong>{serviceType}</strong>.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-8">
          <div className="space-y-4">
            <p className="text-center font-medium">
              De 0 a 10, qual a probabilidade de você nos recomendar a um amigo ou familiar?
            </p>
            
            <div className="grid grid-cols-11 gap-1">
              {[...Array(11)].map((_, i) => (
                <button
                  key={i}
                  onClick={() => setScore(i)}
                  className={cn(
                    "aspect-square rounded-lg border-2 font-semibold transition-all",
                    score === i
                      ? i <= 6
                        ? "bg-red-500 border-red-500 text-white"
                        : i <= 8
                        ? "bg-yellow-500 border-yellow-500 text-white"
                        : "bg-green-500 border-green-500 text-white"
                      : "border-muted-foreground/30 hover:border-primary hover:bg-primary/10"
                  )}
                >
                  {i}
                </button>
              ))}
            </div>
            
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Nada provável</span>
              <span>Muito provável</span>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">
              Deixe um comentário (opcional)
            </label>
            <Textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Conte-nos mais sobre sua experiência..."
              rows={4}
            />
          </div>

          <Button 
            className="w-full" 
            size="lg"
            onClick={handleSubmit}
            disabled={score === null || submitSurvey.isPending}
          >
            {submitSurvey.isPending ? 'Enviando...' : 'Enviar Avaliação'}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
