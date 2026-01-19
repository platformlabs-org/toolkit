import { cn } from "../lib/utils";
import { Check } from "lucide-react";

interface StepIndicatorProps {
  steps: { id: string; title: string }[];
  currentStep: number;
}

export function StepIndicator({ steps, currentStep }: StepIndicatorProps) {
  return (
    <div className="flex items-center justify-center w-full py-6 select-none">
      <div className="flex items-center space-x-2">
        {steps.map((step, index) => {
          const isActive = index === currentStep;
          const isCompleted = index < currentStep;

          return (
            <div key={step.id} className="flex items-center">
              <div className={cn(
                "flex items-center justify-center w-8 h-8 rounded-full border-2 transition-colors",
                isActive ? "border-primary bg-primary text-primary-foreground shadow-[0_0_10px_rgba(189,91,8,0.5)]" :
                isCompleted ? "border-primary bg-primary text-primary-foreground" :
                "border-muted bg-muted/20 text-muted-foreground"
              )}>
                {isCompleted ? <Check size={16} /> : <span className="text-xs font-bold">{index + 1}</span>}
              </div>
              <span className={cn(
                "ml-2 text-sm font-medium hidden sm:block",
                isActive ? "text-primary font-bold" : "text-muted-foreground"
              )}>
                {step.title}
              </span>
              {index < steps.length - 1 && (
                <div className={cn(
                  "w-8 md:w-16 h-0.5 mx-2 md:mx-4 transition-colors",
                  index < currentStep ? "bg-primary" : "bg-muted"
                )} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
