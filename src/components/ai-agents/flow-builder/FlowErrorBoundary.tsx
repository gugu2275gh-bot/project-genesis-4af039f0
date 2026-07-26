import { Component, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
  /** Muda quando o conteúdo é trocado (ex.: outro fluxo) para reiniciar o erro. */
  resetKey?: string;
}

interface State {
  error: Error | null;
}

/** Evita que uma falha no editor visual derrube a tela inteira. */
export class FlowErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidUpdate(prev: Props) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null });
    }
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <Alert variant="destructive" className="m-4">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>O editor de fluxo encontrou um erro</AlertTitle>
        <AlertDescription className="space-y-3">
          <p className="text-xs">{this.state.error.message}</p>
          <Button size="sm" variant="outline" onClick={() => this.setState({ error: null })}>
            <RefreshCw className="h-4 w-4 mr-1" /> Recarregar editor
          </Button>
        </AlertDescription>
      </Alert>
    );
  }
}
