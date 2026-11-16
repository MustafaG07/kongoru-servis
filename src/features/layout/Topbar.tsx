import { useState, type FormEvent } from 'react';
import {
  KeyRound,
  Lock,
  Moon,
  MoreVertical,
  Search,
  Sun,
  UserCheck,
  DatabaseBackup,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { SyncStatus, ThemeMode } from '@/types';
import { cn } from '@/utils/cn';

interface TopbarProps {
  isCustomerMode: boolean;
  theme: ThemeMode;
  onToggleTheme: () => void;
  syncStatus: SyncStatus;
  syncText: string;
  onSyncCloud: () => void;
  onOpenGlobalSearch: () => void;
  onLoginAdmin: (password: string) => boolean;
  onSwitchToCustomerMode: () => void;
  onOpenBackupModal: () => void;
  onOpenPasswordModal: () => void;
  hasTodayBackup: boolean;
  backupCount: number;
}

export function Topbar({
  isCustomerMode,
  theme,
  onToggleTheme,
  syncStatus,
  syncText,
  onSyncCloud,
  onOpenGlobalSearch,
  onLoginAdmin,
  onSwitchToCustomerMode,
  onOpenBackupModal,
  onOpenPasswordModal,
  hasTodayBackup,
  backupCount,
}: TopbarProps) {
  const [authPopoverOpen, setAuthPopoverOpen] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [authError, setAuthError] = useState('');

  const handleOpenAuth = (nextOpen: boolean) => {
    if (!isCustomerMode) return;
    setAuthPopoverOpen(nextOpen);
    if (nextOpen) {
      setPasswordInput('');
      setAuthError('');
    }
  };

  const handleSubmitLogin = (e: FormEvent) => {
    e.preventDefault();
    if (onLoginAdmin(passwordInput)) {
      setAuthPopoverOpen(false);
      setPasswordInput('');
      setAuthError('');
    } else {
      setAuthError('Şifre hatalı!');
    }
  };

  const syncDotClass =
    syncStatus === 'online'
      ? 'bg-emerald-500'
      : syncStatus === 'pending'
        ? 'bg-amber-500'
        : 'bg-muted-foreground';

  return (
    <header className="flex min-h-[58px] shrink-0 items-center justify-between gap-3 border-b bg-[var(--bg-surface)] px-4 py-2 lg:px-5">
      <div className="flex min-w-0 items-center gap-0">
        <div
          onDoubleClick={() => handleOpenAuth(true)}
          title={isCustomerMode ? 'Yönetici erişimi için çift tıklayın' : 'KONGORU'}
          className="flex cursor-pointer select-none items-center gap-3 lg:w-[259px] lg:shrink-0 lg:pr-3"
        >
          <div className="min-w-0">
            <div className="text-[15px] font-semibold tracking-tight text-foreground leading-tight">
              KONGORU
            </div>
            <div className="hidden truncate text-[11.5px] font-normal text-muted-foreground sm:block">
              {isCustomerMode
                ? 'Servis Fiyat Listesi'
                : 'Yönetici Modu — Kur, KDV ve Maliyet Kontrolü'}
            </div>
          </div>
        </div>

        {!isCustomerMode && (
          <>
            <Separator orientation="vertical" className="mr-4 hidden h-6 sm:block" />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onSyncCloud}
              title="Bulut / yerel senkronizasyon durumu (tıklayarak eşitleyin)"
              className="h-8 gap-2 rounded-md bg-[var(--bg-elevated)] px-2.5 text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              <span className={cn('size-2 rounded-full shrink-0', syncDotClass)} />
              <span>{syncText}</span>
            </Button>
          </>
        )}
      </div>

      <Button
        type="button"
        variant="outline"
        onClick={onOpenGlobalSearch}
        aria-label="Genel akıllı arama aç"
        className="hidden h-9 flex-[0_1_360px] justify-between gap-2 rounded-lg border-[var(--border-strong)] bg-[var(--bg-elevated)] px-3 text-[13px] font-medium text-muted-foreground shadow-none hover:border-foreground/50 hover:bg-[var(--bg-surface)] hover:text-foreground lg:inline-flex"
      >
        <span className="flex min-w-0 items-center gap-2">
          <Search className="size-3.5 shrink-0 text-foreground" />
          <span className="truncate">Model, hizmet veya parça ara...</span>
        </span>
        <kbd className="mono-nums shrink-0 rounded border bg-[var(--bg-surface)] px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
          ⌘K
        </kbd>
      </Button>

      <div className="flex shrink-0 items-center gap-2">
        {!isCustomerMode && (
          <div className="flex items-center gap-2 border-r border-[var(--border-strong)] pr-2.5">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onSwitchToCustomerMode}
              className="h-8 gap-1.5 text-xs font-medium"
            >
              <UserCheck className="size-3.5" />
              <span className="hidden sm:inline">Müşteri Görünümü</span>
              <span className="sm:hidden">Müşteri</span>
            </Button>
          </div>
        )}

        {isCustomerMode && (
          <>
            <Popover open={authPopoverOpen} onOpenChange={handleOpenAuth}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Yönetici Girişi"
                      className="text-foreground"
                    >
                      <Lock className="size-4" />
                    </Button>
                  </PopoverTrigger>
                </TooltipTrigger>
                <TooltipContent>Yönetici Girişi</TooltipContent>
              </Tooltip>

              <PopoverContent align="end" className="w-60 p-3.5">
                <form onSubmit={handleSubmitLogin} className="space-y-3">
                  <h3 className="text-sm font-semibold text-foreground">Yönetici Girişi</h3>
                  <div className="space-y-1.5">
                    <Label htmlFor="v3AdminPasswordInput" className="sr-only">
                      Yönetici Şifresi
                    </Label>
                    <Input
                      id="v3AdminPasswordInput"
                      type="password"
                      value={passwordInput}
                      onChange={(e) => {
                        setPasswordInput(e.target.value);
                        if (authError) setAuthError('');
                      }}
                      placeholder="Şifreyi girin..."
                      autoComplete="current-password"
                      className="h-9"
                      autoFocus
                    />
                  </div>
                  {authError && (
                    <p className="text-xs font-medium text-destructive" role="alert">
                      {authError}
                    </p>
                  )}
                  <div className="flex items-center justify-end gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => setAuthPopoverOpen(false)}
                    >
                      İptal
                    </Button>
                    <Button type="submit" size="sm">
                      Giriş Yap
                    </Button>
                  </div>
                </form>
              </PopoverContent>
            </Popover>

            <Separator orientation="vertical" className="h-4.5" />
          </>
        )}

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={onToggleTheme}
              aria-label="Tema Değiştir"
              className="text-foreground"
            >
              {theme === 'dark' ? <Moon className="size-4" /> : <Sun className="size-4" />}
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            {theme === 'dark' ? 'Açık Temaya Geç' : 'Koyu Temaya Geç'}
          </TooltipContent>
        </Tooltip>

        {!isCustomerMode && (
          <DropdownMenu>
            <Tooltip>
              <TooltipTrigger asChild>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Yönetici Ayarları"
                    className="text-foreground"
                  >
                    <MoreVertical className="size-4" />
                  </Button>
                </DropdownMenuTrigger>
              </TooltipTrigger>
              <TooltipContent>Yönetici Ayarları</TooltipContent>
            </Tooltip>

            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuItem onClick={onOpenBackupModal} className="justify-between">
                <span className="flex items-center gap-2">
                  <span
                    className={cn(
                      'size-2 rounded-full',
                      hasTodayBackup ? 'bg-emerald-500' : 'bg-amber-500',
                    )}
                  />
                  <DatabaseBackup className="size-3.5 text-muted-foreground" />
                  <span>Yedekler</span>
                </span>
                <Badge variant="secondary" className="mono-nums px-1.5 py-0 text-[11px]">
                  {backupCount}
                </Badge>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onOpenPasswordModal}>
                <KeyRound className="size-3.5 text-muted-foreground" />
                <span>Şifre Değiştir</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </header>
  );
}
