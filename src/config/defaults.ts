import type { GithubDbConfig, PricesStateMap, ServiceGroupsMap, StorageKeysMap } from '../types/index.ts';

// Sabitler, GitHub Gist DB bağlantısı ve varsayılan katalog verileri (V2 ile %100 uyumlu)

export const STORAGE_KEYS: StorageKeysMap = {
  categories: 'kongoruGroupCatList',
  groups: 'kongoruServiceGroupsMap',
  devices: 'kongoruGroupDeviceList',
  prices: 'kongoruGroupPrices',
  password: 'kongoruAdminPassword',
  theme: 'kongoruV2Theme',
  dailyBackups: 'kongoruDailyCsvBackups',
  lastBackupHash: 'kongoruLastBackupHash',
  pendingSync: 'kongoruPendingCloudSync',
  uiMode: 'kongoruUiMode',
};

export const GITHUB_DB: GithubDbConfig = {
  gistId: 'd8a260ab738c1acde482e5a276353e11',
  fileName: 'kongoru-db.json',
  tokenParts: ['Z2hvX3d5M3dpVzNtMXk', 'xUWF5bllydjR5cDdhSk', 'tucjhnNTNHT3g5RA=='],
};

export function getGithubToken(): string {
  try {
    return atob(GITHUB_DB.tokenParts.join(''));
  } catch {
    return '';
  }
}

export const DEFAULT_PASSWORD = 'kongoru';

export const DEFAULT_CATEGORIES: string[] = [
  'iPhone',
  'iPad',
  'Samsung',
  'Samsung Tablet',
  'Xiaomi',
  'TCL',
  'Diğer',
  'TECHNO',
  'Oppo',
  'Huawei',
  'Honor',
];

export const DEFAULT_SERVICE_GROUPS: ServiceGroupsMap = {
  'Ahize Değişimi': ['Ahize', 'Filmli Ahize'],
  'Arka Kapak': ['Orijinal', 'A Kalite'],
  'Batarya Değişimi': ['Orijinal', 'A Kalite Yükseltilmiş'],
  'Diğer İşlemler': ['On Off Film Değişimi', 'SIM YUVA DEĞİŞİMİ'],
  'Ekran Değişimi': ['Orijinal', 'Revize', 'A Kalite', 'B Kalite', 'C Kalite', 'Çıkma Orijinal'],
  'Kamera Değişimi': ['Arka Kamera', 'Ön Kamera'],
  'Soket İşlemleri': ['Sadece Soket', 'Bordlu-Filmli Soket'],
  'Ön Cam - Dokunmatik': ['Orijinal', 'A Kalite'],
};

export interface DefaultDeviceEntry {
  category: string;
  name: string;
}

