import { getHighlightSegments } from '@/services/search';

interface HighlightedTextProps {
  text: string;
  query: string;
}

export function HighlightedText({ text, query }: HighlightedTextProps) {
  const segments = getHighlightSegments(text, query);
  return (
    <>
      {segments.map((seg, idx) =>
        seg.highlighted ? (
          <mark
            key={idx}
            className="rounded-xs bg-emerald-500/15 px-0.5 font-semibold text-emerald-700 dark:text-emerald-300"
          >
            {seg.text}
          </mark>
        ) : (
          <span key={idx}>{seg.text}</span>
        ),
      )}
    </>
  );
}
