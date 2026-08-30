import { useEffect, useRef, useState } from 'react';
import { Sparkles, Check, Loader2, TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  buildAgriculturalDescription,
  type AgriculturalDescriptionFacts,
  type AgriculturalDescriptionTone,
} from '@/lib/agriculturalDescriptionBuilder';

// ---------------------------------------------------------------------------
// Issue #1627 — agricultural single-page create flow. Agricultural sibling of
// commercial/CommercialDescriptionAssistant.tsx (#1684) / residential/
// DescriptionAssistant.tsx (#1718). FE-only deterministic draft builder — NO
// network call, NO Claude/AI service. Honest copy only: "Draft description" /
// "Draft from entered details" — NEVER "AI-generated" (product-truth #1622).
//
// Issue #2044 AC11/AC12 — Regenerate REPLACES the description wholesale (see
// `generate()` below), so regeneration itself can never accumulate stale
// facts. The real gap: a broker can remove a crop and NOT regenerate, leaving
// the removed crop in the existing text. `lastGeneratedCrops` snapshots the
// crop set at the moment text was (re)generated; when the live `facts.crops`
// set diverges from that snapshot, a stale-description hint is shown.
// ---------------------------------------------------------------------------

/** Order-independent set comparison — crop selection order isn't meaningful. */
function sameCropSet(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const sortedA = [...a].sort();
  const sortedB = [...b].sort();
  return sortedA.every((v, i) => v === sortedB[i]);
}

type AssistantState = 'idle' | 'generating' | 'ready';

interface AgriculturalDescriptionAssistantProps {
  facts: AgriculturalDescriptionFacts;
  value: string;
  onChange: (value: string) => void;
}

export function AgriculturalDescriptionAssistant({ facts, value, onChange }: AgriculturalDescriptionAssistantProps) {
  const [state, setState] = useState<AssistantState>(value.trim() ? 'ready' : 'idle');
  const [tone, setTone] = useState<AgriculturalDescriptionTone>('default');
  // null = "unknown" (never auto-generated in this session, e.g. an existing
  // draft's description loaded on mount) — deliberately shows no stale hint,
  // since we have no generated-from snapshot to compare against.
  const [lastGeneratedCrops, setLastGeneratedCrops] = useState<readonly string[] | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const generate = (nextTone: AgriculturalDescriptionTone) => {
    setState('generating');
    setTone(nextTone);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      onChange(buildAgriculturalDescription(facts, nextTone));
      setLastGeneratedCrops(facts.crops);
      setState('ready');
    }, 400);
  };

  const isStale = state === 'ready' && lastGeneratedCrops != null && !sameCropSet(lastGeneratedCrops, facts.crops);

  const writeManually = () => {
    setState('ready');
  };

  if (state === 'idle') {
    return (
      <div className="rounded-xl border border-dashed p-6 text-center" data-testid="agri-description-assistant-idle">
        <div className="mx-auto mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
          <Sparkles className="h-5 w-5 text-primary" aria-hidden="true" />
        </div>
        <p className="mx-auto mb-4 max-w-sm text-sm text-muted-foreground">
          Draft a description from the land details you've already entered. Every word stays editable — nothing is invented.
        </p>
        <div className="flex justify-center gap-2">
          <Button type="button" onClick={() => generate('default')}>
            Draft description
          </Button>
          <Button type="button" variant="ghost" onClick={writeManually}>
            Write it myself
          </Button>
        </div>
      </div>
    );
  }

  if (state === 'generating') {
    return (
      <div
        className="flex flex-col items-center gap-3 rounded-xl border border-dashed p-8 text-center"
        data-testid="agri-description-assistant-generating"
      >
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-hidden="true" />
        <span className="text-sm text-muted-foreground">Writing from your details…</span>
      </div>
    );
  }

  return (
    <div className="space-y-3" data-testid="agri-description-assistant-ready">
      {isStale && (
        <p
          className="flex items-start gap-1.5 rounded-md bg-amber-50 px-2.5 py-1.5 text-xs text-amber-800"
          data-testid="agri-description-stale-warning"
        >
          <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          Crops changed since this was written — regenerate to keep the description in sync.
        </p>
      )}
      <Textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Write a short, factual description of the land…"
        rows={6}
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => generate(tone)}>
          Regenerate
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => generate('short')}>
          Make shorter
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => generate('factual')}>
          More factual
        </Button>
      </div>
      <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
        <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
        Draft from details you entered. Nothing here is invented or verified — edit freely before submitting.
      </p>
    </div>
  );
}