export const DEFAULT_DEVICES_LIST: DefaultDeviceEntry[] = [
  { category: 'Samsung', name: 'Galaxy m20 m205f' },
  { category: 'iPad', name: 'Air M4 11 INCH A3459 A3460' },
  { category: 'Huawei', name: 'Y5 2019' },
  { category: 'Honor', name: 'Pad 9 HEY2-W09' },
  { category: 'Samsung', name: 'GALAXY A20 A205F' },
  { category: 'Samsung', name: 'S21 FE SM-G990' },
  { category: 'iPad', name: 'Air 5 A2588 A2589 A2591' },
  { category: 'Samsung', name: 'Galaxy M31s m317' },
  { category: 'Xiaomi', name: 'Redmi Note 10s M2101K7BG' },
  { category: 'Samsung', name: 'S24 FE' },
  { category: 'Xiaomi', name: 'Poco X5 Pro 5G 22101320G' },
  { category: 'iPad', name: 'Air 4 A2324 A2072 A2325 A2316' },
  { category: 'Huawei', name: 'P Smart S AQM-LX1' },
  { category: 'iPad', name: 'iPad Mini 6 A2567 A2568 A2569' },
  { category: 'Xiaomi', name: 'Mi 11 Lite' },
  { category: 'Samsung', name: 'Galaxy A70 A705F' },
  { category: 'Xiaomi', name: 'Poco X3 NFC' },
  { category: 'Samsung', name: 'Galaxy M34 M345' },
  { category: 'Samsung', name: 'Galaxy M52' },
  { category: 'TECHNO', name: 'Camon 40 Pro' },
  { category: 'iPhone', name: 'iPhone 18' },
  { category: 'Samsung', name: 'Samsung A04 A045F' },
  { category: 'Samsung', name: 'S24 Ultra S928B' },
  { category: 'Samsung', name: 'SAMSUNG S22 S901E' },
  { category: 'iPad', name: '📱 iPad Pro 11" 3.Nesil A2301 A2377 A2459 A2460' },
  { category: 'iPhone', name: 'iPad Pro 11" 3.Nesil A2301 A2377 A2459 A2460' },
  { category: 'iPad', name: 'iPad Pro 12.9 5th A2461 A2378 A2379' },
  { category: 'Oppo', name: 'Reno Lite CPH2125' },
  { category: 'TECHNO', name: 'Pova 4 LG7n' },
  { category: 'Samsung Tablet', name: 'SAMSUNG S7 FE T737' },
  { category: 'iPad', name: 'iPad 9' },
  { category: 'iPad', name: 'iPad Pro M2 11" A2759' },
  { category: 'Xiaomi', name: '13T' },
  { category: 'TCL', name: '20L Plus T774H' },
  { category: 'iPad', name: 'iPad 10' },
  { category: 'iPhone', name: 'iPhone 17 Pro Max' },
  { category: 'iPhone', name: 'iPhone 17 Pro' },
  { category: 'iPhone', name: 'iPhone 17e' },
  { category: 'iPhone', name: 'iPhone 17' },
  { category: 'iPhone', name: 'iPhone Air' },
  { category: 'iPhone', name: 'iPhone 16 Pro Max' },
  { category: 'iPhone', name: 'iPhone 16 Pro' },
  { category: 'iPhone', name: 'iPhone 16 Plus' },
  { category: 'iPhone', name: 'iPhone 16e' },
  { category: 'iPhone', name: 'iPhone 16' },
  { category: 'iPhone', name: 'iPhone 15 Pro Max' },
  { category: 'iPhone', name: 'iPhone 15 Pro' },
  { category: 'iPhone', name: 'iPhone 15 Plus' },
  { category: 'iPhone', name: 'iPhone 15' },
  { category: 'iPhone', name: 'iPhone 14 Pro Max' },
  { category: 'iPhone', name: 'iPhone 14 Pro' },
  { category: 'iPhone', name: 'iPhone 14 Plus' },
  { category: 'iPhone', name: 'iPhone 14' },
  { category: 'iPhone', name: 'iPhone SE (3. nesil) 2022' },
  { category: 'iPhone', name: 'iPhone 13 Pro Max' },
  { category: 'iPhone', name: 'iPhone 13 Pro' },
  { category: 'iPhone', name: 'iPhone 13 Mini' },
  { category: 'iPhone', name: 'iPhone 13' },
  { category: 'iPhone', name: 'iPhone 12 Pro Max' },
  { category: 'iPhone', name: 'iPhone 12 Pro' },
  { category: 'iPhone', name: 'iPhone 12 Mini' },
  { category: 'iPhone', name: 'iPhone 12' },
  { category: 'iPhone', name: 'iPhone 11 Pro Max' },
  { category: 'iPhone', name: 'iPhone 11 Pro' },
  { category: 'iPhone', name: 'iPhone 11' },
  { category: 'iPhone', name: 'iPhone XS Max' },
  { category: 'iPhone', name: 'iPhone XS' },
  { category: 'iPhone', name: 'iPhone XR' },
  { category: 'iPhone', name: 'iPhone X' },
  { category: 'iPhone', name: 'iPhone SE 2. Nesil 2020' },
  { category: 'iPhone', name: 'iPhone 8 Plus' },
  { category: 'iPhone', name: 'iPhone 8' },
  { category: 'iPhone', name: 'iPhone 7 Plus' },
  { category: 'iPhone', name: 'iPhone 7' },
  { category: 'iPhone', name: 'iPhone 6s Plus' },
  { category: 'iPhone', name: 'iPhone 6s' },
  { category: 'iPhone', name: 'iPhone 6 Plus' },
  { category: 'iPhone', name: 'iPhone 6' },
];

export const DEFAULT_PRICES: PricesStateMap = {
  dollarRate: '50',
  vatRate: '20',
  roundingMode: 'ceil100',
  'iPhone-13-Arka-Kapak_Orijinal-cost': '0',
  'iPhone-13-Arka-Kapak_Orijinal-labor': '0',
  'iPhone-13-Ekran-Deiimi_A-Kalite-cost': '0',
  'iPhone-13-Ekran-Deiimi_A-Kalite-labor': '0',
};
