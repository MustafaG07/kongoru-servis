import { useRef } from 'react';
import { Check, Wrench } from 'lucide-react';
import { ServiceIconBadge } from '@/components/ServiceIconBadge';
import { Card } from '@/components/ui/card';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { useMasonryColumns } from '@/hooks/useMasonryColumns';
import { calculatePrice, formatTry, readItemPriceFromState } from '@/services/pricing';
import type { FinanceConfig, PricesStateMap, QuoteSelectionItem, ServiceGroupsMap } from '@/types';
import { cn } from '@/utils/cn';

interface CustomerServiceGridProps {
  selectedBrand: string;
  selectedDevice: string;
  serviceGroups: ServiceGroupsMap;
  activeServiceFilter: string;
  pricesState: PricesStateMap;
  financeConfig: FinanceConfig;
  selectedQuoteItems: Map<string, QuoteSelectionItem>;
  onToggleQuoteItem: (
    brand: string,
    device: string,
    group: string,
    quality: string,
    price: number,
  ) => void;
  flashTargetKey: string | null;
}

interface CustomerGroupCardData {
  group: string;
  rowsCount: number;
  order: number;
  items: Array<{
    quality: string;
    finalPrice: number;
    quoteKey: string;
  }>;
}

export function CustomerServiceGrid({
  selectedBrand,
  selectedDevice,
  serviceGroups,
  activeServiceFilter,
  pricesState,
  financeConfig,
  selectedQuoteItems,
  onToggleQuoteItem,
  flashTargetKey,
}: CustomerServiceGridProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  const groupNames = Object.keys(serviceGroups);
  const targetGroups =
    activeServiceFilter === 'ALL'
      ? groupNames
      : groupNames.filter((g) => g === activeServiceFilter);

  const cards: CustomerGroupCardData[] = [];
  for (const grp of targetGroups) {
    const quals = serviceGroups[grp] || [];
    const items: CustomerGroupCardData['items'] = [];
    for (const qual of quals) {
      const { usd, labor } = readItemPriceFromState(
        pricesState,
        selectedBrand,
        selectedDevice,
        grp,
        qual,
      );
      const calc = calculatePrice(
        usd,
        labor,
        financeConfig.rate,
        financeConfig.vatRate,
        financeConfig.roundingMode,
      );
      if (!calc.hasPrice) continue;
      items.push({
        quality: qual,
        finalPrice: calc.finalPrice,
        quoteKey: `${selectedBrand}|${selectedDevice}|${grp}|${qual}`,
      });
    }
    if (items.length > 0) {
      cards.push({
        group: grp,
        rowsCount: items.length,
        order: cards.length,
        items,
      });
    }
  }

  const columns = useMasonryColumns(containerRef, cards, 280);

  if (!selectedDevice) {
    return (
      <Empty className="border-dashed bg-[var(--bg-surface)] py-12">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Wrench />
          </EmptyMedia>
          <EmptyTitle>Cihaz Seçin</EmptyTitle>
          <EmptyDescription>
            Fiyatları görmek için sol rehberden veya üst arama çubuğundan bir cihaz seçin.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  if (cards.length === 0) {
    return (
      <Empty className="border-dashed bg-[var(--bg-surface)] py-12">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Wrench />
          </EmptyMedia>
          <EmptyTitle>Fiyat Tanımlanmamış</EmptyTitle>
          <EmptyDescription>
            {selectedDevice} için henüz fiyat tanımlanmamış.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div ref={containerRef} className="flex flex-col items-stretch gap-3 md:flex-row md:items-start">
      {columns.map((col, colIdx) => (
        <div key={colIdx} className="flex min-w-0 flex-1 flex-col gap-3">
          {col.map((card) => {
            const isGroupFlashed = flashTargetKey === `group:${card.group}`;
            return (
              <Card
                key={card.group}
                data-service-group={card.group}
                className={cn(
                  'gap-0 overflow-hidden rounded-xl border bg-[var(--bg-surface)] py-0 shadow-none',
                  isGroupFlashed && 'search-flash',
                )}
              >
                <div className="flex items-center justify-between gap-2 border-b bg-[var(--bg-elevated)]/70 px-3.5 py-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <ServiceIconBadge groupName={card.group} className="size-6.5" />
                    <h2 className="truncate text-[14px] font-semibold tracking-tight text-[var(--group-title-text)]">
                      {card.group}
                    </h2>
                  </div>
                  <span className="mono-nums shrink-0 text-[11px] font-medium text-muted-foreground">
                    {card.items.length} seçenek
                  </span>
                </div>

                <div className="divide-y divide-border">
                  {card.items.map((item) => {
                    const isSelected = selectedQuoteItems.has(item.quoteKey);
                    const isTileFlashed = flashTargetKey === `item:${card.group}|${item.quality}`;
                    return (
                      <button
                        key={item.quoteKey}
                        type="button"
                        data-service-item={`${card.group}|${item.quality}`}
                        onClick={() =>
                          onToggleQuoteItem(
                            selectedBrand,
                            selectedDevice,
                            card.group,
                            item.quality,
                            item.finalPrice,
                          )
                        }
                        className={cn(
                          'flex min-h-[56px] w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors',
                          isSelected
                            ? 'bg-emerald-500/[0.08] shadow-[inset_3px_0_0_var(--quality-accent)] hover:bg-emerald-500/[0.12]'
                            : 'hover:bg-[var(--bg-elevated)]/65',
                          isTileFlashed && 'search-flash',
                        )}
                      >
                        <div className="min-w-0 space-y-0.5">
                          <div className="break-words text-[14px] font-semibold text-[var(--quality-text)]">
                            {item.quality}
                          </div>
                          <div className="text-[11.5px] text-muted-foreground">KDV Dahil</div>
                        </div>

                        <div className="flex shrink-0 items-center gap-2.5">
                          <span className="mono-nums rounded-md border border-[var(--price-border)] bg-[var(--price-bg)] px-2.5 py-1 text-[13px] font-semibold text-[var(--price-text)]">
                            {formatTry(item.finalPrice)}
                          </span>
                          <span
                            aria-hidden="true"
                            className={cn(
                              'inline-flex size-4.5 items-center justify-center rounded-full border transition-colors',
                              isSelected
                                ? 'border-[var(--quality-accent)] bg-[var(--quality-accent)] text-emerald-950'
                                : 'border-[var(--border-strong)] bg-transparent',
                            )}
                          >
                            {isSelected && <Check className="size-3 stroke-[2.5]" />}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </Card>
            );
          })}
        </div>
      ))}
    </div>
  );
}
