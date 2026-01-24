import { Outlet, Link, useLocation, Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { 
  Home, 
  FileText, 
  Upload, 
  CreditCard, 
  MessageSquare, 
  LogOut,
  Menu,
  X,
  User
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { LanguageSwitcher } from './LanguageSwitcher';

export function PortalLayout() {
  const { user, profile, signOut, loading } = useAuth();
  const { t } = useLanguage();
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Check if onboarding is completed
  const { data: onboardingStatus, isLoading: checkingOnboarding } = useQuery({
    queryKey: ['portal-onboarding-status', user?.id],
    queryFn: async () => {
      if (!user) return { completed: true };
      
      const { data: serviceCase } = await supabase
        .from('service_cases')
        .select(`
          opportunity_id,
          opportunities (
            leads (
              contacts (
                onboarding_completed
              )
            )
          )
        `)
        .eq('client_user_id', user.id)
        .maybeSingle();
      
      const contact = serviceCase?.opportunities?.leads?.contacts;
      return { completed: contact?.onboarding_completed ?? true };
    },
    enabled: !!user,
  });

  const portalNavItems = [
    { path: '/portal', label: t.portal.myCases, icon: Home, end: true },
    { path: '/portal/documents', label: t.portal.documents, icon: Upload },
    { path: '/portal/contracts', label: t.portal.contracts, icon: FileText },
    { path: '/portal/payments', label: t.portal.payments, icon: CreditCard },
    { path: '/portal/messages', label: t.portal.messages, icon: MessageSquare },
  ];

  if (loading || checkingOnboarding) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  // Redirect to onboarding if not completed (except if already on onboarding page)
  if (!onboardingStatus?.completed && location.pathname !== '/portal/onboarding') {
    return <Navigate to="/portal/onboarding" replace />;
  }

  return (
    <div className="min-h-screen bg-muted/30">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-primary text-primary-foreground shadow-lg">
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-between h-16">
            {/* Logo */}
            <Link to="/portal" className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center">
                <span className="font-bold text-secondary-foreground text-sm">CB</span>
              </div>
              <span className="font-display font-semibold hidden sm:block">
                {t.portal.dashboard}
              </span>
            </Link>

            {/* Desktop Navigation */}
            <nav className="hidden md:flex items-center gap-1">
              {portalNavItems.map((item) => {
                const isActive = item.end 
                  ? location.pathname === item.path
                  : location.pathname.startsWith(item.path);
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    className={cn(
                      "flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                      isActive 
                        ? "bg-primary-foreground/20 text-primary-foreground" 
                        : "text-primary-foreground/70 hover:text-primary-foreground hover:bg-primary-foreground/10"
                    )}
                  >
                    <item.icon className="h-4 w-4" />
                    {item.label}
                  </Link>
                );
              })}
            </nav>

            {/* User Menu */}
            <div className="flex items-center gap-2">
              <LanguageSwitcher />
              
              <div className="hidden sm:flex items-center gap-2 text-sm">
                <User className="h-4 w-4" />
                <span className="max-w-32 truncate">{profile?.full_name || user.email}</span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => signOut()}
                className="text-primary-foreground hover:bg-primary-foreground/10"
              >
                <LogOut className="h-4 w-4" />
                <span className="hidden sm:inline ml-2">{t.common.signOut}</span>
              </Button>

              {/* Mobile menu button */}
              <Button
                variant="ghost"
                size="sm"
                className="md:hidden text-primary-foreground"
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              >
                {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
              </Button>
            </div>
          </div>
        </div>

        {/* Mobile Navigation */}
        {mobileMenuOpen && (
          <nav className="md:hidden border-t border-primary-foreground/20 pb-4">
            <div className="container mx-auto px-4 pt-4 space-y-1">
              {portalNavItems.map((item) => {
                const isActive = item.end 
                  ? location.pathname === item.path
                  : location.pathname.startsWith(item.path);
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    onClick={() => setMobileMenuOpen(false)}
                    className={cn(
                      "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                      isActive 
                        ? "bg-primary-foreground/20 text-primary-foreground" 
                        : "text-primary-foreground/70 hover:text-primary-foreground hover:bg-primary-foreground/10"
                    )}
                  >
                    <item.icon className="h-4 w-4" />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </nav>
        )}
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-6">
        <Outlet />
      </main>

      {/* Footer */}
      <footer className="border-t bg-card mt-auto">
        <div className="container mx-auto px-4 py-4 text-center text-sm text-muted-foreground">
          © {new Date().getFullYear()} CB Asesoria.
        </div>
      </footer>
    </div>
  );
}
