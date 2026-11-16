import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { SearchResultRow } from '@/features/search/SearchResultRow';
import { searchCatalog, type SearchDocument, type SearchResultMatch } from '@/services/search';

interface GlobalSearchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  searchIndex: readonly SearchDocument[];
  activeBrand: string;
  activeDevice: string;
  onSelectResult: (doc: SearchDocument) => void;
}

const HINT_QUERIES = [
  '17 pro max filmli ahize',
  'ekran orijinal',
  'batarya',
  'arka kapak',
  'ön cam',
  'soket',
];

export function GlobalSearchDialog({
  open,
  onOpenChange,
  searchIndex,
  activeBrand,
  activeDevice,
  onSelectResult,
}: GlobalSearchDialogProps) {
  const [query, setQuery] = useState('');

  const popularDevices: SearchResultMatch[] = useMemo(
    () =>
      searchIndex
        .filter((d) => d.kind === 'device')
        .slice(0, 6)
        .map((doc) => ({ doc, score: 1, matchedTokens: [] })),
    [searchIndex],
  );

  const matches: SearchResultMatch[] = useMemo(() => {
    const clean = query.trim();
    if (!clean) return [];
    return searchCatalog({
      query: clean,
      index: searchIndex,
      includeUnpriced: true,
      activeBrand,
      activeDevice,
      limit: 36,
    });
  }, [activeBrand, activeDevice, query, searchIndex]);

  const handlePick = (doc: SearchDocument) => {
    onOpenChange(false);
    setQuery('');
    onSelectResult(doc);
  };

  const cleanQuery = query.trim();

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) setQuery('');
      }}
    >
      <DialogHeader className="sr-only">
        <DialogTitle>Genel Akıllı Arama</DialogTitle>
        <DialogDescription>
          Yazım hatası toleranslı cihaz, hizmet ve parça araması yapın.
        </DialogDescription>
      </DialogHeader>
      <DialogContent className="overflow-hidden p-0 sm:max-w-[760px]">
        <Command
          shouldFilter={false}
          className="bg-popover [&_[data-slot=command-input-wrapper]]:h-14 [&_[data-slot=command-input-wrapper]]:px-4 [&_[data-slot=command-input-wrapper]]:pr-12"
        >
          <CommandInput
            value={query}
            onValueChange={setQuery}
            placeholder="Model, işlem veya parça ara (Örn: iphone 17 pro max filmli ahize)"
            className="h-12 text-[15px]"
          />
          <CommandList className="max-h-[480px] p-3">
            {!cleanQuery ? (
              <div className="space-y-4">
                <div className="px-1.5 pt-1">
                  <div className="mb-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Örnek Akıllı Aramalar
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {HINT_QUERIES.map((hint) => (
                      <button
                        key={hint}
                        type="button"
                        onClick={() => setQuery(hint)}
                        className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border-strong)] bg-[var(--bg-elevated)] px-3 py-1.5 text-xs font-medium text-secondary-foreground transition-colors hover:border-[var(--price-border)] hover:bg-[var(--price-bg)] hover:text-[var(--price-text)]"
                      >
                        <Search className="size-3 opacity-70" />
                        <span>{hint}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {popularDevices.length > 0 && (
                  <CommandGroup
                    heading="Popüler Modeller"
                    className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:pb-2 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider"
                  >
                    <div className="space-y-1.5">
                      {popularDevices.map((match) => (
                        <CommandItem
                          key={match.doc.id}
                          value={match.doc.id}
                          onSelect={() => handlePick(match.doc)}
                          className="rounded-xl px-3.5 py-3"
                        >
                          <SearchResultRow match={match} query="" />
                        </CommandItem>
                      ))}
                    </div>
                  </CommandGroup>
                )}
              </div>
            ) : matches.length === 0 ? (
              <CommandEmpty className="py-12 text-sm text-muted-foreground">
                Eşleşen cihaz, hizmet veya parça bulunamadı.
              </CommandEmpty>
            ) : (
              <CommandGroup
                heading={`${matches.length} sonuç bulundu`}
                className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:pb-2 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider"
              >
                <div className="space-y-1.5">
                  {matches.map((match) => (
                    <CommandItem
                      key={match.doc.id}
                      value={match.doc.id}
                      onSelect={() => handlePick(match.doc)}
                      className="rounded-xl px-3.5 py-3"
                    >
                      <SearchResultRow match={match} query={cleanQuery} />
                    </CommandItem>
                  ))}
                </div>
              </CommandGroup>
            )}
          </CommandList>
          <div className="hidden items-center justify-between border-t bg-[var(--bg-elevated)] px-4 py-2.5 text-xs text-muted-foreground sm:flex">
            <div className="flex items-center gap-4">
              <span className="flex items-center gap-1.5">
                <kbd className="mono-nums rounded border bg-background px-1.5 py-0.5 text-[10.5px]">
                  ↑
                </kbd>
                <kbd className="mono-nums rounded border bg-background px-1.5 py-0.5 text-[10.5px]">
                  ↓
                </kbd>
                <span>Gezin</span>
              </span>
              <span className="flex items-center gap-1.5">
                <kbd className="mono-nums rounded border bg-background px-1.5 py-0.5 text-[10.5px]">
                  Enter
                </kbd>
                <span>Hedefe Git</span>
              </span>
            </div>
            <span>Yazım hatası toleranslı akıllı arama</span>
          </div>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
