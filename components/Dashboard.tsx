"use client";
import { ArrowRight, FolderOpen, Search, SlidersHorizontal } from "lucide-react";
import { type Claim, displayDate } from "@/lib/claims";
import { claimStatus } from "@/lib/claim-status";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { ClaimStatusBadge } from "./ClaimStatusBadge";
import { Badge } from "./ui/badge";
import { Card } from "./ui/card";
const filters = [{ id: "all", label: "All claims" }, { id: "new", label: "New claims" }, { id: "attention", label: "Needs attention" }, { id: "awaiting", label: "Awaiting evidence" }, { id: "ready", label: "Ready for review" }, { id: "approval", label: "Awaiting approval" }, { id: "complete", label: "Authorized" }];
export function Dashboard({ claims, ready, select, remove, walkthrough, reset, isAgent, filter, setFilter, query, setQuery }: { filter: string; setFilter: (filter: string) => void; query: string; setQuery: (query: string) => void; claims: Claim[]; ready: boolean; isAgent: boolean; select: (c: Claim, nextAction?: boolean) => void; remove: (claim: Claim) => void; walkthrough: () => void; reset: () => void }) {
  const count = (id: string) => claims.filter(c => id === "all" || claimStatus(c).group === id).length;
  const visible = claims.filter(c => (filter === "all" || claimStatus(c).group === filter) && `${c.id} ${c.vehicle} ${c.title}`.toLowerCase().includes(query.toLowerCase()));
  return <main id="main" className="dashboard">
    <div className="dashboard-heading">
      <h1>{isAgent ? "Claims queue" : "Senior review queue"}</h1>
      {isAgent && <Button variant="outline" size="sm" onClick={walkthrough} disabled={!ready}>Demo walkthrough</Button>}
    </div>
    <Card className="claims-card gap-0 border-border py-0 shadow-none">
    <div className="dashboard-controls"><div className="search-field"><Search size={16} /><Input className="pl-9" aria-label="Search claims" placeholder="Search claim ID, vehicle, or incident…" value={query} onChange={e => setQuery(e.target.value)} /></div><span className="queue-caption"><SlidersHorizontal size={14} />Filter by status</span></div>
    <div className="dashboard-filters" aria-label="Filter claims">{filters.map(item => <Button key={item.id} variant={filter === item.id ? "secondary" : "ghost"} size="sm" className="text-xs" aria-pressed={filter === item.id} onClick={() => setFilter(item.id)}>{item.label}<span>{ready ? count(item.id) : "—"}</span></Button>)}</div>
    <div className="claims-table-scroll"><table className="claims-table"><thead><tr><th>Claim / vehicle</th><th>Incident</th><th>Status</th><th>Next action</th></tr></thead><tbody>{ready && visible.map(c => { const status = claimStatus(c); const primary = isAgent ? status.group === "new" : status.group === "approval"; return <tr key={c.id} data-priority={primary}><td><div className="claim-cell"><img src={c.photos[0]?.poster ?? c.photos[0]?.src} alt="" /><div><button className="claim-title" onClick={() => select(c)}>{c.vehicle}</button><small>{c.id}{c.sample && <Badge variant="outline">Sample</Badge>}</small></div></div></td><td><span>{c.title}</span><small>{displayDate(c.created)}</small></td><td><ClaimStatusBadge status={status} /></td><td><Button variant={primary ? "default" : "ghost"} className="next-action text-xs" onClick={() => select(c, true)}>{isAgent ? status.action : c.stage === "senior" ? "Review submission" : c.stage === "authorized" ? "View authorization" : "View claim"}<ArrowRight size={14} /></Button>{isAgent && !c.sample && <button className="text-button" onClick={() => remove(c)} aria-label={"Delete claim " + c.id}>Delete claim</button>}</td></tr>; })}</tbody></table></div>
    {(!ready || !visible.length) && <div className="queue-empty"><FolderOpen size={28} /><h3>{ready ? !isAgent && filter === "approval" && !query ? "No submissions awaiting approval" : "No matching claims" : "Loading your workspace…"}</h3><p>{ready ? !isAgent && filter === "approval" && !query ? "Submitted estimates will appear here for your review." : "Try another status or search term." : "Restoring claims saved in this browser."}</p>{ready && <Button variant="outline" onClick={() => { setFilter("all"); setQuery(""); }}>Clear filters</Button>}</div>}
    <div className="queue-footer"><span>{ready ? visible.length : 0} claims shown · Saved in this browser</span><div className="flex flex-wrap gap-4"><button onClick={reset} disabled={!ready}>Reset sample claims</button></div></div></Card>
    <p className="demo-note">Interview demo · Sample claims use generated imagery. Evidence requests are saved locally; delivery is simulated.</p>
  </main>;
}
