import test from 'node:test';
import assert from 'node:assert/strict';
import { WORKFLOWS, inspectRuns, inspectProduct, collectReport } from '../scripts/hifind-agent.js';
import { validateTask, validateProposal, propose, publishDraft } from '../scripts/hifind-developer.js';
const now = Date.parse('2026-10-31T12:00:00Z');
const run = (overrides = {}) => ({ head_branch: 'main', event: 'schedule', status: 'completed', conclusion: 'success', created_at: '2026-10-31T08:00:00Z', ...overrides });
const product = () => ({ ean: '1234567890123', price: 10, offers_count: 2, image_url: 'https://example.com/a.jpg', ean_offers: [10, 12].map(price => ({ price, updated_at: '2026-10-31T08:00:00Z', url: 'https://example.com/item' })) });
test('latest failure is reported despite an older success', () => {
  const result = inspectRuns(WORKFLOWS[0], [run({ conclusion: 'failure' }), run({ created_at: '2026-10-30T08:00:00Z' })], now);
  assert.equal(result[0].code, 'workflow_failed');
});
test('running jobs do not hide prior failure; PRs do not hide stale main', () => {
  assert.ok(inspectRuns(WORKFLOWS[0], [run({ status: 'in_progress', conclusion: null }), run({ conclusion: 'failure', created_at: '2026-10-30T08:00:00Z' })], now).some(f => f.code === 'workflow_stuck'));
  assert.equal(inspectRuns(WORKFLOWS[0], [run({ event: 'pull_request' })], now)[0].code, 'workflow_missing');
});
test('weekly discovery is not incorrectly treated as daily', () => {
  assert.deepEqual(inspectRuns(WORKFLOWS[3], [run({ created_at: '2026-10-26T08:00:00Z' })], now), []);
});
test('healthy product and invalid/expired offers', () => {
  assert.deepEqual(inspectProduct(product(), now), []);
  const p = product(); p.ean_offers[0] = { price: '', url: 'javascript:alert(1)' };
  const codes = inspectProduct(p, now).map(f => f.code);
  for (const code of ['not_comparable', 'invalid_price', 'invalid_link', 'stale_offers']) assert.ok(codes.includes(code));
});
test('collects bounded public sample and never sends GitHub token to site', async () => {
  const calls = [];
  const report = await collectReport({ now, token: 'private-token', fetchImpl: async (url, opts) => {
    calls.push(url);
    if (url.startsWith('https://hifind.fr')) {
      assert.equal(opts.headers.authorization, undefined);
      return { ok: true, json: async () => ({ data: [product()] }) };
    }
    assert.equal(opts.headers.authorization, 'Bearer private-token');
    return { ok: true, json: async () => ({ workflow_runs: [run()] }) };
  } });
  assert.equal(report.status, 'healthy'); assert.equal(calls.length, 5);
});
test('network failure is unknown/critical, sanitized and never healthy', async () => {
  const report = await collectReport({ now, fetchImpl: async () => { throw new Error('secret=abc'); } });
  assert.equal(report.status, 'critical'); assert.equal(report.checks.filter(c => c.observed).length, 0);
  assert.ok(!JSON.stringify(report).includes('secret=abc'));
});
test('developer refuses secrets, traversal and workflow changes', () => {
  for (const path of ['.env', '.github/workflows/sync.yml', 'scripts/lib/../../.env', 'scripts/sync.js']) assert.throws(() => validateTask({ goal: 'fix', files: [path] }));
});
test('Vercel disabled deployment is distinguished from a catalogue error', async () => {
  const report = await collectReport({ now, fetchImpl: async url => url.startsWith('https://hifind.fr')
    ? { ok: false, status: 402, headers: { get: () => 'DEPLOYMENT_DISABLED' } }
    : { ok: true, json: async () => ({ workflow_runs: [run()] }) }
  });
  assert.equal(report.findings[0].code, 'deployment_disabled');
});
test('developer only accepts unique replacements inside selected files', () => {
  const sources = { 'scripts/lib/demo.js': 'const x = 1;\n' };
  const proposal = { summary: 'Correction', edits: [{ path: 'scripts/lib/demo.js', search: 'x = 1', replace: 'x = 2' }] };
  assert.equal(validateProposal(proposal, sources).files['scripts/lib/demo.js'], 'const x = 2;\n');
  assert.throws(() => validateProposal({ ...proposal, edits: [{ ...proposal.edits[0], path: '.env' }] }, sources));
  assert.throws(() => validateProposal(proposal, { 'scripts/lib/demo.js': 'x = 1; x = 1;' }));
});
test('local Ollama request has no credentials and validates complete response', async () => {
  const task = { goal: 'Change constant', files: ['scripts/lib/demo.js'] };
  const sources = { 'scripts/lib/demo.js': 'const x = 1;' };
  const proposal = await propose({ task, sources, model: 'local:7b', instructions: 'Keep scope', fetchImpl: async (url, opts) => {
    assert.equal(url, 'http://127.0.0.1:11434/api/chat'); assert.equal(opts.headers.authorization, undefined);
    return { ok: true, json: async () => ({ done: true, message: { content: JSON.stringify({ summary: 'Correction', edits: [{ path: task.files[0], search: 'x = 1', replace: 'x = 2' }] }) } }) };
  } });
  assert.equal(proposal.files[task.files[0]], 'const x = 2;');
});
test('publishing aborts before mutation if main changed', async () => {
  const methods = [];
  await assert.rejects(publishDraft({ proposal: {}, base: 'old', token: 'fake', branch: 'agent/test', fetchImpl: async (_, opts) => {
    methods.push(opts.method); return { ok: true, json: async () => ({ object: { sha: 'new' } }) };
  } }), /main a changé/);
  assert.deepEqual(methods, ['GET']);
});
test('publishing creates only a new branch and draft PR, never updates main', async () => {
  const calls = [];
  const responses = [{ object: { sha: 'base' } }, { tree: { sha: 'tree' } }, { sha: 'newtree' }, { sha: 'commit' }, {}, { html_url: 'https://github.com/example/pr/1' }];
  await publishDraft({ proposal: { summary: 'Fix', files: { 'scripts/lib/demo.js': 'const x = 2;' } }, base: 'base', token: 'fake', branch: 'agent/test', fetchImpl: async (url, opts) => {
    calls.push({ url, ...opts }); return { ok: true, json: async () => responses.shift() };
  } });
  assert.equal(JSON.parse(calls.at(-1).body).draft, true);
  assert.equal(JSON.parse(calls[4].body).ref, 'refs/heads/agent/test');
  assert.ok(!calls.some(c => c.method === 'PATCH' || c.url.endsWith('/merge')));
});
