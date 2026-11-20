import { PricingCatalogue } from "@/components/PricingCatalogue";

export default async function PricingPage({ searchParams }: { searchParams: Promise<{ source?: string; entry?: string }> }) {
  const { source, entry } = await searchParams;
  return <main className="body pricing-page"><a href="/" className="app-brand" aria-label="Claims workspace home">Claims workspace</a><h1>Pricing catalogue</h1>
    {source && <p className="notice">Recorded pricing source · {source}</p>}
    <PricingCatalogue entry={entry} />
  </main>;
}
