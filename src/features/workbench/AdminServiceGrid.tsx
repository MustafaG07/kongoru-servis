import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { Plus, Trash2, Wrench } from 'lucide-react';
import { ServiceIconBadge } from '@/components/ServiceIconBadge';
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
import { Card } from '@/components/ui/card';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useMasonryColumns } from '@/hooks/useMasonryColumns';
import { calculatePrice, formatTry, readItemPriceFromState } from '@/services/pricing';
import type {
  AdminSummarySelection,
  FinanceConfig,
  PricesStateMap,
  ServiceGroupsMap,
} from '@/types';
import { cn } from '@/utils/cn';

interface AdminServiceGridProps {
  selectedBrand: string;
  selectedDevice: string;
  serviceGroups: ServiceGroupsMap;
  activeServiceFilter: string;
  pricesState: PricesStateMap;
  financeConfig: FinanceConfig;
  selectedAdminSummary: AdminSummarySelection | null;
  onSelectAdminSummary: (sel: AdminSummarySelection) => void;
  onPriceChange: (
    brand: string,
    device: string,
    group: string,
    quality: string,
    usdVal: string,
    laborVal: string,
  ) => void;
  onRemoveGroup: (groupName: string) => void;
  onRemoveQuality: (groupName: string, qualityName: string) => void;
  onAddQuality: (groupName: string, qualityName: string) => boolean;
  flashTargetKey: string | null;
}

type PendingDeleteAction =
  | { kind: 'group'; group: string }
  | { kind: 'quality'; group: string; quality: string }
  | null;

interface AdminTileRowProps {
  group: string;
  quality: string;
  usd: string;
  labor: string;
  financeConfig: FinanceConfig;
  isSummarySelected: boolean;
  isFlashed: boolean;
  onSelectSummary: () => void;
  onPriceChange: (usdVal: string, laborVal: string) => void;
  onRequestDeleteQuality: () => void;
}

function AdminTileRow({
  group,
  quality,
  usd,
  labor,
  financeConfig,
  isSummarySelected,
  isFlashed,
  onSelectSummary,
  onPriceChange,
  onRequestDeleteQuality,
}: AdminTileRowProps) {
  const baseId = useId();
  const [savedVisible, setSavedVisible] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const triggerSaved = () => {
    setSavedVisible(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setSavedVisible(false), 2200);
  };

  const calc = calculatePrice(
    usd,
    labor,
    financeConfig.rate,
    financeConfig.vatRate,
    financeConfig.roundingMode,
  );

  return (
    <div
      data-service-item={`${group}|${quality}`}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest('input, button')) return;
        onSelectSummary();
      }}
      className={cn(
        'cursor-pointer space-y-2 px-3 py-2.5 transition-colors hover:bg-[var(--bg-elevated)]/65',
        calc.hasPrice && 'shadow-[inset_3px_0_0_var(--quality-accent)]',
        isSummarySelected && 'bg-accent shadow-[inset_3px_0_0_var(--foreground)]',
        isFlashed && 'search-flash',
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="break-words text-[14px] font-semibold text-[var(--quality-text)]">
          {quality}
        </span>

        <div className="flex shrink-0 items-center gap-1.5">
          <span
            className={cn(
              'rounded border border-[var(--price-border)] bg-[var(--price-bg)] px-1.5 py-0.5 text-[11px] font-medium text-[var(--price-text)] transition-opacity',
              savedVisible ? 'opacity-100' : 'pointer-events-none opacity-0',
            )}
          >
            ✓ Kaydedildi
          </span>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onRequestDeleteQuality();
            }}
            title="Kaliteyi Sil"
            aria-label={`${quality} kalitesini sil`}
            className="inline-flex size-5.5 items-center justify-center rounded text-muted-foreground opacity-65 transition-colors hover:bg-[var(--danger-soft)] hover:text-[var(--danger)] hover:opacity-100"
          >
            <Trash2 className="size-3.5" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-[1fr_1fr_minmax(92px,auto)] items-end gap-2">
        <div className="space-y-1">
          <Label htmlFor={`${baseId}-usd`} className="text-[11px] font-medium text-muted-foreground">
            Maliyet ($)
          </Label>
          <div className="relative flex items-center">
            <span className="mono-nums pointer-events-none absolute left-2 text-xs text-muted-foreground">
              $
            </span>
            <Input
              id={`${baseId}-usd`}
              type="number"
              step="0.5"
              min="0"
              inputMode="decimal"
              placeholder="0"
              value={usd}
              onChange={(e) => {
                onPriceChange(e.target.value, labor);
                triggerSaved();
              }}
              className="mono-nums no-spinner h-[30px] bg-[var(--bg-elevated)] pr-2 pl-5 text-right text-base font-medium sm:text-[13px]"
            />
          </div>
        </div>

        <div className="space-y-1">
          <Label htmlFor={`${baseId}-labor`} className="text-[11px] font-medium text-muted-foreground">
            İşçilik (₺)
          </Label>
          <div className="relative flex items-center">
            <span className="mono-nums pointer-events-none absolute left-2 text-xs text-muted-foreground">
              ₺
            </span>
            <Input
              id={`${baseId}-labor`}
              type="number"
              step="10"
              min="0"
              inputMode="decimal"
              placeholder="0"
              value={labor}
              onChange={(e) => {
                onPriceChange(usd, e.target.value);
                triggerSaved();
              }}
              className="mono-nums no-spinner h-[30px] bg-[var(--bg-elevated)] pr-2 pl-5 text-right text-base font-medium sm:text-[13px]"
            />
          </div>
        </div>

        <div className="space-y-1">
          <span className="block text-[11px] font-semibold text-[var(--price-text)]">
            Satış Fiyatı
          </span>
          <div
            className={cn(
              'mono-nums flex h-[30px] items-center justify-center rounded-md px-2.5 text-[13px] font-semibold whitespace-nowrap text-[var(--price-text)]',
              calc.hasPrice
                ? 'border border-[var(--price-border)] bg-[var(--price-bg)]'
                : 'border border-dashed border-[var(--price-border)] bg-[var(--price-bg)]/50',
            )}
          >
            {calc.hasPrice ? formatTry(calc.finalPrice) : '-'}
          </div>
        </div>
      </div>

      {calc.hasPrice && (
        <div className="mono-nums flex flex-wrap items-center justify-between gap-2 pt-0.5 text-[11px] font-medium text-muted-foreground">
          <span>Parça: {formatTry(calc.tlPart)}</span>
          <span>Ham: {formatTry(calc.rawTotal)}</span>
          <span>
            KDV %{financeConfig.vatRate}: {formatTry(calc.vatAmount)}
          </span>
        </div>
      )}
    </div>
  );
}

