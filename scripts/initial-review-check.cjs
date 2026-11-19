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
  new Function('require', 'module', 'exports', code)(name => name.startsWith('.') ? load(path.resolve(path.dirname(file), name) + '.ts') : require(name), module, module.exports);
  return module.exports;
}
const { demoClaims, mergeDemoClaims } = load('lib/sample.ts');
const { claimSchema, needsScopeReview } = load('lib/claims.ts');
const presets = require('./fixtures/demo-assessments-v2.json');
function unreviewed(claim) {
  claimSchema.parse(claim);
  assert.equal(claim.stage, 'intake', claim.id + ' must start without a verdict');
  assert.equal(claim.decision, null);
  assert.equal(claim.decisionSource, undefined);
  assert.equal(claim.quality, '');
  assert.deepEqual(claim.gaps, []);
  assert.equal(claim.request, '');
  assert.deepEqual(claim.findings, []);
  assert.deepEqual(claim.lines, []);
  assert.equal(needsScopeReview(claim), false);
  assert(!claim.log.some(event => event.title === 'Demo assessment loaded'));
  assert.equal(claim.photos.length, 6);
}
demoClaims.forEach(unreviewed);
const migrated = mergeDemoClaims(structuredClone(presets));
migrated.forEach(unreviewed);
assert(migrated.find(claim => claim.id === 'CLM-2086').photos.every(photo => photo.src.includes('lexus-reflections-v2')));
assert.deepEqual(mergeDemoClaims(migrated), migrated, 'migration must be idempotent');
const legacy = claimSchema.parse(load('lib/legacy-sample.ts').sample);
unreviewed(mergeDemoClaims([legacy])[0]);
const editedDescription = { ...presets[0], accidentDescription: 'Only the front bumper was hit.', scopeNeedsReview: true, scopeReviewed: false, stage: 'intake', log: [{ title: 'Accident description updated', detail: 'Only the front bumper was hit.', at: '2026-11-19T00:00:00Z' }, ...presets[0].log] };
const upgradedDescription = mergeDemoClaims([editedDescription])[0];
unreviewed(upgradedDescription);
assert.equal(upgradedDescription.accidentDescription, editedDescription.accidentDescription);
assert(upgradedDescription.log.some(event => event.title === 'Accident description updated'));
for (const original of presets) {
  const live = { ...original, decisionSource: 'jev', log: [{ title: 'Evidence decision recorded', detail: 'Live result', at: '2026-11-19T00:00:00Z' }, ...original.log] };
  assert.deepEqual(mergeDemoClaims([live])[0], live, 'keep completed reviews');
  const edited = { ...original, log: [{ title: 'Estimate updated', detail: 'Adjusted price', at: '2026-11-19T00:00:00Z' }, ...original.log] };
  assert.deepEqual(mergeDemoClaims([edited])[0], edited, 'keep manual work');
  const authorized = { ...original, stage: 'authorized', authorization: { shop: 'Demo shop', adjuster: 'Demo adjuster', at: '2026-11-19T00:00:00Z' } };
  assert.deepEqual(mergeDemoClaims([authorized])[0], authorized, 'keep authorizations');
  const uploaded = { ...original, sample: false };
  assert.deepEqual(mergeDemoClaims([uploaded])[0], uploaded, 'keep uploaded claims');
}
console.log('PASS: clean initial claims, v1/v2 migration, migration idempotence, descriptions, and preserved real reviews/edits/authorizations/uploads.');
