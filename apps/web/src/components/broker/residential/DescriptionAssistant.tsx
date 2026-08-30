import { useEffect, useRef, useState } from 'react';
import { Sparkles, Check, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  buildLocalDescription,
  type DescriptionFacts,
  type DescriptionTone,
} from '@/lib/listingDescriptionBuilder';

// ---------------------------------------------------------------------------
// Issue #1718 — residential single-page create parity (design-spec.md
// "Description" section). FE-only deterministic draft builder — NO network
// call, NO Claude/AI service. Honest copy only: "Generate draft description" /
// "Draft from entered details" — NEVER "AI-generated" (product-truth #1622).
// Composes only facts already entered in the form; the broker can always edit
// or write it manually. Swappable: #1629 can later point this at a real
// backend-generated endpoint by swapping the provider in listingDescriptionBuilder.ts.
// ---------------------------------------------------------------------------

type AssistantState = 'idle' | 'generating' | 'ready';

interface DescriptionAssistantProps {
  facts: DescriptionFacts;
  value: string;
  onChange: (value: string) => void;
}

export function DescriptionAssistant({ facts, value, onChange }: DescriptionAssistantProps) {
  const [state, setState] = useState<AssistantState>(value.trim() ? 'ready' : 'idle');
  const [tone, setTone] = useState<DescriptionTone>('default');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const generate = (nextTone: DescriptionTone) => {
    setState('generating');
    setTone(nextTone);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      onChange(buildLocalDescription(facts, nextTone));
      setState('ready');
    }, 400);
  };

  const writeManually = () => {
    setState('ready');
  };

  if (state === 'idle') {
    return (
      <div className="rounded-xl border border-dashed p-6 text-center" data-testid="description-assistant-idle">
        <div className="mx-auto mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
          <Sparkles className="h-5 w-5 text-primary" aria-hidden="true" />
        </div>
        <p className="mx-auto mb-4 max-w-sm text-sm text-muted-foreground">
          Draft a description from the details you've already entered. Every word stays editable — nothing is invented.
        </p>
        <div className="flex justify-center gap-2">
          <Button type="button" onClick={() => generate('default')}>
            Generate draft description
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
        data-testid="description-assistant-generating"
      >
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-hidden="true" />
        <span className="text-sm text-muted-foreground">Writing from your details…</span>
      </div>
    );
  }

  return (
    <div className="space-y-3" data-testid="description-assistant-ready">
      <Textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Write a short, factual description…"
        rows={6}
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => generate(tone)}>
          Regenerate
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => generate('short')}>
          Make shorter
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => generate('warm')}>
          Make warmer
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
