import type {
  FinanceConfig,
  ItemPricePair,
  PriceCalculation,
  PricesStateMap,
  RoundingMode,
} from '../types/index.ts';

// Fiyat hesaplama, anahtar üretimi ve güvenli biçimlendirme yardımcıları (V2 ile %100 uyumlu)

export function makeSlug(str: string): string {
  return String(str || '').replace(/\s+/g, '-').replace(/[^\w-]/g, '');
}

export function safeJsonParse<T>(raw: string | null | undefined, fallback: T): T {
  try {
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function getSlugItemBase(device: string, group: string, quality: string): string {
  return `${makeSlug(device)}-${makeSlug(`${group}_${quality}`)}`;
}

export function calculatePrice(
  usdCost: string | number,
  laborCost: string | number,
  rate: number,
  vatRate: number,
  roundingMode: RoundingMode | string,
): PriceCalculation {
  const safeUsd = Math.max(0, parseFloat(String(usdCost)) || 0);
  const safeLabor = Math.max(0, parseFloat(String(laborCost)) || 0);
  const safeRate = Math.max(0, parseFloat(String(rate)) || 0);
  const safeVat = Math.max(0, parseFloat(String(vatRate)) || 0);

  const hasPrice = (safeUsd > 0 && safeRate > 0) || safeLabor > 0;
  if (!hasPrice) {
    return {
      hasPrice: false,
      tlPart: 0,
      rawTotal: 0,
      vatAmount: 0,
      withTax: 0,
      finalPrice: 0,
    };
  }

  const tlPart = safeUsd * safeRate;
  const rawTotal = tlPart + safeLabor;
  const vatAmount = rawTotal * (safeVat / 100);
  const withTax = Math.round((rawTotal + vatAmount) * 100) / 100;

  let finalPrice = withTax;
  if (roundingMode === 'ceil100') {
    finalPrice = Math.ceil(withTax / 100) * 100;
  } else if (roundingMode === 'ceil10') {
    finalPrice = Math.ceil(withTax / 10) * 10;
  }

  return {
    hasPrice: true,
    tlPart: Math.round(tlPart * 100) / 100,
    rawTotal: Math.round(rawTotal * 100) / 100,
    vatAmount: Math.round(vatAmount * 100) / 100,
    withTax,
    finalPrice,
  };
}

export function formatTry(num: number): string {
  return `${Number(num || 0).toLocaleString('tr-TR', { maximumFractionDigits: 2 })} ₺`;
}

export function escapeHtml(str: unknown): string {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function readItemPriceFromState(
  pricesState: PricesStateMap,
  brand: string,
  device: string,
  group: string,
  quality: string,
): ItemPricePair {
  const slugBase = getSlugItemBase(device, group, quality);
  const costVal = pricesState[`${slugBase}-cost`];
  const laborVal = pricesState[`${slugBase}-labor`];

  if (costVal !== undefined || laborVal !== undefined) {
    return {
      usd: costVal === undefined || costVal === null ? '' : String(costVal),
      labor: laborVal === undefined || laborVal === null ? '' : String(laborVal),
    };
  }

  const legacyKeys = [
    `${brand}|${device}|${group}|${quality}`,
    `${device}|${group}|${quality}`,
    `${brand}::${device}::${group}::${quality}`,
    `${device}::${group}::${quality}`,
    `${device}__${group}__${quality}`,
  ];
  for (const k of legacyKeys) {
    const entry = pricesState[k];
    if (entry && typeof entry === 'object') {
      const usdRaw = entry.usd !== undefined ? entry.usd : entry.usdCost;
      const laborRaw = entry.labor !== undefined ? entry.labor : entry.laborCost;
      return {
        usd: usdRaw === undefined || usdRaw === null ? '' : String(usdRaw),
        labor: laborRaw === undefined || laborRaw === null ? '' : String(laborRaw),
      };
    }
  }
  return { usd: '', labor: '' };
}

export function updateItemPriceInState(
  pricesState: PricesStateMap,
  brand: string,
  device: string,
  group: string,
  quality: string,
  usdVal: string | number | null | undefined,
  laborVal: string | number | null | undefined,
): PricesStateMap {
  const next = { ...pricesState };
  const slugBase = getSlugItemBase(device, group, quality);
  const costStr =
    usdVal === '' || usdVal === null || usdVal === undefined
      ? ''
      : String(Math.max(0, parseFloat(String(usdVal)) || 0));
  const laborStr =
    laborVal === '' || laborVal === null || laborVal === undefined
      ? ''
      : String(Math.max(0, parseFloat(String(laborVal)) || 0));

  if (costStr === '' && laborStr === '') {
    delete next[`${slugBase}-cost`];
    delete next[`${slugBase}-labor`];
  } else {
    next[`${slugBase}-cost`] = costStr === '' ? '' : costStr;
    next[`${slugBase}-labor`] = laborStr === '' ? '' : laborStr;
  }

  delete next[`${brand}|${device}|${group}|${quality}`];
  return next;
}

export function getFinanceConfigFromState(pricesState: PricesStateMap): FinanceConfig {
  const rateRaw = pricesState.dollarRate !== undefined ? pricesState.dollarRate : pricesState.__dollarRate;
  const vatRaw = pricesState.vatRate !== undefined ? pricesState.vatRate : pricesState.__vatRate;

  const rate = Math.max(0, parseFloat(String(rateRaw ?? 0)) || 0);
  const vatRate = Math.max(0, parseFloat(String(vatRaw ?? 0)) || 0);
  const roundingMode: RoundingMode = 'ceil100';
  return { rate, vatRate, roundingMode };
}

export function getShortServiceTabLabel(groupName: string, isCustomerMode: boolean): string {
  if (!isCustomerMode) return groupName;
  if (groupName === 'Ekran Değişimi') return 'Ekran';
  if (groupName === 'Batarya Değişimi') return 'Batarya';
  if (groupName === 'Kamera Değişimi') return 'Kamera';
  if (groupName === 'Soket İşlemleri') return 'Soket';
  if (groupName === 'Ahize Değişimi') return 'Ahize';
  if (groupName === 'Ön Cam - Dokunmatik') return 'Ön Cam';
  if (groupName === 'Diğer İşlemler') return 'Diğer';
  return groupName;
}
