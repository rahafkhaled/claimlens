import { CheckCheck, CircleAlert, ClipboardCheck, Clock3, FilePlus2, ListChecks, SearchCheck, Wrench } from "lucide-react";
import type { claimStatus } from "@/lib/claim-status";

const icons = { blue: FilePlus2, amber: CircleAlert, slate: Clock3, teal: ListChecks, violet: ClipboardCheck, green: CheckCheck, orange: Wrench, analyzing: SearchCheck };

export function ClaimStatusBadge({ status, assessing = false, workspace = false }: {
  status: ReturnType<typeof claimStatus>;
  assessing?: boolean;
  workspace?: boolean;
}) {
  const tone = assessing ? "analyzing" : status.tone;
  const Icon = icons[tone];
  return <span className={workspace ? "claim-status case-state" : "claim-status"} data-tone={tone}>
    <Icon size={14} aria-hidden="true" />{assessing ? "Assessing evidence" : status.label}
  </span>;
}
