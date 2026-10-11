import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { untrustedFeedIdentityReason, CONFIRMED_MOTO_COLLISIONS } from '../scripts/lib/untrusted-feed-identities.js';

test('only the two audited source identities are blocked',()=>{
  for(const id of ['effinity_moto_axxe','effinity_maxxess']) assert.ok(untrustedFeedIdentityReason(id));
  for(const id of ['effinity_speedway','awin_rue_du_commerce','cj_notino','toString']) assert.equal(untrustedFeedIdentityReason(id),null);
  assert.deepEqual(CONFIRMED_MOTO_COLLISIONS,['3000057241538','3000058301538']);
});
test('untrusted Effinity identity sources are rejected before harvest or lifecycle success',()=>{
  const source=readFileSync(new URL('../scripts/sync.js',import.meta.url),'utf8');
  const effinity=source.slice(source.indexOf('async function syncEffinity()'),source.indexOf('// ══ BCD JEUX'));
  const guard=effinity.indexOf('untrustedFeedIdentityReason(programId)');
  assert.ok(guard>0 && guard<effinity.indexOf('new HarvestWriter'));
  assert.match(effinity.slice(guard,effinity.indexOf('try {',guard)),/feedIncomplete\(programId\)[\s\S]*reportFeed[\s\S]*continue;/);
});
