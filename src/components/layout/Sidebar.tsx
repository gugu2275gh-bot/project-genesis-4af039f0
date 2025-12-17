import { Link, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import {
  LayoutDashboard,
  Users,
  FileText,
  CreditCard,
  Briefcase,
  Settings,
  Bell,
  CheckSquare,
  BarChart3,
  LogOut,
  ChevronLeft,
  Menu,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useState } from 'react';
import logoCB from '@/assets/logo-cb-asesoria.png';

interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
  roles?: string[];
  children?: { label: string; href: string }[];
}

const navItems: NavItem[] = [
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { 
    label: 'CRM', 
    href: '/crm', 
    icon: Users, 
    roles: ['ADMIN', 'MANAGER', 'ATENCAO_CLIENTE'],
    children: [
      { label: 'Lead Intake', href: '/crm/lead-intake' },
      { label: 'Leads', href: '/crm/leads' },
      { label: 'Contatos', href: '/crm/contacts' },
      { label: 'Oportunidades', href: '/crm/opportunities' },
    ]
  },
  { label: 'Contratos', href: '/contracts', icon: FileText, roles: ['ADMIN', 'MANAGER', 'JURIDICO', 'ATENCAO_CLIENTE'] },
  { label: 'Financeiro', href: '/finance', icon: CreditCard, roles: ['ADMIN', 'MANAGER', 'FINANCEIRO'] },
  { label: 'Casos Técnicos', href: '/cases', icon: Briefcase, roles: ['ADMIN', 'MANAGER', 'ATENCAO_CLIENTE', 'TECNICO'] },
  { label: 'Tarefas', href: '/tasks', icon: CheckSquare },
  { label: 'Relatórios', href: '/reports', icon: BarChart3, roles: ['ADMIN', 'MANAGER'] },
  { label: 'Configurações', href: '/settings', icon: Settings, roles: ['ADMIN', 'MANAGER'] },
];

export function Sidebar() {
  const location = useLocation();
  const { profile, roles, signOut } = useAuth();
  const [collapsed, setCollapsed] = useState(false);

  // If user has no roles yet, show all items (for new users/admin setup)
  // Otherwise, filter based on roles
  const filteredNavItems = navItems.filter(item => {
    if (!item.roles) return true;
    if (roles.length === 0) return true; // Show all if no roles assigned yet
    return item.roles.some(role => roles.includes(role as any));
  });

  return (
    <aside
      className={cn(
        'fixed left-0 top-0 z-40 h-screen bg-sidebar text-sidebar-foreground transition-all duration-300 flex flex-col',
        collapsed ? 'w-16' : 'w-64'
      )}
    >
      {/* Header */}
      <div className="relative flex h-16 items-center justify-center border-b border-sidebar-border px-4">
        {!collapsed && (
          <Link to="/dashboard" className="flex items-center justify-center">
            <img src={logoCB} alt="CB Asesoría" className="h-12 w-auto" />
          </Link>
        )}
        {collapsed && (
          <Link to="/dashboard" className="flex items-center justify-center">
            <img src={logoCB} alt="CB Asesoría" className="h-10 w-auto" />
          </Link>
        )}
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setCollapsed(!collapsed)}
          className="absolute right-2 top-2 text-sidebar-foreground hover:bg-sidebar-accent"
        >
          {collapsed ? <Menu className="h-5 w-5" /> : <ChevronLeft className="h-5 w-5" />}
        </Button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-4">
        <ul className="space-y-1 px-2">
          {filteredNavItems.map((item) => {
            const isActive = location.pathname === item.href || location.pathname.startsWith(item.href + '/');
            const hasChildren = item.children && item.children.length > 0;
            const showChildren = hasChildren && location.pathname.startsWith(item.href);
            
            return (
              <li key={item.href}>
                <Link
                  to={hasChildren ? item.children![0].href : item.href}
                  className={cn(
                    'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all',
                    isActive
                      ? 'bg-sidebar-primary text-sidebar-primary-foreground'
                      : 'text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground'
                  )}
                >
                  <item.icon className={cn('h-5 w-5 shrink-0', collapsed && 'mx-auto')} />
                  {!collapsed && <span>{item.label}</span>}
                </Link>
                {/* Children navigation */}
                {!collapsed && showChildren && item.children && (
                  <ul className="ml-8 mt-1 space-y-1">
                    {item.children.map((child) => {
                      const isChildActive = location.pathname === child.href;
                      return (
                        <li key={child.href}>
                          <Link
                            to={child.href}
                            className={cn(
                              'block rounded-lg px-3 py-2 text-sm transition-all',
                              isChildActive
                                ? 'bg-sidebar-accent text-sidebar-foreground font-medium'
                                : 'text-sidebar-foreground/60 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground'
                            )}
                          >
                            {child.label}
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      </nav>

      {/* User section */}
      <div className="border-t border-sidebar-border p-4">
        {!collapsed && profile && (
          <div className="mb-3 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-sidebar-accent text-sidebar-accent-foreground font-medium">
              {profile.full_name.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 overflow-hidden">
              <p className="truncate text-sm font-medium">{profile.full_name}</p>
              <p className="truncate text-xs text-sidebar-foreground/60">{profile.email}</p>
            </div>
          </div>
        )}
        <Button
          variant="ghost"
          size={collapsed ? 'icon' : 'default'}
          onClick={signOut}
          className={cn(
            'w-full text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground',
            collapsed && 'mx-auto'
          )}
        >
          <LogOut className="h-5 w-5" />
          {!collapsed && <span className="ml-2">Sair</span>}
        </Button>
      </div>
    </aside>
  );
}
