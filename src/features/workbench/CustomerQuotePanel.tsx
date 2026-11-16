import { Copy, Printer, ReceiptText, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { formatTry } from '@/services/pricing';
import type { QuoteSelectionItem } from '@/types';

interface CustomerQuotePanelProps {
  items: Map<string, QuoteSelectionItem>;
  selectedBrand: string;
  selectedDevice: string;
  onRemoveItem: (key: string) => void;
  onClearAll: () => void;
}

export function CustomerQuotePanel({
  items,
  selectedBrand,
  selectedDevice,
  onRemoveItem,
  onClearAll,
}: CustomerQuotePanelProps) {
  if (items.size === 0) return null;

  const list = Array.from(items.values());
  const total = list.reduce((acc, item) => acc + item.price, 0);

  const handleCopyQuote = async () => {
    const lines = [
      `KONGORU Teknik Servis Teklif Özeti`,
      `Cihaz: ${selectedBrand} ${selectedDevice}`,
      '---',
      ...list.map((it) => `• ${it.group} (${it.quality}): ${formatTry(it.price)}`),
      '---',
      `Toplam (KDV Dahil): ${formatTry(total)}`,
    ];
    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      toast.success('Teklif özeti panoya kopyalandı.');
    } catch {
      toast.error('Panoya kopyalanamadı.');
    }
  };

  return (
    <Card className="sticky top-3 hidden w-[300px] shrink-0 flex-col gap-0 overflow-hidden rounded-xl border bg-[var(--bg-surface)] py-0 shadow-none xl:flex">
      <div className="flex items-center justify-between gap-2 border-b bg-[var(--bg-elevated)] px-4 py-3">
        <div className="flex items-center gap-2">
          <ReceiptText className="size-4 text-muted-foreground" />
          <div>
            <h2 className="text-sm font-semibold text-foreground">Servis Teklifi</h2>
            <p className="text-[11.5px] text-muted-foreground">
              {selectedDevice} · {list.length} işlem
            </p>
          </div>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          onClick={onClearAll}
          title="Seçimi temizle"
          aria-label="Seçimi temizle"
          className="no-print text-muted-foreground hover:text-foreground"
        >
          <Trash2 className="size-3.5" />
        </Button>
      </div>

      <ScrollArea className="max-h-[380px]">
        <div className="divide-y divide-border px-4">
          {list.map((item) => (
            <div key={item.key} className="flex items-start justify-between gap-2.5 py-3">
              <div className="min-w-0 space-y-0.5">
                <div className="text-[13px] font-semibold text-[var(--group-title-text)]">
                  {item.group}
                </div>
                <div className="text-xs font-medium text-[var(--quality-text)]">{item.quality}</div>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <span className="mono-nums text-[13px] font-semibold text-[var(--price-text)]">
                  {formatTry(item.price)}
                </span>
                <button
                  type="button"
                  onClick={() => onRemoveItem(item.key)}
                  aria-label={`${item.quality} seçimini kaldır`}
                  className="no-print rounded p-1 text-muted-foreground transition-colors hover:bg-[var(--bg-elevated)] hover:text-foreground"
                >
                  <X className="size-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>

      <Separator />

      <div className="space-y-3 bg-[var(--bg-surface)] p-4">
        <div className="flex items-baseline justify-between gap-2">
          <div>
            <div className="text-xs font-medium text-muted-foreground">Genel Toplam</div>
            <div className="text-[11px] text-muted-foreground">KDV Dahil</div>
          </div>
          <div className="mono-nums text-xl font-semibold text-[var(--price-text)]">
            {formatTry(total)}
          </div>
        </div>

        <div className="no-print grid grid-cols-2 gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void handleCopyQuote()}
            className="gap-1.5 text-xs"
          >
            <Copy className="size-3.5" />
            Kopyala
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => window.print()}
            className="gap-1.5 text-xs"
          >
            <Printer className="size-3.5" />
            Yazdır
          </Button>
        </div>
      </div>
    </Card>
  );
}
