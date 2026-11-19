import { PGlite } from "@electric-sql/pglite";
import type { Finding, Line } from "./claims";
import { catalogue, catalogueVersion, laborRateQar } from "./catalogue";

async function initialize() {
  const db = new PGlite();
  await db.exec("CREATE TABLE rates(id text PRIMARY KEY, code text, operation text, parts numeric, hours numeric, basis text, note text, UNIQUE(code, operation));");
  for (const row of catalogue) {
    await db.query("INSERT INTO rates VALUES ($1,$2,$3,$4,$5,$6,$7)",
      [row.id, row.code, row.operation, row.parts, row.hours, row.basis, row.note]);
  }
  return db;
}
let database: Promise<PGlite> | undefined;
export async function priceFindings(findings: Finding[]): Promise<Line[]> {
  database ??= initialize().catch(error => { database = undefined; throw error; });
  const rows = (await (await database).query<{
    id: string; code: string; operation: string; parts: string | null; hours: string | null; basis: string; note: string;
  }>("SELECT * FROM rates WHERE code = ANY($1::text[])", [findings.map(f => f.code)])).rows;
  return findings.map(f => {
    const rate = rows.find(r => r.code === f.code && r.operation === (f.operation ?? "Inspect"));
    const priced = rate && rate.parts !== null && rate.hours !== null;
    return {
      component: f.component, repair: f.repair,
      parts: priced ? Number(rate.parts) : 0,
      labor: priced ? Math.round(Number(rate.hours) * laborRateQar * 100) / 100 : 0,
      catalogueId: rate?.id,
      source: priced
        ? `${rate.basis} · ${catalogueVersion} · ${rate.hours} h × QAR ${laborRateQar.toFixed(2)}`
        : f.operation === "Inspect" ? "Inspection and quote required" : "Supplier quote required",
      needsQuote: !priced,
    };
  });
}
