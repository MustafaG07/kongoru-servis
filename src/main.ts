// Ana uygulama giriş noktası: tip güvenli durum yönetimi, arayüz render, katalog & CSV yedekleme

import {
    STORAGE_KEYS,
    DEFAULT_PASSWORD,
    DEFAULT_CATEGORIES,
    DEFAULT_SERVICE_GROUPS,
    DEFAULT_DEVICES_LIST,
    DEFAULT_PRICES
} from './config/defaults.ts';
import { sortDevicesForBrand } from './services/sorting.ts';
import {
    safeJsonParse,
    getSlugItemBase,
    calculatePrice,
    formatTry,
    escapeHtml
} from './services/pricing.ts';
import { fetchGithubDb, pushGithubDb } from './services/db.ts';
import type {
    BackupDirectoryHandle,
    DailyBackupsMap,
    DevicesByBrand,
    FinanceConfig,
    GithubDbPayload,
    ItemPricePair,
    MobilePane,
    PricesStateMap,
    RoundingMode,
    SaveIndicatorMode,
    SerializedDeviceEntry,
    ServiceGroupsMap,
    SyncStatus,
    ThemeMode
} from './types/index.ts';

declare global {
    interface Window {
        showDirectoryPicker?: (options?: { mode?: 'read' | 'readwrite' }) => Promise<BackupDirectoryHandle>;
    }
}

// --- Tip Güvenli DOM Yardımcıları ---
function byId<T extends HTMLElement = HTMLElement>(id: string): T {
    const el = document.getElementById(id);
    if (!el) {
        throw new Error(`Beklenen DOM öğesi bulunamadı: #${id}`);
    }
    return el as T;
}

function maybeById<T extends HTMLElement = HTMLElement>(id: string): T | null {
    return document.getElementById(id) as T | null;
}

// --- Uygulama Durumu ---
let categories: string[] = [];
let serviceGroups: ServiceGroupsMap = {};
let devicesMap: DevicesByBrand = {};
let pricesState: PricesStateMap = {};

let isCustomerMode = true;
let activeBrandFilter = 'ALL';
let activeServiceFilter = 'ALL';
let selectedBrand = '';
let selectedDevice = '';
let searchQuery = '';
let backupDirHandle: BackupDirectoryHandle | null = null;
let folderWriteQueue: Promise<void> = Promise.resolve();
const customDateOverride: string | null = null;

let autoCloudSaveTimer: ReturnType<typeof setTimeout> | null = null;
let localMutationVersion = 0;
let toastTimer: ReturnType<typeof setTimeout> | null = null;
const tileSaveHideTimers = new WeakMap<HTMLElement, ReturnType<typeof setTimeout>>();
const selectedQuoteItems = new Map<string, number>();

// --- Küresel Çökme Koruması ---
window.addEventListener('error', (event: ErrorEvent) => {
    console.error('[KONGORU Hata Yakalandı]', event.error || event.message);
});

window.addEventListener('unhandledrejection', (event: PromiseRejectionEvent) => {
    console.error('[KONGORU Beklenmeyen Promise Hatası]', event.reason);
});

