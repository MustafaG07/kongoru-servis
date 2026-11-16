import { useEffect, useState, type FormEvent } from 'react';
import { RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { calculatePrice, formatTry, readItemPriceFromState } from '@/services/pricing';
import type {
  AdminSummarySelection,
  FinanceConfig,
  PricesStateMap,
  ServiceGroupsMap,
} from '@/types';

interface AdminControlPanelProps {
  financeConfig: FinanceConfig;
  onFinanceChange: (dollarRate: string, vatRate: string) => void;
  selectedDevice: string;
  selectedBrand: string;
  selectedSummary: AdminSummarySelection | null;
  pricesState: PricesStateMap;
  onResetSummary: () => void;
  categories: readonly string[];
  serviceGroups: ServiceGroupsMap;
  onAddDevice: (brand: string, name: string) => boolean;
  onAddQuality: (groupName: string, qualityName: string) => boolean;
  onAddGroup: (groupName: string) => boolean;
  onAddBrand: (brandName: string) => boolean;
}

export function AdminControlPanel({
  financeConfig,
  onFinanceChange,
  selectedDevice,
  selectedBrand,
  selectedSummary,
  pricesState,
  onResetSummary,
  categories,
  serviceGroups,
  onAddDevice,
  onAddQuality,
  onAddGroup,
  onAddBrand,
}: AdminControlPanelProps) {
  const groupKeys = Object.keys(serviceGroups);

  const [deviceBrand, setDeviceBrand] = useState(selectedBrand || categories[0] || '');
  const [newDeviceName, setNewDeviceName] = useState('');

  const [qualityGroup, setQualityGroup] = useState(groupKeys[0] || '');
  const [newQualityName, setNewQualityName] = useState('');

  const [newGroupName, setNewGroupName] = useState('');
  const [newBrandName, setNewBrandName] = useState('');

  useEffect(() => {
    if (selectedBrand && categories.includes(selectedBrand)) {
      setDeviceBrand(selectedBrand);
    } else if (!categories.includes(deviceBrand)) {
      setDeviceBrand(categories[0] || '');
    }
  }, [categories, deviceBrand, selectedBrand]);

  useEffect(() => {
    if (!groupKeys.includes(qualityGroup)) {
      setQualityGroup(groupKeys[0] || '');
    }
  }, [groupKeys, qualityGroup]);

  const hasMatchingSummary = Boolean(
    selectedSummary &&
      selectedSummary.brand === selectedBrand &&
      selectedSummary.device === selectedDevice,
  );

  let serviceText = 'Seçilmedi';
  let priceText = '- ₺';

  if (hasMatchingSummary && selectedSummary) {
    serviceText = `${selectedSummary.group} - ${selectedSummary.quality}`;
    const { usd, labor } = readItemPriceFromState(
      pricesState,
      selectedSummary.brand,
      selectedSummary.device,
      selectedSummary.group,
      selectedSummary.quality,
    );
    const calc = calculatePrice(
      usd,
      labor,
      financeConfig.rate,
      financeConfig.vatRate,
      financeConfig.roundingMode,
    );
    priceText = calc.hasPrice ? formatTry(calc.finalPrice) : '- ₺';
  }

  const handleAddDevice = (e: FormEvent) => {
    e.preventDefault();
    if (onAddDevice(deviceBrand, newDeviceName)) setNewDeviceName('');
  };

  const handleAddQuality = (e: FormEvent) => {
    e.preventDefault();
    if (onAddQuality(qualityGroup, newQualityName)) setNewQualityName('');
  };

  const handleAddGroup = (e: FormEvent) => {
    e.preventDefault();
    if (onAddGroup(newGroupName)) setNewGroupName('');
  };

  const handleAddBrand = (e: FormEvent) => {
    e.preventDefault();
    if (onAddBrand(newBrandName)) setNewBrandName('');
  };

  return (
    <Card className="gap-0 overflow-hidden rounded-xl border bg-[var(--bg-surface)] p-0 shadow-none">
      {/* Üst Satır: Kur, KDV ve Anlık İşlem Özeti */}
      <div className="flex flex-col gap-2.5 px-3.5 py-2.5 lg:flex-row lg:items-end lg:justify-between">
        <div className="grid grid-cols-2 gap-2 sm:flex sm:items-end">
          <div className="space-y-1">
            <Label
              htmlFor="v3DollarRate"
              className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground"
            >
              Dolar Kuru (₺)
            </Label>
            <Input
              id="v3DollarRate"
              type="number"
              step="0.01"
              min="0"
              inputMode="decimal"
              value={String(financeConfig.rate)}
              onChange={(e) => onFinanceChange(e.target.value, String(financeConfig.vatRate))}
              className="mono-nums h-8 w-full bg-[var(--bg-elevated)] text-right text-base font-medium sm:w-[88px] sm:text-sm"
            />
          </div>

          <div className="space-y-1">
            <Label
              htmlFor="v3VatRate"
              className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground"
            >
              KDV (%)
            </Label>
            <Input
              id="v3VatRate"
              type="number"
              step="1"
              min="0"
              max="100"
              inputMode="decimal"
              value={String(financeConfig.vatRate)}
              onChange={(e) => onFinanceChange(String(financeConfig.rate), e.target.value)}
              className="mono-nums h-8 w-full bg-[var(--bg-elevated)] text-right text-base font-medium sm:w-[74px] sm:text-sm"
            />
          </div>
        </div>

        <div className="flex flex-1 flex-wrap items-center justify-between gap-3 border-t pt-2.5 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-4">
          <div className="flex flex-wrap items-center gap-4 sm:gap-6">
            <div className="min-w-0 space-y-0.5">
              <div className="text-[10.5px] font-medium uppercase tracking-wide text-muted-foreground">
                Seçilen Cihaz
              </div>
              <div className="max-w-[220px] truncate text-sm font-semibold text-foreground">
                {selectedDevice || 'Seçilmedi'}
              </div>
            </div>

            <div className="min-w-0 space-y-0.5">
              <div className="text-[10.5px] font-medium uppercase tracking-wide text-muted-foreground">
                İşlem / Kalite
              </div>
              <div className="max-w-[240px] truncate text-sm font-medium text-foreground">
                {serviceText}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <div className="flex flex-col items-center gap-0.5">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--price-text)]">
                Anlık Fiyat
              </span>
              <span className="mono-nums min-w-[96px] rounded-md border border-[var(--price-border)] bg-[var(--price-bg)] px-3 py-1 text-center text-sm font-semibold text-[var(--price-text)]">
                {priceText}
              </span>
            </div>

            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onResetSummary}
              disabled={!hasMatchingSummary}
              className="h-8 gap-1 text-xs"
            >
              <RotateCcw className="size-3.5" />
              Sıfırla
            </Button>
          </div>
        </div>
      </div>

      {/* Alt Satır: Eşit Genişlikli 4'lü Hızlı Katalog Ekleme Şeridi */}
      <div className="grid grid-cols-1 gap-2 border-t bg-[var(--bg-elevated)]/40 p-2 sm:grid-cols-2 xl:grid-cols-4">
        {/* + Cihaz */}
        <form
          onSubmit={handleAddDevice}
          className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] items-end gap-1.5 rounded-lg border bg-[var(--bg-canvas)] p-2"
        >
          <div className="min-w-0">
            <Label
              htmlFor="v3QuickDeviceBrand"
              className="mb-1 block truncate text-[10.5px] font-medium leading-none text-muted-foreground"
            >
              Cihaz Sınıfı
            </Label>
            <Select value={deviceBrand} onValueChange={setDeviceBrand}>
              <SelectTrigger
                id="v3QuickDeviceBrand"
                size="sm"
                className="h-[30px] w-full min-w-0 bg-[var(--bg-surface)] text-xs"
              >
                <SelectValue placeholder="Marka" />
              </SelectTrigger>
              <SelectContent>
                {categories.map((cat) => (
                  <SelectItem key={cat} value={cat}>
                    {cat}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="min-w-0">
            <Label
              htmlFor="v3QuickDeviceName"
              className="mb-1 block truncate text-[10.5px] font-medium leading-none text-muted-foreground"
            >
              Cihaz Adı
            </Label>
            <Input
              id="v3QuickDeviceName"
              value={newDeviceName}
              onChange={(e) => setNewDeviceName(e.target.value)}
              placeholder="iPhone 16"
              className="h-[30px] w-full bg-[var(--bg-surface)] text-base sm:text-xs"
            />
          </div>
          <Button type="submit" size="sm" className="h-[30px] shrink-0 px-2.5 text-xs">
            + Cihaz
          </Button>
        </form>

        {/* + Kalite */}
        <form
          onSubmit={handleAddQuality}
          className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] items-end gap-1.5 rounded-lg border bg-[var(--bg-canvas)] p-2"
        >
          <div className="min-w-0">
            <Label
              htmlFor="v3QuickQualityGroup"
              className="mb-1 block truncate text-[10.5px] font-medium leading-none text-muted-foreground"
            >
              Ana Grup
            </Label>
            <Select value={qualityGroup} onValueChange={setQualityGroup}>
              <SelectTrigger
                id="v3QuickQualityGroup"
                size="sm"
                className="h-[30px] w-full min-w-0 bg-[var(--bg-surface)] text-xs"
              >
                <SelectValue placeholder="Hizmet" />
              </SelectTrigger>
              <SelectContent>
                {groupKeys.map((grp) => (
                  <SelectItem key={grp} value={grp}>
                    {grp}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="min-w-0">
            <Label
              htmlFor="v3QuickQualityName"
              className="mb-1 block truncate text-[10.5px] font-medium leading-none text-muted-foreground"
            >
              Kalite Adı
            </Label>
            <Input
              id="v3QuickQualityName"
              value={newQualityName}
              onChange={(e) => setNewQualityName(e.target.value)}
              placeholder="Revize"
              className="h-[30px] w-full bg-[var(--bg-surface)] text-base sm:text-xs"
            />
          </div>
          <Button
            type="submit"
            size="sm"
            className="h-[30px] shrink-0 bg-emerald-600 px-2.5 text-xs text-white hover:bg-emerald-700"
          >
            + Kalite
          </Button>
        </form>

        {/* + Hizmet */}
        <form
          onSubmit={handleAddGroup}
          className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-1.5 rounded-lg border bg-[var(--bg-canvas)] p-2"
        >
          <div className="min-w-0">
            <Label
              htmlFor="v3QuickGroupName"
              className="mb-1 block truncate text-[10.5px] font-medium leading-none text-muted-foreground"
            >
              Yeni Hizmet
            </Label>
            <Input
              id="v3QuickGroupName"
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              placeholder="Flex İşlemi"
              className="h-[30px] w-full bg-[var(--bg-surface)] text-base sm:text-xs"
            />
          </div>
          <Button
            type="submit"
            size="sm"
            className="h-[30px] shrink-0 bg-indigo-600 px-2.5 text-xs text-white hover:bg-indigo-700"
          >
            + Hizmet
          </Button>
        </form>

        {/* + Sınıf */}
        <form
          onSubmit={handleAddBrand}
          className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-1.5 rounded-lg border bg-[var(--bg-canvas)] p-2"
        >
          <div className="min-w-0">
            <Label
              htmlFor="v3QuickBrandName"
              className="mb-1 block truncate text-[10.5px] font-medium leading-none text-muted-foreground"
            >
              Yeni Sınıf
            </Label>
            <Input
              id="v3QuickBrandName"
              value={newBrandName}
              onChange={(e) => setNewBrandName(e.target.value)}
              placeholder="Huawei"
              className="h-[30px] w-full bg-[var(--bg-surface)] text-base sm:text-xs"
            />
          </div>
          <Button
            type="submit"
            size="sm"
            variant="outline"
            className="h-[30px] shrink-0 border-[var(--warning-border)] bg-[var(--warning-soft)] px-2.5 text-xs text-[var(--warning)] hover:opacity-90"
          >
            + Sınıf
          </Button>
        </form>
      </div>
    </Card>
  );
}
