import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PageHeader } from '@/components/ui/page-header';
import { useAuth } from '@/contexts/AuthContext';
import { Navigate } from 'react-router-dom';
import { Users, Clock, Settings as SettingsIcon, FileText, Bell, Download, Layers, Briefcase, UserCog, Table2, ChevronDown } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import UsersManagement from './UsersManagement';
import SLASettings from './SLASettings';
import SystemSettings from './SystemSettings';
import DocumentTypesManagement from './DocumentTypesManagement';
import NotificationPreferences from '@/components/settings/NotificationPreferences';
import ExportDocumentation from './ExportDocumentation';
import SectorsManagement from './SectorsManagement';
import ServiceTypesManagement from './ServiceTypesManagement';
import UserProfilesManagement from './UserProfilesManagement';

const TABLE_TABS = ['profiles', 'sectors', 'service-types'] as const;

export default function Settings() {
  const { hasRole } = useAuth();
  const [activeTab, setActiveTab] = useState('users');

  // Only admins and managers can access settings
  if (!hasRole('ADMIN') && !hasRole('MANAGER')) {
    return <Navigate to="/dashboard" replace />;
  }

  const isTableTabActive = TABLE_TABS.includes(activeTab as typeof TABLE_TABS[number]);

  const handleTableTabSelect = (value: string) => {
    setActiveTab(value);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Configurações"
        description="Gerencie usuários, SLAs, documentos, notificações e configurações do sistema"
      />

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="flex flex-wrap gap-1 h-auto p-1 lg:inline-flex">
          <TabsTrigger value="users" className="gap-2">
            <Users className="h-4 w-4" />
            <span className="hidden sm:inline">Usuários</span>
          </TabsTrigger>
          
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className={`inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 gap-2 ${
                  isTableTabActive 
                    ? 'bg-background text-foreground shadow' 
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Table2 className="h-4 w-4" />
                <span className="hidden sm:inline">Cadastro de Tabelas</span>
                <ChevronDown className="h-3 w-3" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-48">
              <DropdownMenuItem 
                onClick={() => handleTableTabSelect('profiles')}
                className={activeTab === 'profiles' ? 'bg-accent' : ''}
              >
                <UserCog className="h-4 w-4 mr-2" />
                Perfis
              </DropdownMenuItem>
              <DropdownMenuItem 
                onClick={() => handleTableTabSelect('sectors')}
                className={activeTab === 'sectors' ? 'bg-accent' : ''}
              >
                <Layers className="h-4 w-4 mr-2" />
                Setores
              </DropdownMenuItem>
              <DropdownMenuItem 
                onClick={() => handleTableTabSelect('service-types')}
                className={activeTab === 'service-types' ? 'bg-accent' : ''}
              >
                <Briefcase className="h-4 w-4 mr-2" />
                Tipos de Serviço
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <TabsTrigger value="sla" className="gap-2">
            <Clock className="h-4 w-4" />
            <span className="hidden sm:inline">SLAs</span>
          </TabsTrigger>
          <TabsTrigger value="documents" className="gap-2">
            <FileText className="h-4 w-4" />
            <span className="hidden sm:inline">Documentos</span>
          </TabsTrigger>
          <TabsTrigger value="notifications" className="gap-2">
            <Bell className="h-4 w-4" />
            <span className="hidden sm:inline">Notificações</span>
          </TabsTrigger>
          <TabsTrigger value="system" className="gap-2">
            <SettingsIcon className="h-4 w-4" />
            <span className="hidden sm:inline">Sistema</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="users">
          <UsersManagement />
        </TabsContent>

        <TabsContent value="profiles">
          <UserProfilesManagement />
        </TabsContent>

        <TabsContent value="sectors">
          <SectorsManagement />
        </TabsContent>

        <TabsContent value="service-types">
          <ServiceTypesManagement />
        </TabsContent>

        <TabsContent value="sla">
          <SLASettings />
        </TabsContent>

        <TabsContent value="documents">
          <DocumentTypesManagement />
        </TabsContent>

        <TabsContent value="notifications">
          <NotificationPreferences />
        </TabsContent>

        <TabsContent value="system">
          <SystemSettings />
        </TabsContent>

        <TabsContent value="export">
          <ExportDocumentation />
        </TabsContent>
      </Tabs>
    </div>
  );
}