// --- Depolama & Veri Yardımcıları ---
function normalizeDevicesToMap(rawDevices: unknown): DevicesByBrand {
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

function serializeDevicesToList(): SerializedDeviceEntry[] {
    const list: SerializedDeviceEntry[] = [];
    const seenCats = new Set<string>();
    for (const cat of categories) {
        seenCats.add(cat);
        for (const name of (devicesMap[cat] || [])) {
            list.push({ name, category: cat });
        }
    }
    for (const cat of Object.keys(devicesMap)) {
        if (seenCats.has(cat)) continue;
        for (const name of (devicesMap[cat] || [])) {
            list.push({ name, category: cat });
        }
    }
    return list;
}

function ensureDefaultsInPricesState(): void {
    if (pricesState.dollarRate === undefined || pricesState.dollarRate === '') {
        pricesState.dollarRate = pricesState.__dollarRate !== undefined ? String(pricesState.__dollarRate) : '50';
    }
    if (pricesState.vatRate === undefined || pricesState.vatRate === '') {
        pricesState.vatRate = pricesState.__vatRate !== undefined ? String(pricesState.__vatRate) : '20';
    }
    pricesState.roundingMode = 'ceil100';
    delete pricesState.__dollarRate;
    delete pricesState.__vatRate;
    delete pricesState.__roundingMode;
}

function ensureInitialSelection(): void {
    if (!selectedBrand || !categories.includes(selectedBrand)) {
        selectedBrand = categories[0] || '';
    }
    const brandDevices = devicesMap[selectedBrand] || [];
    if (!selectedDevice || !brandDevices.includes(selectedDevice)) {
        selectedDevice = brandDevices[0] || '';
        if (!selectedDevice) {
            for (const cat of categories) {
                const list = devicesMap[cat] || [];
                if (list.length) {
                    selectedBrand = cat;
                    selectedDevice = list[0];
                    break;
                }
            }
        }
    }
}

function loadAllLocalData(): void {
    const storedCats = safeJsonParse<string[] | null>(localStorage.getItem(STORAGE_KEYS.categories), null);
    const storedGroups = safeJsonParse<ServiceGroupsMap | null>(localStorage.getItem(STORAGE_KEYS.groups), null);
    const storedDevices = safeJsonParse<unknown>(localStorage.getItem(STORAGE_KEYS.devices), null);
    const storedPrices = safeJsonParse<PricesStateMap | null>(localStorage.getItem(STORAGE_KEYS.prices), null);

    const hasMainSiteDeviceArray = Array.isArray(storedDevices) && storedDevices.length > 0;

    categories = hasMainSiteDeviceArray && Array.isArray(storedCats) && storedCats.length
        ? storedCats
        : [...DEFAULT_CATEGORIES];

    serviceGroups = storedGroups && typeof storedGroups === 'object' && Object.keys(storedGroups).length
        ? storedGroups
        : (JSON.parse(JSON.stringify(DEFAULT_SERVICE_GROUPS)) as ServiceGroupsMap);

    devicesMap = hasMainSiteDeviceArray
        ? normalizeDevicesToMap(storedDevices)
        : normalizeDevicesToMap(DEFAULT_DEVICES_LIST);

    for (const itemCat of Object.keys(devicesMap)) {
        if (!categories.includes(itemCat)) categories.push(itemCat);
    }

    pricesState = storedPrices && typeof storedPrices === 'object'
        ? storedPrices
        : (JSON.parse(JSON.stringify(DEFAULT_PRICES)) as PricesStateMap);

    ensureDefaultsInPricesState();
    ensureInitialSelection();
}

function persistLocalData(skipAutoBackup = false): void {
    try {
        localStorage.setItem(STORAGE_KEYS.categories, JSON.stringify(categories));
        localStorage.setItem(STORAGE_KEYS.groups, JSON.stringify(serviceGroups));
        localStorage.setItem(STORAGE_KEYS.devices, JSON.stringify(serializeDevicesToList()));
        localStorage.setItem(STORAGE_KEYS.prices, JSON.stringify(pricesState));
        if (!skipAutoBackup) {
            localMutationVersion++;
            localStorage.setItem(STORAGE_KEYS.pendingSync, '1');
            runAutoDailyBackupIfChanged();
        }
    } catch (e) {
        console.error('[KONGORU Yerel Kayıt Hatası]', e);
    }
}

// --- Bulut (GitHub Gist Veritabanı) Yardımcıları ---
function setSyncState(status: SyncStatus, text: string): void {
    const dot = maybeById('syncDot');
    const label = maybeById('syncText');
    if (!dot || !label) return;
    dot.classList.remove('online', 'pending');
    if (status === 'online') dot.classList.add('online');
    if (status === 'pending') dot.classList.add('pending');
    label.textContent = text;
}

function setDbSaveStatus(mode: SaveIndicatorMode, text: string): void {
    const dot = maybeById('dbSaveStatusDot');
    const label = maybeById('dbSaveStatusText');
    if (dot) dot.classList.toggle('saving', mode === 'saving');
    if (label && text) label.textContent = text;
}

function scheduleAutoCloudSave(): void {
    setDbSaveStatus('saving', 'Kaydediliyor...');
    if (autoCloudSaveTimer) clearTimeout(autoCloudSaveTimer);
    autoCloudSaveTimer = setTimeout(() => {
        void saveAllChanges({ silent: true });
    }, 600);
}

async function syncFromCloud(): Promise<void> {
    if (localStorage.getItem(STORAGE_KEYS.pendingSync) === '1') {
        await saveAllChanges({ silent: true });
        if (localStorage.getItem(STORAGE_KEYS.pendingSync) === '1') {
            setSyncState('local', 'Yerel Hafıza');
            return;
        }
    }
    setSyncState('pending', 'Senkronize...');
    try {
        const data = await fetchGithubDb();
        if (!data || typeof data !== 'object') {
            setSyncState('local', 'Yerel Hafıza');
            return;
        }

        const c = data.catList || data.categories;
        const g = data.serviceGroups;
        const d = data.deviceList || data.devices;
        const p = data.prices;
        const pw = data.adminPassword;
        const cloudBackups = data.dailyCsvBackups;

        let syncedAny = false;
        if (Array.isArray(c) && c.length) {
            categories = c;
            syncedAny = true;
        }
        if (g && typeof g === 'object') {
            serviceGroups = g;
            syncedAny = true;
        }
        if (d && (Array.isArray(d) || typeof d === 'object')) {
            devicesMap = normalizeDevicesToMap(d);
            for (const itemCat of Object.keys(devicesMap)) {
                if (!categories.includes(itemCat)) categories.push(itemCat);
            }
            syncedAny = true;
        }
        if (p && typeof p === 'object') {
            pricesState = p;
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
        }

        if (!syncedAny) {
            setSyncState('local', 'Yerel Hafıza');
            return;
        }

        ensureDefaultsInPricesState();
        persistLocalData(true);
        localStorage.setItem(STORAGE_KEYS.lastBackupHash, computeDataFingerprint());
        ensureInitialSelection();
        syncFinanceInputsFromState();
        renderAll();
        updateBackupUI();
        setSyncState('online', 'GitHub Aktif');
    } catch {
        setSyncState('local', 'Yerel Hafıza');
    }
}

async function saveAllChanges(options: { silent?: boolean } = {}): Promise<void> {
    const silent = Boolean(options && options.silent);
    if (autoCloudSaveTimer) {
        clearTimeout(autoCloudSaveTimer);
        autoCloudSaveTimer = null;
    }
    persistLocalData();
    const saveVersion = localMutationVersion;
    await folderWriteQueue;

    const btn = maybeById<HTMLButtonElement>('saveAllBtn');
    if (!silent && btn) {
        btn.disabled = true;
        btn.textContent = 'Kaydediliyor...';
    }
    setSyncState('pending', 'Kaydediliyor...');
    setDbSaveStatus('saving', 'Kaydediliyor...');
    try {
        const payload: GithubDbPayload = {
            version: 2,
            updatedAt: new Date().toISOString(),
            catList: categories,
            serviceGroups,
            deviceList: serializeDevicesToList(),
            prices: pricesState,
            adminPassword: getAdminPassword(),
            dailyCsvBackups: getDailyBackupsMap()
        };
        const ok = await pushGithubDb(payload);
        if (ok && saveVersion === localMutationVersion) {
            localStorage.removeItem(STORAGE_KEYS.pendingSync);
        }
        if (ok) {
            setSyncState('online', 'GitHub Aktif');
            setDbSaveStatus('saved', '✓ Kaydedildi');
            if (!silent) showToast('Tüm veriler GitHub hesabınıza ve yerel hafızaya kaydedildi.');
        } else {
            setSyncState('local', 'Yerel Hafıza');
            setDbSaveStatus('saved', '✓ Yerel Hafızaya Kaydedildi');
            if (!silent) showToast('Veriler tarayıcı yerel hafızasına kaydedildi.');
        }
    } catch {
        setSyncState('local', 'Yerel Hafıza');
        setDbSaveStatus('saved', '✓ Yerel Hafızaya Kaydedildi');
        if (!silent) showToast('Veriler yerel hafızaya kaydedildi.');
    } finally {
        if (!silent && btn) {
            btn.disabled = false;
            btn.textContent = 'Kaydet';
        }
    }
}

// --- Şifre Yönetimi ---
function getAdminPassword(): string {
    const localPass = localStorage.getItem(STORAGE_KEYS.password);
    if (localPass && localPass.trim()) return localPass;
    if (typeof pricesState.__adminPassword === 'string' && pricesState.__adminPassword.trim()) {
        return pricesState.__adminPassword;
    }
    return DEFAULT_PASSWORD;
}

async function saveAdminPassword(newPass: string): Promise<void> {
    localStorage.setItem(STORAGE_KEYS.password, newPass);
    pricesState.__adminPassword = newPass;
    persistLocalData();
    await saveAllChanges({ silent: true });
}

// --- Fiyat Okuma / Yazma & Finans Ayarları ---
function readItemPrice(brand: string, device: string, group: string, quality: string): ItemPricePair {
    const slugBase = getSlugItemBase(device, group, quality);
    const costVal = pricesState[`${slugBase}-cost`];
    const laborVal = pricesState[`${slugBase}-labor`];

    if (costVal !== undefined || laborVal !== undefined) {
        return {
            usd: costVal === undefined || costVal === null ? '' : String(costVal),
            labor: laborVal === undefined || laborVal === null ? '' : String(laborVal)
        };
    }

    const legacyKeys = [
        `${brand}|${device}|${group}|${quality}`,
        `${device}|${group}|${quality}`,
        `${brand}::${device}::${group}::${quality}`,
        `${device}::${group}::${quality}`,
        `${device}__${group}__${quality}`
    ];
    for (const k of legacyKeys) {
        const entry = pricesState[k];
        if (entry && typeof entry === 'object') {
            const usdRaw = entry.usd !== undefined ? entry.usd : entry.usdCost;
            const laborRaw = entry.labor !== undefined ? entry.labor : entry.laborCost;
            return {
                usd: usdRaw === undefined || usdRaw === null ? '' : String(usdRaw),
                labor: laborRaw === undefined || laborRaw === null ? '' : String(laborRaw)
            };
        }
    }
    return { usd: '', labor: '' };
}

function writeItemPrice(
    brand: string,
    device: string,
    group: string,
    quality: string,
    usdVal: string | number | null | undefined,
    laborVal: string | number | null | undefined
): void {
    const slugBase = getSlugItemBase(device, group, quality);
    const costStr = usdVal === '' || usdVal === null || usdVal === undefined ? '' : String(Math.max(0, parseFloat(String(usdVal)) || 0));
    const laborStr = laborVal === '' || laborVal === null || laborVal === undefined ? '' : String(Math.max(0, parseFloat(String(laborVal)) || 0));

    if (costStr === '' && laborStr === '') {
        delete pricesState[`${slugBase}-cost`];
        delete pricesState[`${slugBase}-labor`];
    } else {
        pricesState[`${slugBase}-cost`] = costStr === '' ? '' : costStr;
        pricesState[`${slugBase}-labor`] = laborStr === '' ? '' : laborStr;
    }

    delete pricesState[`${brand}|${device}|${group}|${quality}`];
    persistLocalData();
    scheduleAutoCloudSave();
}

function getFinanceConfig(): FinanceConfig {
    const rateRaw = pricesState.dollarRate !== undefined ? pricesState.dollarRate : pricesState.__dollarRate;
    const vatRaw = pricesState.vatRate !== undefined ? pricesState.vatRate : pricesState.__vatRate;

    const rate = Math.max(0, parseFloat(String(rateRaw ?? 0)) || 0);
    const vatRate = Math.max(0, parseFloat(String(vatRaw ?? 0)) || 0);
    const roundingMode: RoundingMode = 'ceil100';
    return { rate, vatRate, roundingMode };
}

// --- Tema, Mod ve Görünüm Geçişleri ---
function applyTheme(theme: ThemeMode): void {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem(STORAGE_KEYS.theme, theme);
    const btn = maybeById('themeToggleBtn');
    if (!btn) return;
    if (isCustomerMode) {
        btn.innerHTML = theme === 'dark'
            ? '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z"/></svg>'
            : '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32 1.41 1.41M2 12h2m16 0h2M4.93 19.07l1.41-1.41m11.32-11.32 1.41-1.41"/></svg>';
    } else {
        btn.textContent = theme === 'dark' ? 'Açık Tema' : 'Koyu Tema';
    }
}

function toggleTheme(): void {
    const curr = (document.documentElement.getAttribute('data-theme') || 'light') as ThemeMode;
    applyTheme(curr === 'dark' ? 'light' : 'dark');
}

function applyModeUI(): void {
    document.body.setAttribute('data-mode', isCustomerMode ? 'customer' : 'admin');
    byId('headerAdminBtn').classList.toggle('hidden', !isCustomerMode);
    maybeById('customerHeaderSep')?.classList.toggle('hidden', !isCustomerMode);
    byId('adminSessionGroup').classList.toggle('hidden', isCustomerMode);
    byId('headerCustomerBtn').classList.toggle('hidden', isCustomerMode);
    closeAdminToolsMenu();
    byId('adminFinanceStrip').classList.toggle('hidden', isCustomerMode);
    maybeById('adminQuickCatalogStrip')?.classList.toggle('hidden', isCustomerMode);
    maybeById('adminBackupStrip')?.classList.toggle('hidden', isCustomerMode);

    byId('modeSubtitle').textContent = isCustomerMode
        ? 'Servis Fiyat Listesi'
        : 'Yönetici Modu — Kur, KDV ve Maliyet Kontrolü';
    byId('activeModeBadge').textContent = isCustomerMode
        ? 'Müşteri Görünümü'
        : 'Yönetici Düzenleme Modu';

    if (!isCustomerMode) {
        selectedQuoteItems.clear();
        renderCustomerQuoteBar();
    }
    applyTheme((document.documentElement.getAttribute('data-theme') || 'dark') as ThemeMode);
}

function closeAdminToolsMenu(): void {
    const menu = maybeById('adminToolsMenu');
    const btn = maybeById('adminToolsToggleBtn');
    if (menu) menu.classList.add('hidden');
    if (btn) btn.setAttribute('aria-expanded', 'false');
}

function toggleAdminToolsMenu(event?: Event): void {
    event?.stopPropagation();
    const menu = maybeById('adminToolsMenu');
    const btn = maybeById('adminToolsToggleBtn');
    if (!menu || !btn) return;
    const isHidden = menu.classList.toggle('hidden');
    btn.setAttribute('aria-expanded', String(!isHidden));
}

function switchToCustomerMode(): void {
    isCustomerMode = true;
    applyModeUI();
    renderAll();
    showToast('Müşteri görünümüne geçildi.');
}

function setMobilePane(pane: MobilePane): void {
    byId('workbenchGrid').setAttribute('data-mobile-pane', pane);
    byId('mobBtnDirectory').classList.toggle('active', pane === 'directory');
    byId('mobBtnStage').classList.toggle('active', pane === 'stage');
}

// --- Modallar ---
function openAuthModal(): void {
    if (!isCustomerMode) return;
    byId('authErrorMsg').textContent = '';
    byId<HTMLInputElement>('adminPasswordInput').value = '';
    byId('authModal').classList.add('open');
    setTimeout(() => byId<HTMLInputElement>('adminPasswordInput').focus(), 40);
}

function closeAuthModal(): void {
    byId('authModal').classList.remove('open');
}

function submitAdminLogin(event: Event): void {
    event.preventDefault();
    const input = byId<HTMLInputElement>('adminPasswordInput');
    const err = byId('authErrorMsg');
    if (input.value === getAdminPassword()) {
        closeAuthModal();
        isCustomerMode = false;
        applyModeUI();
        syncFinanceInputsFromState();
        updateQuickCalc();
        renderAll();
        showToast('Yönetici modu aktif edildi.');
    } else {
        err.textContent = 'Şifre hatalı!';
        input.select();
    }
}

function openPasswordModal(): void {
    if (isCustomerMode) return;
    byId('changePassErrorMsg').textContent = '';
    byId<HTMLInputElement>('currentPasswordInput').value = '';
    byId<HTMLInputElement>('newPasswordInput').value = '';
    byId<HTMLInputElement>('confirmPasswordInput').value = '';
    byId('passwordModal').classList.add('open');
    setTimeout(() => byId<HTMLInputElement>('currentPasswordInput').focus(), 40);
}

function closePasswordModal(): void {
    byId('passwordModal').classList.remove('open');
}

async function submitPasswordChange(event: Event): Promise<void> {
    event.preventDefault();
    const curr = byId<HTMLInputElement>('currentPasswordInput');
    const next = byId<HTMLInputElement>('newPasswordInput');
    const conf = byId<HTMLInputElement>('confirmPasswordInput');
    const err = byId('changePassErrorMsg');

    if (curr.value !== getAdminPassword()) {
        err.textContent = 'Mevcut şifre yanlış!';
        curr.select();
        return;
    }
    if (!next.value || !next.value.trim()) {
        err.textContent = 'Yeni şifre boş olamaz!';
        next.focus();
        return;
    }
    if (next.value !== conf.value) {
        err.textContent = 'Yeni şifreler eşleşmiyor!';
        conf.select();
        return;
    }

    await saveAdminPassword(next.value);
    closePasswordModal();
    showToast('Yönetici şifresi güncellendi.');
}

// --- Sol Panel Render & Filtreleme ---
function onSearchInput(): void {
    searchQuery = byId<HTMLInputElement>('deviceSearchInput').value;
    byId('clearSearchBtn').classList.toggle('hidden', !searchQuery);
    renderDeviceDirectory();
}

function clearDeviceSearch(): void {
    byId<HTMLInputElement>('deviceSearchInput').value = '';
    searchQuery = '';
    byId('clearSearchBtn').classList.add('hidden');
    renderDeviceDirectory();
}

function renderMobileQuickResults(query: string): void {
    const wrap = maybeById('mobileQuickSearchResults');
    if (!wrap) return;
    const q = query.trim().toLocaleLowerCase('tr-TR');
    if (!q) {
        wrap.innerHTML = '';
        wrap.classList.add('hidden');
        return;
    }

    const matches: Array<{ brand: string; device: string }> = [];
    for (const brand of categories) {
        for (const dev of (devicesMap[brand] || [])) {
            if (dev.toLocaleLowerCase('tr-TR').includes(q) || brand.toLocaleLowerCase('tr-TR').includes(q)) {
                matches.push({ brand, device: dev });
            }
        }
    }

    if (!matches.length) {
        wrap.innerHTML = '<div class="mobile-quick-empty">Eşleşen telefon/model bulunamadı.</div>';
        wrap.classList.remove('hidden');
        return;
    }

    wrap.innerHTML = matches.slice(0, 40).map((m) => `
        <button type="button" class="mobile-quick-item"
            data-brand="${escapeHtml(m.brand)}" data-device="${escapeHtml(m.device)}"
            onclick="selectMobileQuickResult(this.dataset.brand, this.dataset.device)">
            <span class="mobile-quick-item-name">${escapeHtml(m.device)}</span>
            <span class="brand-pill">${escapeHtml(m.brand)}</span>
        </button>`).join('');
    wrap.classList.remove('hidden');
}

function onMobileQuickSearch(): void {
    const input = maybeById<HTMLInputElement>('mobileDeviceSearchInput');
    const clearBtn = maybeById('clearMobileSearchBtn');
    const q = input ? input.value : '';
    if (clearBtn) clearBtn.classList.toggle('hidden', !q);
    renderMobileQuickResults(q);
}

function clearMobileQuickSearch(): void {
    const input = maybeById<HTMLInputElement>('mobileDeviceSearchInput');
    const clearBtn = maybeById('clearMobileSearchBtn');
    if (input) input.value = '';
    if (clearBtn) clearBtn.classList.add('hidden');
    renderMobileQuickResults('');
}

function selectMobileQuickResult(brand: string, device: string): void {
    clearMobileQuickSearch();
    const input = maybeById<HTMLInputElement>('mobileDeviceSearchInput');
    if (input) input.blur();
    selectDevice(brand, device);
}

function onMobileQuickSearchKey(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
        const firstBtn = document.querySelector<HTMLButtonElement>('#mobileQuickSearchResults .mobile-quick-item');
        if (firstBtn) {
            event.preventDefault();
            selectMobileQuickResult(firstBtn.dataset.brand || '', firstBtn.dataset.device || '');
        }
    } else if (event.key === 'Escape') {
        clearMobileQuickSearch();
    }
}

