import { useRef, useState, type ChangeEvent } from 'react';
import {
  Download,
  FolderOpen,
  FolderX,
  HardDriveUpload,
  RotateCcw,
  Save,
  Trash2,
} from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from '@/components/ui/empty';
import { ScrollArea } from '@/components/ui/scroll-area';
import { getTodayDateKey } from '@/services/csvBackup';
import type { BackupDirectoryHandle, DailyBackupsMap } from '@/types';

interface BackupDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dailyBackups: DailyBackupsMap;
  backupDirHandle: BackupDirectoryHandle | null;
  customFolderMsg: string | null;
  onTakeManualBackupNow: () => Promise<void>;
  onConnectFolder: () => Promise<void>;
  onDisconnectFolder: () => Promise<void>;
  onDownloadCurrentCsv: () => void;
  onRestoreCsvText: (csvText: string, sourceLabel: string) => Promise<boolean>;
  onDownloadDailyBackup: (dateKey: string) => void;
  onDeleteDailyBackup: (dateKey: string) => void;
}

type PendingBackupConfirm =
  | { kind: 'restore'; dateKey: string }
  | { kind: 'delete'; dateKey: string }
  | null;

export function BackupDialog({
  open,
  onOpenChange,
  dailyBackups,
  backupDirHandle,
  customFolderMsg,
  onTakeManualBackupNow,
  onConnectFolder,
  onDisconnectFolder,
  onDownloadCurrentCsv,
  onRestoreCsvText,
  onDownloadDailyBackup,
  onDeleteDailyBackup,
}: BackupDialogProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [pendingConfirm, setPendingConfirm] = useState<PendingBackupConfirm>(null);

  const sortedDates = Object.keys(dailyBackups).sort().reverse();
  const todayKey = getTodayDateKey();
  const todayEntry = dailyBackups[todayKey];
  const todayTimeStr = todayEntry?.updatedAt
    ? new Date(todayEntry.updatedAt).toLocaleTimeString('tr-TR', {
        hour: '2-digit',
        minute: '2-digit',
      })
    : '';

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const text = typeof ev.target?.result === 'string' ? ev.target.result : '';
      const ok = await onRestoreCsvText(text, file.name);
      if (ok) {
        onOpenChange(false);
      }
    };
    reader.readAsText(file, 'utf-8');
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-[820px]">
          <DialogHeader>
            <DialogTitle>Günlük Otomatik CSV Yedek &amp; Geri Yükleme</DialogTitle>
            <DialogDescription>
              Değişiklik yapılan günlerde otomatik günlük CSV yedeği oluşturulur; yerel klasöre
              yazabilir veya dosyadan geri yükleyebilirsiniz.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* 1. Bugünkü durum & yerel klasör */}
            <Card className="gap-3 rounded-xl border bg-[var(--bg-elevated)] p-4 shadow-none">
              <h4 className="text-sm font-semibold text-foreground">
                1. Bugünkü Otomatik Yedek Durumu &amp; Yerel Klasör
              </h4>
              <div className="space-y-1.5 text-xs leading-relaxed text-secondary-foreground">
                <p>
                  <strong className="font-semibold text-foreground">{todayKey}</strong> —{' '}
                  {todayEntry ? (
                    <>
                      Değişiklik algılandı; günlük yedek güncel (
                      <strong className="mono-nums font-semibold text-foreground">
                        {todayEntry.fileName}
                      </strong>
                      {todayTimeStr ? ` · ${todayTimeStr}` : ''}, {todayEntry.pricedCount || 0}{' '}
                      fiyatlı işlem).
                    </>
                  ) : (
                    'Bugün henüz değişiklik yapılmadı; bu yüzden yeni yedek alınmadı.'
                  )}
                </p>
                <p className="text-muted-foreground">
                  {customFolderMsg ? (
                    customFolderMsg
                  ) : backupDirHandle ? (
                    <>
                      Bağlı yerel klasör:{' '}
                      <strong className="mono-nums font-semibold text-foreground">
                        {backupDirHandle.name || 'Seçili Klasör'}
                      </strong>{' '}
                      (değişiklik olduğunda o günün eski CSV dosyasını silip yenisini yazar).
                    </>
                  ) : (
                    'Doğrudan disk klasörü henüz bağlı değil (uygulama içi günlük CSV geçmişi aktif).'
                  )}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => void onTakeManualBackupNow()}
                  className="gap-1.5 border-[var(--warning-border)] bg-[var(--warning-soft)] text-[var(--warning)] hover:opacity-90"
                >
                  <Save className="size-3.5" />
                  Şimdi Yedek Al
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => void onConnectFolder()}
                  className="gap-1.5"
                >
                  <FolderOpen className="size-3.5" />
                  Yerel Yedek Klasörü Bağla
                </Button>
                {backupDirHandle && (
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => void onDisconnectFolder()}
                    className="gap-1.5"
                  >
                    <FolderX className="size-3.5" />
                    Klasör Bağlantısını Kes
                  </Button>
                )}
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={onDownloadCurrentCsv}
                  className="gap-1.5"
                >
                  <Download className="size-3.5" />
                  Güncel Yedeği CSV İndir
                </Button>
              </div>
            </Card>

            {/* 2. Dosyadan geri yükleme */}
            <Card className="gap-2.5 rounded-xl border bg-[var(--bg-elevated)] p-4 shadow-none">
              <h4 className="text-sm font-semibold text-foreground">
                2. Bilgisayardaki CSV Dosyasından Geri Yükle
              </h4>
              <p className="text-xs leading-relaxed text-muted-foreground">
                Daha önce alınan veya indirilen <span className="mono-nums font-medium">.csv</span>{' '}
                yedeğini seçerek tüm marka, cihaz, kur ve fiyatları geri yükleyebilirsiniz.
              </p>
              <div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,text/csv"
                  className="hidden"
                  onChange={handleFileChange}
                />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    if (fileInputRef.current) {
                      fileInputRef.current.value = '';
                      fileInputRef.current.click();
                    }
                  }}
                  className="gap-1.5 border-[var(--warning-border)] bg-[var(--warning-soft)] text-[var(--warning)] hover:opacity-90"
                >
                  <HardDriveUpload className="size-3.5" />
                  CSV Dosyası Seç ve Geri Yükle
                </Button>
              </div>
            </Card>

            {/* 3. Günlük yedek geçmişi */}
            <Card className="gap-2.5 rounded-xl border bg-[var(--bg-elevated)] p-4 shadow-none">
              <h4 className="text-sm font-semibold text-foreground">
                3. Günlük Yedek Geçmişi (Değişiklik Yapılan Günler)
              </h4>
              <p className="text-xs leading-relaxed text-muted-foreground">
                Yalnızca değişiklik yapılan günlerde yedek oluşturulur; aynı gün içinde tekrar
                değişiklik yapılırsa o günün mevcut yedeği silinip yenisi yazılır.
              </p>

              {sortedDates.length === 0 ? (
                <Empty className="border-dashed bg-[var(--bg-surface)] py-6">
                  <EmptyHeader>
                    <EmptyTitle className="text-sm">Kayıtlı Yedek Yok</EmptyTitle>
                    <EmptyDescription className="text-xs">
                      Henüz kayıtlı günlük CSV yedeği bulunmuyor. Değişiklik yapıldığında otomatik
                      oluşturulacaktır.
                    </EmptyDescription>
                  </EmptyHeader>
                </Empty>
              ) : (
                <ScrollArea className="max-h-60 pr-2">
                  <div className="space-y-2">
                    {sortedDates.map((d) => {
                      const item = dailyBackups[d];
                      const updatedLabel = item.updatedAt
                        ? new Date(item.updatedAt).toLocaleString('tr-TR')
                        : d;
                      return (
                        <div
                          key={d}
                          className="flex flex-col justify-between gap-2.5 rounded-lg border bg-[var(--bg-surface)] px-3 py-2.5 sm:flex-row sm:items-center"
                        >
                          <div className="min-w-0 space-y-0.5">
                            <div className="mono-nums truncate text-xs font-semibold text-foreground">
                              {item.fileName || `kongoru_yedek_${d}.csv`}
                            </div>
                            <div className="text-[11.5px] text-muted-foreground">
                              Son güncelleme: {updatedLabel} · {item.pricedCount || 0} fiyatlı kalem
                            </div>
                          </div>

                          <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                            <Button
                              type="button"
                              size="xs"
                              onClick={() => setPendingConfirm({ kind: 'restore', dateKey: d })}
                              className="gap-1"
                            >
                              <RotateCcw className="size-3" />
                              Geri Yükle
                            </Button>
                            <Button
                              type="button"
                              size="xs"
                              variant="secondary"
                              onClick={() => onDownloadDailyBackup(d)}
                              className="gap-1"
                            >
                              <Download className="size-3" />
                              CSV İndir
                            </Button>
                            <Button
                              type="button"
                              size="xs"
                              variant="destructive"
                              onClick={() => setPendingConfirm({ kind: 'delete', dateKey: d })}
                              className="gap-1"
                            >
                              <Trash2 className="size-3" />
                              Sil
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </ScrollArea>
              )}
            </Card>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={pendingConfirm !== null}
        onOpenChange={(next) => {
          if (!next) setPendingConfirm(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pendingConfirm?.kind === 'restore' ? 'Yedeği Geri Yükle' : 'Yedek Kaydını Sil'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingConfirm?.kind === 'restore'
                ? `${pendingConfirm.dateKey} tarihli yedeği geri yüklemek mevcut verilerin üzerine yazar. Devam etmek istiyor musunuz?`
                : pendingConfirm?.kind === 'delete'
                  ? `${pendingConfirm.dateKey} tarihli günlük yedek kaydını silmek istiyor musunuz?`
                  : ''}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>İptal</AlertDialogCancel>
            <AlertDialogAction
              variant={pendingConfirm?.kind === 'delete' ? 'destructive' : 'default'}
              onClick={async () => {
                if (!pendingConfirm) return;
                const action = pendingConfirm;
                setPendingConfirm(null);
                if (action.kind === 'restore') {
                  const entry = dailyBackups[action.dateKey];
                  if (entry?.csv) {
                    const ok = await onRestoreCsvText(entry.csv, `${action.dateKey} tarihli yedek`);
                    if (ok) onOpenChange(false);
                  }
                } else {
                  onDeleteDailyBackup(action.dateKey);
                }
              }}
            >
              {pendingConfirm?.kind === 'restore' ? 'Geri Yükle' : 'Sil'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
