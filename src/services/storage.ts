import {
  DEFAULT_CATEGORIES,
  DEFAULT_DEVICES_LIST,
  DEFAULT_PASSWORD,
  DEFAULT_PRICES,
  DEFAULT_SERVICE_GROUPS,
  STORAGE_KEYS,
} from '../config/defaults.ts';
import type {
  CatalogState,
  DevicesByBrand,
  PricesStateMap,
  SerializedDeviceEntry,
  ServiceGroupsMap,
} from '../types/index.ts';
import { safeJsonParse } from './pricing.ts';

// V2 localStorage şeması ile %100 uyumlu okuma ve yazma katmanı

export function normalizeDevicesToMap(rawDevices: unknown): DevicesByBrand {
  const map: DevicesByBrand = {};
  if (Array.isArray(rawDevices)) {
    for (const item of rawDevices) {
      if (!item || typeof item !== 'object') continue;
      const entry = item as Partial<SerializedDeviceEntry>;
      if (!entry.name) continue;
      const cat = entry.category || 'Diğer';
      if (!map[cat]) map[cat] = [];
      if (!map[cat].includes(entry.name)) {
        map[cat].push(entry.name);
      }
    }
    return map;
  }
  if (rawDevices && typeof rawDevices === 'object') {
    for (const [cat, list] of Object.entries(rawDevices as Record<string, unknown>)) {
      if (Array.isArray(list)) {
        map[cat] = list.map((v) => String(v));
      }
    }
  }
  return map;
}

export function serializeDevicesToList(
  categories: readonly string[],
  devicesMap: DevicesByBrand,
): SerializedDeviceEntry[] {
  const list: SerializedDeviceEntry[] = [];
  const seenCats = new Set<string>();
  for (const cat of categories) {
    seenCats.add(cat);
    for (const name of devicesMap[cat] || []) {
      list.push({ name, category: cat });
    }
  }
  for (const cat of Object.keys(devicesMap)) {
    if (seenCats.has(cat)) continue;
    for (const name of devicesMap[cat] || []) {
      list.push({ name, category: cat });
    }
  }
  return list;
}

export function ensureDefaultsInPricesState(rawPrices: PricesStateMap): PricesStateMap {
  const next: PricesStateMap = { ...rawPrices };
  if (next.dollarRate === undefined || next.dollarRate === '') {
    next.dollarRate = next.__dollarRate !== undefined ? String(next.__dollarRate) : '50';
  }
  if (next.vatRate === undefined || next.vatRate === '') {
    next.vatRate = next.__vatRate !== undefined ? String(next.__vatRate) : '20';
  }
  next.roundingMode = 'ceil100';
  delete next.__dollarRate;
  delete next.__vatRate;
  delete next.__roundingMode;
  return next;
}

export function resolveInitialSelection(
  categories: readonly string[],
  devicesMap: DevicesByBrand,
  currentBrand: string,
  currentDevice: string,
): { brand: string; device: string } {
  let brand = currentBrand;
  let device = currentDevice;

  if (!brand || !categories.includes(brand)) {
    brand = categories[0] || '';
  }
  const brandDevices = devicesMap[brand] || [];
  if (!device || !brandDevices.includes(device)) {
    device = brandDevices[0] || '';
    if (!device) {
      for (const cat of categories) {
        const list = devicesMap[cat] || [];
        if (list.length) {
          brand = cat;
          device = list[0];
          break;
        }
      }
    }
  }
  return { brand, device };
}

export function loadLocalCatalog(): CatalogState {
  const storedCats = safeJsonParse<string[] | null>(
    localStorage.getItem(STORAGE_KEYS.categories),
    null,
  );
  const storedGroups = safeJsonParse<ServiceGroupsMap | null>(
    localStorage.getItem(STORAGE_KEYS.groups),
    null,
  );
  const storedDevices = safeJsonParse<unknown>(localStorage.getItem(STORAGE_KEYS.devices), null);
  const storedPrices = safeJsonParse<PricesStateMap | null>(
    localStorage.getItem(STORAGE_KEYS.prices),
    null,
  );

  const hasMainSiteDeviceArray = Array.isArray(storedDevices) && storedDevices.length > 0;

  const categories =
    hasMainSiteDeviceArray && Array.isArray(storedCats) && storedCats.length
      ? [...storedCats]
      : [...DEFAULT_CATEGORIES];

  const serviceGroups =
    storedGroups && typeof storedGroups === 'object' && Object.keys(storedGroups).length
      ? (JSON.parse(JSON.stringify(storedGroups)) as ServiceGroupsMap)
      : (JSON.parse(JSON.stringify(DEFAULT_SERVICE_GROUPS)) as ServiceGroupsMap);

  const devicesMap = hasMainSiteDeviceArray
    ? normalizeDevicesToMap(storedDevices)
    : normalizeDevicesToMap(DEFAULT_DEVICES_LIST);

  for (const itemCat of Object.keys(devicesMap)) {
    if (!categories.includes(itemCat)) categories.push(itemCat);
  }

  const rawPrices =
    storedPrices && typeof storedPrices === 'object'
      ? storedPrices
      : (JSON.parse(JSON.stringify(DEFAULT_PRICES)) as PricesStateMap);

  return {
    categories,
    serviceGroups,
    devicesMap,
    pricesState: ensureDefaultsInPricesState(rawPrices),
  };
}

export function saveLocalCatalog(state: CatalogState): void {
  localStorage.setItem(STORAGE_KEYS.categories, JSON.stringify(state.categories));
  localStorage.setItem(STORAGE_KEYS.groups, JSON.stringify(state.serviceGroups));
  localStorage.setItem(
    STORAGE_KEYS.devices,
    JSON.stringify(serializeDevicesToList(state.categories, state.devicesMap)),
  );
  localStorage.setItem(STORAGE_KEYS.prices, JSON.stringify(state.pricesState));
}

export function getAdminPasswordFromStorage(pricesState: PricesStateMap): string {
  const localPass = localStorage.getItem(STORAGE_KEYS.password);
  if (localPass && localPass.trim()) return localPass;
  if (typeof pricesState.__adminPassword === 'string' && pricesState.__adminPassword.trim()) {
    return pricesState.__adminPassword;
  }
  return DEFAULT_PASSWORD;
}
