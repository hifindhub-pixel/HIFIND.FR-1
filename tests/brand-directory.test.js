import test from 'node:test';
import assert from 'node:assert/strict';
import { brandDirectoryHtml } from '../api/marques.js';

test('brand directory is indexable, searchable and escapes catalogue data',()=>{
  const html=brandDirectoryHtml([{brand:'L’Oréal',products:42,merchants:5},{brand:'A < B',products:3,merchants:2}]);
  assert.match(html,/<link rel="canonical" href="https:\/\/hifind.fr\/marques">/);
  assert.match(html,/application\/ld\+json/);
  assert.match(html,/id="brandSearch"/);
  assert.match(html,/href="\/marque\/l-oreal"/);
  assert.match(html,/A &lt; B/);
  assert.doesNotMatch(html,/A < B/);
});
