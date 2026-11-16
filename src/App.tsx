import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { ErrorState } from '@/components/assistant-ui/elements/error-state';
import { Button } from '@/components/ui/button';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { DeviceSidebar } from '@/features/directory/DeviceSidebar';
import { Topbar } from '@/features/layout/Topbar';
import { BackupDialog } from '@/features/modals/BackupDialog';
import { PasswordDialog } from '@/features/modals/PasswordDialog';
import { GlobalSearchDialog } from '@/features/search/GlobalSearchDialog';
import { MobileQuickSearch } from '@/features/search/MobileQuickSearch';
import { AdminControlPanel } from '@/features/workbench/AdminControlPanel';
import { AdminServiceGrid } from '@/features/workbench/AdminServiceGrid';
import { CustomerQuoteBar } from '@/features/workbench/CustomerQuoteBar';
import { CustomerServiceGrid } from '@/features/workbench/CustomerServiceGrid';
import { DeviceBanner } from '@/features/workbench/DeviceBanner';
import { useKongoruCatalog } from '@/hooks/useKongoruCatalog';
import { useTheme } from '@/hooks/useTheme';
import { getTodayDateKey } from '@/services/csvBackup';
import type { SearchDocument } from '@/services/search';
import { cn } from '@/utils/cn';

