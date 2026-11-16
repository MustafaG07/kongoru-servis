import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { STORAGE_KEYS } from '../config/defaults.ts';
import {
  clearDirHandleFromIdb,
  computeDataFingerprint,
  countAllPricedItems,
  generateBackupCsv,
  getDailyBackupsMap,
  getTodayDateKey,
  loadDirHandleFromIdb,
  parseBackupCsvToCatalog,
  saveDailyBackupsMap,
  saveDirHandleToIdb,
  triggerCsvDownload,
  writeCsvFileToHandle,
} from '../services/csvBackup.ts';
import { fetchGithubDb, pushGithubDb } from '../services/db.ts';
import {
  getFinanceConfigFromState,
  getSlugItemBase,
  readItemPriceFromState,
  updateItemPriceInState,
} from '../services/pricing.ts';
import { buildSearchIndex, type SearchDocument } from '../services/search.ts';
import { sortDevicesForBrand } from '../services/sorting.ts';
import {
  ensureDefaultsInPricesState,
  getAdminPasswordFromStorage,
  loadLocalCatalog,
  normalizeDevicesToMap,
  resolveInitialSelection,
  saveLocalCatalog,
  serializeDevicesToList,
} from '../services/storage.ts';
import type {
  AdminSummarySelection,
  BackupDirectoryHandle,
  CatalogState,
  DailyBackupsMap,
  GithubDbPayload,
  MobilePane,
  QuoteSelectionItem,
  SaveIndicatorMode,
  SyncStatus,
} from '../types/index.ts';

declare global {
  interface Window {
    showDirectoryPicker?: (options?: {
      mode?: 'read' | 'readwrite';
    }) => Promise<BackupDirectoryHandle>;
  }
}

