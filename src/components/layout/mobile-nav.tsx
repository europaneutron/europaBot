'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { 
  Home, 
  MessageSquare, 
  ClipboardList, 
  Calendar, 
  Settings,
  UserCog
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface NavItem {
  href: string;
  icon: React.ElementType;
  label: string;
}

const mobileNavItems: NavItem[] = [
  { href: '/dashboard', icon: Home, label: 'Inicio' },
  { href: '/conversations', icon: MessageSquare, label: 'Chats' },
  { href: '/advisor-requests', icon: ClipboardList, label: 'Solicitudes' },
  { href: '/appointments', icon: Calendar, label: 'Citas' },
  { href: '/settings', icon: Settings, label: 'Config' },
  { href: '/profile', icon: UserCog, label: 'Perfil' },
];

export function MobileNav() {
  const pathname = usePathname();

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-card border-t border-border z-50">
      <div className="flex items-center justify-around h-16 px-2">
        {mobileNavItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href || pathname.startsWith(item.href + '/');

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex flex-col items-center justify-center gap-1 px-3 py-2 rounded-lg transition-colors flex-1',
                'hover:bg-accent',
                isActive && 'text-primary bg-accent'
              )}
            >
              <Icon className="w-5 h-5" />
              <span className="text-[10px] font-medium">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
