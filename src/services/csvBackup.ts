import { STORAGE_KEYS } from '../config/defaults.ts';
import type {
  BackupDirectoryHandle,
  CatalogState,
  DailyBackupsMap,
  DevicesByBrand,
  PricesStateMap,
  ServiceGroupsMap,
} from '../types/index.ts';
import {
  calculatePrice,
  getFinanceConfigFromState,
  getSlugItemBase,
  readItemPriceFromState,
  safeJsonParse,
} from './pricing.ts';
import { sortDevicesForBrand } from './sorting.ts';
import { ensureDefaultsInPricesState } from './storage.ts';

// Günlük değişiklik odaklı CSV yedekleme, geri yükleme ve yerel klasör senkronizasyonu (V2 ile %100 uyumlu)

export function getTodayDateKey(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function computeDataFingerprint(state: CatalogState): string {
  const sortedGroups: ServiceGroupsMap = {};
  for (const g of Object.keys(state.serviceGroups).sort()) {
    sortedGroups[g] = [...(state.serviceGroups[g] || [])];
  }
  const sortedDevices: DevicesByBrand = {};
  for (const b of Object.keys(state.devicesMap).sort()) {
    sortedDevices[b] = [...(state.devicesMap[b] || [])];
  }
  const sortedPrices: PricesStateMap = {};
  for (const k of Object.keys(state.pricesState).sort()) {
    if (k === '__adminPassword') continue;
    sortedPrices[k] = state.pricesState[k];
  }
  const canonical = JSON.stringify({
    categories: state.categories,
    serviceGroups: sortedGroups,
    devicesMap: sortedDevices,
    prices: sortedPrices,
  });

  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < canonical.length; i++) {
    const c = canonical.charCodeAt(i);
    h1 ^= c;
    h1 = Math.imul(h1, 0x01000193);
    h2 ^= c + i;
    h2 = Math.imul(h2, 0x85ebca6b);
  }
  return `${(h1 >>> 0).toString(16)}-${(h2 >>> 0).toString(16)}-${canonical.length}`;
}

export function getDailyBackupsMap(): DailyBackupsMap {
  const map = safeJsonParse<DailyBackupsMap>(localStorage.getItem(STORAGE_KEYS.dailyBackups), {});
  return map && typeof map === 'object' ? map : {};
}

export function saveDailyBackupsMap(map: DailyBackupsMap): void {
  localStorage.setItem(STORAGE_KEYS.dailyBackups, JSON.stringify(map));
}

export function countAllPricedItems(state: CatalogState): number {
  const cfg = getFinanceConfigFromState(state.pricesState);
  let count = 0;
  for (const brand of state.categories) {
    for (const dev of state.devicesMap[brand] || []) {
      for (const grp of Object.keys(state.serviceGroups)) {
        for (const qual of state.serviceGroups[grp] || []) {
          const { usd, labor } = readItemPriceFromState(state.pricesState, brand, dev, grp, qual);
          const calc = calculatePrice(usd, labor, cfg.rate, cfg.vatRate, cfg.roundingMode);
          if (calc.hasPrice) count++;
        }
      }
    }
  }
  return count;
}

