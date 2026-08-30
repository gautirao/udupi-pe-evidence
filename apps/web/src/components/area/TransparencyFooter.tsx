interface TransparencyFooterProps {
  /** Optional ISO date string — displayed as 'Updated {date}'. Omitted when null. */
  updatedAt?: string | null;
}

/**
 * Buyer-safe transparency footer (AC8, AC12).
 * Static copy — no per-area data, no broker/demand language.
 */
export function TransparencyFooter({ updatedAt }: TransparencyFooterProps) {
  const formattedDate = updatedAt
    ? new Date(updatedAt).toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    : null;

  return (
    <footer className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pt-4 border-t border-slate-200">
      <p className="text-xs text-slate-500 max-w-lg leading-relaxed">
        Area insights are based on verified listing activity. We only show a figure when
        there&apos;s enough activity to be reliable.
      </p>
      {formattedDate && (
        <p className="text-xs text-slate-400 flex-shrink-0">Updated {formattedDate}</p>
      )}
    </footer>
  );
}