export function AdminServiceGrid({
  selectedBrand,
  selectedDevice,
  serviceGroups,
  activeServiceFilter,
  pricesState,
  financeConfig,
  selectedAdminSummary,
  onSelectAdminSummary,
  onPriceChange,
  onRemoveGroup,
  onRemoveQuality,
  onAddQuality,
  flashTargetKey,
}: AdminServiceGridProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [pendingDelete, setPendingDelete] = useState<PendingDeleteAction>(null);
  const [addingQualityGroup, setAddingQualityGroup] = useState<string | null>(null);
  const [inlineQualityName, setInlineQualityName] = useState('');

  const groupNames = Object.keys(serviceGroups);
  const targetGroups =
    activeServiceFilter === 'ALL'
      ? groupNames
      : groupNames.filter((g) => g === activeServiceFilter);

  const cards = targetGroups.map((grp, order) => {
    const qualities = serviceGroups[grp] || [];
    return {
      group: grp,
      qualities,
      rowsCount: qualities.length,
      order,
    };
  });

  const columns = useMasonryColumns(containerRef, cards, 300);

  if (!selectedDevice) {
    return (
      <Empty className="border-dashed bg-[var(--bg-surface)] py-12">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Wrench />
          </EmptyMedia>
          <EmptyTitle>Cihaz Seçin</EmptyTitle>
          <EmptyDescription>
            Maliyet ve işçilik girişi yapmak için sol rehberden bir cihaz seçin.
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
          <EmptyTitle>Eşleşen İşlem Yok</EmptyTitle>
          <EmptyDescription>
            Seçili filtre kriterine uygun hizmet kalemi bulunamadı.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <>
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
                  <div className="flex items-center justify-between gap-2 border-b bg-[var(--bg-elevated)]/70 px-3 py-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <ServiceIconBadge groupName={card.group} className="size-6.5" />
                      <h2 className="truncate text-[14px] font-semibold tracking-tight text-[var(--group-title-text)]">
                        {card.group}
                      </h2>
                    </div>

                    <div className="flex shrink-0 items-center gap-1">
                      <Popover
                        open={addingQualityGroup === card.group}
                        onOpenChange={(next) => {
                          setAddingQualityGroup(next ? card.group : null);
                          if (!next) setInlineQualityName('');
                        }}
                      >
                        <PopoverTrigger asChild>
                          <button
                            type="button"
                            title={`${card.group} grubuna kalite ekle`}
                            aria-label={`${card.group} grubuna kalite ekle`}
                            className="inline-flex size-6 items-center justify-center rounded text-muted-foreground opacity-75 transition-colors hover:bg-background hover:text-foreground hover:opacity-100"
                          >
                            <Plus className="size-3.5" />
                          </button>
                        </PopoverTrigger>
                        <PopoverContent align="end" className="w-64 p-3">
                          <form
                            onSubmit={(e: FormEvent) => {
                              e.preventDefault();
                              if (onAddQuality(card.group, inlineQualityName)) {
                                setInlineQualityName('');
                                setAddingQualityGroup(null);
                              }
                            }}
                            className="space-y-2.5"
                          >
                            <div className="text-xs font-semibold text-foreground">
                              {card.group} · Kalite Ekle
                            </div>
                            <Input
                              value={inlineQualityName}
                              onChange={(e) => setInlineQualityName(e.target.value)}
                              placeholder="Örn: Revize"
                              className="h-8 bg-[var(--bg-elevated)] text-base sm:text-xs"
                              autoFocus
                            />
                            <div className="flex justify-end gap-1.5">
                              <Button
                                type="button"
                                variant="secondary"
                                size="xs"
                                onClick={() => setAddingQualityGroup(null)}
                              >
                                İptal
                              </Button>
                              <Button type="submit" size="xs">
                                Ekle
                              </Button>
                            </div>
                          </form>
                        </PopoverContent>
                      </Popover>

                      <button
                        type="button"
                        onClick={() => setPendingDelete({ kind: 'group', group: card.group })}
                        title="Hizmeti Sil"
                        aria-label={`${card.group} hizmetini sil`}
                        className="inline-flex size-6 items-center justify-center rounded text-muted-foreground opacity-65 transition-colors hover:bg-[var(--danger-soft)] hover:text-[var(--danger)] hover:opacity-100"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                  </div>

                  <div className="divide-y divide-border">
                    {card.qualities.map((qual) => {
                      const { usd, labor } = readItemPriceFromState(
                        pricesState,
                        selectedBrand,
                        selectedDevice,
                        card.group,
                        qual,
                      );
                      const isSummarySelected = Boolean(
                        selectedAdminSummary &&
                          selectedAdminSummary.brand === selectedBrand &&
                          selectedAdminSummary.device === selectedDevice &&
                          selectedAdminSummary.group === card.group &&
                          selectedAdminSummary.quality === qual,
                      );
                      const isTileFlashed = flashTargetKey === `item:${card.group}|${qual}`;

                      return (
                        <AdminTileRow
                          key={`${selectedBrand}|${selectedDevice}|${card.group}|${qual}`}
                          group={card.group}
                          quality={qual}
                          usd={usd}
                          labor={labor}
                          financeConfig={financeConfig}
                          isSummarySelected={isSummarySelected}
                          isFlashed={isTileFlashed}
                          onSelectSummary={() =>
                            onSelectAdminSummary({
                              brand: selectedBrand,
                              device: selectedDevice,
                              group: card.group,
                              quality: qual,
                            })
                          }
                          onPriceChange={(nextUsd, nextLabor) =>
                            onPriceChange(
                              selectedBrand,
                              selectedDevice,
                              card.group,
                              qual,
                              nextUsd,
                              nextLabor,
                            )
                          }
                          onRequestDeleteQuality={() =>
                            setPendingDelete({
                              kind: 'quality',
                              group: card.group,
                              quality: qual,
                            })
                          }
                        />
                      );
                    })}
                  </div>
                </Card>
              );
            })}
          </div>
        ))}
      </div>

      <AlertDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pendingDelete?.kind === 'group' ? 'Hizmet Grubunu Sil' : 'Kalite Sınıfını Sil'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete?.kind === 'group'
                ? `"${pendingDelete.group}" hizmetini ve altındaki tüm kaliteleri silmek istiyor musunuz?`
                : pendingDelete?.kind === 'quality'
                  ? `"${pendingDelete.group}" altındaki "${pendingDelete.quality}" kalitesini silmek istiyor musunuz?`
                  : ''}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>İptal</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (!pendingDelete) return;
                if (pendingDelete.kind === 'group') {
                  onRemoveGroup(pendingDelete.group);
                } else {
                  onRemoveQuality(pendingDelete.group, pendingDelete.quality);
                }
                setPendingDelete(null);
              }}
            >
              Sil
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
