import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { Tone } from "@/lib/constants";

const TONE_CLASS: Record<Tone, string> = {
  neutral: "bg-neutral/15 text-foreground",
  info: "bg-info/15 text-info",
  success: "bg-success/15 text-success",
  warning: "bg-warning/15 text-warning",
  danger: "bg-error/15 text-error",
};

export function StatusBadge({
  tone,
  children,
}: {
  tone: Tone;
  children: React.ReactNode;
}) {
  return (
    <Badge
      variant="outline"
      className={cn("border-transparent font-medium", TONE_CLASS[tone])}
    >
      {children}
    </Badge>
  );
}