export function App() {
  const { theme, toggleTheme } = useTheme();
  const {
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
    dailyBackups,
    backupDirHandle,
    customFolderMsg,
    selectDevice,
    selectBrandFromBanner,
    loginAdmin,
    switchToCustomerMode,
    changeAdminPassword,
    syncFromCloud,
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
  } = useKongoruCatalog();

  const [globalSearchOpen, setGlobalSearchOpen] = useState(false);
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [backupModalOpen, setBackupModalOpen] = useState(false);
  const [flashTargetKey, setFlashTargetKey] = useState<string | null>(null);

  const sidebarSearchRef = useRef<HTMLInputElement | null>(null);
  const centerPaneRef = useRef<HTMLElement | null>(null);
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    document.body.setAttribute('data-mode', isCustomerMode ? 'customer' : 'admin');
  }, [isCustomerMode]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeTag = document.activeElement?.tagName || '';
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setGlobalSearchOpen(true);
        return;
      }
      if (e.key === '/' && activeTag !== 'INPUT' && activeTag !== 'TEXTAREA') {
        e.preventDefault();
        if (window.innerWidth < 1024) setMobilePane('directory');
        setTimeout(() => sidebarSearchRef.current?.focus(), 20);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [setMobilePane]);

  const triggerFlash = useCallback((key: string) => {
    if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    setFlashTargetKey(null);
    requestAnimationFrame(() => {
      setFlashTargetKey(key);
      flashTimerRef.current = setTimeout(() => setFlashTargetKey(null), 2200);
    });
  }, []);

  const handleJumpToSearchDocument = useCallback(
    (doc: SearchDocument) => {
      if (activeServiceFilter !== 'ALL') {
        setActiveServiceFilter('ALL');
      }
      if (activeBrandFilter !== 'ALL' && activeBrandFilter !== doc.brand) {
        setActiveBrandFilter('ALL');
      }

      selectDevice(doc.brand, doc.device);
      setMobilePane('stage');

      requestAnimationFrame(() => {
        setTimeout(() => {
          if (doc.kind === 'device') {
            if (centerPaneRef.current) centerPaneRef.current.scrollTop = 0;
            triggerFlash('device');
            return;
          }

          if (doc.kind === 'group') {
            const cardEl = document.querySelector<HTMLElement>(
              `[data-service-group="${CSS.escape(doc.group)}"]`,
            );
            if (cardEl) {
              cardEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
              triggerFlash(`group:${doc.group}`);
            } else {
              if (centerPaneRef.current) centerPaneRef.current.scrollTop = 0;
              toast.info(`${doc.device} · ${doc.group} için henüz fiyat girilmemiş.`);
            }
            return;
          }

          const itemSelector = `[data-service-item="${CSS.escape(`${doc.group}|${doc.quality}`)}"]`;
          const itemEl = document.querySelector<HTMLElement>(itemSelector);
          if (itemEl) {
            itemEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
            triggerFlash(`item:${doc.group}|${doc.quality}`);
            if (!isCustomerMode) {
              setSelectedAdminSummary({
                brand: doc.brand,
                device: doc.device,
                group: doc.group,
                quality: doc.quality,
              });
            }
          } else {
            const parentEl = document.querySelector<HTMLElement>(
              `[data-service-group="${CSS.escape(doc.group)}"]`,
            );
            parentEl?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            toast.info(
              `${doc.device} · ${doc.group} (${doc.quality}) için henüz fiyat girilmemiş.`,
            );
          }
        }, 40);
      });
    },
    [
      activeBrandFilter,
      activeServiceFilter,
      isCustomerMode,
      selectDevice,
      setActiveBrandFilter,
      setActiveServiceFilter,
      setMobilePane,
      setSelectedAdminSummary,
      triggerFlash,
    ],
  );

  const todayKey = getTodayDateKey();
  const hasTodayBackup = Boolean(dailyBackups[todayKey]);
  const backupCount = Object.keys(dailyBackups).length;

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex h-[100dvh] max-w-[100vw] flex-col overflow-hidden bg-background text-foreground print:h-auto print:overflow-visible">
        <div className="no-print">
          <Topbar
            isCustomerMode={isCustomerMode}
            theme={theme}
            onToggleTheme={toggleTheme}
            syncStatus={syncStatus}
            syncText={syncText}
            onSyncCloud={() => void syncFromCloud(true)}
            onOpenGlobalSearch={() => setGlobalSearchOpen(true)}
            onLoginAdmin={loginAdmin}
            onSwitchToCustomerMode={switchToCustomerMode}
            onOpenBackupModal={() => setBackupModalOpen(true)}
            onOpenPasswordModal={() => setPasswordModalOpen(true)}
            hasTodayBackup={hasTodayBackup}
            backupCount={backupCount}
          />
        </div>

        <div className="no-print">
          <MobileQuickSearch
            searchIndex={searchIndex}
            activeBrand={selectedBrand}
            activeDevice={selectedDevice}
            onSelectResult={handleJumpToSearchDocument}
          />
        </div>

        {/* Mobil Bölüm Seçici (Sadece Yönetici Modunda) */}
        {!isCustomerMode && (
          <div className="no-print grid shrink-0 grid-cols-2 gap-2 border-b bg-[var(--bg-surface)] px-3 py-2 lg:hidden">
            <Button
              type="button"
              variant={mobilePane === 'directory' ? 'default' : 'secondary'}
              size="sm"
              onClick={() => setMobilePane('directory')}
              className="h-9 text-xs font-medium"
            >
              Cihazlar
            </Button>
            <Button
              type="button"
              variant={mobilePane === 'stage' ? 'default' : 'secondary'}
              size="sm"
              onClick={() => setMobilePane('stage')}
              className="h-9 text-xs font-medium"
            >
              Tamir Masası
            </Button>
          </div>
        )}

        {/* 2 Sütunlu Çalışma Alanı */}
        <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden lg:grid-cols-[280px_minmax(0,1fr)] print:block print:overflow-visible">
          <div
            className={cn(
              'no-print min-h-0 overflow-hidden',
              !isCustomerMode && mobilePane === 'directory'
                ? 'flex flex-col'
                : 'hidden lg:flex lg:flex-col',
            )}
          >
            <DeviceSidebar
              categories={catalog.categories}
              devicesMap={catalog.devicesMap}
              activeBrandFilter={activeBrandFilter}
              onChangeBrandFilter={setActiveBrandFilter}
              searchQuery={deviceSearchQuery}
              onChangeSearchQuery={setDeviceSearchQuery}
              selectedBrand={selectedBrand}
              selectedDevice={selectedDevice}
              onSelectDevice={selectDevice}
              isCustomerMode={isCustomerMode}
              onMoveDevice={moveDevice}
              onSortBrandDevices={sortBrandDevices}
              onRemoveDevice={removeDevice}
              onBackToStageMobile={() => setMobilePane('stage')}
              searchInputRef={sidebarSearchRef}
            />
          </div>

          <main
            ref={centerPaneRef}
            className={cn(
              'min-h-0 flex-col gap-3 overflow-y-auto bg-[var(--bg-canvas)] px-3 py-3 sm:px-4 sm:py-3 print:overflow-visible print:bg-white',
              isCustomerMode && 'max-md:gap-2.5 max-md:px-2.5 max-md:py-2',
              isCustomerMode || mobilePane === 'stage' ? 'flex' : 'hidden lg:flex',
              isCustomerMode && selectedQuoteItems.size > 0 ? 'pb-24' : 'pb-7',
            )}
          >
            {!isCustomerMode && syncError && (
              <ErrorState
                title="Bulut Senkronizasyonu Hatası"
                detail={syncError}
                retrying={isSyncing}
                onRetry={() => void syncFromCloud(true)}
                className="no-print max-w-full rounded-xl border border-[var(--danger-border)]"
              />
            )}

            {!isCustomerMode && (
              <div className="no-print">
                <AdminControlPanel
                  financeConfig={financeConfig}
                  onFinanceChange={updateFinance}
                  selectedDevice={selectedDevice}
                  selectedBrand={selectedBrand}
                  selectedSummary={selectedAdminSummary}
                  pricesState={catalog.pricesState}
                  onResetSummary={() => setSelectedAdminSummary(null)}
                  categories={catalog.categories}
                  serviceGroups={catalog.serviceGroups}
                  onAddDevice={addDevice}
                  onAddQuality={addQuality}
                  onAddGroup={addGroup}
                  onAddBrand={addBrand}
                />
              </div>
            )}

            <div className="flex items-start gap-4">
              <div
                className={cn(
                  'min-w-0 flex-1 space-y-3',
                  flashTargetKey === 'device' && 'search-flash rounded-xl',
                )}
              >
                <div className="no-print">
                  <DeviceBanner
                    categories={catalog.categories}
                    devicesMap={catalog.devicesMap}
                    selectedBrand={selectedBrand}
                    selectedDevice={selectedDevice}
                    onSelectBrandFromBanner={selectBrandFromBanner}
                    onSelectDeviceFromBanner={selectDevice}
                    onRemoveDevice={removeDevice}
                    isCustomerMode={isCustomerMode}
                    financeConfig={financeConfig}
                    serviceGroups={catalog.serviceGroups}
                    pricesState={catalog.pricesState}
                    activeServiceFilter={activeServiceFilter}
                    onSelectServiceFilter={setActiveServiceFilter}
                  />
                </div>

                {isCustomerMode ? (
                  <div className="no-print">
                    <CustomerServiceGrid
                      selectedBrand={selectedBrand}
                      selectedDevice={selectedDevice}
                      serviceGroups={catalog.serviceGroups}
                      activeServiceFilter={activeServiceFilter}
                      pricesState={catalog.pricesState}
                      financeConfig={financeConfig}
                      selectedQuoteItems={selectedQuoteItems}
                      onToggleQuoteItem={toggleQuoteItem}
                      flashTargetKey={flashTargetKey}
                    />
                  </div>
                ) : (
                  <AdminServiceGrid
                    selectedBrand={selectedBrand}
                    selectedDevice={selectedDevice}
                    serviceGroups={catalog.serviceGroups}
                    activeServiceFilter={activeServiceFilter}
                    pricesState={catalog.pricesState}
                    financeConfig={financeConfig}
                    selectedAdminSummary={selectedAdminSummary}
                    onSelectAdminSummary={setSelectedAdminSummary}
                    onPriceChange={updateItemPrice}
                    onRemoveGroup={removeGroup}
                    onRemoveQuality={removeQualityFromGroup}
                    onAddQuality={addQuality}
                    flashTargetKey={flashTargetKey}
                  />
                )}
              </div>
            </div>
          </main>
        </div>

        {isCustomerMode && (
          <CustomerQuoteBar
            items={selectedQuoteItems}
            onRemoveItem={removeQuoteItem}
            onClearAll={clearQuoteSelection}
          />
        )}

        <GlobalSearchDialog
          open={globalSearchOpen}
          onOpenChange={setGlobalSearchOpen}
          searchIndex={searchIndex}
          activeBrand={selectedBrand}
          activeDevice={selectedDevice}
          onSelectResult={handleJumpToSearchDocument}
        />

        <PasswordDialog
          open={passwordModalOpen}
          onOpenChange={setPasswordModalOpen}
          onSubmitPasswordChange={changeAdminPassword}
        />

        <BackupDialog
          open={backupModalOpen}
          onOpenChange={setBackupModalOpen}
          dailyBackups={dailyBackups}
          backupDirHandle={backupDirHandle}
          customFolderMsg={customFolderMsg}
          onTakeManualBackupNow={takeManualBackupNow}
          onConnectFolder={connectBackupFolder}
          onDisconnectFolder={disconnectBackupFolder}
          onDownloadCurrentCsv={downloadCurrentCsv}
          onRestoreCsvText={restoreFromCsvText}
          onDownloadDailyBackup={downloadDailyBackup}
          onDeleteDailyBackup={deleteDailyBackup}
        />

        <Toaster theme={theme} position="bottom-right" richColors />
      </div>
    </TooltipProvider>
  );
}

export default App;