export function useKongoruCatalog() {
  const initialCatalog = useMemo(() => loadLocalCatalog(), []);
  const initialSelection = useMemo(
    () => resolveInitialSelection(initialCatalog.categories, initialCatalog.devicesMap, '', ''),
    [initialCatalog],
  );

  const [catalog, setCatalog] = useState<CatalogState>(initialCatalog);
  const catalogRef = useRef<CatalogState>(initialCatalog);
  catalogRef.current = catalog;

  const [isCustomerMode, setIsCustomerMode] = useState<boolean>(
    () => localStorage.getItem(STORAGE_KEYS.uiMode) !== 'admin',
  );
  const [mobilePane, setMobilePane] = useState<MobilePane>('stage');

  const [selectedBrand, setSelectedBrand] = useState<string>(initialSelection.brand);
  const [selectedDevice, setSelectedDevice] = useState<string>(initialSelection.device);
  const [activeBrandFilter, setActiveBrandFilter] = useState<string>('ALL');
  const [activeServiceFilter, setActiveServiceFilter] = useState<string>('ALL');
  const [deviceSearchQuery, setDeviceSearchQuery] = useState<string>('');

  const [selectedQuoteItems, setSelectedQuoteItems] = useState<Map<string, QuoteSelectionItem>>(
    () => new Map(),
  );
  const [selectedAdminSummary, setSelectedAdminSummary] =
    useState<AdminSummarySelection | null>(null);

  const [syncStatus, setSyncStatus] = useState<SyncStatus>('local');
  const [syncText, setSyncText] = useState<string>('Yerel Hafıza');
  const [syncError, setSyncError] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [dbSaveStatus, setDbSaveStatus] = useState<{ mode: SaveIndicatorMode; text: string }>({
    mode: 'idle',
    text: '',
  });

  const [dailyBackups, setDailyBackups] = useState<DailyBackupsMap>(() => getDailyBackupsMap());
  const [backupDirHandle, setBackupDirHandle] = useState<BackupDirectoryHandle | null>(null);
  const backupDirHandleRef = useRef<BackupDirectoryHandle | null>(null);
  backupDirHandleRef.current = backupDirHandle;

  const [customFolderMsg, setCustomFolderMsg] = useState<string | null>(null);

  const folderWriteQueueRef = useRef<Promise<void>>(Promise.resolve());
  const autoCloudSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const localMutationVersionRef = useRef<number>(0);

  const financeConfig = useMemo(
    () => getFinanceConfigFromState(catalog.pricesState),
    [catalog.pricesState],
  );

  const searchIndex: SearchDocument[] = useMemo(
    () =>
      buildSearchIndex({
        categories: catalog.categories,
        devicesMap: catalog.devicesMap,
        serviceGroups: catalog.serviceGroups,
        financeConfig,
        readItemPrice: (_brand, device, group, quality) =>
          readItemPriceFromState(catalog.pricesState, _brand, device, group, quality),
      }),
    [catalog, financeConfig],
  );

  const queueFolderCsvWrite = useCallback((fileName: string, csvText: string): Promise<void> => {
    const handle = backupDirHandleRef.current;
    if (!handle) return folderWriteQueueRef.current;
    folderWriteQueueRef.current = folderWriteQueueRef.current.then(async () => {
      try {
        const res = await writeCsvFileToHandle(handle, fileName, csvText);
        if (!res.ok && res.reason === 'permission') {
          setCustomFolderMsg('Klasör yazma izni yenilenmeli.');
        } else if (res.ok) {
          setCustomFolderMsg(null);
        }
      } catch {
        setCustomFolderMsg('Klasöre yazılırken hata oluştu.');
      }
    });
    return folderWriteQueueRef.current;
  }, []);

  const runAutoDailyBackupIfChanged = useCallback(
    (nextCatalog: CatalogState, forceWrite = false) => {
      const currentHash = computeDataFingerprint(nextCatalog);
      const lastHash = localStorage.getItem(STORAGE_KEYS.lastBackupHash);
      if (!forceWrite && lastHash === currentHash) {
        return { skipped: true, hash: currentHash };
      }

      const todayKey = getTodayDateKey();
      const fileName = `kongoru_yedek_${todayKey}.csv`;
      const csv = generateBackupCsv(nextCatalog);
      const pricedCount = countAllPricedItems(nextCatalog);
      const map = getDailyBackupsMap();

      delete map[todayKey];
      map[todayKey] = {
        date: todayKey,
        updatedAt: new Date().toISOString(),
        fileName,
        hash: currentHash,
        pricedCount,
        csv,
      };

      saveDailyBackupsMap(map);
      setDailyBackups({ ...map });
      localStorage.setItem(STORAGE_KEYS.lastBackupHash, currentHash);
      void queueFolderCsvWrite(fileName, csv);

      return { skipped: false, date: todayKey, fileName, hash: currentHash, pricedCount };
    },
    [queueFolderCsvWrite],
  );

  const persistLocalState = useCallback(
    (nextCatalog: CatalogState, skipAutoBackup = false) => {
      try {
        saveLocalCatalog(nextCatalog);
        if (!skipAutoBackup) {
          localMutationVersionRef.current += 1;
          localStorage.setItem(STORAGE_KEYS.pendingSync, '1');
          runAutoDailyBackupIfChanged(nextCatalog, false);
        }
      } catch (err) {
        console.error('[KONGORU Yerel Kayıt Hatası]', err);
      }
    },
    [runAutoDailyBackupIfChanged],
  );

  const saveAllChanges = useCallback(
    async (options: { silent?: boolean; overrideState?: CatalogState } = {}): Promise<boolean> => {
      const silent = Boolean(options.silent);
      if (autoCloudSaveTimerRef.current) {
        clearTimeout(autoCloudSaveTimerRef.current);
        autoCloudSaveTimerRef.current = null;
      }

      const targetCatalog = options.overrideState ?? catalogRef.current;
      persistLocalState(targetCatalog, false);
      const saveVersion = localMutationVersionRef.current;
      await folderWriteQueueRef.current;

      setSyncStatus('pending');
      setSyncText('Kaydediliyor...');
      setDbSaveStatus({ mode: 'saving', text: 'Kaydediliyor...' });

      try {
        const payload: GithubDbPayload = {
          version: 2,
          updatedAt: new Date().toISOString(),
          catList: targetCatalog.categories,
          serviceGroups: targetCatalog.serviceGroups,
          deviceList: serializeDevicesToList(targetCatalog.categories, targetCatalog.devicesMap),
          prices: targetCatalog.pricesState,
          adminPassword: getAdminPasswordFromStorage(targetCatalog.pricesState),
          dailyCsvBackups: getDailyBackupsMap(),
        };
        const ok = await pushGithubDb(payload);
        if (ok && saveVersion === localMutationVersionRef.current) {
          localStorage.removeItem(STORAGE_KEYS.pendingSync);
        }
        if (ok) {
          setSyncStatus('online');
          setSyncText('GitHub Aktif');
          setSyncError(null);
          setDbSaveStatus({ mode: 'saved', text: '✓ Kaydedildi' });
          if (!silent) toast.success('Tüm veriler GitHub hesabınıza ve yerel hafızaya kaydedildi.');
          return true;
        }
        setSyncStatus('local');
        setSyncText('Yerel Hafıza');
        setDbSaveStatus({ mode: 'saved', text: '✓ Yerel Hafızaya Kaydedildi' });
        if (!silent) toast.info('Veriler tarayıcı yerel hafızasına kaydedildi.');
        return false;
      } catch {
        setSyncStatus('local');
        setSyncText('Yerel Hafıza');
        setDbSaveStatus({ mode: 'saved', text: '✓ Yerel Hafızaya Kaydedildi' });
        if (!silent) toast.info('Veriler yerel hafızaya kaydedildi.');
        return false;
      }
    },
    [persistLocalState],
  );

  const scheduleAutoCloudSave = useCallback(
    (nextCatalog: CatalogState) => {
      setDbSaveStatus({ mode: 'saving', text: 'Kaydediliyor...' });
      if (autoCloudSaveTimerRef.current) {
        clearTimeout(autoCloudSaveTimerRef.current);
      }
      autoCloudSaveTimerRef.current = setTimeout(() => {
        void saveAllChanges({ silent: true, overrideState: nextCatalog });
      }, 600);
    },
    [saveAllChanges],
  );

  const syncFromCloud = useCallback(
    async (manualTrigger = false) => {
      if (localStorage.getItem(STORAGE_KEYS.pendingSync) === '1') {
        const pushed = await saveAllChanges({ silent: true });
        if (!pushed && localStorage.getItem(STORAGE_KEYS.pendingSync) === '1') {
          setSyncStatus('local');
          setSyncText('Yerel Hafıza');
          if (manualTrigger) {
            setSyncError('Bekleyen yerel değişiklikler buluta gönderilemedi. Bağlantınızı kontrol edin.');
          }
          return;
        }
      }

      setIsSyncing(true);
      setSyncStatus('pending');
      setSyncText('Senkronize...');
      setSyncError(null);

      try {
        const data = await fetchGithubDb();
        if (!data || typeof data !== 'object') {
          setSyncStatus('local');
          setSyncText('Yerel Hafıza');
          if (manualTrigger) {
            setSyncError('GitHub veritabanına ulaşılamadı; yerel hafıza kullanılıyor.');
          }
          return;
        }

        const curr = catalogRef.current;
        let nextCategories = [...curr.categories];
        let nextGroups = curr.serviceGroups;
        let nextDevices = curr.devicesMap;
        let nextPrices = curr.pricesState;
        let syncedAny = false;

        const c = data.catList || data.categories;
        const g = data.serviceGroups;
        const d = data.deviceList || data.devices;
        const p = data.prices;
        const pw = data.adminPassword;
        const cloudBackups = data.dailyCsvBackups;

        if (Array.isArray(c) && c.length) {
          nextCategories = [...c];
          syncedAny = true;
        }
        if (g && typeof g === 'object') {
          nextGroups = g;
          syncedAny = true;
        }
        if (d && (Array.isArray(d) || typeof d === 'object')) {
          nextDevices = normalizeDevicesToMap(d);
          for (const itemCat of Object.keys(nextDevices)) {
            if (!nextCategories.includes(itemCat)) nextCategories.push(itemCat);
          }
          syncedAny = true;
        }
        if (p && typeof p === 'object') {
          nextPrices = p;
          syncedAny = true;
        }
        if (typeof pw === 'string' && pw.trim()) {
          localStorage.setItem(STORAGE_KEYS.password, pw);
        } else if (p && typeof p.__adminPassword === 'string' && p.__adminPassword.trim()) {
          localStorage.setItem(STORAGE_KEYS.password, p.__adminPassword);
        }
        if (cloudBackups && typeof cloudBackups === 'object') {
          const merged: DailyBackupsMap = { ...cloudBackups, ...getDailyBackupsMap() };
          saveDailyBackupsMap(merged);
          setDailyBackups(merged);
        }

        if (!syncedAny) {
          setSyncStatus('local');
          setSyncText('Yerel Hafıza');
          return;
        }

        const finalized: CatalogState = {
          categories: nextCategories,
          serviceGroups: nextGroups,
          devicesMap: nextDevices,
          pricesState: ensureDefaultsInPricesState(nextPrices),
        };

        setCatalog(finalized);
        catalogRef.current = finalized;
        persistLocalState(finalized, true);
        localStorage.setItem(STORAGE_KEYS.lastBackupHash, computeDataFingerprint(finalized));

        setSelectedBrand((prevB) => {
          const resolved = resolveInitialSelection(
            finalized.categories,
            finalized.devicesMap,
            prevB,
            selectedDevice,
          );
          setSelectedDevice(resolved.device);
          return resolved.brand;
        });

        setSyncStatus('online');
        setSyncText('GitHub Aktif');
        setSyncError(null);
        if (manualTrigger) {
          toast.success('GitHub veritabanı ile senkronizasyon tamamlandı.');
        }
      } catch {
        setSyncStatus('local');
        setSyncText('Yerel Hafıza');
        if (manualTrigger) {
          setSyncError('Bulut senkronizasyonu başarısız oldu; yerel veriler gösteriliyor.');
        }
      } finally {
        setIsSyncing(false);
      }
    },
    [persistLocalState, saveAllChanges, selectedDevice],
  );

  // İlk açılışta yerel parmak izi, klasör tutamacı ve bulut senkronizasyonu
  useEffect(() => {
    if (localStorage.getItem(STORAGE_KEYS.lastBackupHash) === null) {
      localStorage.setItem(STORAGE_KEYS.lastBackupHash, computeDataFingerprint(catalogRef.current));
    }
    void loadDirHandleFromIdb()
      .then((handle) => {
        if (handle) setBackupDirHandle(handle);
      })
      .catch(() => {});
    void syncFromCloud(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- Seçim & Mod Geçişleri ---
  const selectDevice = useCallback(
    (brand: string, device: string) => {
      if (selectedBrand !== brand || selectedDevice !== device) {
        setSelectedQuoteItems(new Map());
      }
      setSelectedBrand(brand);
      setSelectedDevice(device);
      if (typeof window !== 'undefined' && window.innerWidth <= 1024) {
        setMobilePane('stage');
      }
    },
    [selectedBrand, selectedDevice],
  );

  const selectBrandFromBanner = useCallback(
    (brand: string) => {
      if (!brand) return;
      setActiveBrandFilter(brand);
      if (selectedBrand !== brand) {
        const nextDevice = (catalog.devicesMap[brand] || [])[0] || '';
        setSelectedBrand(brand);
        setSelectedDevice(nextDevice);
        setSelectedQuoteItems(new Map());
      }
    },
    [catalog.devicesMap, selectedBrand],
  );

  const loginAdmin = useCallback((passwordAttempt: string): boolean => {
    const validPassword = getAdminPasswordFromStorage(catalogRef.current.pricesState);
    if (passwordAttempt === validPassword) {
      setIsCustomerMode(false);
      localStorage.setItem(STORAGE_KEYS.uiMode, 'admin');
      setSelectedQuoteItems(new Map());
      toast.success('Yönetici modu aktif edildi.');
      return true;
    }
    return false;
  }, []);

  const switchToCustomerMode = useCallback(() => {
    setIsCustomerMode(true);
    localStorage.setItem(STORAGE_KEYS.uiMode, 'customer');
    setSelectedQuoteItems(new Map());
    toast.info('Müşteri görünümüne geçildi.');
  }, []);

  const changeAdminPassword = useCallback(
    async (
      currentPass: string,
      newPass: string,
      confirmPass: string,
    ): Promise<{ ok: boolean; error?: string }> => {
      const actual = getAdminPasswordFromStorage(catalogRef.current.pricesState);
      if (currentPass !== actual) {
        return { ok: false, error: 'Mevcut şifre yanlış!' };
      }
      if (!newPass || !newPass.trim()) {
        return { ok: false, error: 'Yeni şifre boş olamaz!' };
      }
      if (newPass !== confirmPass) {
        return { ok: false, error: 'Yeni şifreler eşleşmiyor!' };
      }

      localStorage.setItem(STORAGE_KEYS.password, newPass);
      const nextCatalog: CatalogState = {
        ...catalogRef.current,
        pricesState: {
          ...catalogRef.current.pricesState,
          __adminPassword: newPass,
        },
      };
      setCatalog(nextCatalog);
      catalogRef.current = nextCatalog;
      persistLocalState(nextCatalog, false);
      await saveAllChanges({ silent: true, overrideState: nextCatalog });
      toast.success('Yönetici şifresi güncellendi.');
      return { ok: true };
    },
    [persistLocalState, saveAllChanges],
  );

  // --- Müşteri Teklif Seçimi ---
  const toggleQuoteItem = useCallback(
    (brand: string, device: string, group: string, quality: string, price: number) => {
      if (!isCustomerMode || price <= 0) return;
      const key = `${brand}|${device}|${group}|${quality}`;
      setSelectedQuoteItems((prev) => {
        const next = new Map(prev);
        if (next.has(key)) {
          next.delete(key);
        } else {
          next.set(key, { key, brand, device, group, quality, price });
        }
        return next;
      });
    },
    [isCustomerMode],
  );

  const removeQuoteItem = useCallback((key: string) => {
    setSelectedQuoteItems((prev) => {
      const next = new Map(prev);
      next.delete(key);
      return next;
    });
  }, []);

  const clearQuoteSelection = useCallback(() => {
    setSelectedQuoteItems(new Map());
  }, []);

  // --- Yönetici Finans & Fiyat Mutasyonları ---
  const updateFinance = useCallback(
    (nextRateRaw: string, nextVatRaw: string) => {
      const r = parseFloat(nextRateRaw);
      const v = parseFloat(nextVatRaw);
      const nextCatalog: CatalogState = {
        ...catalogRef.current,
        pricesState: {
          ...catalogRef.current.pricesState,
          dollarRate: String(Number.isFinite(r) && r >= 0 ? r : 0),
          vatRate: String(Number.isFinite(v) && v >= 0 ? v : 0),
          roundingMode: 'ceil100',
        },
      };
      setCatalog(nextCatalog);
      catalogRef.current = nextCatalog;
      persistLocalState(nextCatalog, false);
      scheduleAutoCloudSave(nextCatalog);
    },
    [persistLocalState, scheduleAutoCloudSave],
  );

  const updateItemPrice = useCallback(
    (
      brand: string,
      device: string,
      group: string,
      quality: string,
      usdVal: string,
      laborVal: string,
    ) => {
      const nextPrices = updateItemPriceInState(
        catalogRef.current.pricesState,
        brand,
        device,
        group,
        quality,
        usdVal,
        laborVal,
      );
      const nextCatalog: CatalogState = {
        ...catalogRef.current,
        pricesState: nextPrices,
      };
      setCatalog(nextCatalog);
      catalogRef.current = nextCatalog;
      persistLocalState(nextCatalog, false);
      scheduleAutoCloudSave(nextCatalog);
    },
    [persistLocalState, scheduleAutoCloudSave],
  );

  // --- Katalog Mutasyonları ---
  const addBrand = useCallback(
    (rawName: string) => {
      const name = rawName.trim();
      const curr = catalogRef.current;
      if (!name || curr.categories.includes(name)) return false;

      const nextCatalog: CatalogState = {
        ...curr,
        categories: [...curr.categories, name],
        devicesMap: {
          ...curr.devicesMap,
          [name]: curr.devicesMap[name] ? [...curr.devicesMap[name]] : [],
        },
      };
      setCatalog(nextCatalog);
      catalogRef.current = nextCatalog;
      persistLocalState(nextCatalog, false);
      void saveAllChanges({ silent: true, overrideState: nextCatalog });
      toast.success(`${name} markası eklendi.`);
      return true;
    },
    [persistLocalState, saveAllChanges],
  );

  const addDevice = useCallback(
    (brand: string, rawName: string) => {
      const name = rawName.trim();
      if (!brand || !name) return false;
      const curr = catalogRef.current;
      const existingList = curr.devicesMap[brand] || [];
      const nextList = existingList.includes(name) ? existingList : [name, ...existingList];
      const nextCatalog: CatalogState = {
        ...curr,
        devicesMap: {
          ...curr.devicesMap,
          [brand]: nextList,
        },
      };
      setCatalog(nextCatalog);
      catalogRef.current = nextCatalog;
      setSelectedBrand(brand);
      setSelectedDevice(name);
      persistLocalState(nextCatalog, false);
      void saveAllChanges({ silent: true, overrideState: nextCatalog });
      toast.success(`${name} eklendi.`);
      return true;
    },
    [persistLocalState, saveAllChanges],
  );

  const moveDevice = useCallback(
    (brand: string, dev: string, delta: -1 | 1) => {
      const curr = catalogRef.current;
      const list = curr.devicesMap[brand];
      if (!list) return;
      const idx = list.indexOf(dev);
      const nextIdx = idx + delta;
      if (idx < 0 || nextIdx < 0 || nextIdx >= list.length) return;
      const copy = [...list];
      const [item] = copy.splice(idx, 1);
      copy.splice(nextIdx, 0, item);

      const nextCatalog: CatalogState = {
        ...curr,
        devicesMap: {
          ...curr.devicesMap,
          [brand]: copy,
        },
      };
      setCatalog(nextCatalog);
      catalogRef.current = nextCatalog;
      persistLocalState(nextCatalog, false);
      scheduleAutoCloudSave(nextCatalog);
    },
    [persistLocalState, scheduleAutoCloudSave],
  );

  const sortBrandDevices = useCallback(
    (brand: string) => {
      const curr = catalogRef.current;
      const list = curr.devicesMap[brand];
      if (!list || list.length < 2) return;
      const sorted = sortDevicesForBrand(brand, list);
      const nextCatalog: CatalogState = {
        ...curr,
        devicesMap: {
          ...curr.devicesMap,
          [brand]: sorted,
        },
      };
      setCatalog(nextCatalog);
      catalogRef.current = nextCatalog;
      persistLocalState(nextCatalog, false);
      scheduleAutoCloudSave(nextCatalog);
      toast.success(`${brand} cihazları nesle göre sıralandı.`);
    },
    [persistLocalState, scheduleAutoCloudSave],
  );

  const removeDevice = useCallback(
    (brand: string, deviceName: string) => {
      const curr = catalogRef.current;
      const list = curr.devicesMap[brand];
      if (!list || !list.includes(deviceName)) return;

      const nextList = list.filter((d) => d !== deviceName);
      const nextDevicesMap = {
        ...curr.devicesMap,
        [brand]: nextList,
      };

      const isSharedNameElsewhere = Object.entries(nextDevicesMap).some(
        ([otherBrand, otherList]) => otherBrand !== brand && otherList.includes(deviceName),
      );

      const nextPrices = { ...curr.pricesState };
      for (const grp of Object.keys(curr.serviceGroups)) {
        for (const qual of curr.serviceGroups[grp] || []) {
          delete nextPrices[`${brand}|${deviceName}|${grp}|${qual}`];
          if (!isSharedNameElsewhere) {
            const slugBase = getSlugItemBase(deviceName, grp, qual);
            delete nextPrices[`${slugBase}-cost`];
            delete nextPrices[`${slugBase}-labor`];
          }
        }
      }

      const nextCatalog: CatalogState = {
        ...curr,
        devicesMap: nextDevicesMap,
        pricesState: nextPrices,
      };

      setCatalog(nextCatalog);
      catalogRef.current = nextCatalog;

      if (selectedBrand === brand && selectedDevice === deviceName) {
        const resolved = resolveInitialSelection(
          nextCatalog.categories,
          nextCatalog.devicesMap,
          brand,
          '',
        );
        setSelectedBrand(resolved.brand);
        setSelectedDevice(resolved.device);
        setSelectedQuoteItems(new Map());
      }
      if (selectedAdminSummary?.brand === brand && selectedAdminSummary?.device === deviceName) {
        setSelectedAdminSummary(null);
      }

      persistLocalState(nextCatalog, false);
      void saveAllChanges({ silent: true, overrideState: nextCatalog });
      toast.success(`${deviceName} silindi.`);
    },
    [
      persistLocalState,
      saveAllChanges,
      selectedAdminSummary,
      selectedBrand,
      selectedDevice,
    ],
  );

  const addGroup = useCallback(
    (rawName: string) => {
      const name = rawName.trim();
      const curr = catalogRef.current;
      if (!name || curr.serviceGroups[name]) return false;

      const nextCatalog: CatalogState = {
        ...curr,
        serviceGroups: {
          ...curr.serviceGroups,
          [name]: ['Orijinal', 'A Kalite'],
        },
      };
      setCatalog(nextCatalog);
      catalogRef.current = nextCatalog;
      persistLocalState(nextCatalog, false);
      void saveAllChanges({ silent: true, overrideState: nextCatalog });
      toast.success(`${name} hizmet grubu eklendi.`);
      return true;
    },
    [persistLocalState, saveAllChanges],
  );

  const addQuality = useCallback(
    (groupName: string, rawName: string) => {
      const name = rawName.trim();
      if (!groupName || !name) return false;
      const curr = catalogRef.current;
      const existing = curr.serviceGroups[groupName] || [];
      const nextQualities = existing.includes(name) ? existing : [...existing, name];

      const nextCatalog: CatalogState = {
        ...curr,
        serviceGroups: {
          ...curr.serviceGroups,
          [groupName]: nextQualities,
        },
      };
      setCatalog(nextCatalog);
      catalogRef.current = nextCatalog;
      persistLocalState(nextCatalog, false);
      void saveAllChanges({ silent: true, overrideState: nextCatalog });
      toast.success(`${name} kalite sınıfı eklendi.`);
      return true;
    },
    [persistLocalState, saveAllChanges],
  );

  const removeGroup = useCallback(
    (groupName: string) => {
      const curr = catalogRef.current;
      if (!groupName || !curr.serviceGroups[groupName]) return;
      const nextGroups = { ...curr.serviceGroups };
      delete nextGroups[groupName];

      const nextCatalog: CatalogState = {
        ...curr,
        serviceGroups: nextGroups,
      };
      setCatalog(nextCatalog);
      catalogRef.current = nextCatalog;
      if (activeServiceFilter === groupName) setActiveServiceFilter('ALL');
      if (selectedAdminSummary?.group === groupName) setSelectedAdminSummary(null);
      persistLocalState(nextCatalog, false);
      void saveAllChanges({ silent: true, overrideState: nextCatalog });
      toast.success('Hizmet grubu silindi.');
    },
    [activeServiceFilter, persistLocalState, saveAllChanges, selectedAdminSummary],
  );

  const removeQualityFromGroup = useCallback(
    (groupName: string, qualityName: string) => {
      const curr = catalogRef.current;
      if (!groupName || !qualityName || !curr.serviceGroups[groupName]) return;
      const remaining = curr.serviceGroups[groupName].filter((q) => q !== qualityName);
      const nextGroups = { ...curr.serviceGroups };
      if (remaining.length === 0) {
        delete nextGroups[groupName];
        if (activeServiceFilter === groupName) setActiveServiceFilter('ALL');
      } else {
        nextGroups[groupName] = remaining;
      }

      const nextCatalog: CatalogState = {
        ...curr,
        serviceGroups: nextGroups,
      };
      setCatalog(nextCatalog);
      catalogRef.current = nextCatalog;
      if (selectedAdminSummary?.group === groupName && selectedAdminSummary?.quality === qualityName) {
        setSelectedAdminSummary(null);
      }
      persistLocalState(nextCatalog, false);
      void saveAllChanges({ silent: true, overrideState: nextCatalog });
      toast.success('Kalite silindi.');
    },
    [activeServiceFilter, persistLocalState, saveAllChanges, selectedAdminSummary],
  );

  // --- CSV Yedekleme & Geri Yükleme ---
  const restoreFromCsvText = useCallback(
    async (csvText: string, sourceLabel = 'CSV yedeği'): Promise<boolean> => {
      const existingPass =
        typeof catalogRef.current.pricesState.__adminPassword === 'string'
          ? catalogRef.current.pricesState.__adminPassword
          : undefined;

      const parsed = parseBackupCsvToCatalog(csvText, existingPass);
      if (!parsed.ok || !parsed.state) {
        toast.error(parsed.error || 'CSV geri yükleme başarısız oldu.');
        return false;
      }

      const nextCatalog = parsed.state;
      const resolved = resolveInitialSelection(
        nextCatalog.categories,
        nextCatalog.devicesMap,
        selectedBrand,
        selectedDevice,
      );

      setCatalog(nextCatalog);
      catalogRef.current = nextCatalog;
      setSelectedBrand(resolved.brand);
      setSelectedDevice(resolved.device);
      setSelectedAdminSummary(null);

      persistLocalState(nextCatalog, false);
      await saveAllChanges({ silent: true, overrideState: nextCatalog });
      toast.success(`${sourceLabel} başarıyla geri yüklendi!`);
      return true;
    },
    [persistLocalState, saveAllChanges, selectedBrand, selectedDevice],
  );

  const takeManualBackupNow = useCallback(async () => {
    const res = runAutoDailyBackupIfChanged(catalogRef.current, true);
    await folderWriteQueueRef.current;
    const map = getDailyBackupsMap();
    const entry = res.date ? map[res.date] : undefined;
    const fileName = res.fileName || `kongoru_yedek_${getTodayDateKey()}.csv`;
    const csvText = entry && entry.csv ? entry.csv : generateBackupCsv(catalogRef.current);
    triggerCsvDownload(fileName, csvText);
    void saveAllChanges({ silent: true });
    toast.success('Günlük CSV yedeği manuel olarak alındı ve güncellendi.');
  }, [runAutoDailyBackupIfChanged, saveAllChanges]);

  const downloadCurrentCsv = useCallback(() => {
    const todayKey = getTodayDateKey();
    triggerCsvDownload(`kongoru_yedek_${todayKey}.csv`, generateBackupCsv(catalogRef.current));
    toast.success('Güncel CSV yedeği indirildi.');
  }, []);

  const downloadDailyBackup = useCallback((dateKey: string) => {
    const map = getDailyBackupsMap();
    const entry = map[dateKey];
    if (!entry) return;
    triggerCsvDownload(entry.fileName || `kongoru_yedek_${dateKey}.csv`, entry.csv);
    toast.success(`${entry.fileName} indirildi.`);
  }, []);

  const deleteDailyBackup = useCallback((dateKey: string) => {
    const map = getDailyBackupsMap();
    delete map[dateKey];
    saveDailyBackupsMap(map);
    setDailyBackups({ ...map });
    toast.info(`${dateKey} tarihli günlük yedek kaydı silindi.`);
  }, []);

  const connectBackupFolder = useCallback(async () => {
    if (typeof window.showDirectoryPicker !== 'function') {
      toast.info(
        'Tarayıcınız doğrudan klasör yazmayı desteklemiyor (Chrome/Edge HTTPS veya localhost gerekir). Uygulama içi günlük CSV geçmişi aktif.',
      );
      setCustomFolderMsg(
        'Tarayıcı doğrudan klasör erişimi desteklemiyor; indirme/geçmiş üzerinden kullanabilirsiniz.',
      );
      return;
    }
    try {
      const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
      setBackupDirHandle(handle);
      backupDirHandleRef.current = handle;
      await saveDirHandleToIdb(handle);
      const todayKey = getTodayDateKey();
      const map = getDailyBackupsMap();
      if (map[todayKey]) {
        await queueFolderCsvWrite(map[todayKey].fileName, map[todayKey].csv);
        toast.success(`"${handle.name || 'Seçili Klasör'}" klasörü bağlandı ve bugünkü CSV yedeği yazıldı.`);
      } else {
        toast.success(
          `"${handle.name || 'Seçili Klasör'}" klasörü bağlandı. Bugün değişiklik olduğunda otomatik CSV yazılacak.`,
        );
      }
      setCustomFolderMsg(null);
    } catch (e) {
      if (!(e instanceof DOMException && e.name === 'AbortError')) {
        toast.error('Klasör bağlantısı kurulamadı.');
      }
    }
  }, [queueFolderCsvWrite]);

  const disconnectBackupFolder = useCallback(async () => {
    setBackupDirHandle(null);
    backupDirHandleRef.current = null;
    await clearDirHandleFromIdb();
    setCustomFolderMsg(null);
    toast.info('Yerel yedek klasörü bağlantısı kaldırıldı.');
  }, []);

  return {
    catalog,
    financeConfig,
    searchIndex,
    isCustomerMode,
    mobilePane,
    setMobilePane,
    selectedBrand,
    selectedDevice,
    activeBrandFilter,
    setActiveBrandFilter,
    activeServiceFilter,
    setActiveServiceFilter,
    deviceSearchQuery,
    setDeviceSearchQuery,
    selectedQuoteItems,
    toggleQuoteItem,
    removeQuoteItem,
    clearQuoteSelection,
    selectedAdminSummary,
    setSelectedAdminSummary,
    syncStatus,
    syncText,
    syncError,
    isSyncing,
    dbSaveStatus,
    dailyBackups,
    backupDirHandle,
    customFolderMsg,
    selectDevice,
    selectBrandFromBanner,
    loginAdmin,
    switchToCustomerMode,
    changeAdminPassword,
    syncFromCloud,
    saveAllChanges,
    updateFinance,
    updateItemPrice,
    addBrand,
    addDevice,
    removeDevice,
    moveDevice,
    sortBrandDevices,
    addGroup,
    addQuality,
    removeGroup,
    removeQualityFromGroup,
    restoreFromCsvText,
    takeManualBackupNow,
    downloadCurrentCsv,
    downloadDailyBackup,
    deleteDailyBackup,
    connectBackupFolder,
    disconnectBackupFolder,
  };
}
