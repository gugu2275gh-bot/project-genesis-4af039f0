import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { cn } from '@/lib/utils';

export function MainLayout() {
  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <main className={cn('ml-64 min-h-screen transition-all duration-300')}>
        <Outlet />
      </main>
    </div>
  );
}
