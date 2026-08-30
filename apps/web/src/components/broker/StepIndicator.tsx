import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Step {
  label: string;
  isComplete: boolean;
}

interface StepIndicatorProps {
  steps: Step[];
  currentStep: number; // 1-based
  onStepClick: (stepNumber: number) => void;
  /** Optional helper text rendered below the step row */
  helperText?: string;
}

export function StepIndicator({ steps, currentStep, onStepClick, helperText }: StepIndicatorProps) {
  return (
    <div className="flex flex-col items-center px-2 pb-2 sm:px-6">
      <div className="flex w-full items-start" role="list">
        {steps.map((step, i) => {
          const stepNumber = i + 1;
          const isActive = stepNumber === currentStep;
          const isComplete = step.isComplete;
          const isFuture = !isComplete && !isActive;
          const isLastStep = i === steps.length - 1;

          const circleClass = isComplete
            ? 'bg-green-500 text-white border-green-500'
            : isActive
              ? 'bg-primary text-primary-foreground border-primary ring-4 ring-primary/10'
              : 'bg-card text-muted-foreground border-border';

          const labelClass = isComplete
            ? 'text-green-600 font-medium'
            : isActive
              ? 'text-foreground font-semibold'
              : 'text-muted-foreground';

          return (
            <div
              key={stepNumber}
              className={cn('flex items-start', isLastStep ? 'flex-none' : 'flex-1')}
              role="listitem"
            >
              <div className="flex flex-col items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => onStepClick(stepNumber)}
                  disabled={isFuture}
                  aria-current={isActive ? 'step' : undefined}
                  aria-label={`Step ${stepNumber}: ${step.label}${isComplete ? ' (complete)' : ''}`}
                  className={cn(
                    'flex h-9 w-9 items-center justify-center rounded-full border text-sm font-semibold transition-colors',
                    circleClass,
                    isFuture ? 'cursor-not-allowed' : 'cursor-pointer',
                  )}
                >
                  {isComplete ? <Check className="h-4 w-4" strokeWidth={2.5} /> : stepNumber}
                </button>
                <span className={cn('whitespace-nowrap text-center text-xs', labelClass)}>
                  {step.label}
                </span>
              </div>
              {!isLastStep && (
                <div
                  className={cn(
                    'mx-1 mt-[18px] h-0.5 flex-1 rounded-full sm:mx-2',
                    isComplete ? 'bg-green-500' : 'bg-border',
                  )}
                />
              )}
            </div>
          );
        })}
      </div>
      {helperText && <p className="mt-3 text-xs text-muted-foreground">{helperText}</p>}
    </div>
  );
}
