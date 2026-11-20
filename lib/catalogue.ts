import { operations, type Finding, type Line } from "./claims";

export const laborRateQar = 218.4;
export const catalogueVersion = "2026-11-complete";
export const bodyPartsReference = "https://humansintheloop.org/resources/datasets/car-parts-and-car-damages-dataset/";
export const partLabels: Record<Finding["code"], string> = {
  bumper: "Bumper", fender: "Fender", headlamp: "Headlamp", taillamp: "Tail lamp",
  mirror: "Door mirror", grille: "Grille", trunk: "Trunk / tailgate", roof: "Roof",
  quarter_panel: "Quarter panel", rocker_panel: "Rocker panel", windshield: "Windshield",
  rear_glass: "Rear glass", side_glass: "Side glass", tire: "Tire", suspension: "Suspension",
  structure: "Structure / frame", sensor: "Parking / driver-assistance sensor",
  calibration: "ADAS calibration", hood: "Hood", door: "Door", glass: "Other glass",
  wheel: "Wheel", paint: "Paint", other: "Other component",
};
export type CatalogueEntry = {
  id: string;
  code: Finding["code"];
  operation: NonNullable<Finding["operation"]>;
  parts: number | null;
  hours: number | null;
  basis: "Existing demo allowance" | "Added demo allowance" | "Workshop quote";
  note: string;
};
function allowance(code: CatalogueEntry["code"], operation: CatalogueEntry["operation"], parts: number, hours: number, existing = false): CatalogueEntry {
  return { id: `${code}:${operation}`, code, operation, parts, hours,
    basis: existing ? "Existing demo allowance" : "Added demo allowance",
    note: "Parts/materials and labor allowance. Confirm vehicle, trim and supplier price before use." };
}
// QAR amounts are prototype allowances, not prices established by the body-part research.
// Legacy demo values retain the previous 3.64 QAR/USD conversion. No markup or tax is added.
const existingAllowances: CatalogueEntry[] = [
  allowance("bumper", "Replace", 2620.8, 8, true),
  allowance("fender", "Replace", 1619.8, 6, true),
  allowance("headlamp", "Replace", 4440.8, 4, true),
  allowance("hood", "Replace", 3239.6, 7, true),
  allowance("door", "Replace", 3458, 9, true),
  allowance("glass", "Replace", 1237.6, 3, true),
  allowance("wheel", "Replace", 1419.6, 2, true),
  allowance("bumper", "Repair", 309.4, 4, true),
  allowance("fender", "Repair", 200.2, 4, true),
  allowance("door", "Repair", 254.8, 5, true),
  allowance("hood", "Repair", 291.2, 6, true),
  allowance("paint", "Refinish", 345.8, 6, true),
  allowance("bumper", "Refinish", 345.8, 4, true),
  allowance("door", "Refinish", 400.4, 5, true),
  allowance("fender", "Refinish", 309.4, 4, true),
  allowance("hood", "Refinish", 546, 6, true),
  allowance("taillamp", "Replace", 1456, 1.5),
  allowance("mirror", "Replace", 1820, 2),
  allowance("mirror", "Refinish", 182, 1),
  allowance("grille", "Replace", 1092, 2),
  allowance("trunk", "Replace", 2912, 6),
  allowance("trunk", "Repair", 254.8, 5),
  allowance("trunk", "Refinish", 436.8, 4),
  allowance("roof", "Repair", 364, 7),
  allowance("roof", "Refinish", 655.2, 6),
  allowance("quarter_panel", "Repair", 327.6, 6),
  allowance("quarter_panel", "Refinish", 436.8, 5),
  allowance("rocker_panel", "Repair", 218.4, 4),
  allowance("rocker_panel", "Refinish", 254.8, 3),
  allowance("windshield", "Replace", 1820, 3),
  allowance("rear_glass", "Replace", 1456, 3),
  allowance("side_glass", "Replace", 728, 2),
  allowance("tire", "Replace", 546, 0.5),
];
// Explicit mock budgets for named components.
// Replace parts/hours, repair materials/hours, refinish materials/hours, inspection hours.
const budgets: Record<Exclude<Finding["code"], "other">, [number, number, number, number, number, number, number]> = {
  bumper: [2620.8, 8, 309.4, 4, 345.8, 4, 1],
  fender: [1619.8, 6, 200.2, 4, 309.4, 4, 1],
  headlamp: [4440.8, 4, 364, 2, 145.6, 1, .5],
  taillamp: [1456, 1.5, 218.4, 1.5, 109.2, 1, .5],
  mirror: [1820, 2, 291.2, 1.5, 182, 1, .5],
  grille: [1092, 2, 182, 2, 182, 1.5, .5],
  trunk: [2912, 6, 254.8, 5, 436.8, 4, 1],
  roof: [4368, 16, 364, 7, 655.2, 6, 2],
  quarter_panel: [3276, 14, 327.6, 6, 436.8, 5, 2],
  rocker_panel: [1820, 10, 218.4, 4, 254.8, 3, 2],
  windshield: [1820, 3, 145.6, 1, 109.2, 1, .5],
  rear_glass: [1456, 3, 145.6, 1, 109.2, 1, .5],
  side_glass: [728, 2, 109.2, 1, 72.8, .5, .5],
  tire: [546, .5, 72.8, .5, 36.4, .5, .5],
  suspension: [2912, 5, 546, 4, 145.6, 1, 2],
  structure: [9100, 24, 1456, 16, 728, 8, 4],
  sensor: [1092, 2, 182, 1.5, 72.8, .5, 1],
  calibration: [728, 3, 0, 3, 0, 2, 3],
  hood: [3239.6, 7, 291.2, 6, 546, 6, 1],
  door: [3458, 9, 254.8, 5, 400.4, 5, 1],
  glass: [1237.6, 3, 145.6, 1, 109.2, 1, .5],
  wheel: [1419.6, 2, 218.4, 2, 182, 1.5, 1],
  paint: [546, 6, 254.8, 4, 345.8, 6, .5],
};
export const catalogue: CatalogueEntry[] = Object.entries(budgets).flatMap(([part, values]) => {
  const code = part as Finding["code"];
  return operations.map(operation => {
    const existing = existingAllowances.find(row => row.code === code && row.operation === operation);
    if (existing) return existing;
    const index = operation === "Replace" ? 0 : operation === "Repair" ? 2 : 4;
    const entry = allowance(code, operation, operation === "Inspect" ? 0 : values[index], operation === "Inspect" ? values[6] : values[index + 1]);
    entry.note = operation === "Inspect"
      ? "Mock inspection labor allowance. Agent approval is recorded separately."
      : "Illustrative budget for this operation. The agent confirms applicability and can adjust the amount.";
    return entry;
  });
});
export function mockPriceLine(finding: Finding): Line {
  const entry = catalogue.find(row => row.code === finding.code && row.operation === (finding.operation ?? "Inspect"));
  if (!entry || entry.parts === null || entry.hours === null) return { component: finding.component, repair: finding.repair, parts: 0, labor: 0, needsQuote: true, source: "Supplier quote required" };
  return {
    component: finding.component, repair: finding.repair,
    parts: entry.parts, labor: Math.round(entry.hours * laborRateQar * 100) / 100,
    catalogueId: entry.id, needsQuote: false,
    source: `${entry.basis} · ${catalogueVersion} · ${entry.hours} h × QAR ${laborRateQar.toFixed(2)}`,
  };
}
export const lineAmount = (entry: CatalogueEntry) => entry.parts === null || entry.hours === null
  ? null : Math.round((entry.parts + entry.hours * laborRateQar) * 100) / 100;
