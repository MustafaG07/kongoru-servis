import { ArrowRight, Smartphone } from 'lucide-react';
import { HighlightedText } from '@/components/HighlightedText';
import { ServiceIconBadge } from '@/components/ServiceIconBadge';
import { Badge } from '@/components/ui/badge';
import { formatTry } from '@/services/pricing';
import type { SearchResultMatch } from '@/services/search';
import { cn } from '@/utils/cn';

interface SearchResultRowProps {
  match: SearchResultMatch;
  query: string;
}

export function SearchResultRow({ match, query }: SearchResultRowProps) {
  const { doc } = match;

  let kindLabel = 'Cihaz';
  let kindBadgeClass =
    'border-blue-500/30 bg-blue-500/12 text-blue-700 dark:text-blue-300';
  let titleClass = 'text-foreground';
  let titleNode: React.ReactNode = <HighlightedText text={doc.device} query={query} />;
  let subNode: React.ReactNode = (
    <span>
      <HighlightedText text={doc.brand} query={query} /> · Fiyat listesini aç
    </span>
  );
  let leftIcon: React.ReactNode = (
    <span
      aria-hidden="true"
      className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg border border-blue-500/25 bg-blue-500/12 text-blue-700 dark:text-blue-300"
    >
      <Smartphone className="size-4" />
    </span>
  );
  let rightNode: React.ReactNode = (
    <div className="flex items-center gap-2">
      <Badge variant="outline" className="bg-[var(--bg-elevated)] text-[11px] font-medium">
        {doc.brand}
      </Badge>
      <ArrowRight className="size-3.5 text-muted-foreground/70" />
    </div>
  );

  if (doc.kind === 'group') {
    kindLabel = 'Hizmet';
    kindBadgeClass =
      'border-amber-500/35 bg-amber-500/12 text-amber-800 dark:text-amber-300';
    titleClass = 'text-[var(--group-title-text)]';
    titleNode = <HighlightedText text={doc.group} query={query} />;
    subNode = (
      <span>
        <HighlightedText text={doc.brand} query={query} /> ›{' '}
        <HighlightedText text={doc.device} query={query} />
      </span>
    );
    leftIcon = <ServiceIconBadge groupName={doc.group} className="size-8 rounded-lg" />;
    rightNode =
      doc.hasPrice && doc.finalPrice > 0 ? (
        <span className="mono-nums rounded-md border border-[var(--price-border)] bg-[var(--price-bg)] px-2.5 py-1 text-xs font-semibold text-[var(--price-text)]">
          {formatTry(doc.finalPrice)}&apos;den
        </span>
      ) : (
        <span className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground">
          <span>Hizmete git</span>
          <ArrowRight className="size-3.5" />
        </span>
      );
  } else if (doc.kind === 'item') {
    kindLabel = 'İşlem';
    kindBadgeClass =
      'border-teal-500/35 bg-teal-500/12 text-teal-800 dark:text-teal-300';
    titleClass = 'text-[var(--quality-text)]';
    titleNode = <HighlightedText text={doc.quality} query={query} />;
    subNode = (
      <span>
        <HighlightedText text={doc.device} query={query} /> ›{' '}
        <span className="font-medium text-[var(--group-title-text)]">
          <HighlightedText text={doc.group} query={query} />
        </span>
      </span>
    );
    leftIcon = <ServiceIconBadge groupName={doc.group} className="size-8 rounded-lg" />;
    rightNode = doc.hasPrice ? (
      <span className="mono-nums rounded-md border border-[var(--price-border)] bg-[var(--price-bg)] px-2.5 py-1 text-xs font-semibold text-[var(--price-text)]">
        {formatTry(doc.finalPrice)}
      </span>
    ) : (
      <span className="rounded-md border border-dashed border-[var(--warning-border)] bg-[var(--warning-soft)] px-2.5 py-1 text-[11px] font-medium text-[var(--warning)]">
        Fiyat girilmemiş
      </span>
    );
  }

  return (
    <div className="flex w-full items-center justify-between gap-3">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        {leftIcon}
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-center gap-2">
            <span
              className={cn(
                'shrink-0 rounded-md border px-1.5 py-0.5 text-[10.5px] font-semibold leading-none tracking-wide',
                kindBadgeClass,
              )}
            >
              {kindLabel}
            </span>
            <span className={cn('truncate text-[14px] font-semibold', titleClass)}>
              {titleNode}
            </span>
          </div>
          <div className="truncate text-xs text-muted-foreground">{subNode}</div>
        </div>
      </div>

      <div className="shrink-0">{rightNode}</div>
    </div>
  );
}
