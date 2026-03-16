import { Check } from 'lucide-react';

interface Step {
  label: string;
  isComplete: boolean;
}

interface StepIndicatorProps {
  steps: Step[];
  currentStep: number; // 1-based
  onStepClick: (stepNumber: number) => void;
}

export function StepIndicator({ steps, currentStep, onStepClick }: StepIndicatorProps) {
  return (
    <div className="flex items-center justify-center gap-0 px-6 pb-4" role="list">
      {steps.map((step, i) => {
        const stepNumber = i + 1;
        const isActive = stepNumber === currentStep;
        const isComplete = step.isComplete;
        const isFuture = !isComplete && !isActive;

        const circleClass = isComplete
          ? 'bg-green-500 text-white'
          : isActive
            ? 'bg-primary text-primary-foreground'
            : 'bg-muted text-muted-foreground';

        const labelClass =
          isComplete || isActive ? 'text-primary font-medium' : 'text-muted-foreground';

        const isLastStep = i === steps.length - 1;
        const connectorClass = isComplete ? 'bg-primary' : 'bg-border';

        return (
          <div key={stepNumber} className="flex items-center" role="listitem">
            <div className="flex flex-col items-center">
              <button
                type="button"
                onClick={() => onStepClick(stepNumber)}
                disabled={isFuture}
                aria-current={isActive ? 'step' : undefined}
                aria-label={`Step ${stepNumber}: ${step.label}${isComplete ? ' (complete)' : ''}`}
                className={[
                  'w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold',
                  circleClass,
                  isFuture ? '' : 'cursor-pointer',
                ].join(' ')}
              >
                {isComplete ? <Check className="h-4 w-4" strokeWidth={2.5} /> : stepNumber}
              </button>
              <span className={`mt-1 text-xs ${labelClass}`}>{step.label}</span>
            </div>
            {!isLastStep && <div className={`w-12 h-px ${connectorClass} mx-2 mb-4`} />}
          </div>
        );
      })}
    </div>
  );
}
