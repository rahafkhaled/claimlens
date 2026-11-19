"use client";
import { useState } from "react";
import { catalogue, laborRateQar, partLabels, lineAmount, bodyPartsReference } from "@/lib/catalogue";
import { money } from "@/lib/claims";
import { Modal } from "./ui";

export function PricingCatalogue({ close }: { close: () => void }) {
  const [query, setQuery] = useState(""), [filter, setFilter] = useState("all");
  const rows = catalogue.filter(row =>
    `${partLabels[row.code]} ${row.operation}`.toLowerCase().includes(query.trim().toLowerCase()) &&
    (filter === "all" || row.operation === filter));
  return <Modal title="Pricing catalogue" close={close} wide>
    <div className="catalogue-tools">
      <input aria-label="Search catalogue" placeholder="Find a part or operation…" value={query} onChange={e => setQuery(e.target.value)} />
      <select aria-label="Catalogue operation" value={filter} onChange={e => setFilter(e.target.value)}>
        <option value="all">All operations</option>{["Replace", "Repair", "Refinish", "Inspect"].map(operation => <option key={operation} value={operation}>{operation}</option>)}
      </select>
    </div>
    <p className="catalogue-note">Labor {money(laborRateQar)}/h · Vehicle-specific quotes required for actual repairs.</p>
    <div className="table-scroll catalogue-table"><table>
      <thead><tr><th>Part / operation</th><th>Parts / materials</th><th>Labor</th><th>Total</th></tr></thead>
      <tbody>{rows.map(row => <tr key={row.id}>
        <td><strong>{partLabels[row.code]}</strong><small>{row.operation}</small>
          <details><summary>Source & scope</summary><p>{row.basis}. {row.note}</p><code>{row.id}</code></details>
        </td>
        <td>{row.parts === null ? "—" : money(row.parts)}</td>
        <td>{row.hours === null ? "—" : <>{money(Math.round(row.hours * laborRateQar * 100) / 100)}<small>{row.hours} h</small></>}</td>
        <td>{lineAmount(row) === null ? "Quote required" : money(lineAmount(row)!)}</td>
      </tr>)}</tbody>
    </table></div>
    {rows.length === 0 && <p>No matching entries.</p>}
    <details className="catalogue-provenance"><summary>Catalogue basis</summary>
      <p>Body-part coverage follows the earlier <a href={bodyPartsReference} target="_blank" rel="noreferrer">car-parts research</a>. That source defines components, not prices. All amounts here are illustrative prototype allowances; no supplier quote is implied. Every supported operation has a mock allowance, including inspection and calibration.</p>
    </details>
  </Modal>;
}
