// KONGORU Teknik Servis alan modeli ve uygulama tipleri

export type ThemeMode = 'dark' | 'light';
export type MobilePane = 'directory' | 'stage';
export type SyncStatus = 'online' | 'pending' | 'local' | 'offline';
export type SaveIndicatorMode = 'idle' | 'saving' | 'saved' | 'error';
export type RoundingMode = 'ceil100' | 'ceil10' | 'exact';

export type ServiceGroupsMap = Record<string, string[]>;
export type DevicesByBrand = Record<string, string[]>;

export interface SerializedDeviceEntry {
    name: string;
    category: string;
}

export interface ItemPricePair {
    usd: string;
    labor: string;
}

export interface LegacyStructuredPriceItem {
    cost?: string | number;
    usd?: string | number;
    usdCost?: string | number;
    labor?: string | number;
    laborCost?: string | number;
}

export type PriceMapValue = string | number | boolean | LegacyStructuredPriceItem | undefined;
export type PricesStateMap = Record<string, PriceMapValue>;

export interface FinanceConfig {
    rate: number;
    vatRate: number;
    roundingMode: RoundingMode;
}

export interface PriceCalculation {
    hasPrice: boolean;
    tlPart: number;
    rawTotal: number;
    vatAmount: number;
    withTax: number;
    finalPrice: number;
}

export interface DeviceSortScore {
    familyRank: number;
    genScore: number;
    tierScore: number;
    subScore: number;
}

export interface DailyBackupEntry {
    date: string;
    updatedAt: string;
    fileName: string;
    hash?: string;
    pricedCount: number;
    csv: string;
}

export type DailyBackupsMap = Record<string, DailyBackupEntry>;

export interface GithubDbPayload {
    version?: number;
    updatedAt?: string;
    catList?: string[];
    categories?: string[];
    serviceGroups?: ServiceGroupsMap;
    deviceList?: SerializedDeviceEntry[] | DevicesByBrand;
    devices?: DevicesByBrand;
    prices?: PricesStateMap;
    adminPassword?: string;
    dailyCsvBackups?: DailyBackupsMap;
}

export interface StorageKeysMap {
    categories: string;
    groups: string;
    devices: string;
    prices: string;
    password: string;
    theme: string;
    dailyBackups: string;
    lastBackupHash: string;
    pendingSync: string;
}

export interface GithubDbConfig {
    gistId: string;
    fileName: string;
    tokenParts: readonly string[];
}

export interface BackupWritableStream {
    write(data: string): Promise<void>;
    close(): Promise<void>;
}

export interface BackupFileHandle {
    createWritable(): Promise<BackupWritableStream>;
}

export interface BackupDirectoryHandle {
    name?: string;
    queryPermission?(descriptor?: { mode?: 'read' | 'readwrite' }): Promise<PermissionState>;
    removeEntry?(name: string): Promise<void>;
    getFileHandle(name: string, options?: { create?: boolean }): Promise<BackupFileHandle>;
}