function selectBrandFilter(brand: string): void {
    activeBrandFilter = brand;
    renderBrandChips();
    renderDeviceDirectory();
}

function selectDevice(brand: string, device: string): void {
    if (selectedBrand !== brand || selectedDevice !== device) {
        selectedQuoteItems.clear();
    }
    selectedBrand = brand;
    selectedDevice = device;
    renderDeviceDirectory();
    renderCenterWorkbench();
    if (window.innerWidth <= 1160) {
        setMobilePane('stage');
        const centerPane = document.querySelector<HTMLElement>('.pane-center');
        if (centerPane) centerPane.scrollTop = 0;
    }
}

function renderBrandChips(): void {
    const wrap = byId('brandChips');
    let html = `<button type="button" class="brand-chip ${activeBrandFilter === 'ALL' ? 'active' : ''}" onclick="selectBrandFilter('ALL')">Tümü</button>`;
    for (const cat of categories) {
        html += `<button type="button" class="brand-chip ${activeBrandFilter === cat ? 'active' : ''}" data-brand="${escapeHtml(cat)}" onclick="selectBrandFilter(this.dataset.brand)">${escapeHtml(cat)}</button>`;
    }
    wrap.innerHTML = html;
}

function renderDeviceDirectory(): void {
    const wrap = byId('deviceList');
    const q = searchQuery.trim().toLocaleLowerCase('tr-TR');
    const targetBrands = activeBrandFilter === 'ALL' ? categories : [activeBrandFilter];
    let html = '';

    for (const brand of targetBrands) {
        const list = (devicesMap[brand] || []).filter((dev) => {
            if (!q) return true;
            return dev.toLocaleLowerCase('tr-TR').includes(q) || brand.toLocaleLowerCase('tr-TR').includes(q);
        });
        if (!list.length) continue;

        html += `<div class="device-group-label">${escapeHtml(brand)}</div>`;
        const canReorder = !isCustomerMode && !q;
        for (let idx = 0; idx < list.length; idx++) {
            const dev = list[idx];
            const isActive = brand === selectedBrand && dev === selectedDevice;
            const upDisabled = idx === 0 ? 'disabled' : '';
            const downDisabled = idx === list.length - 1 ? 'disabled' : '';
            const actionsHtml = canReorder
                ? `<span class="device-item-actions">
                    <button type="button" class="order-btn" title="Yukarı taşı" ${upDisabled} data-brand="${escapeHtml(brand)}" data-device="${escapeHtml(dev)}" onclick="onMoveDeviceClick(event, this.dataset.brand, this.dataset.device, -1)">↑</button>
                    <button type="button" class="order-btn" title="Aşağı taşı" ${downDisabled} data-brand="${escapeHtml(brand)}" data-device="${escapeHtml(dev)}" onclick="onMoveDeviceClick(event, this.dataset.brand, this.dataset.device, 1)">↓</button>
                   </span>`
                : `<span class="device-item-check" aria-hidden="true">${isActive ? '✓' : ''}</span>`;
            html += `
            <div class="device-item ${isActive ? 'active' : ''}" role="button" tabindex="0"
                data-brand="${escapeHtml(brand)}" data-device="${escapeHtml(dev)}"
                onclick="selectDevice(this.dataset.brand, this.dataset.device)">
                <span class="device-item-name">${escapeHtml(dev)}</span>
                ${actionsHtml}
            </div>`;
        }
    }

    if (!html) {
        html = `<div class="quote-empty">Aramayla eşleşen cihaz bulunamadı.</div>`;
    }
    wrap.innerHTML = html;
}

