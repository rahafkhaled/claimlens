const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const cache = new Map();
function load(file) {
  file = path.resolve(file);
  if (cache.has(file)) return cache.get(file).exports;
  const module = { exports: {} }; cache.set(file, module);
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  new Function('require', 'module', 'exports', code)(name => {
    if (name.startsWith('@/')) return load(name.slice(2) + '.ts');
    if (name.startsWith('.')) return load(path.resolve(path.dirname(file), name) + '.ts');
    return require(name);
  }, module, module.exports);
  return module.exports;
}
(async () => {
  const { catalogue, partLabels } = load('lib/catalogue.ts');
  const { partCodes, operations, requiresInspection } = load('lib/claims.ts');
  const { priceFindings } = load('lib/pricing.ts');
  const { readReviewResponse } = load('lib/review-progress.ts');
  assert.equal(new Set(catalogue.map(r => r.id)).size, catalogue.length);
  assert.deepEqual(Object.keys(partLabels).sort(), [...partCodes].sort());
  const make = (code, operation) => ({ component: partLabels[code], code, operation, damage: 'Visible damage', repair: operation + ' component', severity: 'Moderate', accidentRelation: 'related', accidentReason: 'Damage matches the reported impact area.', visualBasis: operation === 'Inspect' ? 'inspection_indicator' : 'visible_damage', inspectionEvidence: operation === 'Inspect' ? {item: 1, indicator: 'wheel_displacement', observation: 'The wheel is displaced rearward into its arch.'} : null, evidence: [{ item: 1, box: [100, 100, 800, 800], seconds: null }] });
  const newParts = ['taillamp', 'mirror', 'grille', 'trunk', 'windshield', 'rear_glass', 'side_glass', 'tire'];
  const priced = await priceFindings(newParts.map(code => make(code, 'Replace')));
  assert(priced.every(l => l.parts > 0 && l.labor > 0 && !l.needsQuote && l.catalogueId));
  const inspections = await priceFindings(partCodes.map(code => make(code, 'Inspect')));
  assert(inspections.every(l => l.parts === 0 && l.labor > 0 && !l.needsQuote));
  assert.equal(catalogue.length, partCodes.length * operations.length);
  const everyOperation = await priceFindings(partCodes.flatMap(code => operations.map(operation => make(code, operation))));
  assert(everyOperation.every(line => !line.needsQuote && line.parts + line.labor > 0));
  const unknown = await priceFindings([make('other', 'Replace'), make('headlamp', 'Repair'), make('roof', 'Replace')]);
  assert(unknown.every(l => !l.needsQuote && l.parts + l.labor > 0));
  const { migrateClaim } = load("lib/sample.ts");
  const pending = structuredClone(require('./fixtures/demo-assessments-v2.json')[3]);
  pending.decisionSource = 'jev';
  pending.lines[2] = { ...pending.lines[2], parts: 0, labor: 0, needsQuote: true };
  const filled = migrateClaim(pending);
  assert(filled.lines.every(line => !line.needsQuote));
  assert(filled.lines[2].labor > 0);
  assert.deepEqual(migrateClaim(filled), filled);
  pending.lines[2].parts = 150;
  assert.equal(migrateClaim(pending).lines[2].parts, 150);
  assert(requiresInspection(make('roof', 'Replace')));
  assert(requiresInspection(make('structure', 'Repair')));
  const bumper = (await priceFindings([make('bumper', 'Replace')]))[0];
  assert.equal(bumper.parts + bumper.labor, 4368);

  // Fragments split JSON lines and multibyte UTF-8 without losing the terminal result.
  const events = [{ type: 'stage', stage: 'quality' }, { type: 'quality', quality: { summary: 'Révision — واضحة', gaps: [] } }, { type: 'result', data: { success: true } }];
  const bytes = new TextEncoder().encode(events.map(e => JSON.stringify(e)).join('\n'));
  let at = 0; const received = [];
  const response = new Response(new ReadableStream({ pull(c) { if (at >= bytes.length) return c.close(); c.enqueue(bytes.slice(at, at += 3)); } }), { headers: { 'content-type': 'application/x-ndjson' } });
  assert.deepEqual(await readReviewResponse(response, e => received.push(e)), { success: true });
  assert.deepEqual(received, events);
  await assert.rejects(readReviewResponse(new Response('{"type":"stage","stage":"quality"}\n', { headers: { 'content-type': 'application/x-ndjson' } }), () => {}), /interrupted/);
  await assert.rejects(readReviewResponse(new Response('{"type":"error","error":"Provider unavailable"}\n', { headers: { 'content-type': 'application/x-ndjson' } }), () => {}), /Provider unavailable/);

  process.env.GEMINI_API_KEY = 'test-only'; process.env.TYPESAFE_API_KEY = 'test-only';
  const { POST } = load('app/api/analyze/route.ts');
  const nativeFetch = global.fetch;
  let choice = 'sufficient', failing = false, invalidScope = false, calls = 0, confidence = .93;
  const quality = { summary: 'Clear view of the affected panel.', gaps: [], ambiguities: [] };
  global.fetch = async (url, init) => {
    calls++;
    if (failing) return Response.json({}, { status: 429 });
    if (url.includes('typesafe')) return Response.json({ answers: { evidence: { choice, confidence } } });
    const body = JSON.parse(init.body), prompt = body.contents[0].parts[0].text;
    const result = prompt.includes('PRELIMINARY VISIBLE') ? quality : [make('taillamp', 'Replace'), make('structure', 'Inspect'), {...make('door', 'Repair'), accidentRelation: 'unrelated', accidentReason: 'Prior wear outside impact area.'}, {...make('roof', 'Repair'), accidentRelation: invalidScope ? undefined : 'uncertain', accidentReason: 'Connection to impact cannot be established.'}];
    return Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify(result) }] } }] });
  };
  const req = (step, stream = true) => new Request('http://localhost/api/analyze', { method: 'POST', headers: { host: 'localhost', 'content-type': 'application/json', ...(stream ? { accept: 'application/x-ndjson' } : {}) }, body: JSON.stringify({ step, vehicle: 'Test car', details: 'Rear corner impact while parked.', accidentDescription: 'Rear corner impact while parked.', images: ['data:image/jpeg;base64,YQ=='] }) });
  try {
    for (choice of ['sufficient', 'missing', 'uncertain']) {
      quality.gaps = choice === 'missing' ? ['Blurred tail lamp close-up.'] : [];
      quality.ambiguities = choice === 'uncertain' ? ['The mark could be a reflection.'] : [];
      const got = []; const result = await readReviewResponse(await POST(req('quality')), e => got.push(e));
      assert.deepEqual(got.map(e => e.type === 'stage' ? e.stage : e.type), ['quality', 'quality', 'decision', 'decision', 'result']);
      assert.equal(result.decision.choice, choice);
    }
    quality.gaps = []; quality.ambiguities = [];
    choice = 'missing'; confidence = .46;
    const guarded = await readReviewResponse(await POST(req('quality')), () => {});
    assert.equal(guarded.decision.choice, 'uncertain');
    assert.equal(guarded.decision.modelChoice, 'missing');
    assert.equal(guarded.decision.confidence, .46);
    choice = 'uncertain'; confidence = .93;
    const got = []; const result = await readReviewResponse(await POST(req('damage')), e => got.push(e));
    assert.deepEqual(got.map(e => e.type === 'stage' ? e.stage : e.type), ['damage', 'findings', 'pricing', 'priced', 'result']);
    assert.equal(result.findings.length, 2);
    assert.deepEqual(result.excludedFindings.map(f => f.accidentRelation), ['unrelated', 'uncertain']);
    assert.equal(result.lines[0].catalogueId, 'taillamp:Replace');
    assert.equal(result.lines[1].needsQuote, false);
    assert.deepEqual(got.find(e => e.type === 'priced'), { type: 'priced', count: 2, unpriced: 0 });
    assert.equal((await (await POST(req('quality', false))).json()).decision.choice, 'uncertain');
    invalidScope = true;
    await assert.rejects(readReviewResponse(await POST(req('damage')), () => {}));
    invalidScope = false;
    const countBeforeBlank = calls;
    const blank = await POST(new Request('http://localhost/api/analyze', {method:'POST', headers:{host:'localhost','content-type':'application/json'}, body:JSON.stringify({step:'quality',vehicle:'Test',details:'',images:['data:image/jpeg;base64,YQ==']})}));
    assert.equal(blank.status,400); assert.equal(calls,countBeforeBlank);
    failing = true;
    await assert.rejects(readReviewResponse(await POST(req('quality')), () => {}), /rate-limited/);
    const before = calls;
    const bad = await POST(new Request('http://localhost/api/analyze', { method: 'POST', headers: { host: 'localhost', 'content-type': 'application/json' }, body: '{}' }));
    assert.equal(bad.status, 400); assert.equal(calls, before);
  } finally { global.fetch = nativeFetch; }
  console.log(`PASS: ${catalogue.length} unique catalogue entries; expanded parts; QAR calculations; inspection gates; chunked streaming; all Jev branches; pricing events; JSON compatibility; error and input validation.`);
})().catch(e => { console.error(e); process.exitCode = 1; });
