import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { MainLayout } from "@/components/layout/MainLayout";
import { PortalLayout } from "@/components/portal/PortalLayout";

// Pages
import AuthPage from "./pages/Auth";
import ResetPasswordPage from "./pages/ResetPassword";
import Dashboard from "./pages/Dashboard";
import NotFound from "./pages/NotFound";

// CRM Pages
import Contacts from "./pages/crm/Contacts";
import ContactDetail from "./pages/crm/ContactDetail";
import Leads from "./pages/crm/Leads";
import LeadDetail from "./pages/crm/LeadDetail";
import LeadIntake from "./pages/crm/LeadIntake";
import Opportunities from "./pages/crm/Opportunities";
import OpportunityDetail from "./pages/crm/OpportunityDetail";

// Legal Pages
import ContractsList from "./pages/contracts/ContractsList";
import ContractDetail from "./pages/contracts/ContractDetail";
import LegalDashboard from "./pages/legal/LegalDashboard";

// Finance Pages
import PaymentsList from "./pages/finance/PaymentsList";
import Commissions from "./pages/finance/Commissions";
import CashFlow from "./pages/finance/CashFlow";
import Invoices from "./pages/finance/Invoices";
import FinancialReports from "./pages/finance/FinancialReports";

// Cases Pages
import CasesList from "./pages/cases/CasesList";
import CaseDetail from "./pages/cases/CaseDetail";

// Tasks Pages
import TasksList from "./pages/tasks/TasksList";

// Reports Pages
import Reports from "./pages/reports/Reports";

// NPS Pages
import NPSSurvey from "./pages/nps/NPSSurvey";

// Settings Pages
import Settings from "./pages/settings/Settings";
import WebhookLogs from "./pages/settings/WebhookLogs";

// Portal Pages
import PortalDashboard from "./pages/portal/PortalDashboard";
import PortalDocuments from "./pages/portal/PortalDocuments";
import PortalContracts from "./pages/portal/PortalContracts";
import PortalPayments from "./pages/portal/PortalPayments";
import PortalMessages from "./pages/portal/PortalMessages";
import PortalOnboarding from "./pages/portal/PortalOnboarding";

const queryClient = new QueryClient();

function LoadingSpinner() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
    </div>
  );
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  
  if (loading) {
    return <LoadingSpinner />;
  }
  
  if (!user) {
    return <Navigate to="/auth" replace />;
  }
  
  return <>{children}</>;
}

function AppRoutes() {
  const { user } = useAuth();
  // Check if we're on the reset-password route - don't redirect even if user is set
  // because the PASSWORD_RECOVERY flow sets a session before the user changes their password
  const isResetPasswordRoute = window.location.pathname === '/reset-password';

  return (
    <Routes>
      <Route path="/auth" element={user && !isResetPasswordRoute ? <Navigate to="/dashboard" /> : <AuthPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="/nps/:caseId" element={<NPSSurvey />} />
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      
      <Route element={<ProtectedRoute><MainLayout /></ProtectedRoute>}>
        {/* Dashboard */}
        <Route path="/dashboard" element={<Dashboard />} />
        
        {/* CRM Module */}
        <Route path="/crm" element={<Navigate to="/crm/lead-intake" replace />} />
        <Route path="/crm/lead-intake" element={<LeadIntake />} />
        <Route path="/crm/contacts" element={<Contacts />} />
        <Route path="/crm/contacts/:id" element={<ContactDetail />} />
        <Route path="/crm/leads" element={<Leads />} />
        <Route path="/crm/leads/:id" element={<LeadDetail />} />
        <Route path="/crm/opportunities" element={<Opportunities />} />
        <Route path="/crm/opportunities/:id" element={<OpportunityDetail />} />
        
        {/* Legal Module */}
        <Route path="/legal" element={<LegalDashboard />} />
        <Route path="/contracts" element={<ContractsList />} />
        <Route path="/contracts/:id" element={<ContractDetail />} />
        
        {/* Finance Module */}
        <Route path="/finance" element={<PaymentsList />} />
        <Route path="/finance/commissions" element={<Commissions />} />
        <Route path="/finance/cashflow" element={<CashFlow />} />
        <Route path="/finance/invoices" element={<Invoices />} />
        <Route path="/finance/reports" element={<FinancialReports />} />
        
        {/* Cases Module */}
        <Route path="/cases" element={<CasesList />} />
        <Route path="/cases/:id" element={<CaseDetail />} />
        
        {/* Tasks Module */}
        <Route path="/tasks" element={<TasksList />} />
        
        {/* Reports Module */}
        <Route path="/reports" element={<Reports />} />
        
        {/* Settings */}
        <Route path="/settings" element={<Settings />} />
        <Route path="/settings/webhook-logs" element={<WebhookLogs />} />
      </Route>

      {/* Portal do Cliente - Rota separada */}
      <Route path="/portal/onboarding" element={<ProtectedRoute><PortalOnboarding /></ProtectedRoute>} />
      <Route path="/portal" element={<ProtectedRoute><PortalLayout /></ProtectedRoute>}>
        <Route index element={<PortalDashboard />} />
        <Route path="documents" element={<PortalDocuments />} />
        <Route path="contracts" element={<PortalContracts />} />
        <Route path="payments" element={<PortalPayments />} />
        <Route path="messages" element={<PortalMessages />} />
      </Route>

      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <LanguageProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <AppRoutes />
          </BrowserRouter>
        </TooltipProvider>
      </LanguageProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
