"use client";

import { useRef, useState } from "react";
import { Pause, Play } from "lucide-react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";

gsap.registerPlugin(useGSAP);

export function EvidenceScan({ active }: { active: boolean }) {
  const root = useRef<HTMLDivElement>(null);
  const motion = useRef<gsap.core.Timeline | null>(null);
  const pausedState = useRef(false);
  const [paused, setPaused] = useState(false);
  useGSAP(() => {
    if (!active) return;
    const media = gsap.matchMedia();
    media.add("(prefers-reduced-motion: no-preference)", () => {
      motion.current = gsap.timeline({ repeat: -1, repeatDelay: .4, paused: pausedState.current })
        .fromTo(".evidence-scan-beam", { yPercent: -100, opacity: 0 }, { opacity: .75, duration: .2 })
        .to(".evidence-scan-beam", { yPercent: 420, duration: 3, ease: "none" }, 0)
        .to(".evidence-scan-beam", { opacity: 0, duration: .25 }, 2.75);
      return () => { motion.current = null; };
    }, root);
    return () => media.revert();
  }, { scope: root, dependencies: [active], revertOnUpdate: true });

  // Pausing affects the visual only; the server continues processing evidence.
  useGSAP(() => { pausedState.current = paused; motion.current?.paused(paused); }, { dependencies: [paused] });

  return <div ref={root} className="evidence-scan" data-active={active} data-paused={paused}>
    <div className="evidence-scan-window" aria-hidden="true"><div className="evidence-scan-beam" /></div>
    {active && <button className="evidence-scan-toggle" type="button" aria-label={paused ? "Resume scan animation" : "Pause scan animation"} title={paused ? "Resume scan animation" : "Pause scan animation"} onClick={() => setPaused(value => !value)}>
      {paused ? <Play size={15} /> : <Pause size={15} />}
    </button>}
  </div>;
}