// --- Orta Panel: Finans & Tamir Masası ---
function syncFinanceInputsFromState(): void {
    const cfg = getFinanceConfig();
    byId<HTMLInputElement>('dollarRate').value = String(cfg.rate);
    byId<HTMLInputElement>('vatRate').value = String(cfg.vatRate);
    byId('statRateVat').textContent = `${cfg.rate} ₺ / %${cfg.vatRate}`;
}

function onFinanceChange(): void {
    const r = parseFloat(byId<HTMLInputElement>('dollarRate').value);
    const v = parseFloat(byId<HTMLInputElement>('vatRate').value);

    pricesState.dollarRate = String(Number.isFinite(r) && r >= 0 ? r : 0);
    pricesState.vatRate = String(Number.isFinite(v) && v >= 0 ? v : 0);
    pricesState.roundingMode = 'ceil100';
    persistLocalData();
    scheduleAutoCloudSave();

    syncFinanceInputsFromState();
    updateQuickCalc();
    renderCenterWorkbench();
}

function selectServiceFilter(groupName: string): void {
    activeServiceFilter = groupName;
    renderCenterWorkbench();
}

function handleCostTableInput(inputEl: HTMLInputElement): void {
    const row = inputEl.closest<HTMLElement>('[data-quality]');
    if (!row) return;
    const brand = row.dataset.brand || '';
    const device = row.dataset.device || '';
    const group = row.dataset.group || '';
    const quality = row.dataset.quality || '';

    const usdEl = row.querySelector<HTMLInputElement>('[data-field="usd"]');
    const laborEl = row.querySelector<HTMLInputElement>('[data-field="labor"]');
    if (!usdEl || !laborEl) return;

    writeItemPrice(brand, device, group, quality, usdEl.value, laborEl.value);

    const saveStateEl = row.querySelector<HTMLElement>('[data-out="savestate"]');
    if (saveStateEl) {
        saveStateEl.textContent = '✓ Kaydedildi';
        saveStateEl.classList.add('visible');
        const prevTimer = tileSaveHideTimers.get(saveStateEl);
        if (prevTimer) clearTimeout(prevTimer);
        tileSaveHideTimers.set(
            saveStateEl,
            setTimeout(() => {
                saveStateEl.classList.remove('visible');
            }, 2200)
        );
    }

    const cfg = getFinanceConfig();
    const calc = calculatePrice(usdEl.value, laborEl.value, cfg.rate, cfg.vatRate, cfg.roundingMode);
    const finalEl = row.querySelector<HTMLElement>('[data-out="final"]');
    if (finalEl) {
        finalEl.textContent = calc.hasPrice ? formatTry(calc.finalPrice) : '-';
        finalEl.classList.toggle('empty', !calc.hasPrice);
    }

    const bdEl = row.querySelector<HTMLElement>('[data-out="breakdown"]');
    if (bdEl) {
        bdEl.textContent = calc.hasPrice
            ? `Parça: ${formatTry(calc.tlPart)} · Ham: ${formatTry(calc.rawTotal)} · KDV (%${cfg.vatRate}): ${formatTry(calc.vatAmount)}`
            : 'Maliyet veya işçilik girin';
    }

    const rawEl = row.querySelector<HTMLElement>('[data-out="raw"]');
    if (rawEl) rawEl.textContent = calc.hasPrice ? formatTry(calc.rawTotal) : '-';
    const vatEl = row.querySelector<HTMLElement>('[data-out="vat"]');
    if (vatEl) vatEl.textContent = calc.hasPrice ? formatTry(calc.vatAmount) : '-';
}

function getServiceIconMeta(groupName: string): { colorClass: string; svg: string } {
    const key = groupName.toLocaleLowerCase('tr-TR');
    if (key.includes('ekran')) {
        return {
            colorClass: 'icon-blue',
            svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="2.5" width="12" height="19" rx="2.5"/><path d="M10 18h4"/></svg>'
        };
    }
    if (key.includes('batarya')) {
        return {
            colorClass: 'icon-green',
            svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="7" y="4" width="10" height="17" rx="2"/><path d="M10 2h4"/><path d="M12 9v5"/><path d="M10 11.5h4"/></svg>'
        };
    }
    if (key.includes('kapak')) {
        return {
            colorClass: 'icon-purple',
            svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="2.5" width="12" height="19" rx="2.5"/><circle cx="10" cy="6.5" r="1.2"/></svg>'
        };
    }
    if (key.includes('kamera')) {
        return {
            colorClass: 'icon-cyan',
            svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8a2 2 0 0 1 2-2h2l1.5-2h5L16 6h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8Z"/><circle cx="12" cy="12.5" r="3.2"/></svg>'
        };
    }
    if (key.includes('soket')) {
        return {
            colorClass: 'icon-amber',
            svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22v-5"/><path d="M9 8V3"/><path d="M15 8V3"/><path d="M7 8h10v4a5 5 0 0 1-10 0V8Z"/></svg>'
        };
    }
    if (key.includes('ahize')) {
        return {
            colorClass: 'icon-rose',
            svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 13a8 8 0 0 1 16 0"/><rect x="3" y="13" width="4" height="6" rx="1.5"/><rect x="17" y="13" width="4" height="6" rx="1.5"/></svg>'
        };
    }
    if (key.includes('cam')) {
        return {
            colorClass: 'icon-cyan',
            svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="2.5" width="12" height="19" rx="2.5"/><path d="m9 9 6-3"/><path d="m9 14 6-3"/></svg>'
        };
    }
    return {
        colorClass: 'icon-blue',
        svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m14.7 6.3 3 3-9.4 9.4H5.3v-3l9.4-9.4Z"/></svg>'
    };
}

