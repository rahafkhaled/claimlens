# Claims workspace

A local Next.js and strict TypeScript claims-assessment prototype.

## Run

Use Node.js 22 or newer. Install with `npm install`, configure the server keys listed in `.env.example` in `.env.local`, then run `npm run dev -- --hostname 0.0.0.0 --port 3184`. The dev configuration allows localhost, 127.0.0.1 and the original LAN host 192.168.1.11. If the LAN address changes, update `allowedDevOrigins` in `next.config.ts`.

## Demo cases

**All claims** contains four saved scenarios, each with four corner views and two detail views:

- **CLM-2084 · BMW 330i:** standard repair estimate; corrections, senior review, shop selection and report download.
- **CLM-2085 · Toyota Camry:** missing evidence; blurred detail images require clearer close-ups.
- **CLM-2086 · Lexus ES 350:** ambiguous door mark; agent review or request a glare-free view.
- **CLM-2087 · Nissan Patrol:** agent approval hold; the alignment-inspection allowance is priced, and an agent approval record is required before submission.

The app opens on a searchable claims dashboard with live status counts and clearly labeled sample claims. Select a claim to open its workspace. The vehicle, claim number, incident details, date and status remain at the top. The tabs are Evidence, Repair estimate and Activity log; The BMW starts as a new claim for the assessment walkthrough. The Camry awaits a policyholder response, the Lexus needs manual review, and the Patrol has an inspection hold. Click **Assess evidence** to run the animated assessment, then **Review estimate** to check the resulting line items. Adding evidence returns to the photos so the user can start the review. **Reset sample claims** restores the four starting scenarios; it keeps separately uploaded claims. Sample photos are AI-generated and do not represent real losses; provenance is retained in the assets and exported report rather than badges in the workspace. Live AI decisions and recommended repairs may vary.

**Assess evidence** sends all selected evidence to Gemini for review, then TypeSafe Jev routes the result. Adequate evidence proceeds to visible-damage analysis and pricing. A repeat review asks before replacing a live or edited draft; a failed provider request preserves it. A successful new review invalidates prior draft approval. Uploaded photos and short videos follow the same pipeline.

The animated workflow labels the photo reviewer **LLM** and the routing step **Decision Model**. It follows server events through evidence review, the returned choice and confidence, damage analysis and catalogue matching. It also shows the agent, senior approval and authorization steps. Close it to continue in the background and reopen it from the progress strip. Reduced-motion preferences disable the flow animations.

The server checks the model route against structured photo gaps and ambiguous observations. Confidence below the demo's 80% threshold goes to agent review; a missing-photo verdict with no photo gaps also goes to agent review instead of inventing a request. This threshold is a prototype policy, not a calibrated insurance risk score. The original model choice and confidence are retained, and **Why this route?** explains any applied rule. Clear views of severe damage can produce a preliminary estimate while inspection approval remains blocked.

Live damage findings require a visual basis. Structural/suspension inspections must cite a concrete visible indicator in a linked image; unsupported hidden-damage possibilities stay outside the priced estimate. Supported inspection items remain subject to agent approval. Empty damage results go to agent review, not an automatic request for more photos.

Findings link to clean source photos or video timestamps and estimate lines; photo boxes and part tags are hidden. Every supported component and operation has a mock price; inspection and structural items require an agent approval record before submission. Agent and senior adjuster roles, repair shops and prices are simulated. Reports include sources, decisions and authorization.

## Accident scope and reviewer views

The light neutral workspace includes an accident description on each claim. New claims require a description. The LLM classifies observations as related, unrelated, or uncertain against that reported event; the server prices only related findings. Other observations are shown outside the estimate and included in the report. Changing the description preserves the previous draft but blocks approval until evidence is reviewed again. This is a prototype assessment aid, not a determination of causation or coverage.

Hover over the small profile icon at the top right, or click/tap it, to switch between Agent and Senior adjuster. The switcher also supports keyboard arrows, Enter, and Escape. Agent view handles evidence, edits and submission. Senior view has its own submitted-claim queue, return-for-changes action, shop selection and authorization. The selected view persists in this browser. These are simulated UI roles, not authentication or access control.

The review animation follows actual streamed stages. The ribbon above the photos highlights the active stage. Analysis details show the returned route and confidence. Reduced-motion settings are respected.

## Requesting evidence