export function csvEscape(val: unknown): string {
  const s = val === null || val === undefined ? '' : String(val);
  if (/[;,"\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function generateBackupCsv(state: CatalogState): string {
  const cfg = getFinanceConfigFromState(state.pricesState);
  const rows: string[] = [];
  rows.push(
    [
      'KayitTipi',
      'Marka',
      'CihazModeli',
      'HizmetGrubu',
      'KaliteSinifi',
      'ParcaUSD',
      'IscilikTRY',
      'DolarKuru',
      'KDV',
      'Yuvarlama',
      'SatisFiyatiTRY',
    ].join(';'),
  );

  rows.push(
    [
      'CONFIG',
      '',
      '',
      '',
      '',
      '',
      '',
      csvEscape(cfg.rate),
      csvEscape(cfg.vatRate),
      csvEscape(cfg.roundingMode),
      '',
    ].join(';'),
  );

  for (const brand of state.categories) {
    rows.push(['BRAND', csvEscape(brand), '', '', '', '', '', '', '', '', ''].join(';'));
    for (const dev of state.devicesMap[brand] || []) {
      rows.push(['DEVICE', csvEscape(brand), csvEscape(dev), '', '', '', '', '', '', '', ''].join(';'));
    }
  }

  for (const grp of Object.keys(state.serviceGroups)) {
    for (const qual of state.serviceGroups[grp] || []) {
      rows.push(['GROUP', '', '', csvEscape(grp), csvEscape(qual), '', '', '', '', '', ''].join(';'));
    }
  }

  for (const brand of state.categories) {
    for (const dev of state.devicesMap[brand] || []) {
      for (const grp of Object.keys(state.serviceGroups)) {
        for (const qual of state.serviceGroups[grp] || []) {
          const { usd, labor } = readItemPriceFromState(state.pricesState, brand, dev, grp, qual);
          if (usd === '' && labor === '') continue;
          const calc = calculatePrice(usd, labor, cfg.rate, cfg.vatRate, cfg.roundingMode);
          rows.push(
            [
              'ITEM',
              csvEscape(brand),
              csvEscape(dev),
              csvEscape(grp),
              csvEscape(qual),
              csvEscape(usd === '' ? 0 : usd),
              csvEscape(labor === '' ? 0 : labor),
              csvEscape(cfg.rate),
              csvEscape(cfg.vatRate),
              csvEscape(cfg.roundingMode),
              csvEscape(calc.hasPrice ? calc.finalPrice : ''),
            ].join(';'),
          );
        }
      }
    }
  }

  return `\uFEFF${rows.join('\r\n')}`;
}

export function parseCsvRows(csvText: string): string[][] {
  const cleaned = String(csvText || '').replace(/^\uFEFF/, '');
  const lines: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;
  let delimiter = ';';

  const firstBreak = cleaned.search(/\r?\n/);
  const firstLine = firstBreak === -1 ? cleaned : cleaned.slice(0, firstBreak);
  if (firstLine.split(',').length > firstLine.split(';').length) {
    delimiter = ',';
  }

  for (let i = 0; i < cleaned.length; i++) {
    const ch = cleaned[i];
    if (inQuotes) {
      if (ch === '"') {
        if (cleaned[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      row.push(cell);
      cell = '';
    } else if (ch === '\r') {
      if (cleaned[i + 1] === '\n') i++;
      row.push(cell);
      if (row.some((c) => c !== '')) lines.push(row);
      row = [];
      cell = '';
    } else if (ch === '\n') {
      row.push(cell);
      if (row.some((c) => c !== '')) lines.push(row);
      row = [];
      cell = '';
    } else {
      cell += ch;
    }
  }
  row.push(cell);
  if (row.some((c) => c !== '')) lines.push(row);
  return lines;
}

export interface CsvParseResult {
  ok: boolean;
  error?: string;
  state?: CatalogState;
}

export function parseBackupCsvToCatalog(
  csvText: string,
  existingAdminPassword?: string,
): CsvParseResult {
  const rows = parseCsvRows(csvText);
  if (rows.length < 2) {
    return { ok: false, error: 'Geçersiz veya boş CSV dosyası!' };
  }

  const header = rows[0].map((h) => h.trim());
  const colIdx = (name: string, fallbackIdx: number): number => {
    const idx = header.indexOf(name);
    return idx !== -1 ? idx : fallbackIdx;
  };
  if (!header.includes('KayitTipi')) {
    return { ok: false, error: 'CSV başlık formatı tanınmadı ("KayitTipi" sütunu eksik).' };
  }

  const iType = colIdx('KayitTipi', 0);
  const iBrand = colIdx('Marka', 1);
  const iDev = colIdx('CihazModeli', 2);
  const iGrp = colIdx('HizmetGrubu', 3);
  const iQual = colIdx('KaliteSinifi', 4);
  const iUsd = colIdx('ParcaUSD', 5);
  const iLabor = colIdx('IscilikTRY', 6);
  const iRate = colIdx('DolarKuru', 7);
  const iVat = colIdx('KDV', 8);
  const iRound = colIdx('Yuvarlama', 9);

  const nextCategories: string[] = [];
  const nextDevices: DevicesByBrand = {};
  const nextGroups: ServiceGroupsMap = {};
  const nextPrices: PricesStateMap = {};
  if (existingAdminPassword) {
    nextPrices.__adminPassword = existingAdminPassword;
  }

  const ensureBrand = (b: string): void => {
    if (!b) return;
    if (!nextCategories.includes(b)) nextCategories.push(b);
    if (!nextDevices[b]) nextDevices[b] = [];
  };
  const ensureDevice = (b: string, d: string): void => {
    if (!b || !d) return;
    ensureBrand(b);
    if (!nextDevices[b].includes(d)) nextDevices[b].push(d);
  };
  const ensureGroupQuality = (g: string, q: string): void => {
    if (!g) return;
    if (!nextGroups[g]) nextGroups[g] = [];
    if (q && !nextGroups[g].includes(q)) nextGroups[g].push(q);
  };

  for (let r = 1; r < rows.length; r++) {
    const cols = rows[r];
    const type = (cols[iType] || '').trim().toUpperCase();
    const brand = (cols[iBrand] || '').trim();
    const device = (cols[iDev] || '').trim();
    const group = (cols[iGrp] || '').trim();
    const quality = (cols[iQual] || '').trim();

    if (type === 'CONFIG') {
      const rVal = parseFloat(cols[iRate]);
      const vVal = parseFloat(cols[iVat]);
      const roundVal = (cols[iRound] || '').trim();
      if (Number.isFinite(rVal) && rVal >= 0) nextPrices.dollarRate = String(rVal);
      if (Number.isFinite(vVal) && vVal >= 0) nextPrices.vatRate = String(vVal);
      if (roundVal) nextPrices.roundingMode = roundVal === 'none' ? 'exact' : roundVal;
    } else if (type === 'BRAND') {
      ensureBrand(brand);
    } else if (type === 'DEVICE') {
      ensureDevice(brand, device);
    } else if (type === 'GROUP') {
      ensureGroupQuality(group, quality);
    } else if (type === 'ITEM') {
      ensureDevice(brand, device);
      ensureGroupQuality(group, quality);
      const usdRaw = (cols[iUsd] || '').trim();
      const laborRaw = (cols[iLabor] || '').trim();
      if (usdRaw !== '' || laborRaw !== '') {
        const slugBase = getSlugItemBase(device, group, quality);
        nextPrices[`${slugBase}-cost`] =
          usdRaw === '' ? '' : String(Math.max(0, parseFloat(usdRaw) || 0));
        nextPrices[`${slugBase}-labor`] =
          laborRaw === '' ? '' : String(Math.max(0, parseFloat(laborRaw) || 0));
      }
    }
  }

  if (!nextCategories.length && !Object.keys(nextGroups).length) {
    return { ok: false, error: 'CSV içinde geri yüklenecek geçerli veri bulunamadı.' };
  }

  for (const b of Object.keys(nextDevices)) {
    nextDevices[b] = sortDevicesForBrand(b, nextDevices[b]);
  }

  return {
    ok: true,
    state: {
      categories: nextCategories,
      devicesMap: nextDevices,
      serviceGroups: nextGroups,
      pricesState: ensureDefaultsInPricesState(nextPrices),
    },
  };
}

// --- IndexedDB & Doğrudan Yerel Klasöre CSV Yazma ---
function openFsIdb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') {
      resolve(null);
      return;
    }
    const req = indexedDB.open('kongoruBackupFsDB', 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('handles')) {
        db.createObjectStore('handles');
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
  });
}

export async function saveDirHandleToIdb(handle: BackupDirectoryHandle): Promise<void> {
  const db = await openFsIdb();
  if (!db) return;
  return new Promise((resolve) => {
    const tx = db.transaction('handles', 'readwrite');
    tx.objectStore('handles').put(handle, 'backupDir');
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
}

export async function loadDirHandleFromIdb(): Promise<BackupDirectoryHandle | null> {
  const db = await openFsIdb();
  if (!db) return null;
  return new Promise((resolve) => {
    const tx = db.transaction('handles', 'readonly');
    const req = tx.objectStore('handles').get('backupDir');
    req.onsuccess = () => resolve((req.result as BackupDirectoryHandle | undefined) || null);
    req.onerror = () => resolve(null);
  });
}

export async function clearDirHandleFromIdb(): Promise<void> {
  const db = await openFsIdb();
  if (!db) return;
  return new Promise((resolve) => {
    const tx = db.transaction('handles', 'readwrite');
    tx.objectStore('handles').delete('backupDir');
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
}

export async function writeCsvFileToHandle(
  dirHandle: BackupDirectoryHandle | null,
  fileName: string,
  csvText: string,
): Promise<{ ok: boolean; reason?: 'no-handle' | 'permission' }> {
  if (!dirHandle) return { ok: false, reason: 'no-handle' };
  if (typeof dirHandle.queryPermission === 'function') {
    const perm = await dirHandle.queryPermission({ mode: 'readwrite' });
    if (perm !== 'granted') return { ok: false, reason: 'permission' };
  }
  if (typeof dirHandle.removeEntry === 'function') {
    try {
      await dirHandle.removeEntry(fileName);
    } catch {
      // Eski dosya mevcut değilse yoksayılır
    }
  }
  const fileHandle = await dirHandle.getFileHandle(fileName, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(csvText);
  await writable.close();
  return { ok: true };
}

export function triggerCsvDownload(fileName: string, csvText: string): void {
  if (
    typeof Blob === 'undefined' ||
    typeof URL === 'undefined' ||
    typeof URL.createObjectURL !== 'function' ||
    !document.createElement ||
    !document.body
  ) {
    return;
  }
  const blob = new Blob([csvText], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
