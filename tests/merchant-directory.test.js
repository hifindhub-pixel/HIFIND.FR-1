import test from 'node:test';
import assert from 'node:assert/strict';
import { merchantDirectoryHtml } from '../api/marchands.js';

test('merchant directory is indexable, searchable and escapes catalogue data', () => {
  const html = merchantDirectoryHtml([
    { title:'Électro Dépôt', products:120, offers:145, categories:4 },
    { title:'Marchand <test>', products:12, offers:15, categories:2 },
  ]);
  assert.match(html,/<link rel="canonical" href="https:\/\/hifind.fr\/marchands">/);
  assert.match(html,/application\/ld\+json/);
  assert.match(html,/id="merchantSearch"/);
  assert.match(html,/Électro Dépôt/);
  assert.match(html,/href="\/marchand\/electro-depot"/);
  assert.match(html,/120/);
  assert.match(html,/Marchand &lt;test&gt;/);
  assert.doesNotMatch(html,/Marchand <test>/);
});
