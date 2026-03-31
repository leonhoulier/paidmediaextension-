import React, { useState } from 'react';
import { Link, useLocation, Outlet } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
  LayoutDashboard,
  Users,
  UserCog,
  Building2,
  Building,
  Shield,
  Layers,
  FileText,
  BarChart3,
  CheckCircle,
  Puzzle,
  Webhook,
  LogOut,
  Menu,
  X,
  ChevronRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';

/** Sidebar navigation items */
const navItems = [
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { label: 'Organizations', href: '/organizations', icon: Building, superAdminOnly: true },
  { label: 'Accounts', href: '/accounts', icon: Building2 },
  { label: 'Teams', href: '/teams', icon: UserCog },
  { label: 'Users', href: '/users', icon: Users },
  { label: 'Rules', href: '/rules', icon: Shield },
  { label: 'Rule Sets', href: '/rule-sets', icon: Layers },
  { label: 'Naming Templates', href: '/naming-templates', icon: FileText },
  { label: 'Compliance', href: '/compliance', icon: BarChart3 },
  { label: 'Approvals', href: '/approvals', icon: CheckCircle },
  { label: 'Extension Pairing', href: '/settings/extension', icon: Puzzle },
  { label: 'Webhooks', href: '/settings/webhooks', icon: Webhook },
];

/**
 * Main application layout with sidebar navigation
 */
export function Layout(): React.ReactElement {
  const { user, signOut } = useAuth();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const handleSignOut = async (): Promise<void> => {
    await signOut();
  };

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
          role="presentation"
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r bg-card transition-transform duration-200 lg:static lg:translate-x-0',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        {/* Logo / Brand */}
        <div className="flex h-16 items-center justify-between px-6">
          <Link to="/dashboard" className="flex items-center gap-2">
            <Shield className="h-6 w-6 text-primary" />
            <span className="text-lg font-bold">DLG Admin</span>
          </Link>
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={() => setSidebarOpen(false)}
            aria-label="Close sidebar"
          >
            <X className="h-5 w-5" />
          </Button>
        </div>

        <Separator />

        {/* Navigation */}
        <nav className="flex-1 space-y-1 px-3 py-4" aria-label="Main navigation">
          {navItems
            .filter((_item) => {
              // For now, show all items. In a production app, you would check user role here:
              // if (item.superAdminOnly && user?.role !== 'super_admin') return false;
              return true;
            })
            .map((item) => {
              const isActive =
                location.pathname === item.href || location.pathname.startsWith(item.href + '/');
              return (
                <Link
                  key={item.href}
                  to={item.href}
                  onClick={() => setSidebarOpen(false)}
                  className={cn(
                    'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-primary/10 text-primary'
                      : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                  )}
                  aria-current={isActive ? 'page' : undefined}
                >
                  <item.icon className="h-4 w-4" />
                  {item.label}
                  {isActive && <ChevronRight className="ml-auto h-4 w-4" />}
                </Link>
              );
            })}
        </nav>

        <Separator />

        {/* User info and sign out */}
        <div className="p-4">
          <div className="flex items-center gap-3">
            {user?.photoURL ? (
              <img
                src={user.photoURL}
                alt={user.displayName ?? 'User avatar'}
                className="h-8 w-8 rounded-full"
              />
            ) : (
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary">
                {user?.displayName?.charAt(0) ?? user?.email?.charAt(0) ?? '?'}
              </div>
            )}
            <div className="flex-1 truncate">
              <p className="truncate text-sm font-medium">{user?.displayName ?? 'User'}</p>
              <p className="truncate text-xs text-muted-foreground">{user?.email}</p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="mt-3 w-full justify-start gap-2 text-muted-foreground"
            onClick={handleSignOut}
            aria-label="Sign out"
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </Button>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Top bar (mobile) */}
        <header className="flex h-16 items-center gap-4 border-b px-6 lg:hidden">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setSidebarOpen(true)}
            aria-label="Open sidebar"
          >
            <Menu className="h-5 w-5" />
          </Button>
          <Shield className="h-5 w-5 text-primary" />
          <span className="text-lg font-bold">DLG Admin</span>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
