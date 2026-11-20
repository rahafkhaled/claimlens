import Workspace from "@/components/Workspace";
import { mockPriceLine } from "@/lib/catalogue";
import type { Claim } from "@/lib/claims";
import { sample } from "@/lib/legacy-sample";

export default function MissingPriceExample() {
  const findings = sample.findings.map(finding => finding.code === "headlamp"
    ? { ...finding, code: "other" as const, component: "Left headlamp mounting bracket", repair: "Replace mounting bracket" }
    : finding);
  const claim: Claim = {
    ...sample,
    id: "DEMO-BRACKET",
    title: "Missing price example",
    currency: "QAR",
    findings,
    lines: findings.map(mockPriceLine),
    log: [{ ...sample.log[0], detail: "Two repairs priced. The headlamp mounting bracket needs a supplier quote." }, ...sample.log.slice(1)],
  };
  return <Workspace example={claim} />;
}
