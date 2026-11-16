import { useState } from 'react';
import { Check, ChevronDown, Trash2 } from 'lucide-react';
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
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  calculatePrice,
  formatTry,
  getShortServiceTabLabel,
  readItemPriceFromState,
} from '@/services/pricing';
import type {
  DevicesByBrand,
  FinanceConfig,
  PricesStateMap,
  ServiceGroupsMap,
} from '@/types';
import { cn } from '@/utils/cn';

interface DeviceBannerProps {
  categories: readonly string[];
  devicesMap: DevicesByBrand;
  selectedBrand: string;
  selectedDevice: string;
  onSelectBrandFromBanner: (brand: string) => void;
  onSelectDeviceFromBanner: (brand: string, device: string) => void;
  onRemoveDevice: (brand: string, device: string) => void;
  isCustomerMode: boolean;
  financeConfig: FinanceConfig;
  serviceGroups: ServiceGroupsMap;
  pricesState: PricesStateMap;
  activeServiceFilter: string;
  onSelectServiceFilter: (group: string) => void;
}

export function DeviceBanner({
  categories,
  devicesMap,
  selectedBrand,
  selectedDevice,
  onSelectBrandFromBanner,
  onSelectDeviceFromBanner,
  onRemoveDevice,
  isCustomerMode,
  financeConfig,
  serviceGroups,
  pricesState,
  activeServiceFilter,
  onSelectServiceFilter,
}: DeviceBannerProps) {
  const [brandMenuOpen, setBrandMenuOpen] = useState(false);
  const [deviceMenuOpen, setDeviceMenuOpen] = useState(false);
  const [devicePickerFilter, setDevicePickerFilter] = useState('');
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  const brandDevices = devicesMap[selectedBrand] || [];
  const filteredBannerDevices = devicePickerFilter.trim()
    ? brandDevices.filter((d) =>
        d.toLocaleLowerCase('tr-TR').includes(devicePickerFilter.trim().toLocaleLowerCase('tr-TR')),
      )
    : brandDevices;

  const serviceGroupNames = Object.keys(serviceGroups);

  let pricedOptions = 0;
  let pricedGroups = 0;
  let minFinalPrice = 0;

  if (selectedDevice && isCustomerMode) {
    for (const grp of serviceGroupNames) {
      let groupHasPriced = false;
      for (const qual of serviceGroups[grp] || []) {
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
        if (calc.hasPrice) {
          pricedOptions += 1;
          groupHasPriced = true;
          if (minFinalPrice === 0 || calc.finalPrice < minFinalPrice) {
            minFinalPrice = calc.finalPrice;
          }
        }
      }
      if (groupHasPriced) pricedGroups += 1;
    }
  }

  return (
    <Card className="gap-3 rounded-xl border bg-[var(--bg-surface)] px-4.5 py-3.5 shadow-none">
      {/* Ana Cihaz Başlık ve Metrik Alanı */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <Popover open={brandMenuOpen} onOpenChange={setBrandMenuOpen}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="inline-flex items-center gap-1 rounded-md border border-[var(--brand-pill-border)] bg-[var(--brand-pill-bg)] px-2.5 py-0.5 text-xs font-medium text-[var(--brand-pill-text)] transition-colors hover:border-[var(--border-strong)]"
                >
                  <span>{selectedBrand || '-'}</span>
                  <ChevronDown
                    className={cn(
                      'size-3.5 text-muted-foreground transition-transform',
                      brandMenuOpen && 'rotate-180',
                    )}
                  />
                </button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-56 overflow-hidden p-1.5">
                <ScrollArea className="max-h-64 pr-1">
                  <div className="flex flex-col gap-0.5">
                    {categories.map((cat) => {
                      const active = cat === selectedBrand;
                      return (
                        <button
                          key={cat}
                          type="button"
                          onClick={() => {
                            setBrandMenuOpen(false);
                            onSelectBrandFromBanner(cat);
                          }}
                          className={cn(
                            'flex w-full items-center justify-between rounded-md px-2.5 py-2 text-left text-xs font-medium transition-colors',
                            active
                              ? 'bg-primary text-primary-foreground'
                              : 'text-foreground hover:bg-[var(--bg-elevated)]',
                          )}
                        >
                          <span>{cat}</span>
                          {active && <Check className="size-3.5" />}
                        </button>
                      );
                    })}
                  </div>
                </ScrollArea>
              </PopoverContent>
            </Popover>
            {selectedDevice && isCustomerMode && (
              pricedOptions > 0 ? (
                <span className="mono-nums">
                  {pricedGroups} hizmet · {pricedOptions} seçenek ·{' '}
                  <span className="font-medium text-[var(--price-text)]">
                    {formatTry(minFinalPrice)}
                  </span>
                  &apos;den başlayan
                </span>
              ) : (
                <span>Henüz fiyat girilmemiş</span>
              )
            )}
            {!isCustomerMode && (
              <Badge variant="secondary" className="rounded-md text-[11px] font-medium">
                Yönetici Modu
              </Badge>
            )}
          </div>

          <Popover
            open={deviceMenuOpen}
            onOpenChange={(next) => {
              setDeviceMenuOpen(next);
              if (!next) setDevicePickerFilter('');
            }}
          >
            <PopoverTrigger asChild>
              <button
                type="button"
                className="group inline-flex max-w-full items-center gap-2 text-left"
              >
                <h1 className="break-words text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
                  {selectedDevice || 'Cihaz Seçin'}
                </h1>
                <ChevronDown
                  className={cn(
                    'size-4.5 shrink-0 text-muted-foreground transition-transform group-hover:text-foreground',
                    deviceMenuOpen && 'rotate-180',
                  )}
                />
              </button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-72 overflow-hidden p-2">
              {brandDevices.length > 6 && (
                <div className="mb-2">
                  <Input
                    value={devicePickerFilter}
                    onChange={(e) => setDevicePickerFilter(e.target.value)}
                    placeholder={`${selectedBrand} içinde ara...`}
                    className="h-8 text-base sm:text-xs"
                  />
                </div>
              )}
              <ScrollArea className="max-h-64 pr-1">
                {filteredBannerDevices.length === 0 ? (
                  <div className="px-2.5 py-4 text-center text-xs text-muted-foreground">
                    Bu markada cihaz bulunamadı
                  </div>
                ) : (
                  <div className="flex flex-col gap-0.5">
                    {filteredBannerDevices.map((dev) => {
                      const active = dev === selectedDevice;
                      return (
                        <button
                          key={dev}
                          type="button"
                          onClick={() => {
                            setDeviceMenuOpen(false);
                            setDevicePickerFilter('');
                            onSelectDeviceFromBanner(selectedBrand, dev);
                          }}
                          className={cn(
                            'flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-2 text-left text-xs font-medium transition-colors',
                            active
                              ? 'bg-primary text-primary-foreground'
                              : 'text-foreground hover:bg-[var(--bg-elevated)]',
                          )}
                        >
                          <span className="min-w-0 break-words">{dev}</span>
                          {active && <Check className="size-3.5 shrink-0" />}
                        </button>
                      );
                    })}
                  </div>
                )}
              </ScrollArea>
            </PopoverContent>
          </Popover>
        </div>

        {!isCustomerMode && (
          <div className="flex items-center gap-2">
            {selectedDevice && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setConfirmDeleteOpen(true)}
                className="h-9 gap-1.5 border-[var(--danger-border)] bg-[var(--danger-soft)] text-xs text-[var(--danger)] hover:opacity-90"
              >
                <Trash2 className="size-3.5" />
                <span>Cihazı Sil</span>
              </Button>
            )}
            <div className="rounded-lg border bg-[var(--bg-elevated)] px-3 py-1.5">
              <span className="block text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                Aktif Kur / KDV
              </span>
              <span className="mono-nums block text-xs font-semibold text-foreground">
                {financeConfig.rate} ₺ / %{financeConfig.vatRate}
              </span>
            </div>
          </div>
        )}
      </div>

      {selectedDevice && serviceGroupNames.length > 0 && (
        <div className="border-t pt-2.5">
          <Tabs value={activeServiceFilter} onValueChange={onSelectServiceFilter}>
            <TabsList className="h-auto w-full flex-wrap justify-start gap-2 bg-transparent p-0">
              <TabsTrigger
                value="ALL"
                className="h-8.5 flex-none rounded-lg border border-border bg-[var(--bg-surface)] px-3 text-xs font-medium text-muted-foreground data-[state=active]:border-primary data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
              >
                Tümü
              </TabsTrigger>
              {serviceGroupNames.map((grp) => (
                <TabsTrigger
                  key={grp}
                  value={grp}
                  className="h-8.5 flex-none rounded-lg border border-border bg-[var(--bg-surface)] px-3 text-xs font-medium text-muted-foreground data-[state=active]:border-primary data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
                >
                  {getShortServiceTabLabel(grp, isCustomerMode)}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>
      )}

      <AlertDialog open={confirmDeleteOpen} onOpenChange={setConfirmDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cihazı Sil</AlertDialogTitle>
            <AlertDialogDescription>
              &quot;{selectedDevice}&quot; ({selectedBrand}) cihazını ve bu cihaza ait fiyat
              kayıtlarını silmek istiyor musunuz?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>İptal</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (!selectedBrand || !selectedDevice) return;
                onRemoveDevice(selectedBrand, selectedDevice);
                setConfirmDeleteOpen(false);
              }}
            >
              Cihazı Sil
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
