"use client";
import { useEffect, useRef, useState } from "react";
import { Check, UserRound, ShieldCheck } from "lucide-react";
import type { ViewRole } from "@/lib/claims";
export function ViewSwitcher({ role, change, disabled }: { role: ViewRole; change: (role: ViewRole) => void; disabled: boolean }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null), trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") { setOpen(false); trigger.current?.focus(); } };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", close); document.removeEventListener("keydown", escape); };
  }, [open]);
  return <div className="view-switcher" ref={root} onMouseEnter={() => { if (!disabled && matchMedia("(hover: hover)").matches) setOpen(true); }} onMouseLeave={() => { if (!root.current?.contains(document.activeElement)) setOpen(false); }} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }} onKeyDown={event => {
    if (disabled) return;
    if (event.key === "Escape") { setOpen(false); trigger.current?.focus(); event.stopPropagation(); }
    if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
      event.preventDefault(); setOpen(true);
      requestAnimationFrame(() => { const items = Array.from(root.current?.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]') ?? []); const at = items.indexOf(document.activeElement as HTMLButtonElement); const next = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : at < 0 ? (event.key === "ArrowUp" ? items.length - 1 : 0) : (at + (event.key === "ArrowUp" ? -1 : 1) + items.length) % items.length; items[next]?.focus(); });
    }
  }}>
    <button ref={trigger} className="view-trigger" aria-label={`Switch view: ${role === "agent" ? "Agent" : "Senior adjuster"}`} aria-haspopup="menu" aria-expanded={open} disabled={disabled} onClick={() => setOpen(true)}>{role === "agent" ? <UserRound size={17} /> : <ShieldCheck size={17} />}</button>
    {open && <div className="view-menu" role="menu" aria-label="Workspace view"><span>Workspace view</span>{([['agent','Agent'],['senior','Senior adjuster']] as const).map(([value,label]) => <button role="menuitemradio" aria-checked={role === value} key={value} onClick={() => { change(value); setOpen(false); trigger.current?.focus(); }}>{value === "agent" ? <UserRound size={16} /> : <ShieldCheck size={16} />}<span>{label}</span>{role === value && <Check size={14} />}</button>)}</div>}
  </div>;
}
