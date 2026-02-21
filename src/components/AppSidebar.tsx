import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import {
  Activity,
  BarChart3,
  Brain,
  ChevronDown,
  Home,
  Languages,
  LogOut,
  Menu,
  MessageSquare,
  Table2,
  Shield,
  Upload,
  User,
  type LucideIcon,
} from 'lucide-react';
import { useLanguage } from '@/hooks/useLanguage';

type NavItem = {
  icon: LucideIcon;
  label: string;
  path: string;
};

const tradingItems: NavItem[] = [
  { icon: Upload, label: 'Upload Trades', path: '/upload' },
  { icon: Table2, label: 'All Trades', path: '/trades' },
  { icon: Shield, label: 'Portfolio', path: '/portfolio' },
];

const analyticsItems: NavItem[] = [
  { icon: Brain, label: 'Bias Analysis', path: '/analysis' },
  { icon: BarChart3, label: 'Risk Profile', path: '/risk-profile' },
  { icon: Activity, label: 'Emotional Tracker', path: '/emotions' },
];

const workspaceItems: NavItem[] = [
  { icon: MessageSquare, label: 'Laurent Ferreira', path: '/ai-coach' },
  { icon: User, label: 'Settings', path: '/settings' },
];

const allItems: NavItem[] = [
  { icon: Home, label: 'Dashboard', path: '/dashboard' },
  ...tradingItems,
  ...analyticsItems,
  ...workspaceItems,
];

interface NavDropdownProps {
  label: string;
  items: NavItem[];
}

export default function AppSidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, signOut } = useAuth();
  const { language, toggleLanguage } = useLanguage();

  const isActive = (path: string) => location.pathname === path;

  const NavDropdown = ({ label, items }: NavDropdownProps) => {
    const groupActive = items.some((item) => isActive(item.path));

    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            className={cn(
              'text-secondary-foreground/85 hover:text-secondary-foreground hover:bg-sidebar-accent/70',
              groupActive && 'bg-sidebar-accent text-secondary-foreground',
            )}
          >
            {label}
            <ChevronDown className="w-4 h-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          sideOffset={10}
          className="w-56 border-sidebar-border bg-card"
        >
          {items.map((item) => (
            <DropdownMenuItem
              key={item.path}
              onClick={() => navigate(item.path)}
              className={cn(
                'cursor-pointer',
                isActive(item.path) && 'bg-accent text-accent-foreground',
              )}
            >
              <item.icon className="w-4 h-4 mr-2" />
              {item.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  };

  return (
    <header className="fixed inset-x-0 top-0 z-40 border-b border-sidebar-border bg-secondary text-secondary-foreground">
      <div className="mx-auto flex h-16 max-w-[1600px] items-center gap-2 px-4 md:px-8">
        <button
          onClick={() => navigate('/dashboard')}
          className="flex items-center gap-3 rounded-md px-2 py-1 hover:bg-sidebar-accent/60 transition-colors"
        >
          <div className="w-9 h-9 rounded-md bg-white/95 border border-sidebar-border/70 flex items-center justify-center overflow-hidden">
            <img src="/national-bank-logo.png" alt="National Bank logo" className="w-7 h-7 object-contain" />
          </div>
          <div className="text-left">
            <p className="text-sm font-semibold leading-tight">Bias Detector</p>
            <p className="text-[11px] text-secondary-foreground/70 leading-tight">National Bank</p>
          </div>
        </button>

        <nav className="hidden md:flex items-center gap-1 ml-4">
          <Button
            variant="ghost"
            onClick={() => navigate('/dashboard')}
            className={cn(
              'text-secondary-foreground/85 hover:text-secondary-foreground hover:bg-sidebar-accent/70',
              isActive('/dashboard') && 'bg-sidebar-accent text-secondary-foreground',
            )}
          >
            <Home className="w-4 h-4 mr-1" />
            Dashboard
          </Button>
          <NavDropdown label="Trading" items={tradingItems} />
          <NavDropdown label="Analytics" items={analyticsItems} />
          <NavDropdown label="Workspace" items={workspaceItems} />
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={toggleLanguage}
            className="text-secondary-foreground hover:bg-sidebar-accent/70"
            title={language === 'en' ? 'Set language to French' : 'Set language to English'}
          >
            <Languages className="w-4 h-4 mr-1" />
            {language === 'en' ? 'FR' : 'EN'}
          </Button>

          <div className="md:hidden">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="text-secondary-foreground hover:bg-sidebar-accent/70">
                  <Menu className="w-5 h-5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56 border-sidebar-border bg-card">
                {allItems.map((item) => (
                  <DropdownMenuItem
                    key={item.path}
                    onClick={() => navigate(item.path)}
                    className={cn('cursor-pointer', isActive(item.path) && 'bg-accent text-accent-foreground')}
                  >
                    <item.icon className="w-4 h-4 mr-2" />
                    {item.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="text-secondary-foreground hover:bg-sidebar-accent/70">
                <div className="w-7 h-7 rounded-full gradient-primary flex items-center justify-center text-primary-foreground text-xs font-semibold">
                  {user?.email?.charAt(0).toUpperCase()}
                </div>
                <span className="hidden md:inline max-w-52 truncate">{user?.email}</span>
                <ChevronDown className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" sideOffset={10} className="w-64 border-sidebar-border bg-card">
              <DropdownMenuLabel className="text-xs text-muted-foreground">Signed in as</DropdownMenuLabel>
              <DropdownMenuLabel className="font-medium truncate">{user?.email}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => navigate('/settings')} className="cursor-pointer">
                <User className="w-4 h-4 mr-2" />
                Settings
              </DropdownMenuItem>
              <DropdownMenuItem onClick={signOut} className="cursor-pointer text-destructive focus:text-destructive">
                <LogOut className="w-4 h-4 mr-2" />
                Sign Out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
