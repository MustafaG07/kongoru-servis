import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface PasswordDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmitPasswordChange: (
    currentPass: string,
    newPass: string,
    confirmPass: string,
  ) => Promise<{ ok: boolean; error?: string }>;
}

export function PasswordDialog({
  open,
  onOpenChange,
  onSubmitPasswordChange,
}: PasswordDialogProps) {
  const [currentPass, setCurrentPass] = useState('');
  const [newPass, setNewPass] = useState('');
  const [confirmPass, setConfirmPass] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const resetForm = () => {
    setCurrentPass('');
    setNewPass('');
    setConfirmPass('');
    setErrorMsg('');
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await onSubmitPasswordChange(currentPass, newPass, confirmPass);
      if (res.ok) {
        resetForm();
        onOpenChange(false);
      } else {
        setErrorMsg(res.error || 'Şifre güncellenemedi.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) resetForm();
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle>Yönetici Şifresini Değiştir</DialogTitle>
          <DialogDescription>
            Yeni şifreniz yerel tarayıcı hafızasına ve bulut veritabanına kaydedilir.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="v3CurrentPass">Mevcut Şifre</Label>
            <Input
              id="v3CurrentPass"
              type="password"
              value={currentPass}
              onChange={(e) => {
                setCurrentPass(e.target.value);
                if (errorMsg) setErrorMsg('');
              }}
              placeholder="Mevcut şifreyi girin..."
              autoComplete="current-password"
              autoFocus
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="v3NewPass">Yeni Şifre</Label>
            <Input
              id="v3NewPass"
              type="password"
              value={newPass}
              onChange={(e) => {
                setNewPass(e.target.value);
                if (errorMsg) setErrorMsg('');
              }}
              placeholder="Yeni şifre..."
              autoComplete="new-password"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="v3ConfirmPass">Yeni Şifre (Tekrar)</Label>
            <Input
              id="v3ConfirmPass"
              type="password"
              value={confirmPass}
              onChange={(e) => {
                setConfirmPass(e.target.value);
                if (errorMsg) setErrorMsg('');
              }}
              placeholder="Yeni şifreyi tekrar girin..."
              autoComplete="new-password"
            />
          </div>

          {errorMsg && (
            <p className="text-xs font-medium text-destructive" role="alert">
              {errorMsg}
            </p>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="secondary"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              İptal
            </Button>
            <Button
              type="submit"
              disabled={submitting}
              className="border border-[var(--warning-border)] bg-[var(--warning-soft)] text-[var(--warning)] hover:opacity-90"
            >
              {submitting ? 'Kaydediliyor...' : 'Şifreyi Kaydet'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
