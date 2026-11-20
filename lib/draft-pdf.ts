import { inspectionSummary } from "./claims";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { type Claim, displayDate, money, needsScopeReview, total } from "./claims";
import { activityTitle, claimStatus, decisionLabel } from "./claim-status";

export function downloadReportPdf(c: Claim) {
  const pdf = new jsPDF({ unit: "mm", format: "a4" });
  const authorized = c.stage === "authorized";
  const title = authorized ? "Authorized repair report" : "Draft repair estimate";
  pdf.setProperties({title: c.id + " | " + title});
  const ink: [number,number,number] = [27,39,59];
  const blue: [number,number,number] = [52,75,158];
  let y = 31;
  function section(title: string, columns: string[], rows: string[][], numeric = false) {
    if (!rows.length) return;
    if (y > 239) { pdf.addPage(); y = 30; }
    pdf.setFont("helvetica","bold").setFontSize(13).setTextColor(...ink).text(title,17,y);
    autoTable(pdf,{ startY:y+4, margin:{top:29,bottom:21,left:17,right:17}, head:[columns],body:rows,
      theme:"plain", rowPageBreak:"avoid", styles:{fontSize:9,cellPadding:3,textColor:ink,overflow:"linebreak"},
      headStyles:{fillColor:[237,241,249],textColor:blue,fontSize:8},
      alternateRowStyles:{fillColor:[248,249,252]},
      columnStyles:numeric?{0:{cellWidth:76},1:{halign:"right"},2:{halign:"right"},3:{halign:"right"}}:{0:{cellWidth:47}},
      didDrawPage: data => { y=(data.cursor?.y ?? 30)+12; }
    });
  }
  pdf.setFont("helvetica","bold").setFontSize(23).setTextColor(...ink).text(title,17,y+5);
  y+=15;
  section("Claim summary",["Claim record","Details"],[
    ["Vehicle",c.vehicle],["Incident",c.title],["Opened",displayDate(c.created)],["Status",claimStatus(c).label],
    ["Reported accident",c.accidentDescription ?? c.details],["Assessment basis",c.sample?"Sample claim with generated imagery and illustrative pricing.":"Preliminary estimate using illustrative pricing."],
    ...(needsScopeReview(c)?[["Review required","Assessment is outdated. Reassess before approval."]]:[])
  ]);
  section("Estimated repair costs",["Repair item","Parts (QAR)","Labor (QAR)","Amount (QAR)"],[
    ...c.lines.map(l=>[l.component+"\n"+l.repair,...[l.parts,l.labor].map(n=>l.needsQuote ? "—" : n.toFixed(2)),l.needsQuote?"Quote needed":(l.parts+l.labor).toFixed(2)]),
    [c.lines.some(l=>l.needsQuote)?"Priced items subtotal":authorized ? "Authorized amount" : "Draft total","","",money(total(c.lines)).replace(/\s/g," ")]
  ],true);
  section("Evidence assessment",["Review","Assessment"],[
    ["Outcome",c.decision ? decisionLabel[c.decision.choice]+" · "+Math.round(c.decision.confidence*100)+"% confidence" : "Pending assessment"],
    ...[["Summary",c.quality],["Routing rationale",c.decision?.reason],["Original model decision",c.decision?.modelChoice],["Outstanding gaps",c.gaps.join("\n")],["Review note",c.request],["Agent override",c.override?"Evidence accepted by agent":""]].filter((row):row is string[]=>!!row[1])
  ]);
  section("Damage findings",["Repair item","Observation and supporting evidence"],c.findings.map(f=>[f.component,[f.severity,f.damage,f.accidentReason,f.inspectionEvidence?.observation,...(f.evidence??[]).map(r=>(c.photos[r.item-1]?.name??"Evidence "+r.item)+(r.seconds!=null?" at "+r.seconds+" s":""))].filter(Boolean).join("\n")]));
  section("Pricing references",["Repair item","Basis and agent changes"],c.lines.map(l=>[l.component,[l.source,l.quoteConfirmedAt && "Quote confirmed · "+displayDate(l.quoteConfirmedAt),l.zeroCostReason,l.catalogueId,inspectionSummary(l),l.inspectionNote,l.editedByAgentAt&&"Edited by agent · "+displayDate(l.editedByAgentAt)].filter(Boolean).join("\n")]));
  section("Outside the estimate",["Item","Reason"],(c.excludedFindings??[]).map(f=>[f.component,[f.accidentRelation,f.accidentReason].filter(Boolean).join("\n")]));
  section("Evidence requests",["Request","Instructions"],(c.evidenceRequests??[]).map(r=>[displayDate(r.created)+"\n"+r.recipient+" · "+r.status,[r.message,...r.pins.map((p,i)=>`Pin ${i+1} · ${p.photoName} (${p.x.toFixed(1)}%, ${p.y.toFixed(1)}%)\n${p.comment}`)].filter(Boolean).join("\n")]));
  section("Review history",["Date and event","Record"],c.log.map(e=>[displayDate(e.at)+"\n"+activityTitle(c,e),e.delivery==="recalled"?"Recalled by agent":e.detail]));
  if (authorized && c.authorization) {
    const { shop, at, adjuster } = c.authorization;
    // Keep the authorization and its typed signature together on the final page.
    if (y > 215) { pdf.addPage(); y = 30; }
    section("Repair authorization", ["Authorization record", "Details"], [
      ["Approved repair shop", shop], ["Authorized on", displayDate(at)],
      ["Senior adjuster signature", adjuster],
    ]);
  }
  const pages=pdf.getNumberOfPages();
  for(let n=1;n<=pages;n++){
    pdf.setPage(n);
    pdf.setFont("helvetica","bold").setFontSize(11).setTextColor(...blue).text(c.vehicle,17,14);
    pdf.setFont("helvetica","normal").setFontSize(9).setTextColor(...ink).text(c.id,193,14,{align:"right"});
    pdf.setDrawColor(210,218,232).line(17,18,193,18).line(17,280,193,280);
    pdf.setFontSize(8).text(authorized ? "AUTHORIZED  /  Repair assessment" : "DRAFT  /  Repair assessment",17,286).text(n+" / "+pages,193,286,{align:"right"});
  }
  pdf.save(c.id + (authorized ? "-authorized.pdf" : "-draft.pdf"));
}
