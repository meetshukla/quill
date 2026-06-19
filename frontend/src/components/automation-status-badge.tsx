import { Badge } from "@/components/ui/badge";
import type { AutomationStatus } from "@/lib/types";

const MAP: Record<
  AutomationStatus,
  {
    variant: "brand" | "success" | "warning" | "destructive" | "outline";
    label: string;
  }
> = {
  PENDING: { variant: "warning", label: "Pending" },
  ACTIVE: { variant: "brand", label: "Active" },
  POSTED: { variant: "success", label: "Posted" },
  PAUSED: { variant: "outline", label: "Paused" },
  FAILED: { variant: "destructive", label: "Failed" },
  CANCELED: { variant: "outline", label: "Canceled" },
  EXPIRED: { variant: "outline", label: "Expired" },
};

export function AutomationStatusBadge({
  status,
}: {
  status: AutomationStatus;
}) {
  const cfg = MAP[status];
  return <Badge variant={cfg.variant}>{cfg.label}</Badge>;
}
