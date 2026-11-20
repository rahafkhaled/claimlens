import type { Line } from "@/lib/claims";

export function PricingSource({ line, compact }: { line: Line; compact?: boolean }) {
  if (line.needsQuote) return <span>Awaiting supplier quote</span>;
  const sourceUrl = /^https?:\/\//i.test(line.source.trim()) ? line.source.trim() : undefined;
  if (!sourceUrl && !line.catalogueId) return <span>{line.source || "No pricing source recorded"}</span>;
  const params = new URLSearchParams({ source: line.source });
  if (line.catalogueId) params.set("entry", line.catalogueId);
  const href = sourceUrl ?? "/pricing?" + params;
  return <a className="text-button" href={href} target="_blank" rel="noopener noreferrer">
    {compact ? (sourceUrl ? "Open pricing source" : "View catalogue rate") : line.source || "Pricing catalogue"} ↗
  </a>;
}
