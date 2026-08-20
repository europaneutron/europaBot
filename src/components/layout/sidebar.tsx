'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { 
  Home, 
  MessageSquare, 
  ClipboardList, 
  Target, 
  Calendar, 
  Settings, 
  LogOut,
  UserCog,
  MessagesSquare,
  Database,
  Building2,
} from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/use-auth';

interface NavItem {
  href: string;
  icon: React.ElementType;
  label: string;
}

const navItems: NavItem[] = [
  { href: '/dashboard', icon: Home, label: 'Dashboard' },
  { href: '/conversations', icon: MessageSquare, label: 'Conversaciones' },
  { href: '/advisor-requests', icon: ClipboardList, label: 'Solicitudes Asesor' },
  // El orden es el de configurar un bot a mano: primero que existan los
  // fraccionamientos, luego sus datos, luego lo que contesta de cada uno.
  { href: '/scopes', icon: Building2, label: 'Alcances' },
  { href: '/catalog', icon: Database, label: 'Catálogo' },
  { href: '/intents', icon: Target, label: 'Preguntas' },
  ...(process.env.NODE_ENV !== 'production'
    ? [{ href: '/simulator', icon: MessagesSquare, label: 'Simulador' }]
    : []),
  { href: '/appointments', icon: Calendar, label: 'Citas' },
  { href: '/settings', icon: Settings, label: 'Configuración' },
  { href: '/profile', icon: UserCog, label: 'Mi Perfil' },
];

export function Sidebar() {
  const pathname = usePathname();
  const { signOut } = useAuth();

  const handleLogout = async () => {
    try {
      await signOut();
    } catch (error) {
      console.error('Error al cerrar sesión:', error);
    }
  };

  return (
    <TooltipProvider delayDuration={0}>
      <aside className="hidden md:flex flex-col w-16 bg-card border-r border-border h-screen sticky top-0">
        {/* Logo/Brand */}
        <div className="h-16 flex items-center justify-center border-b border-border">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
            <span className="text-primary-foreground font-bold text-sm">E</span>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 flex flex-col items-center py-4 gap-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href || pathname.startsWith(item.href + '/');

            return (
              <Tooltip key={item.href}>
                <TooltipTrigger asChild>
                  <Link
                    href={item.href}
                    className={cn(
                      'w-12 h-12 rounded-lg flex items-center justify-center transition-colors',
                      'hover:bg-accent hover:text-accent-foreground',
                      isActive && 'bg-primary text-primary-foreground hover:bg-primary/90'
                    )}
                  >
                    <Icon className="w-5 h-5" />
                  </Link>
                </TooltipTrigger>
                <TooltipContent side="right">
                  <p>{item.label}</p>
                </TooltipContent>
              </Tooltip>
            );
          })}
        </nav>

        {/* Bottom Actions */}
        <div className="flex flex-col items-center py-4 gap-2">
          <Separator className="w-8" />
          
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={handleLogout}
                className={cn(
                  'w-12 h-12 rounded-lg flex items-center justify-center transition-colors',
                  'hover:bg-destructive hover:text-destructive-foreground'
                )}
              >
                <LogOut className="w-5 h-5" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">
              <p>Cerrar Sesión</p>
            </TooltipContent>
          </Tooltip>
        </div>
      </aside>
    </TooltipProvider>
  );
}
