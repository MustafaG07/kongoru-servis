import { useState, type RefObject } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, Check, ChevronLeft, Search, Trash2, X } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from '@/components/ui/empty';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { DevicesByBrand } from '@/types';
import { cn } from '@/utils/cn';

interface DeviceSidebarProps {
  categories: readonly string[];
  devicesMap: DevicesByBrand;
  activeBrandFilter: string;
  onChangeBrandFilter: (brand: string) => void;
  searchQuery: string;
  onChangeSearchQuery: (q: string) => void;
  selectedBrand: string;
  selectedDevice: string;
  onSelectDevice: (brand: string, device: string) => void;
  isCustomerMode: boolean;
  onMoveDevice: (brand: string, device: string, delta: -1 | 1) => void;
  onSortBrandDevices: (brand: string) => void;
  onRemoveDevice: (brand: string, device: string) => void;
  onBackToStageMobile: () => void;
  searchInputRef?: RefObject<HTMLInputElement | null>;
}

export function DeviceSidebar({
  categories,
  devicesMap,
  activeBrandFilter,
  onChangeBrandFilter,
  searchQuery,
  onChangeSearchQuery,
  selectedBrand,
  selectedDevice,
  onSelectDevice,
  isCustomerMode,
  onMoveDevice,
  onSortBrandDevices,
  onRemoveDevice,
  onBackToStageMobile,
  searchInputRef,
}: DeviceSidebarProps) {
  const [pendingDelete, setPendingDelete] = useState<{ brand: string; device: string } | null>(
    null,
  );
  const q = searchQuery.trim().toLocaleLowerCase('tr-TR');
  const targetBrands = activeBrandFilter === 'ALL' ? categories : [activeBrandFilter];
  const canReorder = !isCustomerMode && !q;

  const grouped = targetBrands
    .map((brand) => {
      const list = (devicesMap[brand] || []).filter((dev) => {
        if (!q) return true;
        return (
          dev.toLocaleLowerCase('tr-TR').includes(q) ||
          brand.toLocaleLowerCase('tr-TR').includes(q)
        );
      });
      return { brand, devices: list };
    })
    .filter((entry) => entry.devices.length > 0);

  return (
    <aside className="flex h-full min-h-0 flex-col border-r bg-[var(--bg-surface)]">
      <div className="shrink-0 space-y-2 border-b p-3.5">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={onBackToStageMobile}
          className="w-full justify-start gap-1.5 lg:hidden"
        >
          <ChevronLeft className="size-4" />
          Fiyatlara Dön
        </Button>

        <div className="relative flex items-center">
          <Search className="pointer-events-none absolute left-2.5 size-3.5 text-muted-foreground" />
          <Input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => onChangeSearchQuery(e.target.value)}
            placeholder="Model veya marka ara"
            className="h-9 bg-[var(--bg-elevated)] pr-12 pl-8 text-base sm:text-[13px]"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => onChangeSearchQuery('')}
              aria-label="Aramayı temizle"
              className="absolute right-7 inline-flex size-4.5 items-center justify-center rounded bg-muted text-muted-foreground hover:text-foreground"
            >
              <X className="size-3" />
            </button>
          )}
          <kbd className="mono-nums pointer-events-none absolute right-2 hidden rounded border bg-[var(--bg-surface)] px-1.5 py-0.5 text-[10.5px] text-muted-foreground sm:inline-block">
            /
          </kbd>
        </div>

        <Select value={activeBrandFilter} onValueChange={onChangeBrandFilter}>
          <SelectTrigger className="h-8.5 w-full bg-[var(--bg-elevated)] text-xs font-medium">
            <SelectValue placeholder="Tüm Markalar" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Tüm Markalar</SelectItem>
            {categories.map((cat) => (
              <SelectItem key={cat} value={cat}>
                {cat}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-4 p-2.5 pb-6">
          {grouped.length === 0 ? (
            <Empty className="border-dashed py-8">
              <EmptyHeader>
                <EmptyTitle className="text-sm">Cihaz bulunamadı</EmptyTitle>
                <EmptyDescription className="text-xs">
                  Aramayla eşleşen cihaz bulunamadı.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            grouped.map(({ brand, devices }) => (
              <div key={brand} className="space-y-1">
                <div className="flex items-center justify-between gap-2 px-2 py-1">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="truncate text-[11.5px] font-semibold tracking-wide text-muted-foreground">
                      {brand}
                    </span>
                    <span className="mono-nums text-[11px] text-muted-foreground/75">
                      {devices.length}
                    </span>
                  </div>

                  {canReorder && devices.length > 1 && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          onClick={() => onSortBrandDevices(brand)}
                          aria-label={`${brand} cihazlarını nesle göre sırala`}
                          className="inline-flex size-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-[var(--bg-elevated)] hover:text-foreground"
                        >
                          <ArrowUpDown className="size-3" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent>Nesle göre sırala</TooltipContent>
                    </Tooltip>
                  )}
                </div>

                <div className="space-y-0.5">
                  {devices.map((dev, idx) => {
                    const isActive = brand === selectedBrand && dev === selectedDevice;
                    return (
                      <div
                        key={`${brand}-${dev}`}
                        className={cn(
                          'group flex min-h-[34px] items-center gap-1 rounded-lg border border-transparent transition-colors',
                          isActive
                            ? 'border-[var(--border-strong)] bg-accent text-foreground'
                            : 'text-secondary-foreground hover:bg-[var(--bg-elevated)] hover:text-foreground',
                        )}
                      >
                        <button
                          type="button"
                          onClick={() => onSelectDevice(brand, dev)}
                          className="flex min-w-0 flex-1 items-center justify-between gap-2 px-2.5 py-1.5 text-left text-[13px] font-medium leading-snug"
                        >
                          <span className="min-w-0 break-words">{dev}</span>
                          {!canReorder && isActive && (
                            <Check className="size-3.5 shrink-0 text-[var(--quality-accent)]" />
                          )}
                        </button>

                        {!isCustomerMode && (
                          <div className="flex shrink-0 items-center gap-0.5 pr-1.5 opacity-80 group-hover:opacity-100">
                            {canReorder && (
                              <>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon-xs"
                                  disabled={idx === 0}
                                  onClick={() => onMoveDevice(brand, dev, -1)}
                                  title="Yukarı taşı"
                                  aria-label={`${dev} yukarı taşı`}
                                  className="size-6"
                                >
                                  <ArrowUp className="size-3" />
                                </Button>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon-xs"
                                  disabled={idx === devices.length - 1}
                                  onClick={() => onMoveDevice(brand, dev, 1)}
                                  title="Aşağı taşı"
                                  aria-label={`${dev} aşağı taşı`}
                                  className="size-6"
                                >
                                  <ArrowDown className="size-3" />
                                </Button>
                              </>
                            )}
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-xs"
                              onClick={() => setPendingDelete({ brand, device: dev })}
                              title="Cihazı sil"
                              aria-label={`${dev} cihazını sil`}
                              className="size-6 text-muted-foreground hover:bg-[var(--danger-soft)] hover:text-[var(--danger)]"
                            >
                              <Trash2 className="size-3" />
                            </Button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>
      </ScrollArea>

      <AlertDialog
        open={pendingDelete !== null}
        onOpenChange={(next) => {
          if (!next) setPendingDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cihazı Sil</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete
                ? `"${pendingDelete.device}" (${pendingDelete.brand}) cihazını ve bu cihaza ait fiyat kayıtlarını silmek istiyor musunuz?`
                : ''}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>İptal</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (!pendingDelete) return;
                onRemoveDevice(pendingDelete.brand, pendingDelete.device);
                setPendingDelete(null);
              }}
            >
              Cihazı Sil
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </aside>
  );
}
