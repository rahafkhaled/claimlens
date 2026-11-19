const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const cache = new Map();
function load(file) {
 file=path.resolve(file);if(cache.has(file))return cache.get(file).exports;
 const module={exports:{}};cache.set(file,module);
 const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
 new Function('require','module','exports',code)(name=>name.startsWith('.')?load(path.resolve(path.dirname(file),name)+'.ts'):require(name),module,module.exports);
 return module.exports;
}
const {routeEvidence, validateObservations}=load('lib/review-policy.ts');
const {partitionAccidentFindings,requiresInspection}=load('lib/claims.ts');
const clear={summary:'Clear views; displaced wheel requires inspection.',gaps:[],ambiguities:[]};
const low=routeEvidence(clear,{choice:'missing',confidence:.46});
assert.equal(low.choice,'uncertain');assert.equal(low.modelChoice,'missing');assert.equal(low.confidence,.46);assert(low.reason.includes('80%'));
assert.equal(routeEvidence(clear,{choice:'missing',confidence:.96}).choice,'uncertain');
assert.equal(routeEvidence(clear,{choice:'sufficient',confidence:.96}).choice,'sufficient');
assert.equal(routeEvidence({...clear,gaps:['Blurred damage detail.']},{choice:'sufficient',confidence:.96}).choice,'missing');
assert.equal(routeEvidence({...clear,ambiguities:['Mark could be a reflection.']},{choice:'sufficient',confidence:.96}).choice,'uncertain');
assert.equal(routeEvidence(clear,{choice:'sufficient',confidence:.79}).choice,'uncertain');
assert.equal(routeEvidence(clear,{choice:'sufficient',confidence:.80}).choice,'sufficient');
const finding={component:'Front structure',code:'structure',operation:'Inspect',damage:'Possible internal deformation.',repair:'Inspect structure.',severity:'Moderate',accidentRelation:'related',accidentReason:'Reported impact.',evidence:[{item:1,box:[0,0,500,500]}],visualBasis:'unconfirmed',inspectionEvidence:null};
const speculative=validateObservations([finding]);
assert.equal(partitionAccidentFindings(speculative).findings.length,0);
assert.equal(speculative[0].accidentRelation,'uncertain');
const bumper={...finding,component:'Bumper',code:'bumper',operation:'Replace',visualBasis:'visible_damage',damage:'Cracked cover.'};
assert.equal(partitionAccidentFindings(validateObservations([bumper])).findings.length,1);
assert.equal(requiresInspection(validateObservations([bumper])[0]),false);
for(const operation of ['Replace','Inspect']) {
 const supported={...finding,operation,visualBasis:'inspection_indicator',inspectionEvidence:{item:1,indicator:'wheel_displacement',observation:'Wheel displaced rearward into the arch.'}};
 const accepted=validateObservations([supported])[0];
 assert.equal(accepted.operation,'Inspect');assert(requiresInspection(accepted));assert.equal(accepted.accidentRelation,'related');
}
const ungrounded={...finding,visualBasis:'visible_damage',inspectionEvidence:null};
assert.equal(partitionAccidentFindings(validateObservations([ungrounded])).findings.length,0);
assert.throws(()=>validateObservations([{...finding,inspectionEvidence:{item:2,indicator:'wheel_displacement',observation:'Wheel displaced.'}}]));
console.log('PASS: confidence threshold, missing-photo contradiction, ambiguity routing, original verdict audit, speculative structure exclusion and supported inspection holds.');
