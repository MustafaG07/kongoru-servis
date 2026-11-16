import { useEffect, useMemo, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { SearchResultRow } from '@/features/search/SearchResultRow';
import { searchCatalog, type SearchDocument } from '@/services/search';

interface MobileQuickSearchProps {
  searchIndex: readonly SearchDocument[];
  activeBrand: string;
  activeDevice: string;
  onSelectResult: (doc: SearchDocument) => void;
}

export function MobileQuickSearch({
  searchIndex,
  activeBrand,
  activeDevice,
  onSelectResult,
}: MobileQuickSearchProps) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const matches = useMemo(() => {
    const clean = query.trim();
    if (!clean) return [];
    return searchCatalog({
      query: clean,
      index: searchIndex,
      includeUnpriced: true,
      activeBrand,
      activeDevice,
      limit: 28,
    });
  }, [activeBrand, activeDevice, query, searchIndex]);

  useEffect(() => {
    const handleDocClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('click', handleDocClick);
    return () => document.removeEventListener('click', handleDocClick);
  }, []);

  const handleSelect = (doc: SearchDocument) => {
    setQuery('');
    setOpen(false);
    onSelectResult(doc);
  };

  return (
    <div ref={containerRef} className="relative z-40 shrink-0 px-3.5 pt-1 pb-2.5 lg:hidden">
      <div className="relative flex items-center">
        <Search className="pointer-events-none absolute left-3 size-4 text-muted-foreground" />
        <Input
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => {
            if (query.trim()) setOpen(true);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && matches.length > 0) {
              e.preventDefault();
              handleSelect(matches[0].doc);
            } else if (e.key === 'Escape') {
              setQuery('');
              setOpen(false);
            }
          }}
          placeholder="Model, hizmet veya parça ara..."
          className="h-11 rounded-xl border-[var(--border-strong)] bg-[var(--bg-surface)] pr-9 pl-9 text-base"
        />
        {query && (
          <button
            type="button"
            onClick={() => {
              setQuery('');
              setOpen(false);
            }}
            aria-label="Aramayı temizle"
            className="absolute right-2.5 inline-flex size-6 items-center justify-center rounded-md bg-muted text-muted-foreground hover:text-foreground"
          >
            <X className="size-3.5" />
          </button>
        )}
      </div>

      {open && query.trim() && (
        <div className="absolute right-3.5 left-3.5 top-full z-50 mt-1.5 max-h-[60dvh] overflow-y-auto rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] p-2 shadow-xl">
          {matches.length === 0 ? (
            <div className="py-6 text-center text-sm text-muted-foreground">
              Eşleşen model, hizmet veya parça bulunamadı.
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              {matches.map((match) => (
                <button
                  key={match.doc.id}
                  type="button"
                  onClick={() => handleSelect(match.doc)}
                  className="w-full rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-[var(--bg-elevated)]"
                >
                  <SearchResultRow match={match} query={query} />
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
