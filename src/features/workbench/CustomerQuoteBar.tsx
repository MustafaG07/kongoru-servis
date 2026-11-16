import { useState } from 'react';
import { ChevronUp, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { formatTry } from '@/services/pricing';
import type { QuoteSelectionItem } from '@/types';

interface CustomerQuoteBarProps {
  items: Map<string, QuoteSelectionItem>;
  onRemoveItem: (key: string) => void;
  onClearAll: () => void;
}

export function CustomerQuoteBar({
  items,
  onRemoveItem,
  onClearAll,
}: CustomerQuoteBarProps) {
  const [sheetOpen, setSheetOpen] = useState(false);

  if (items.size === 0) return null;

  const list = Array.from(items.values());
  const total = list.reduce((acc, item) => acc + item.price, 0);

  return (
    <div
      aria-live="polite"
      className="no-print fixed bottom-3.5 left-1/2 z-45 flex w-[min(520px,calc(100vw-24px))] -translate-x-1/2 items-center justify-between gap-3 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] px-3.5 py-2.5 shadow-xl"
    >
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetTrigger asChild>
          <button type="button" className="flex min-w-0 flex-1 items-center gap-3 text-left">
            <span className="mono-nums inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-[var(--quality-accent)] text-sm font-semibold text-emerald-950">
              {list.length}
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-1 text-[11.5px] font-medium text-muted-foreground">
                <span>Seçili İşlem Toplamı</span>
                <ChevronUp className="size-3.5" />
              </div>
              <div className="mono-nums text-base font-semibold text-foreground">
                {formatTry(total)}
              </div>
            </div>
          </button>
        </SheetTrigger>

        <SheetContent side="bottom" className="mx-auto max-w-lg rounded-t-2xl">
          <SheetHeader>
            <SheetTitle>Seçili İşlemler</SheetTitle>
            <SheetDescription>
              {list[0]?.device} · {list.length} seçili işlem (KDV Dahil)
            </SheetDescription>
          </SheetHeader>

          <ScrollArea className="max-h-[45dvh] px-4">
            <div className="divide-y divide-border">
              {list.map((item) => (
                <div key={item.key} className="flex items-center justify-between gap-2 py-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-[var(--group-title-text)]">
                      {item.group}
                    </div>
                    <div className="truncate text-xs font-medium text-[var(--quality-text)]">
                      {item.quality}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="mono-nums text-sm font-semibold text-[var(--price-text)]">
                      {formatTry(item.price)}
                    </span>
                    <button
                      type="button"
                      onClick={() => onRemoveItem(item.key)}
                      aria-label={`${item.quality} seçimini kaldır`}
                      className="rounded p-1.5 text-muted-foreground hover:bg-[var(--bg-elevated)] hover:text-foreground"
                    >
                      <X className="size-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>

          <SheetFooter className="border-t pt-3">
            <div className="flex items-baseline justify-between">
              <span className="text-sm font-medium text-muted-foreground">Toplam (KDV Dahil)</span>
              <span className="mono-nums text-lg font-semibold text-[var(--price-text)]">
                {formatTry(total)}
              </span>
            </div>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={onClearAll}
        className="shrink-0 gap-1.5 text-xs font-medium"
      >
        <Trash2 className="size-3.5" />
        Temizle
      </Button>
    </div>
  );
}
