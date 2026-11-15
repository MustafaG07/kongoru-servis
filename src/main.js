// Ana uygulama giriş noktası: durum yönetimi, arayüz render, katalog & CSV yedekleme

import {
    STORAGE_KEYS,
    DEFAULT_PASSWORD,
    DEFAULT_CATEGORIES,
    DEFAULT_SERVICE_GROUPS,
    DEFAULT_DEVICES_LIST,
    DEFAULT_PRICES
} from './config/defaults.js';
import { sortDevicesForBrand } from './services/sorting.js';
import {
    makeSlug,
    safeJsonParse,
    getSlugItemBase,
    calculatePrice,
    formatTry,
    escapeHtml
} from './services/pricing.js';
import { fetchGithubDb, pushGithubDb } from './services/db.js';

// --- Uygulama Durumu ---
let categories = [];
let serviceGroups = {};
let devicesMap = {};
let pricesState = {};

let isCustomerMode = true;
let activeBrandFilter = 'ALL';
let activeServiceFilter = 'ALL';
let selectedBrand = '';
let selectedDevice = '';
let searchQuery = '';
let backupDirHandle = null;
let folderWriteQueue = Promise.resolve();
let customDateOverride = null;

let autoCloudSaveTimer = null;
let localMutationVersion = 0;
let toastTimer = null;

// --- Küresel Çökme Koruması ---
window.addEventListener('error', (event) => {
    console.error('[KONGORU Hata Yakalandı]', event.error || event.message);
});

window.addEventListener('unhandledrejection', (event) => {
    console.error('[KONGORU Beklenmeyen Promise Hatası]', event.reason);
});

// --- Depolama & Veri Yardımcıları ---
function normalizeDevicesToMap(rawDevices) {
    const map = {};
    if (Array.isArray(rawDevices)) {
        for (const item of rawDevices) {
            if (!item || !item.name) continue;
            const cat = item.category || 'Diğer';
            if (!map[cat]) map[cat] = [];
            if (!map[cat].includes(item.name)) {
                map[cat].push(item.name);
            }
        }
        for (const cat of Object.keys(map)) {
            map[cat] = sortDevicesForBrand(cat, map[cat]);
        }
        return map;
    }
    if (rawDevices && typeof rawDevices === 'object') {
        for (const [cat, list] of Object.entries(rawDevices)) {
            if (Array.isArray(list)) map[cat] = sortDevicesForBrand(cat, list);
        }
    }
    return map;
}

