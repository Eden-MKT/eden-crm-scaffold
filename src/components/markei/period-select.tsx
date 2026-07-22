import { PERIOD_LABELS, type Period } from "@/lib/markei/types";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface PeriodSelectProps {
  value: Period;
  onChange: (period: Period) => void;
  className?: string;
}

// Filtro de período compartilhado (dashboard, leads, analytics).
export function PeriodSelect({ value, onChange, className }: PeriodSelectProps) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as Period)}>
      <SelectTrigger className={cn("w-36", className)}>
        <SelectValue placeholder="Período" />
      </SelectTrigger>
      <SelectContent>
        {(Object.keys(PERIOD_LABELS) as Period[]).map((p) => (
          <SelectItem key={p} value={p}>
            {PERIOD_LABELS[p]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
