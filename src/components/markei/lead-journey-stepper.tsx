import { Check } from "lucide-react";

import { FUNNEL_STEPS } from "@/lib/markei/types";
import { cn } from "@/lib/utils";

interface LeadJourneyStepperProps {
  /** Passo ativo (1..5) da jornada FUNNEL_STEPS. */
  activeStep: number;
}

// Stepper horizontal da jornada do lead: Novo Contato → … → Finalizado.
export function LeadJourneyStepper({ activeStep }: LeadJourneyStepperProps) {
  return (
    <ol className="flex items-start">
      {FUNNEL_STEPS.map((label, i) => {
        const step = i + 1;
        const done = step < activeStep;
        const current = step === activeStep;
        return (
          <li key={label} className="flex flex-1 flex-col items-center gap-1.5">
            <div className="flex w-full items-center">
              <span
                className={cn(
                  "h-0.5 flex-1",
                  i === 0 ? "bg-transparent" : step <= activeStep ? "bg-primary" : "bg-border",
                )}
              />
              <span
                className={cn(
                  "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold transition-colors",
                  done && "border-primary bg-primary text-primary-foreground",
                  current && "border-primary bg-primary/15 text-primary",
                  !done && !current && "border-border text-muted-foreground",
                )}
              >
                {done ? <Check className="h-3.5 w-3.5" /> : step}
              </span>
              <span
                className={cn(
                  "h-0.5 flex-1",
                  i === FUNNEL_STEPS.length - 1
                    ? "bg-transparent"
                    : step < activeStep
                      ? "bg-primary"
                      : "bg-border",
                )}
              />
            </div>
            <span
              className={cn(
                "px-0.5 text-center text-[10px] leading-tight",
                current ? "font-semibold text-primary" : "text-muted-foreground",
              )}
            >
              {label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
