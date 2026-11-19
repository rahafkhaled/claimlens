import type { ReactNode } from "react";
import { ArrowUpRight, ShieldCheck } from "lucide-react";
import { money, total, type Claim } from "@/lib/claims";
export function SeniorDesk({ claims, active, select, children }: { claims: Claim[]; active: string; select: (id: string) => void; children: ReactNode }) {
  const queue = claims.filter(claim => claim.stage === "senior" || claim.stage === "authorized").sort((a,b) => Number(a.stage === "authorized") - Number(b.stage === "authorized"));
  const pending = queue.filter(claim => claim.stage === "senior");
  return <div className="senior-desk"><aside className="senior-queue" aria-label="Senior review queue">
    <div className="senior-queue-title"><ShieldCheck size={19} /><h2>Senior desk</h2></div>
    <div className="senior-queue-count"><strong>{pending.length}</strong><span>awaiting approval</span></div>
    {queue.length ? queue.map(claim => <button key={claim.id} className="senior-claim" aria-current={claim.id === active ? "true" : undefined} onClick={() => select(claim.id)}><span>{claim.id}<ArrowUpRight size={13} /></span><strong>{claim.vehicle}</strong><small>{claim.stage === "authorized" ? "Authorized" : "Ready for decision"}</small><b>{money(total(claim.lines))}</b></button>) : <p className="senior-empty">Claims appear here when an agent submits an estimate.</p>}
  </aside><div className="senior-content">{children}</div></div>;
}