Agents use **Request additional evidence** to select existing photos, place numbered pins, and add a comment to each pin. Request notes can also describe a missing view or a video timestamp without a pin. Evidence requests are addressed to the policyholder; save the request and the claim shows **Awaiting policyholder response**. Requests and comments persist with the claim, appear in its history and report, and are read-only in the senior view. Photo coordinates remain aligned as the view resizes; keyboard users can add a centered pin and reposition it with arrow keys.

Delivery is simulated. The agent can open **View request** to read the sent message and its photo comments. The demo ends this branch at **Awaiting policyholder response**.

Run `node scripts/evidence-request-check.cjs` for request routing, pins, comments, policyholder-only requests, persistence, mobile alignment, senior read-only access and the waiting state, using mocked provider calls.

## Pricing and storage

All current amounts are QAR. The illustrative price book converts the original demo values at 3.64 QAR/USD, with labor at QAR 218.40/hour; these are not verified Qatar repair quotes. Older saved amounts are converted once and logged. Existing edited claims and submitted evidence are preserved; only the untouched original demo is upgraded automatically. Claims and media remain in IndexedDB on the same browser and origin.

**Pricing catalogue** in the estimate opens a new tab with 92 searchable rates, including tail lamps, mirrors, grille, trunk, roof, quarter panels, rocker panels, glass, tires, suspension, structure, sensors and calibration. Each entry identifies its mock allowance basis; filter by operation to inspect the coverage. The [body-part research](https://humansintheloop.org/resources/datasets/car-parts-and-car-damages-dataset/) informed component coverage, not prices. Added amounts are illustrative allowances. The generic other-component category requires a supplier quote. These allowances do not determine whether an operation is appropriate; the agent can correct them. Unpriced repairs remain pending until an agent confirms a supplier quote.

Credentials stay on the server. Media and incident details go to Gemini; a text summary goes to Jev. Media is limited to eight files, 12 MB per file, and 18 MB combined base64 payload. Video playback depends on the browser.

## Validation and assets

Run `npm run typecheck`, `npm run build`, and `node scripts/demo-check.cjs` with the server on port 3184. The browser check uses an isolated temporary profile and mocked provider responses to exercise routing, failure recovery, inspection gating, edits, authorization, downloads, persistence and mobile layouts. `CHROME_PATH` can override its browser executable; `CLAIMLENS_URL` can override the URL.

Run `node scripts/review-check.cjs` for catalogue SQL matching, inspection gates, stream parsing and all three Jev routes with mocked providers. Run `node scripts/flow-browser-check.cjs` against the local server for streamed workflow progress, decision confidence, background continuation, catalogue operation filters and mobile/reduced-motion behavior. Run `node scripts/scope-browser-check.cjs` for accident-scope invalidation, exclusions, role restrictions and switcher persistence/accessibility. These checks do not consume provider quota.

Run `node scripts/initial-review-check.cjs` for clean seeds and saved-claim migrations, `node scripts/review-policy-check.cjs` for routing and visual-basis checks, and `node scripts/routing-browser-check.cjs` for guarded-route audit/persistence and agent continuation.

The current 24 demo images are under `public/evidence/{bmw,camry,lexus-reflections-v2,patrol}`. The revised Lexus set depicts ambiguous reflected marks instead of the original definite scratch. Unreviewed saved demos receive the new set automatically; reviewed or edited claims keep their original evidence. Use **Reset sample claims** to restart those demos with the current photos. Generation provenance and exact prompts are in `assets/demo-sources/`, including `lexus-reflections-v2.json`. Older assets remain available for saved evidence links. The legacy BMW photograph and crops remain for saved older claims; their source was [Copart lot 53271023](https://cs.copart.com/v1/AUTH_svc.pdoc00001/lpp/0523/3a923b959b9648febc648bc390f68795_hrs.jpg).

Provider references: [TypeSafe decision API](https://api.typesafe.ai/docs), [Gemini image understanding](https://ai.google.dev/gemini-api/docs/image-understanding).

## UI and dashboard validation

Tailwind CSS v4 and shadcn/ui Button, Input, Badge, and Card components are configured in `components.json`; shared colors also style the existing workspace. Components are owned locally under `components/ui/`.

Run `node scripts/dashboard-response-check.cjs` for dashboard search, sent evidence requests, read-only waiting state, persistence, and mobile overflow. Like the other browser checks, it accepts `CHROME_PATH` and `CLAIMLENS_URL`. If Turbopack cannot start its CSS worker in a restricted environment, use `npm run build -- --webpack`.