function serializeDevicesToList() {
    const list = [];
    const seenCats = new Set();
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

function ensureDefaultsInPricesState() {
    if (pricesState.dollarRate === undefined || pricesState.dollarRate === '') {
        pricesState.dollarRate = pricesState.__dollarRate !== undefined ? String(pricesState.__dollarRate) : '50';
    }
    if (pricesState.vatRate === undefined || pricesState.vatRate === '') {
        pricesState.vatRate = pricesState.__vatRate !== undefined ? String(pricesState.__vatRate) : '20';
    }
    if (!pricesState.roundingMode) {
        const legacyRound = pricesState.__roundingMode === 'none' ? 'exact' : pricesState.__roundingMode;
        pricesState.roundingMode = legacyRound || 'ceil100';
    }
    delete pricesState.__dollarRate;
    delete pricesState.__vatRate;
    delete pricesState.__roundingMode;
}

function ensureInitialSelection() {
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

function loadAllLocalData() {
    const storedCats = safeJsonParse(localStorage.getItem(STORAGE_KEYS.categories), null);
    const storedGroups = safeJsonParse(localStorage.getItem(STORAGE_KEYS.groups), null);
    const storedDevices = safeJsonParse(localStorage.getItem(STORAGE_KEYS.devices), null);
    const storedPrices = safeJsonParse(localStorage.getItem(STORAGE_KEYS.prices), null);

    const hasMainSiteDeviceArray = Array.isArray(storedDevices) && storedDevices.length > 0;

    categories = hasMainSiteDeviceArray && Array.isArray(storedCats) && storedCats.length
        ? storedCats
        : [...DEFAULT_CATEGORIES];

    serviceGroups = storedGroups && typeof storedGroups === 'object' && Object.keys(storedGroups).length
        ? storedGroups
        : JSON.parse(JSON.stringify(DEFAULT_SERVICE_GROUPS));

    devicesMap = hasMainSiteDeviceArray
        ? normalizeDevicesToMap(storedDevices)
        : normalizeDevicesToMap(DEFAULT_DEVICES_LIST);

    for (const itemCat of Object.keys(devicesMap)) {
        if (!categories.includes(itemCat)) categories.push(itemCat);
    }

    pricesState = storedPrices && typeof storedPrices === 'object'
        ? storedPrices
        : JSON.parse(JSON.stringify(DEFAULT_PRICES));

    ensureDefaultsInPricesState();
    ensureInitialSelection();
}

function persistLocalData(skipAutoBackup = false) {
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
function setSyncState(status, text) {
    const dot = document.getElementById('syncDot');
    const label = document.getElementById('syncText');
    if (!dot || !label) return;
    dot.classList.remove('online', 'pending');
    if (status === 'online') dot.classList.add('online');
    if (status === 'pending') dot.classList.add('pending');
    label.textContent = text;
}

function setDbSaveStatus(mode, text) {
    const dot = document.getElementById('dbSaveStatusDot');
    const label = document.getElementById('dbSaveStatusText');
    if (dot) dot.classList.toggle('saving', mode === 'saving');
    if (label && text) label.textContent = text;
}

function scheduleAutoCloudSave() {
    setDbSaveStatus('saving', 'Kaydediliyor...');
    if (autoCloudSaveTimer) clearTimeout(autoCloudSaveTimer);
    autoCloudSaveTimer = setTimeout(() => {
        saveAllChanges({ silent: true });
    }, 600);
}

async function syncFromCloud() {
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

        const c = data.catList;
        const g = data.serviceGroups;
        const d = data.deviceList;
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
            const merged = { ...cloudBackups, ...getDailyBackupsMap() };
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
    } catch (e) {
        setSyncState('local', 'Yerel Hafıza');
    }
}

async function saveAllChanges(options = {}) {
    const silent = Boolean(options && options.silent);
    if (autoCloudSaveTimer) {
        clearTimeout(autoCloudSaveTimer);
        autoCloudSaveTimer = null;
    }
    persistLocalData();
    const saveVersion = localMutationVersion;
    await folderWriteQueue;

    const btn = document.getElementById('saveAllBtn');
    if (!silent && btn) {
        btn.disabled = true;
        btn.textContent = 'Kaydediliyor...';
    }
    setSyncState('pending', 'Kaydediliyor...');
    setDbSaveStatus('saving', 'Kaydediliyor...');
    try {
        const payload = {
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
    } catch (e) {
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
function getAdminPassword() {
    const localPass = localStorage.getItem(STORAGE_KEYS.password);
    if (localPass && localPass.trim()) return localPass;
    if (typeof pricesState.__adminPassword === 'string' && pricesState.__adminPassword.trim()) {
        return pricesState.__adminPassword;
    }
    return DEFAULT_PASSWORD;
}

async function saveAdminPassword(newPass) {
    localStorage.setItem(STORAGE_KEYS.password, newPass);
    pricesState.__adminPassword = newPass;
    persistLocalData();
    await saveAllChanges({ silent: true });
}

// --- Fiyat Okuma / Yazma & Finans Ayarları ---
function readItemPrice(brand, device, group, quality) {
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
            const usd = entry.usd !== undefined ? entry.usd : (entry.usdCost !== undefined ? entry.usdCost : '');
            const labor = entry.labor !== undefined ? entry.labor : (entry.laborCost !== undefined ? entry.laborCost : '');
            return { usd, labor };
        }
    }
    return { usd: '', labor: '' };
}

function writeItemPrice(brand, device, group, quality, usdVal, laborVal) {
    const slugBase = getSlugItemBase(device, group, quality);
    const costStr = usdVal === '' || usdVal === null || usdVal === undefined ? '' : String(Math.max(0, parseFloat(usdVal) || 0));
    const laborStr = laborVal === '' || laborVal === null || laborVal === undefined ? '' : String(Math.max(0, parseFloat(laborVal) || 0));

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

function getFinanceConfig() {
    const rateRaw = pricesState.dollarRate !== undefined ? pricesState.dollarRate : pricesState.__dollarRate;
    const vatRaw = pricesState.vatRate !== undefined ? pricesState.vatRate : pricesState.__vatRate;
    const roundRaw = pricesState.roundingMode || pricesState.__roundingMode || 'ceil100';

    const rate = Math.max(0, parseFloat(rateRaw) || 0);
    const vatRate = Math.max(0, parseFloat(vatRaw) || 0);
    const roundingMode = roundRaw === 'none' ? 'exact' : roundRaw;
    return { rate, vatRate, roundingMode };
}

// --- Tema, Mod ve Görünüm Geçişleri ---
function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem(STORAGE_KEYS.theme, theme);
    const btn = document.getElementById('themeToggleBtn');
    if (btn) btn.textContent = theme === 'dark' ? 'Açık Tema' : 'Koyu Tema';
}

function toggleTheme() {
    const curr = document.documentElement.getAttribute('data-theme') || 'light';
    applyTheme(curr === 'dark' ? 'light' : 'dark');
}

function applyModeUI() {
    document.getElementById('headerAdminBtn').classList.toggle('hidden', !isCustomerMode);
    document.getElementById('adminSaveGroup').classList.toggle('hidden', isCustomerMode);
    document.getElementById('adminSessionGroup').classList.toggle('hidden', isCustomerMode);
    document.getElementById('headerCustomerBtn').classList.toggle('hidden', isCustomerMode);
    document.getElementById('headerPassChangeBtn').classList.toggle('hidden', isCustomerMode);
    document.getElementById('openBackupBtn').classList.toggle('hidden', isCustomerMode);
    document.getElementById('openCatalogBtn').classList.toggle('hidden', isCustomerMode);
    document.getElementById('saveAllBtn').classList.toggle('hidden', isCustomerMode);
    document.getElementById('adminFinanceStrip').classList.toggle('hidden', isCustomerMode);
    document.getElementById('adminBackupStrip').classList.toggle('hidden', isCustomerMode);

    document.getElementById('modeSubtitle').textContent = isCustomerMode
        ? 'Teknik Servis Çalışma Masası'
        : 'Yönetici Modu — Kur, KDV ve Maliyet Kontrolü';
    document.getElementById('activeModeBadge').textContent = isCustomerMode
        ? 'Müşteri Görünümü'
        : 'Yönetici Düzenleme Modu';
}

function switchToCustomerMode() {
    isCustomerMode = true;
    applyModeUI();
    renderAll();
    showToast('Müşteri görünümüne geçildi.');
}

function setMobilePane(pane) {
    document.getElementById('workbenchGrid').setAttribute('data-mobile-pane', pane);
    document.getElementById('mobBtnDirectory').classList.toggle('active', pane === 'directory');
    document.getElementById('mobBtnStage').classList.toggle('active', pane === 'stage');
}

// --- Modallar ---
function openAuthModal() {
    if (!isCustomerMode) return;
    document.getElementById('authErrorMsg').textContent = '';
    document.getElementById('adminPasswordInput').value = '';
    document.getElementById('authModal').classList.add('open');
    setTimeout(() => document.getElementById('adminPasswordInput').focus(), 40);
}

function closeAuthModal() {
    document.getElementById('authModal').classList.remove('open');
}

function submitAdminLogin(event) {
    event.preventDefault();
    const input = document.getElementById('adminPasswordInput');
    const err = document.getElementById('authErrorMsg');
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

function openPasswordModal() {
    if (isCustomerMode) return;
    document.getElementById('changePassErrorMsg').textContent = '';
    document.getElementById('currentPasswordInput').value = '';
    document.getElementById('newPasswordInput').value = '';
    document.getElementById('confirmPasswordInput').value = '';
    document.getElementById('passwordModal').classList.add('open');
    setTimeout(() => document.getElementById('currentPasswordInput').focus(), 40);
}

function closePasswordModal() {
    document.getElementById('passwordModal').classList.remove('open');
}

async function submitPasswordChange(event) {
    event.preventDefault();
    const curr = document.getElementById('currentPasswordInput');
    const next = document.getElementById('newPasswordInput');
    const conf = document.getElementById('confirmPasswordInput');
    const err = document.getElementById('changePassErrorMsg');

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

function openCatalogModal() {
    if (isCustomerMode) return;
    renderCatalogManager();
    document.getElementById('catalogModal').classList.add('open');
}

function closeCatalogModal() {
    document.getElementById('catalogModal').classList.remove('open');
}

// --- Sol Panel Render & Filtreleme ---
function onSearchInput() {
    searchQuery = document.getElementById('deviceSearchInput').value;
    document.getElementById('clearSearchBtn').classList.toggle('hidden', !searchQuery);
    renderDeviceDirectory();
}

function clearDeviceSearch() {
    document.getElementById('deviceSearchInput').value = '';
    searchQuery = '';
    document.getElementById('clearSearchBtn').classList.add('hidden');
    renderDeviceDirectory();
}

function selectBrandFilter(brand) {
    activeBrandFilter = brand;
    renderBrandChips();
    renderDeviceDirectory();
}

function selectDevice(brand, device) {
    selectedBrand = brand;
    selectedDevice = device;
    renderDeviceDirectory();
    renderCenterWorkbench();
    if (window.innerWidth <= 1160) {
        setMobilePane('stage');
    }
}

function countPricedForDevice(brand, device) {
    const cfg = getFinanceConfig();
    let priced = 0;
    let total = 0;
    for (const grp of Object.keys(serviceGroups)) {
        const quals = serviceGroups[grp] || [];
        for (const q of quals) {
            total++;
            const { usd, labor } = readItemPrice(brand, device, grp, q);
            const calc = calculatePrice(usd, labor, cfg.rate, cfg.vatRate, cfg.roundingMode);
            if (calc.hasPrice) priced++;
        }
    }
    return { priced, total };
}

function renderBrandChips() {
    const wrap = document.getElementById('brandChips');
    let html = `<button type="button" class="brand-chip ${activeBrandFilter === 'ALL' ? 'active' : ''}" onclick="selectBrandFilter('ALL')">Tümü</button>`;
    for (const cat of categories) {
        html += `<button type="button" class="brand-chip ${activeBrandFilter === cat ? 'active' : ''}" data-brand="${escapeHtml(cat)}" onclick="selectBrandFilter(this.dataset.brand)">${escapeHtml(cat)}</button>`;
    }
    wrap.innerHTML = html;
}

function renderDeviceDirectory() {
    const wrap = document.getElementById('deviceList');
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
        for (const dev of list) {
            const isActive = brand === selectedBrand && dev === selectedDevice;
            html += `
            <button type="button" class="device-item ${isActive ? 'active' : ''}"
                data-brand="${escapeHtml(brand)}" data-device="${escapeHtml(dev)}"
                onclick="selectDevice(this.dataset.brand, this.dataset.device)">
                <span class="device-item-name">${escapeHtml(dev)}</span>
            </button>`;
        }
    }

    if (!html) {
        html = `<div class="quote-empty">Aramayla eşleşen cihaz bulunamadı.</div>`;
    }
    wrap.innerHTML = html;
}

// --- Orta Panel: Finans & Tamir Masası ---
function syncFinanceInputsFromState() {
    const cfg = getFinanceConfig();
    document.getElementById('dollarRate').value = cfg.rate;
    document.getElementById('vatRate').value = cfg.vatRate;
    document.getElementById('roundingMode').value = cfg.roundingMode;
    document.getElementById('statRateVat').textContent = `${cfg.rate} ₺ / %${cfg.vatRate}`;
}

function onFinanceChange() {
    const r = parseFloat(document.getElementById('dollarRate').value);
    const v = parseFloat(document.getElementById('vatRate').value);
    const m = document.getElementById('roundingMode').value;

    pricesState.dollarRate = String(Number.isFinite(r) && r >= 0 ? r : 0);
    pricesState.vatRate = String(Number.isFinite(v) && v >= 0 ? v : 0);
    pricesState.roundingMode = m === 'none' ? 'exact' : (m || 'ceil100');
    persistLocalData();
    scheduleAutoCloudSave();

    syncFinanceInputsFromState();
    updateQuickCalc();
    renderCenterWorkbench();
}

function selectServiceFilter(groupName) {
    activeServiceFilter = groupName;
    renderCenterWorkbench();
}

function handleCostTableInput(inputEl) {
    const row = inputEl.closest('[data-quality]');
    if (!row) return;
    const brand = row.dataset.brand;
    const device = row.dataset.device;
    const group = row.dataset.group;
    const quality = row.dataset.quality;

    const usdEl = row.querySelector('[data-field="usd"]');
    const laborEl = row.querySelector('[data-field="labor"]');
    writeItemPrice(brand, device, group, quality, usdEl.value, laborEl.value);

    const saveStateEl = row.querySelector('[data-out="savestate"]');
    if (saveStateEl) {
        saveStateEl.textContent = '✓ Kaydedildi';
        saveStateEl.classList.add('visible');
        if (saveStateEl._hideTimer) clearTimeout(saveStateEl._hideTimer);
        saveStateEl._hideTimer = setTimeout(() => {
            saveStateEl.classList.remove('visible');
        }, 2200);
    }

    const cfg = getFinanceConfig();
    const calc = calculatePrice(usdEl.value, laborEl.value, cfg.rate, cfg.vatRate, cfg.roundingMode);
    const finalEl = row.querySelector('[data-out="final"]');
    if (finalEl) {
        finalEl.textContent = calc.hasPrice ? formatTry(calc.finalPrice) : '-';
        finalEl.classList.toggle('empty', !calc.hasPrice);
    }

    const bdEl = row.querySelector('[data-out="breakdown"]');
    if (bdEl) {
        bdEl.textContent = calc.hasPrice
            ? `Parça: ${formatTry(calc.tlPart)} · Ham: ${formatTry(calc.rawTotal)} · KDV (%${cfg.vatRate}): ${formatTry(calc.vatAmount)}`
            : 'Maliyet veya işçilik girin';
    }

    const rawEl = row.querySelector('[data-out="raw"]');
    if (rawEl) rawEl.textContent = calc.hasPrice ? formatTry(calc.rawTotal) : '-';
    const vatEl = row.querySelector('[data-out="vat"]');
    if (vatEl) vatEl.textContent = calc.hasPrice ? formatTry(calc.vatAmount) : '-';
}

function renderCenterWorkbench() {
    const cfg = getFinanceConfig();
    document.getElementById('statRateVat').textContent = `${cfg.rate} ₺ / %${cfg.vatRate}`;

    if (!selectedDevice) {
        document.getElementById('activeBrandBadge').textContent = '-';
        document.getElementById('activeDeviceTitle').textContent = 'Cihaz Seçin';
        document.getElementById('serviceFilterPills').innerHTML = '';
        document.getElementById('workbenchContent').innerHTML = '<div class="quote-empty">Sol rehberden bir cihaz seçin.</div>';
        return;
    }

    document.getElementById('activeBrandBadge').textContent = selectedBrand;
    document.getElementById('activeDeviceTitle').textContent = selectedDevice;

    const groupNames = Object.keys(serviceGroups);
    let pillsHtml = `<button type="button" class="service-pill ${activeServiceFilter === 'ALL' ? 'active' : ''}" onclick="selectServiceFilter('ALL')">Tüm Hizmetler</button>`;
    for (const grp of groupNames) {
        pillsHtml += `<button type="button" class="service-pill ${activeServiceFilter === grp ? 'active' : ''}" data-group="${escapeHtml(grp)}" onclick="selectServiceFilter(this.dataset.group)">${escapeHtml(grp)}</button>`;
    }
    document.getElementById('serviceFilterPills').innerHTML = pillsHtml;

    const targetGroups = activeServiceFilter === 'ALL' ? groupNames : groupNames.filter((g) => g === activeServiceFilter);
    const contentWrap = document.getElementById('workbenchContent');

    let cardsHtml = '<div class="customer-groups-grid">';
    for (const grp of targetGroups) {
        const quals = serviceGroups[grp] || [];
        let rowsHtml = '';

        for (const qual of quals) {
            const { usd, labor } = readItemPrice(selectedBrand, selectedDevice, grp, qual);
            const calc = calculatePrice(usd, labor, cfg.rate, cfg.vatRate, cfg.roundingMode);

            if (isCustomerMode) {
                rowsHtml += `
                <div class="quality-tile ${calc.hasPrice ? '' : 'unpriced'}">
                    <div class="quality-tile-left">
                        <span class="quality-name">${escapeHtml(qual)}</span>
                    </div>
                    <div class="quality-tile-right">
                        <span class="price-badge ${calc.hasPrice ? '' : 'empty'}">${calc.hasPrice ? formatTry(calc.finalPrice) : '-'}</span>
                    </div>
                </div>`;
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

        cardsHtml += `
        <article class="service-card">
            <div class="service-card-head">
                <span class="service-card-title">${escapeHtml(grp)}</span>
            </div>
            <div class="quality-list">${rowsHtml}</div>
        </article>`;
    }
    cardsHtml += '</div>';
    contentWrap.innerHTML = cardsHtml;
}

// --- Hızlı Maliyet Hesaplayıcı ---
function updateQuickCalc() {
    const cfg = getFinanceConfig();
    const usd = document.getElementById('quickUsdInput').value;
    const labor = document.getElementById('quickLaborInput').value;
    const res = calculatePrice(usd, labor, cfg.rate, cfg.vatRate, cfg.roundingMode);
    document.getElementById('quickCalcTotal').textContent = res.hasPrice ? formatTry(res.finalPrice) : '- ₺';
    document.getElementById('quickCalcBreakdown').textContent = `Parça: ${formatTry(res.tlPart)} · KDV: ${formatTry(res.vatAmount)}`;
}

// --- Katalog Yöneticisi İşlemleri ---
function renderCatalogManager() {
    document.getElementById('catManageList').innerHTML = categories.map((cat) => `
    <div class="catalog-item">
        <span>${escapeHtml(cat)}</span>
        <div class="catalog-item-actions">
            <button type="button" class="btn btn-danger btn-sm" data-brand="${escapeHtml(cat)}" onclick="deleteBrand(this.dataset.brand)">Sil</button>
        </div>
    </div>`).join('');

    const devBrandSel = document.getElementById('deviceTargetBrand');
    const prevDevBrand = devBrandSel.value || selectedBrand || categories[0] || '';
    devBrandSel.innerHTML = categories.map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');
    if (categories.includes(prevDevBrand)) devBrandSel.value = prevDevBrand;
    const targetBrand = devBrandSel.value;

    document.getElementById('deviceManageList').innerHTML = (devicesMap[targetBrand] || []).map((dev) => `
    <div class="catalog-item">
        <span>${escapeHtml(dev)}</span>
        <button type="button" class="btn btn-danger btn-sm" data-brand="${escapeHtml(targetBrand)}" data-device="${escapeHtml(dev)}" onclick="deleteDevice(this.dataset.brand, this.dataset.device)">Sil</button>
    </div>`).join('');

    const grpKeys = Object.keys(serviceGroups);
    document.getElementById('groupManageList').innerHTML = grpKeys.map((g) => `
    <div class="catalog-item">
        <span>${escapeHtml(g)}</span>
        <button type="button" class="btn btn-danger btn-sm" data-group="${escapeHtml(g)}" onclick="deleteServiceGroup(this.dataset.group)">Sil</button>
    </div>`).join('');

    const qualGrpSel = document.getElementById('qualityTargetGroup');
    const prevQualGrp = qualGrpSel.value || grpKeys[0] || '';
    qualGrpSel.innerHTML = grpKeys.map((g) => `<option value="${escapeHtml(g)}">${escapeHtml(g)}</option>`).join('');
    if (grpKeys.includes(prevQualGrp)) qualGrpSel.value = prevQualGrp;
    const targetGrp = qualGrpSel.value;

    document.getElementById('qualityManageList').innerHTML = (serviceGroups[targetGrp] || []).map((q) => `
    <div class="catalog-item">
        <span>${escapeHtml(q)}</span>
        <button type="button" class="btn btn-danger btn-sm" data-group="${escapeHtml(targetGrp)}" data-quality="${escapeHtml(q)}" onclick="deleteQualityTier(this.dataset.group, this.dataset.quality)">Sil</button>
    </div>`).join('');
}

function addBrand() {
    const input = document.getElementById('newBrandInput');
    const name = input.value.trim();
    if (!name || categories.includes(name)) return;
    categories.push(name);
    if (!devicesMap[name]) devicesMap[name] = [];
    input.value = '';
    persistLocalData();
    saveAllChanges({ silent: true });
    renderAll();
    renderCatalogManager();
    showToast(`${name} markası eklendi.`);
}

function deleteBrand(name) {
    categories = categories.filter((c) => c !== name);
    delete devicesMap[name];
    ensureInitialSelection();
    persistLocalData();
    saveAllChanges({ silent: true });
    renderAll();
    renderCatalogManager();
}

function addDevice() {
    const brand = document.getElementById('deviceTargetBrand').value;
    const input = document.getElementById('newDeviceInput');
    const name = input.value.trim();
    if (!brand || !name) return;
    if (!devicesMap[brand]) devicesMap[brand] = [];
    if (!devicesMap[brand].includes(name)) {
        devicesMap[brand].push(name);
    }
    devicesMap[brand] = sortDevicesForBrand(brand, devicesMap[brand]);
    input.value = '';
    selectedBrand = brand;
    selectedDevice = name;
    persistLocalData();
    saveAllChanges({ silent: true });
    renderAll();
    renderCatalogManager();
    showToast(`${name} eklendi (yeni nesilden eski nesile sıralandı).`);
}

function deleteDevice(brand, dev) {
    if (!devicesMap[brand]) return;
    devicesMap[brand] = devicesMap[brand].filter((d) => d !== dev);
    ensureInitialSelection();
    persistLocalData();
    saveAllChanges({ silent: true });
    renderAll();
    renderCatalogManager();
    showToast(`${dev} silindi.`);
}

function addServiceGroup() {
    const input = document.getElementById('newGroupInput');
    const name = input.value.trim();
    if (!name || serviceGroups[name]) return;
    serviceGroups[name] = ['Orijinal', 'A Kalite'];
    input.value = '';
    persistLocalData();
    saveAllChanges({ silent: true });
    renderAll();
    renderCatalogManager();
    showToast(`${name} hizmet grubu eklendi.`);
}

function deleteServiceGroup(grp) {
    delete serviceGroups[grp];
    if (activeServiceFilter === grp) activeServiceFilter = 'ALL';
    persistLocalData();
    saveAllChanges({ silent: true });
    renderAll();
    renderCatalogManager();
}

function addQualityTier() {
    const grp = document.getElementById('qualityTargetGroup').value;
    const input = document.getElementById('newQualityInput');
    const name = input.value.trim();
    if (!grp || !name) return;
    if (!serviceGroups[grp]) serviceGroups[grp] = [];
    if (!serviceGroups[grp].includes(name)) serviceGroups[grp].push(name);
    input.value = '';
    persistLocalData();
    saveAllChanges({ silent: true });
    renderAll();
    renderCatalogManager();
    showToast(`${name} kalite sınıfı eklendi.`);
}

function deleteQualityTier(grp, qual) {
    if (!serviceGroups[grp]) return;
    serviceGroups[grp] = serviceGroups[grp].filter((q) => q !== qual);
    persistLocalData();
    saveAllChanges({ silent: true });
    renderAll();
    renderCatalogManager();
}

// --- Günlük Değişiklik Odaklı CSV Yedekleme & Geri Yükleme ---
function getTodayDateKey() {
    if (customDateOverride) return customDateOverride;
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

function computeDataFingerprint() {
    const sortedGroups = {};
    for (const g of Object.keys(serviceGroups).sort()) {
        sortedGroups[g] = [...(serviceGroups[g] || [])];
    }
    const sortedDevices = {};
    for (const b of Object.keys(devicesMap).sort()) {
        sortedDevices[b] = [...(devicesMap[b] || [])];
    }
    const sortedPrices = {};
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

function getDailyBackupsMap() {
    const map = safeJsonParse(localStorage.getItem(STORAGE_KEYS.dailyBackups), {});
    return map && typeof map === 'object' ? map : {};
}

function saveDailyBackupsMap(map) {
    localStorage.setItem(STORAGE_KEYS.dailyBackups, JSON.stringify(map));
}

function countAllPricedItems() {
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

function csvEscape(val) {
    const s = val === null || val === undefined ? '' : String(val);
    if (/[;,"\r\n]/.test(s)) {
        return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
}

function generateBackupCsv() {
    const cfg = getFinanceConfig();
    const rows = [];
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

function parseCsvRows(csvText) {
    const cleaned = String(csvText || '').replace(/^\uFEFF/, '');
    const lines = [];
    let row = [];
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

function restoreFromCsvText(csvText, sourceLabel = 'CSV yedeği') {
    const rows = parseCsvRows(csvText);
    if (rows.length < 2) {
        showToast('Geçersiz veya boş CSV dosyası!');
        return false;
    }

    const header = rows[0].map((h) => h.trim());
    const colIdx = (name, fallbackIdx) => {
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

    const nextCategories = [];
    const nextDevices = {};
    const nextGroups = {};
    const nextPrices = {};
    if (typeof pricesState.__adminPassword === 'string' && pricesState.__adminPassword) {
        nextPrices.__adminPassword = pricesState.__adminPassword;
    }

    const ensureBrand = (b) => {
        if (!b) return;
        if (!nextCategories.includes(b)) nextCategories.push(b);
        if (!nextDevices[b]) nextDevices[b] = [];
    };
    const ensureDevice = (b, d) => {
        if (!b || !d) return;
        ensureBrand(b);
        if (!nextDevices[b].includes(d)) nextDevices[b].push(d);
    };
    const ensureGroupQuality = (g, q) => {
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
function openFsIdb() {
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

async function saveDirHandleToIdb(handle) {
    const db = await openFsIdb();
    if (!db) return;
    return new Promise((resolve) => {
        const tx = db.transaction('handles', 'readwrite');
        tx.objectStore('handles').put(handle, 'backupDir');
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
    });
}

async function loadDirHandleFromIdb() {
    const db = await openFsIdb();
    if (!db) return null;
    return new Promise((resolve) => {
        const tx = db.transaction('handles', 'readonly');
        const req = tx.objectStore('handles').get('backupDir');
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => resolve(null);
    });
}

async function clearDirHandleFromIdb() {
    const db = await openFsIdb();
    if (!db) return;
    return new Promise((resolve) => {
        const tx = db.transaction('handles', 'readwrite');
        tx.objectStore('handles').delete('backupDir');
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
    });
}

async function writeCsvFileToHandle(dirHandle, fileName, csvText) {
    if (!dirHandle) return { ok: false, reason: 'no-handle' };
    if (typeof dirHandle.queryPermission === 'function') {
        const perm = await dirHandle.queryPermission({ mode: 'readwrite' });
        if (perm !== 'granted') return { ok: false, reason: 'permission' };
    }
    if (typeof dirHandle.removeEntry === 'function') {
        try {
            await dirHandle.removeEntry(fileName);
        } catch (e) { }
    }
    const fileHandle = await dirHandle.getFileHandle(fileName, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(csvText);
    await writable.close();
    return { ok: true };
}

function queueFolderCsvWrite(fileName, csvText) {
    if (!backupDirHandle) return folderWriteQueue;
    folderWriteQueue = folderWriteQueue.then(async () => {
        try {
            const res = await writeCsvFileToHandle(backupDirHandle, fileName, csvText);
            if (!res.ok && res.reason === 'permission') {
                updateBackupUI('Klasör yazma izni yenilenmeli.');
            }
        } catch (e) {
            updateBackupUI('Klasöre yazılırken hata oluştu.');
        }
    });
    return folderWriteQueue;
}

function runAutoDailyBackupIfChanged(forceWrite = false) {
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
    queueFolderCsvWrite(fileName, csv);
    updateBackupUI();

    return { skipped: false, date: todayKey, fileName, hash: currentHash, pricedCount };
}

async function connectBackupFolder() {
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
            showToast(`"${handle.name}" klasörü bağlandı ve bugünkü CSV yedeği yazıldı.`);
        } else {
            showToast(`"${handle.name}" klasörü bağlandı. Bugün değişiklik olduğunda otomatik CSV yazılacak.`);
        }
        updateBackupUI();
    } catch (e) {
        if (e && e.name !== 'AbortError') {
            showToast('Klasör bağlantısı kurulamadı.');
        }
    }
}

async function disconnectBackupFolder() {
    backupDirHandle = null;
    await clearDirHandleFromIdb();
    updateBackupUI();
    showToast('Yerel yedek klasörü bağlantısı kaldırıldı.');
}

async function initSavedBackupFolder() {
    try {
        const handle = await loadDirHandleFromIdb();
        if (handle) {
            backupDirHandle = handle;
            updateBackupUI();
        }
    } catch (e) { }
}

function openBackupModal() {
    if (isCustomerMode) return;
    updateBackupUI();
    document.getElementById('backupModal').classList.add('open');
}

function closeBackupModal() {
    document.getElementById('backupModal').classList.remove('open');
}

function triggerCsvDownload(fileName, csvText) {
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

async function takeManualBackupNow() {
    const res = runAutoDailyBackupIfChanged(true);
    await folderWriteQueue;
    const map = getDailyBackupsMap();
    const entry = res && res.date ? map[res.date] : null;
    const fileName = (res && res.fileName) || `kongoru_yedek_${getTodayDateKey()}.csv`;
    const csvText = entry && entry.csv ? entry.csv : generateBackupCsv();
    triggerCsvDownload(fileName, csvText);
    saveAllChanges({ silent: true }).catch(() => { });
    updateBackupUI();
    showToast('Günlük CSV yedeği manuel olarak alındı ve güncellendi.');
}

function downloadCurrentCsv() {
    const todayKey = getTodayDateKey();
    triggerCsvDownload(`kongoru_yedek_${todayKey}.csv`, generateBackupCsv());
    showToast('Güncel CSV yedeği indirildi.');
}

function downloadDailyBackup(dateKey) {
    const map = getDailyBackupsMap();
    const entry = map[dateKey];
    if (!entry) return;
    triggerCsvDownload(entry.fileName || `kongoru_yedek_${dateKey}.csv`, entry.csv);
    showToast(`${entry.fileName} indirildi.`);
}

function triggerCsvFileSelect() {
    const input = document.getElementById('csvRestoreFileInput');
    input.value = '';
    input.click();
}

function handleCsvFileRestore(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
        const ok = restoreFromCsvText(ev.target.result, file.name);
        if (ok) {
            await saveAllChanges();
            closeBackupModal();
        }
    };
    reader.readAsText(file, 'utf-8');
}

async function restoreDailyBackup(dateKey) {
    const map = getDailyBackupsMap();
    const entry = map[dateKey];
    if (!entry || !entry.csv) return;
    const ok = restoreFromCsvText(entry.csv, `${dateKey} tarihli yedek`);
    if (ok) {
        await saveAllChanges();
        closeBackupModal();
    }
}

function deleteDailyBackup(dateKey) {
    const map = getDailyBackupsMap();
    delete map[dateKey];
    saveDailyBackupsMap(map);
    updateBackupUI();
    showToast(`${dateKey} tarihli günlük yedek kaydı silindi.`);
}

function updateBackupUI(customFolderMsg = null) {
    const map = getDailyBackupsMap();
    const dates = Object.keys(map).sort().reverse();
    const todayKey = getTodayDateKey();
    const todayEntry = map[todayKey];

    const badge = document.getElementById('backupStatusBadge');
    if (badge) badge.textContent = dates.length;

    const adminDot = document.getElementById('adminBackupDot');
    const adminAutoEl = document.getElementById('adminAutoBackupStatus');
    const adminLastEl = document.getElementById('adminLastBackupTime');

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

    const todayEl = document.getElementById('todayBackupStatusText');
    if (todayEl) {
        if (todayEntry) {
            const timeStr = todayEntry.updatedAt ? new Date(todayEntry.updatedAt).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }) : '';
            todayEl.innerHTML = `<strong>${escapeHtml(todayKey)}</strong> — Değişiklik algılandı; günlük yedek güncel (<strong>${escapeHtml(todayEntry.fileName)}</strong>${timeStr ? ` · ${escapeHtml(timeStr)}` : ''}, ${todayEntry.pricedCount || 0} fiyatlı işlem).`;
        } else {
            todayEl.innerHTML = `<strong>${escapeHtml(todayKey)}</strong> — Bugün henüz değişiklik yapılmadı; bu yüzden yeni yedek alınmadı.`;
        }
    }

    const folderEl = document.getElementById('folderStatusText');
    const disconnectBtn = document.getElementById('disconnectFolderBtn');
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

function renderDailyBackupHistory(map, sortedDates) {
    const listEl = document.getElementById('dailyBackupList');
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
function showToast(msg) {
    const el = document.getElementById('toastEl');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}

function renderAll() {
    renderBrandChips();
    renderDeviceDirectory();
    renderCenterWorkbench();
}

// HTML satır içi olay yöneticileri için pencere bağlamaları
Object.assign(window, {
    addBrand,
    addDevice,
    addQualityTier,
    addServiceGroup,
    clearDeviceSearch,
    closeAuthModal,
    closeBackupModal,
    closeCatalogModal,
    closePasswordModal,
    connectBackupFolder,
    deleteBrand,
    deleteDailyBackup,
    deleteDevice,
    deleteQualityTier,
    deleteServiceGroup,
    disconnectBackupFolder,
    downloadCurrentCsv,
    downloadDailyBackup,
    handleCostTableInput,
    handleCsvFileRestore,
    onFinanceChange,
    onSearchInput,
    openAuthModal,
    openBackupModal,
    openCatalogModal,
    openPasswordModal,
    renderCatalogManager,
    restoreDailyBackup,
    saveAllChanges,
    selectBrandFilter,
    selectDevice,
    selectServiceFilter,
    setMobilePane,
    submitAdminLogin,
    submitPasswordChange,
    switchToCustomerMode,
    syncFromCloud,
    takeManualBackupNow,
    toggleTheme,
    triggerCsvFileSelect,
    updateQuickCalc
});

document.addEventListener('keydown', (e) => {
    const activeTag = document.activeElement ? document.activeElement.tagName : '';
    if (e.key === '/' && activeTag !== 'INPUT' && activeTag !== 'TEXTAREA') {
        e.preventDefault();
        if (window.innerWidth <= 1160) setMobilePane('directory');
        const input = document.getElementById('deviceSearchInput');
        if (input) input.focus();
    } else if (e.key === 'Escape') {
        closeAuthModal();
        closePasswordModal();
        closeCatalogModal();
        closeBackupModal();
    }
});

// --- Başlatma ---
function bootApp() {
    const savedTheme = localStorage.getItem(STORAGE_KEYS.theme) || 'dark';
    applyTheme(savedTheme);
    loadAllLocalData();
    if (localStorage.getItem(STORAGE_KEYS.lastBackupHash) === null) {
        localStorage.setItem(STORAGE_KEYS.lastBackupHash, computeDataFingerprint());
    }
    applyModeUI();
    syncFinanceInputsFromState();
    renderAll();
    updateBackupUI();
    initSavedBackupFolder();
    syncFromCloud();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootApp);
} else {
    bootApp();
}
