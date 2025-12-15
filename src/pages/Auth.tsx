import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Building2, Loader2, Mail, ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';

type AuthMode = 'login' | 'forgot-password';

export default function AuthPage() {
  const navigate = useNavigate();
  const { signIn, resetPassword, user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<AuthMode>('login');

  // Login form
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  // Forgot password form
  const [recoveryEmail, setRecoveryEmail] = useState('');
  const [emailSent, setEmailSent] = useState(false);

  if (user) {
    navigate('/dashboard');
    return null;
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await signIn(loginEmail, loginPassword);
    setLoading(false);
    if (error) {
      toast.error('Erro ao entrar', { description: error.message });
    } else {
      navigate('/dashboard');
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await resetPassword(recoveryEmail);
    setLoading(false);
    if (error) {
      toast.error('Erro ao enviar email', { description: error.message });
    } else {
      setEmailSent(true);
      toast.success('Email enviado!', { 
        description: 'Verifique sua caixa de entrada para redefinir sua senha.' 
      });
    }
  };

  const resetForgotPassword = () => {
    setMode('login');
    setRecoveryEmail('');
    setEmailSent(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 via-background to-accent/5 p-4">
      <div className="w-full max-w-md animate-fade-in">
        <div className="flex flex-col items-center mb-8">
          <div className="flex items-center gap-2 mb-2">
            <Building2 className="h-10 w-10 text-primary" />
            <span className="font-display font-bold text-2xl">CB Asesoria</span>
          </div>
          <p className="text-muted-foreground text-center">
            Sistema de gestão de consultoria de imigração
          </p>
        </div>

        <Card className="shadow-soft-lg">
          {mode === 'login' && (
            <>
              <CardHeader className="text-center">
                <CardTitle>Entrar</CardTitle>
                <CardDescription>
                  Acesse sua conta para continuar
                </CardDescription>
              </CardHeader>

              <CardContent>
                <form onSubmit={handleLogin} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="login-email">Email</Label>
                    <Input
                      id="login-email"
                      type="email"
                      placeholder="seu@email.com"
                      value={loginEmail}
                      onChange={(e) => setLoginEmail(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="login-password">Senha</Label>
                    <Input
                      id="login-password"
                      type="password"
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      required
                    />
                  </div>
                  <Button type="submit" className="w-full" disabled={loading}>
                    {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Entrar
                  </Button>
                  <div className="text-center">
                    <button
                      type="button"
                      onClick={() => setMode('forgot-password')}
                      className="text-sm text-muted-foreground hover:text-primary transition-colors"
                    >
                      Esqueci minha senha
                    </button>
                  </div>
                </form>
              </CardContent>
            </>
          )}

          {mode === 'forgot-password' && !emailSent && (
            <>
              <CardHeader className="text-center">
                <div className="mx-auto mb-4 w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center">
                  <Mail className="h-6 w-6 text-primary" />
                </div>
                <CardTitle>Recuperar Senha</CardTitle>
                <CardDescription>
                  Digite seu email e enviaremos um link para redefinir sua senha.
                </CardDescription>
              </CardHeader>

              <CardContent>
                <form onSubmit={handleForgotPassword} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="recovery-email">Email</Label>
                    <Input
                      id="recovery-email"
                      type="email"
                      placeholder="seu@email.com"
                      value={recoveryEmail}
                      onChange={(e) => setRecoveryEmail(e.target.value)}
                      required
                    />
                  </div>
                  <Button type="submit" className="w-full" disabled={loading}>
                    {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Enviar link de recuperação
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    className="w-full"
                    onClick={resetForgotPassword}
                  >
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Voltar ao login
                  </Button>
                </form>
              </CardContent>
            </>
          )}

          {mode === 'forgot-password' && emailSent && (
            <>
              <CardHeader className="text-center">
                <div className="mx-auto mb-4 w-12 h-12 bg-green-100 dark:bg-green-900/20 rounded-full flex items-center justify-center">
                  <Mail className="h-6 w-6 text-green-600" />
                </div>
                <CardTitle>Email Enviado!</CardTitle>
                <CardDescription>
                  Enviamos um link de recuperação para <strong>{recoveryEmail}</strong>. 
                  Verifique sua caixa de entrada e spam.
                </CardDescription>
              </CardHeader>

              <CardContent>
                <div className="space-y-4">
                  <p className="text-sm text-muted-foreground text-center">
                    Não recebeu o email? Aguarde alguns minutos ou tente novamente.
                  </p>
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => setEmailSent(false)}
                  >
                    Tentar novamente
                  </Button>
                  <Button
                    variant="ghost"
                    className="w-full"
                    onClick={resetForgotPassword}
                  >
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Voltar ao login
                  </Button>
                </div>
              </CardContent>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