function renderCustomerQuoteBar(): void {
    const bar = maybeById('customerQuoteBar');
    if (!bar) return;
    if (!isCustomerMode || selectedQuoteItems.size === 0) {
        bar.classList.add('hidden');
        document.body.classList.remove('has-quote-bar');
        return;
    }
    let total = 0;
    for (const price of selectedQuoteItems.values()) {
        total += price;
    }
    byId('quoteCountBadge').textContent = String(selectedQuoteItems.size);
    byId('quoteTotalPrice').textContent = formatTry(total);
    bar.classList.remove('hidden');
    document.body.classList.add('has-quote-bar');
}

function toggleQuoteItem(el: HTMLElement): void {
    if (!isCustomerMode) return;
    const key = el.dataset.quoteKey || '';
    const price = parseFloat(el.dataset.price || '0') || 0;
    if (!key || price <= 0) return;

    if (selectedQuoteItems.has(key)) {
        selectedQuoteItems.delete(key);
        el.classList.remove('selected');
    } else {
        selectedQuoteItems.set(key, price);
        el.classList.add('selected');
    }
    renderCustomerQuoteBar();
}

function clearQuoteSelection(): void {
    selectedQuoteItems.clear();
    document.querySelectorAll('.customer-tile.selected').forEach((tile) => {
        tile.classList.remove('selected');
    });
    renderCustomerQuoteBar();
}

function getShortServiceTabLabel(groupName: string): string {
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

function renderCenterWorkbench(): void {
    const cfg = getFinanceConfig();
    byId('statRateVat').textContent = `${cfg.rate} ₺ / %${cfg.vatRate}`;

    if (!selectedDevice) {
        byId('activeBrandBadge').textContent = '-';
        byId('activeDeviceTitle').textContent = 'Cihaz Seçin';
        byId('serviceFilterPills').innerHTML = '';
        byId('workbenchContent').innerHTML = '<div class="quote-empty">Sol rehberden bir cihaz seçin.</div>';
        renderCustomerQuoteBar();
        return;
    }

    byId('activeBrandBadge').textContent = selectedBrand;
    byId('activeDeviceTitle').textContent = selectedDevice;

    const groupNames = Object.keys(serviceGroups);
    let pillsHtml = `<button type="button" class="service-pill ${activeServiceFilter === 'ALL' ? 'active' : ''}" onclick="selectServiceFilter('ALL')">Tümü</button>`;
    for (const grp of groupNames) {
        pillsHtml += `<button type="button" class="service-pill ${activeServiceFilter === grp ? 'active' : ''}" data-group="${escapeHtml(grp)}" onclick="selectServiceFilter(this.dataset.group)">${escapeHtml(getShortServiceTabLabel(grp))}</button>`;
    }
    byId('serviceFilterPills').innerHTML = pillsHtml;

    const targetGroups = activeServiceFilter === 'ALL' ? groupNames : groupNames.filter((g) => g === activeServiceFilter);
    const contentWrap = byId('workbenchContent');

    let cardsHtml = '<div class="customer-groups-grid">';
    let renderedCardCount = 0;

    for (const grp of targetGroups) {
        const quals = serviceGroups[grp] || [];
        const iconMeta = getServiceIconMeta(grp);
        let rowsHtml = '';

        for (const qual of quals) {
            const { usd, labor } = readItemPrice(selectedBrand, selectedDevice, grp, qual);
            const calc = calculatePrice(usd, labor, cfg.rate, cfg.vatRate, cfg.roundingMode);

            if (isCustomerMode) {
                if (!calc.hasPrice) continue;
                const quoteKey = `${selectedBrand}|${selectedDevice}|${grp}|${qual}`;
                const isSelected = selectedQuoteItems.has(quoteKey);
                rowsHtml += `
                <button type="button" class="quality-tile customer-tile ${isSelected ? 'selected' : ''}"
                    data-quote-key="${escapeHtml(quoteKey)}" data-price="${calc.finalPrice}"
                    onclick="toggleQuoteItem(this)">
                    <div class="quality-tile-left">
                        <span class="quality-name">${escapeHtml(qual)}</span>
                        <span class="quality-sub">KDV Dahil</span>
                    </div>
                    <div class="quality-tile-right">
                        <span class="price-badge">${formatTry(calc.finalPrice)}</span>
                        <span class="quote-radio" aria-hidden="true"></span>
                    </div>
                </button>`;
            } else {
                const breakdownText = calc.hasPrice
                    ? `Parça: ${formatTry(calc.tlPart)} · Ham: ${formatTry(calc.rawTotal)} · KDV (%${cfg.vatRate}): ${formatTry(calc.vatAmount)}`
                    : 'Maliyet veya işçilik girin';
                rowsHtml += `
                <div class="quality-tile admin-tile" data-brand="${escapeHtml(selectedBrand)}" data-device="${escapeHtml(selectedDevice)}" data-group="${escapeHtml(grp)}" data-quality="${escapeHtml(qual)}">
                    <div class="admin-tile-head">
                        <span class="quality-name">${escapeHtml(qual)}</span>
                        <span class="tile-save-state" data-out="savestate">✓ Kaydedildi</span>
                    </div>
                    <div class="admin-tile-inputs">
                        <div class="admin-input-box">
                            <label>Maliyet ($)</label>
                            <input type="number" step="0.5" min="0" class="table-input" data-field="usd" placeholder="$" value="${escapeHtml(usd)}" oninput="handleCostTableInput(this)">
                        </div>
                        <div class="admin-input-box">
                            <label>İşçilik (₺)</label>
                            <input type="number" step="10" min="0" class="table-input" data-field="labor" placeholder="₺" value="${escapeHtml(labor)}" oninput="handleCostTableInput(this)">
                        </div>
                        <div class="admin-input-box">
                            <label>Satış Fiyatı</label>
                            <span class="price-badge ${calc.hasPrice ? '' : 'empty'}" data-out="final">${calc.hasPrice ? formatTry(calc.finalPrice) : '-'}</span>
                        </div>
                    </div>
                    <div class="admin-tile-breakdown" data-out="breakdown">${escapeHtml(breakdownText)}</div>
                </div>`;
            }
        }

        if (isCustomerMode && !rowsHtml) {
            continue;
        }

        renderedCardCount += 1;
        const isWideAdminCard = !isCustomerMode && quals.length >= 4;
        cardsHtml += `
        <article class="service-card ${isWideAdminCard ? 'service-card-wide' : ''}">
            <div class="service-card-head">
                <div class="service-card-head-left">
                    <span class="service-icon-badge ${iconMeta.colorClass}" aria-hidden="true">${iconMeta.svg}</span>
                    <span class="service-card-title">${escapeHtml(grp)}</span>
                </div>
            </div>
            <div class="quality-list">${rowsHtml}</div>
        </article>`;
    }
    cardsHtml += '</div>';

    if (isCustomerMode && renderedCardCount === 0) {
        contentWrap.innerHTML = '<div class="quote-empty">Bu cihaz için henüz fiyat tanımlanmamış.</div>';
    } else {
        contentWrap.innerHTML = cardsHtml;
    }
    renderCustomerQuoteBar();
}

// --- Hızlı Maliyet Hesaplayıcı ---
function updateQuickCalc(): void {
    const cfg = getFinanceConfig();
    const usd = byId<HTMLInputElement>('quickUsdInput').value;
    const labor = byId<HTMLInputElement>('quickLaborInput').value;
    const res = calculatePrice(usd, labor, cfg.rate, cfg.vatRate, cfg.roundingMode);
    byId('quickCalcTotal').textContent = res.hasPrice ? formatTry(res.finalPrice) : '- ₺';
    byId('quickCalcBreakdown').textContent = `Parça: ${formatTry(res.tlPart)} · KDV: ${formatTry(res.vatAmount)}`;
}

// --- Katalog Hızlı Ekleme & Sıralama İşlemleri ---
function renderQuickCatalogBar(): void {
    const devBrandSel = maybeById<HTMLSelectElement>('quickDeviceTargetBrand');
    if (devBrandSel) {
        const prevBrand = devBrandSel.value || selectedBrand || categories[0] || '';
        devBrandSel.innerHTML = categories.map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');
        if (categories.includes(prevBrand)) devBrandSel.value = prevBrand;
    }

    const qualGrpSel = maybeById<HTMLSelectElement>('quickQualityTargetGroup');
    if (qualGrpSel) {
        const grpKeys = Object.keys(serviceGroups);
        const prevGrp = qualGrpSel.value || grpKeys[0] || '';
        qualGrpSel.innerHTML = grpKeys.map((g) => `<option value="${escapeHtml(g)}">${escapeHtml(g)}</option>`).join('');
        if (grpKeys.includes(prevGrp)) qualGrpSel.value = prevGrp;
    }
}

function addBrandFromQuickBar(): void {
    const input = byId<HTMLInputElement>('quickNewBrandInput');
    const name = input.value.trim();
    if (!name || categories.includes(name)) return;
    categories.push(name);
    if (!devicesMap[name]) devicesMap[name] = [];
    input.value = '';
    persistLocalData();
    void saveAllChanges({ silent: true });
    renderAll();
    showToast(`${name} markası eklendi.`);
}

function addDeviceFromQuickBar(): void {
    const brand = byId<HTMLSelectElement>('quickDeviceTargetBrand').value;
    const input = byId<HTMLInputElement>('quickNewDeviceInput');
    const name = input.value.trim();
    if (!brand || !name) return;
    if (!devicesMap[brand]) devicesMap[brand] = [];
    if (!devicesMap[brand].includes(name)) {
        devicesMap[brand].unshift(name);
    }
    input.value = '';
    selectedBrand = brand;
    selectedDevice = name;
    persistLocalData();
    void saveAllChanges({ silent: true });
    renderAll();
    showToast(`${name} eklendi.`);
}

function moveDevice(brand: string, dev: string, delta: -1 | 1): void {
    const list = devicesMap[brand];
    if (!list) return;
    const idx = list.indexOf(dev);
    const nextIdx = idx + delta;
    if (idx < 0 || nextIdx < 0 || nextIdx >= list.length) return;
    const copy = [...list];
    const [item] = copy.splice(idx, 1);
    copy.splice(nextIdx, 0, item);
    devicesMap[brand] = copy;
    persistLocalData();
    scheduleAutoCloudSave();
    renderDeviceDirectory();
}

function onMoveDeviceClick(event: Event, brand: string, dev: string, delta: -1 | 1): void {
    event.stopPropagation();
    moveDevice(brand, dev, delta);
}

function addGroupFromQuickBar(): void {
    const input = byId<HTMLInputElement>('quickNewGroupInput');
    const name = input.value.trim();
    if (!name || serviceGroups[name]) return;
    serviceGroups[name] = ['Orijinal', 'A Kalite'];
    input.value = '';
    persistLocalData();
    void saveAllChanges({ silent: true });
    renderAll();
    showToast(`${name} hizmet grubu eklendi.`);
}

function addQualityFromQuickBar(): void {
    const grp = byId<HTMLSelectElement>('quickQualityTargetGroup').value;
    const input = byId<HTMLInputElement>('quickNewQualityInput');
    const name = input.value.trim();
    if (!grp || !name) return;
    if (!serviceGroups[grp]) serviceGroups[grp] = [];
    if (!serviceGroups[grp].includes(name)) serviceGroups[grp].push(name);
    input.value = '';
    persistLocalData();
    void saveAllChanges({ silent: true });
    renderAll();
    showToast(`${name} kalite sınıfı eklendi.`);
}

// --- Günlük Değişiklik Odaklı CSV Yedekleme & Geri Yükleme ---
function getTodayDateKey(): string {
    if (customDateOverride) return customDateOverride;
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

function computeDataFingerprint(): string {
    const sortedGroups: ServiceGroupsMap = {};
    for (const g of Object.keys(serviceGroups).sort()) {
        sortedGroups[g] = [...(serviceGroups[g] || [])];
    }
    const sortedDevices: DevicesByBrand = {};
    for (const b of Object.keys(devicesMap).sort()) {
        sortedDevices[b] = [...(devicesMap[b] || [])];
    }
    const sortedPrices: PricesStateMap = {};
    for (const k of Object.keys(pricesState).sort()) {
        if (k === '__adminPassword') continue;
        sortedPrices[k] = pricesState[k];
    }
    const canonical = JSON.stringify({
        categories,
        serviceGroups: sortedGroups,
        devicesMap: sortedDevices,
        prices: sortedPrices
    });

    let h1 = 0x811c9dc5;
    let h2 = 0x01000193;
    for (let i = 0; i < canonical.length; i++) {
        const c = canonical.charCodeAt(i);
        h1 ^= c;
        h1 = Math.imul(h1, 0x01000193);
        h2 ^= (c + i);
        h2 = Math.imul(h2, 0x85ebca6b);
    }
    return `${(h1 >>> 0).toString(16)}-${(h2 >>> 0).toString(16)}-${canonical.length}`;
}

function getDailyBackupsMap(): DailyBackupsMap {
    const map = safeJsonParse<DailyBackupsMap>(localStorage.getItem(STORAGE_KEYS.dailyBackups), {});
    return map && typeof map === 'object' ? map : {};
}

function saveDailyBackupsMap(map: DailyBackupsMap): void {
    localStorage.setItem(STORAGE_KEYS.dailyBackups, JSON.stringify(map));
}

function countAllPricedItems(): number {
    const cfg = getFinanceConfig();
    let count = 0;
    for (const brand of categories) {
        for (const dev of (devicesMap[brand] || [])) {
            for (const grp of Object.keys(serviceGroups)) {
                for (const qual of (serviceGroups[grp] || [])) {
                    const { usd, labor } = readItemPrice(brand, dev, grp, qual);
                    const calc = calculatePrice(usd, labor, cfg.rate, cfg.vatRate, cfg.roundingMode);
                    if (calc.hasPrice) count++;
                }
            }
        }
    }
    return count;
}

function csvEscape(val: unknown): string {
    const s = val === null || val === undefined ? '' : String(val);
    if (/[;,"\r\n]/.test(s)) {
        return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
}

function generateBackupCsv(): string {
    const cfg = getFinanceConfig();
    const rows: string[] = [];
    rows.push([
        'KayitTipi', 'Marka', 'CihazModeli', 'HizmetGrubu', 'KaliteSinifi',
        'ParcaUSD', 'IscilikTRY', 'DolarKuru', 'KDV', 'Yuvarlama', 'SatisFiyatiTRY'
    ].join(';'));

    rows.push([
        'CONFIG', '', '', '', '', '', '',
        csvEscape(cfg.rate), csvEscape(cfg.vatRate), csvEscape(cfg.roundingMode), ''
    ].join(';'));

    for (const brand of categories) {
        rows.push(['BRAND', csvEscape(brand), '', '', '', '', '', '', '', '', ''].join(';'));
        for (const dev of (devicesMap[brand] || [])) {
            rows.push(['DEVICE', csvEscape(brand), csvEscape(dev), '', '', '', '', '', '', '', ''].join(';'));
        }
    }

    for (const grp of Object.keys(serviceGroups)) {
        for (const qual of (serviceGroups[grp] || [])) {
            rows.push(['GROUP', '', '', csvEscape(grp), csvEscape(qual), '', '', '', '', '', ''].join(';'));
        }
    }

    for (const brand of categories) {
        for (const dev of (devicesMap[brand] || [])) {
            for (const grp of Object.keys(serviceGroups)) {
                for (const qual of (serviceGroups[grp] || [])) {
                    const { usd, labor } = readItemPrice(brand, dev, grp, qual);
                    if (usd === '' && labor === '') continue;
                    const calc = calculatePrice(usd, labor, cfg.rate, cfg.vatRate, cfg.roundingMode);
                    rows.push([
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
                        csvEscape(calc.hasPrice ? calc.finalPrice : '')
                    ].join(';'));
                }
            }
        }
    }

    return '\uFEFF' + rows.join('\r\n');
}

function parseCsvRows(csvText: string): string[][] {
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

function restoreFromCsvText(csvText: string, sourceLabel = 'CSV yedeği'): boolean {
    const rows = parseCsvRows(csvText);
    if (rows.length < 2) {
        showToast('Geçersiz veya boş CSV dosyası!');
        return false;
    }

    const header = rows[0].map((h) => h.trim());
    const colIdx = (name: string, fallbackIdx: number): number => {
        const idx = header.indexOf(name);
        return idx !== -1 ? idx : fallbackIdx;
    };
    if (!header.includes('KayitTipi')) {
        showToast('CSV başlık formatı tanınmadı ("KayitTipi" sütunu eksik).');
        return false;
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
    if (typeof pricesState.__adminPassword === 'string' && pricesState.__adminPassword) {
        nextPrices.__adminPassword = pricesState.__adminPassword;
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
                nextPrices[`${slugBase}-cost`] = usdRaw === '' ? '' : String(Math.max(0, parseFloat(usdRaw) || 0));
                nextPrices[`${slugBase}-labor`] = laborRaw === '' ? '' : String(Math.max(0, parseFloat(laborRaw) || 0));
            }
        }
    }

    if (!nextCategories.length && !Object.keys(nextGroups).length) {
        showToast('CSV içinde geri yüklenecek geçerli veri bulunamadı.');
        return false;
    }

    categories = nextCategories;
    for (const b of Object.keys(nextDevices)) {
        nextDevices[b] = sortDevicesForBrand(b, nextDevices[b]);
    }
    devicesMap = nextDevices;
    serviceGroups = nextGroups;
    pricesState = nextPrices;
    ensureDefaultsInPricesState();
    ensureInitialSelection();
    persistLocalData();
    syncFinanceInputsFromState();
    updateQuickCalc();
    renderAll();
    updateBackupUI();
    showToast(`${sourceLabel} başarıyla geri yüklendi!`);
    return true;
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

async function saveDirHandleToIdb(handle: BackupDirectoryHandle): Promise<void> {
    const db = await openFsIdb();
    if (!db) return;
    return new Promise((resolve) => {
        const tx = db.transaction('handles', 'readwrite');
        tx.objectStore('handles').put(handle, 'backupDir');
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
    });
}

async function loadDirHandleFromIdb(): Promise<BackupDirectoryHandle | null> {
    const db = await openFsIdb();
    if (!db) return null;
    return new Promise((resolve) => {
        const tx = db.transaction('handles', 'readonly');
        const req = tx.objectStore('handles').get('backupDir');
        req.onsuccess = () => resolve((req.result as BackupDirectoryHandle | undefined) || null);
        req.onerror = () => resolve(null);
    });
}

async function clearDirHandleFromIdb(): Promise<void> {
    const db = await openFsIdb();
    if (!db) return;
    return new Promise((resolve) => {
        const tx = db.transaction('handles', 'readwrite');
        tx.objectStore('handles').delete('backupDir');
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
    });
}

async function writeCsvFileToHandle(
    dirHandle: BackupDirectoryHandle | null,
    fileName: string,
    csvText: string
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

function queueFolderCsvWrite(fileName: string, csvText: string): Promise<void> {
    if (!backupDirHandle) return folderWriteQueue;
    folderWriteQueue = folderWriteQueue.then(async () => {
        try {
            const res = await writeCsvFileToHandle(backupDirHandle, fileName, csvText);
            if (!res.ok && res.reason === 'permission') {
                updateBackupUI('Klasör yazma izni yenilenmeli.');
            }
        } catch {
            updateBackupUI('Klasöre yazılırken hata oluştu.');
        }
    });
    return folderWriteQueue;
}

interface BackupRunResult {
    skipped: boolean;
    reason?: string;
    date?: string;
    fileName?: string;
    hash: string;
    pricedCount?: number;
}

function runAutoDailyBackupIfChanged(forceWrite = false): BackupRunResult {
    const currentHash = computeDataFingerprint();
    const lastHash = localStorage.getItem(STORAGE_KEYS.lastBackupHash);
    if (!forceWrite && lastHash === currentHash) {
        updateBackupUI();
        return { skipped: true, reason: 'no-changes', hash: currentHash };
    }

    const todayKey = getTodayDateKey();
    const fileName = `kongoru_yedek_${todayKey}.csv`;
    const csv = generateBackupCsv();
    const pricedCount = countAllPricedItems();
    const map = getDailyBackupsMap();

    delete map[todayKey];
    map[todayKey] = {
        date: todayKey,
        updatedAt: new Date().toISOString(),
        fileName,
        hash: currentHash,
        pricedCount,
        csv
    };

    saveDailyBackupsMap(map);
    localStorage.setItem(STORAGE_KEYS.lastBackupHash, currentHash);
    void queueFolderCsvWrite(fileName, csv);
    updateBackupUI();

    return { skipped: false, date: todayKey, fileName, hash: currentHash, pricedCount };
}

async function connectBackupFolder(): Promise<void> {
    if (typeof window.showDirectoryPicker !== 'function') {
        showToast('Tarayıcınız doğrudan klasör yazmayı desteklemiyor (Chrome/Edge HTTPS veya localhost gerekir). Uygulama içi günlük CSV geçmişi aktif.');
        updateBackupUI('Tarayıcı doğrudan klasör erişimi desteklemiyor; indirme/geçmiş üzerinden kullanabilirsiniz.');
        return;
    }
    try {
        const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
        backupDirHandle = handle;
        await saveDirHandleToIdb(handle);
        const todayKey = getTodayDateKey();
        const map = getDailyBackupsMap();
        if (map[todayKey]) {
            await queueFolderCsvWrite(map[todayKey].fileName, map[todayKey].csv);
            showToast(`"${handle.name || 'Seçili Klasör'}" klasörü bağlandı ve bugünkü CSV yedeği yazıldı.`);
        } else {
            showToast(`"${handle.name || 'Seçili Klasör'}" klasörü bağlandı. Bugün değişiklik olduğunda otomatik CSV yazılacak.`);
        }
        updateBackupUI();
    } catch (e) {
        if (!(e instanceof DOMException && e.name === 'AbortError')) {
            showToast('Klasör bağlantısı kurulamadı.');
        }
    }
}

async function disconnectBackupFolder(): Promise<void> {
    backupDirHandle = null;
    await clearDirHandleFromIdb();
    updateBackupUI();
    showToast('Yerel yedek klasörü bağlantısı kaldırıldı.');
}

async function initSavedBackupFolder(): Promise<void> {
    try {
        const handle = await loadDirHandleFromIdb();
        if (handle) {
            backupDirHandle = handle;
            updateBackupUI();
        }
    } catch {
        // IndexedDB erişimi yoksa sessizce atla
    }
}

function openBackupModal(): void {
    if (isCustomerMode) return;
    updateBackupUI();
    byId('backupModal').classList.add('open');
}

function closeBackupModal(): void {
    byId('backupModal').classList.remove('open');
}

function triggerCsvDownload(fileName: string, csvText: string): void {
    if (typeof Blob === 'undefined' || typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function' || !document.createElement || !document.body) {
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

async function takeManualBackupNow(): Promise<void> {
    const res = runAutoDailyBackupIfChanged(true);
    await folderWriteQueue;
    const map = getDailyBackupsMap();
    const entry = res.date ? map[res.date] : undefined;
    const fileName = res.fileName || `kongoru_yedek_${getTodayDateKey()}.csv`;
    const csvText = entry && entry.csv ? entry.csv : generateBackupCsv();
    triggerCsvDownload(fileName, csvText);
    saveAllChanges({ silent: true }).catch(() => { });
    updateBackupUI();
    showToast('Günlük CSV yedeği manuel olarak alındı ve güncellendi.');
}

function downloadCurrentCsv(): void {
    const todayKey = getTodayDateKey();
    triggerCsvDownload(`kongoru_yedek_${todayKey}.csv`, generateBackupCsv());
    showToast('Güncel CSV yedeği indirildi.');
}

function downloadDailyBackup(dateKey: string): void {
    const map = getDailyBackupsMap();
    const entry = map[dateKey];
    if (!entry) return;
    triggerCsvDownload(entry.fileName || `kongoru_yedek_${dateKey}.csv`, entry.csv);
    showToast(`${entry.fileName} indirildi.`);
}

function triggerCsvFileSelect(): void {
    const input = byId<HTMLInputElement>('csvRestoreFileInput');
    input.value = '';
    input.click();
}

function handleCsvFileRestore(event: Event): void {
    const target = event.target as HTMLInputElement | null;
    const file = target && target.files ? target.files[0] : undefined;
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev: ProgressEvent<FileReader>) => {
        const resultText = typeof ev.target?.result === 'string' ? ev.target.result : '';
        const ok = restoreFromCsvText(resultText, file.name);
        if (ok) {
            await saveAllChanges();
            closeBackupModal();
        }
    };
    reader.readAsText(file, 'utf-8');
}

async function restoreDailyBackup(dateKey: string): Promise<void> {
    const map = getDailyBackupsMap();
    const entry = map[dateKey];
    if (!entry || !entry.csv) return;
    const ok = restoreFromCsvText(entry.csv, `${dateKey} tarihli yedek`);
    if (ok) {
        await saveAllChanges();
        closeBackupModal();
    }
}

function deleteDailyBackup(dateKey: string): void {
    const map = getDailyBackupsMap();
    delete map[dateKey];
    saveDailyBackupsMap(map);
    updateBackupUI();
    showToast(`${dateKey} tarihli günlük yedek kaydı silindi.`);
}

function updateBackupUI(customFolderMsg: string | null = null): void {
    const map = getDailyBackupsMap();
    const dates = Object.keys(map).sort().reverse();
    const todayKey = getTodayDateKey();
    const todayEntry = map[todayKey];

    const badge = maybeById('backupStatusBadge');
    if (badge) badge.textContent = String(dates.length);

    const adminDot = maybeById('adminBackupDot');
    const adminAutoEl = maybeById('adminAutoBackupStatus');
    const adminLastEl = maybeById('adminLastBackupTime');

    if (adminDot) {
        adminDot.classList.remove('active', 'waiting');
        adminDot.classList.add(todayEntry ? 'active' : 'waiting');
    }
    if (adminAutoEl) {
        adminAutoEl.textContent = todayEntry
            ? 'Otomatik CSV Yedek: Aktif (Bugün Güncellendi)'
            : 'Otomatik CSV Yedek: Beklemede (Bugün Değişiklik Yok)';
    }
    if (adminLastEl) {
        const latestEntry = dates
            .map((d) => map[d])
            .filter(Boolean)
            .sort((a, b) => String(b.updatedAt || b.date || '').localeCompare(String(a.updatedAt || a.date || '')))[0];

        if (latestEntry) {
            const formattedTime = latestEntry.updatedAt
                ? new Date(latestEntry.updatedAt).toLocaleString('tr-TR')
                : (latestEntry.date || '');
            adminLastEl.textContent = `Son Yedek: ${formattedTime} — ${latestEntry.fileName || `kongoru_yedek_${latestEntry.date}.csv`}`;
        } else {
            adminLastEl.textContent = 'Son Yedek: Henüz yedek alınmadı';
        }
    }

    const todayEl = maybeById('todayBackupStatusText');
    if (todayEl) {
        if (todayEntry) {
            const timeStr = todayEntry.updatedAt ? new Date(todayEntry.updatedAt).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }) : '';
            todayEl.innerHTML = `<strong>${escapeHtml(todayKey)}</strong> — Değişiklik algılandı; günlük yedek güncel (<strong>${escapeHtml(todayEntry.fileName)}</strong>${timeStr ? ` · ${escapeHtml(timeStr)}` : ''}, ${todayEntry.pricedCount || 0} fiyatlı işlem).`;
        } else {
            todayEl.innerHTML = `<strong>${escapeHtml(todayKey)}</strong> — Bugün henüz değişiklik yapılmadı; bu yüzden yeni yedek alınmadı.`;
        }
    }

    const folderEl = maybeById('folderStatusText');
    const disconnectBtn = maybeById('disconnectFolderBtn');
    if (folderEl) {
        if (customFolderMsg) {
            folderEl.textContent = customFolderMsg;
        } else if (backupDirHandle) {
            folderEl.innerHTML = `Bağlı yerel klasör: <strong class="mono">${escapeHtml(backupDirHandle.name || 'Seçili Klasör')}</strong> (değişiklik olduğunda o günün eski CSV dosyasını silip yenisini yazar).`;
        } else {
            folderEl.textContent = 'Doğrudan disk klasörü henüz bağlı değil (uygulama içi günlük CSV geçmişi aktif).';
        }
    }
    if (disconnectBtn) {
        disconnectBtn.classList.toggle('hidden', !backupDirHandle);
    }

    renderDailyBackupHistory(map, dates);
}

function renderDailyBackupHistory(map: DailyBackupsMap, sortedDates: string[]): void {
    const listEl = maybeById('dailyBackupList');
    if (!listEl) return;
    if (!sortedDates.length) {
        listEl.innerHTML = '<div class="quote-empty">Henüz kayıtlı günlük CSV yedeği bulunmuyor. Değişiklik yapıldığında otomatik oluşturulacaktır.</div>';
        return;
    }
    listEl.innerHTML = sortedDates.map((d) => {
        const item = map[d];
        const updatedLabel = item.updatedAt
            ? new Date(item.updatedAt).toLocaleString('tr-TR')
            : d;
        return `
        <div class="backup-row">
            <div class="backup-row-info">
                <span class="backup-row-title">${escapeHtml(item.fileName || `kongoru_yedek_${d}.csv`)}</span>
                <span class="backup-row-sub">Son güncelleme: ${escapeHtml(updatedLabel)} · ${item.pricedCount || 0} fiyatlı kalem</span>
            </div>
            <div class="catalog-item-actions">
                <button type="button" class="btn btn-primary btn-sm" data-date="${escapeHtml(d)}" onclick="restoreDailyBackup(this.dataset.date)">Geri Yükle</button>
                <button type="button" class="btn btn-secondary btn-sm" data-date="${escapeHtml(d)}" onclick="downloadDailyBackup(this.dataset.date)">CSV İndir</button>
                <button type="button" class="btn btn-danger btn-sm" data-date="${escapeHtml(d)}" onclick="deleteDailyBackup(this.dataset.date)">Sil</button>
            </div>
        </div>`;
    }).join('');
}

// --- Toast & Klavye Kısayolları ---
function showToast(msg: string): void {
    const el = maybeById('toastEl');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('show');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}

function renderAll(): void {
    renderBrandChips();
    renderDeviceDirectory();
    renderCenterWorkbench();
    if (!isCustomerMode) renderQuickCatalogBar();
}

// HTML satır içi olay yöneticileri için pencere bağlamaları
Object.assign(window, {
    addBrandFromQuickBar,
    addDeviceFromQuickBar,
    addGroupFromQuickBar,
    addQualityFromQuickBar,
    clearDeviceSearch,
    clearMobileQuickSearch,
    clearQuoteSelection,
    closeAdminToolsMenu,
    closeAuthModal,
    closeBackupModal,
    closePasswordModal,
    connectBackupFolder,
    deleteDailyBackup,
    disconnectBackupFolder,
    downloadCurrentCsv,
    downloadDailyBackup,
    handleCostTableInput,
    handleCsvFileRestore,
    moveDevice,
    onFinanceChange,
    onMobileQuickSearch,
    onMobileQuickSearchKey,
    onMoveDeviceClick,
    onSearchInput,
    openAuthModal,
    openBackupModal,
    openPasswordModal,
    restoreDailyBackup,
    saveAllChanges,
    selectBrandFilter,
    selectDevice,
    selectMobileQuickResult,
    selectServiceFilter,
    setMobilePane,
    submitAdminLogin,
    submitPasswordChange,
    switchToCustomerMode,
    syncFromCloud,
    takeManualBackupNow,
    toggleQuoteItem,
    toggleAdminToolsMenu,
    toggleTheme,
    triggerCsvFileSelect,
    updateQuickCalc
});

document.addEventListener('click', (e: MouseEvent) => {
    const toolsWrap = maybeById('adminToolsWrap');
    if (toolsWrap && !toolsWrap.contains(e.target as Node)) {
        closeAdminToolsMenu();
    }
    const searchWrap = maybeById('mobileQuickSearch');
    const results = maybeById('mobileQuickSearchResults');
    if (searchWrap && results && !results.classList.contains('hidden')) {
        if (!searchWrap.contains(e.target as Node)) {
            results.classList.add('hidden');
        }
    }
});

document.addEventListener('keydown', (e: KeyboardEvent) => {
    const activeTag = document.activeElement ? document.activeElement.tagName : '';
    if (e.key === '/' && activeTag !== 'INPUT' && activeTag !== 'TEXTAREA') {
        e.preventDefault();
        if (window.innerWidth <= 1160) setMobilePane('directory');
        const input = maybeById<HTMLInputElement>('deviceSearchInput');
        if (input) input.focus();
    } else if (e.key === 'Escape') {
        closeAdminToolsMenu();
        closeAuthModal();
        closePasswordModal();
        closeBackupModal();
    }
});

// --- Başlatma ---
function bootApp(): void {
    const storedTheme = localStorage.getItem(STORAGE_KEYS.theme);
    const savedTheme: ThemeMode = storedTheme === 'light' ? 'light' : 'dark';
    applyTheme(savedTheme);
    loadAllLocalData();
    if (localStorage.getItem(STORAGE_KEYS.lastBackupHash) === null) {
        localStorage.setItem(STORAGE_KEYS.lastBackupHash, computeDataFingerprint());
    }
    applyModeUI();
    syncFinanceInputsFromState();
    renderAll();
    updateBackupUI();
    void initSavedBackupFolder();
    void syncFromCloud();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootApp);
} else {
    bootApp();
}
