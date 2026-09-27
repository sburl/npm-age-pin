import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSpec, parseArgs, resolve, main } from '../bin/npm-age-pin.mjs';

const now = Date.parse('2026-09-27T12:00:00Z');
const cutoff = now - 3 * 86_400_000;
const metadata = name => ({
  name,
  'dist-tags': { latest: '2.0.0', stable: '1.2.0', next: '3.0.0-beta.1' },
  versions: Object.fromEntries(['1.0.0', '1.1.0', '1.2.0', '2.0.0', '3.0.0-beta.1', '4.0.0', '5.0.0'].map(version => [version, { version }])),
  time: {
    '1.0.0': '2026-09-01T12:00:00Z',
    '1.1.0': '2026-09-24T11:59:59Z',
    '1.2.0': '2026-09-24T12:00:00Z',
    '2.0.0': '2026-09-24T12:00:01Z',
    '3.0.0-beta.1': '2026-09-23T12:00:00Z',
    '4.0.0': 'bad timestamp'
  }
});

test('default is three days; accepts scoped names and exact versions', () => {
  assert.equal(parseArgs(['example']).days, 3);
  assert.deepEqual(parseSpec('@scope/tool@1.2.0'), { name: '@scope/tool', selector: '1.2.0' });
  assert.deepEqual(parseSpec('@scope/tool'), { name: '@scope/tool', selector: undefined });
});
test('rejects ranges, paths, URLs, npm aliases and injection-shaped inputs', () => {
  for (const spec of ['example@^1', 'example@*', '../x', 'https://example.com/x', 'git+ssh://x', 'npm:other', 'x;touch', '@scope', 'x@', '-x']) {
    assert.throws(() => parseSpec(spec), undefined, spec);
  }
});
test('invalid ages and unknown flags fail closed', () => {
  for (const value of ['0', '-1', 'NaN', '1.5', '', '9999999999999999999']) {
    assert.throws(() => parseArgs(['example', '--age-days', value]));
  }
  assert.throws(() => parseArgs(['example', '--age-days']));
  assert.throws(() => parseArgs(['example', '--ignore-scripts=false']));
  assert.throws(() => parseArgs(['example', '-D', '-g']));
  assert.equal(parseArgs(['example', '--age-days=7']).days, 7);
});
test('includes exact cutoff, excludes newer releases, prereleases and invalid dates', () => {
  assert.equal(resolve(parseSpec('example'), metadata('example'), cutoff), 'example@1.2.0');
});
test('publication order, not semver order, chooses a bare package', () => {
  const data = metadata('example');
  data.time['1.0.0'] = '2026-09-24T12:00:00.000Z';
  data.time['1.2.0'] = '2026-09-20T12:00:00Z';
  assert.equal(resolve(parseSpec('example'), data, cutoff), 'example@1.0.0');
});
test('tags resolve to concrete versions; tags and explicit pins cannot bypass age', () => {
  assert.equal(resolve(parseSpec('example@stable'), metadata('example'), cutoff), 'example@1.2.0');
  assert.equal(resolve(parseSpec('example@next'), metadata('example'), cutoff), 'example@3.0.0-beta.1');
  for (const spec of ['example@latest', 'example@2.0.0', 'example@missing']) {
    assert.throws(() => resolve(parseSpec(spec), metadata('example'), cutoff));
  }
});
test('deprecated, absent, malformed and mismatched metadata is refused', () => {
  const data = metadata('example');
  data.versions['1.2.0'].deprecated = 'do not use';
  assert.equal(resolve(parseSpec('example'), data, cutoff), 'example@1.1.0');
  assert.throws(() => resolve(parseSpec('example@1.2.0'), data, cutoff));
  for (const broken of [null, {}, { ...data, name: 'other' }, { ...data, versions: {} }, { ...data, time: {} }]) {
    assert.throws(() => resolve(parseSpec('example'), broken, cutoff));
  }
});
test('dry-run queries scoped package but never invokes npm', async () => {
  let installed = false;
  const output = [];
  assert.equal(await main(['@scope/tool', '--dry-run'], {
    now, log: line => output.push(line), fetchMetadata: async name => metadata(name),
    install: () => { installed = true; }
  }), 0);
  assert.equal(installed, false);
  assert.ok(output.includes('@scope/tool@1.2.0'));
});
test('install passes exact pins, script suppression and flags as separate arguments', async () => {
  let actual;
  const status = await main(['example', '@scope/tool@stable', '-D'], {
    now, log() {}, fetchMetadata: async name => metadata(name),
    install: args => { actual = args; return 17; }
  });
  assert.equal(status, 17);
  assert.deepEqual(actual, ['install', '--save-exact', '--ignore-scripts', '--registry=https://registry.npmjs.org/', '--save-dev', 'example@1.2.0', '@scope/tool@1.2.0']);
});
test('one failed resolution prevents the entire install', async () => {
  let installed = false;
  await assert.rejects(main(['example', 'other@latest'], {
    now, log() {}, fetchMetadata: async name => metadata(name), install: () => { installed = true; }
  }));
  assert.equal(installed, false);
});
test('registry/network failure prevents installation', async () => {
  let installed = false;
  await assert.rejects(main(['example'], {
    now, log() {}, fetchMetadata: async () => { throw new Error('offline'); }, install: () => { installed = true; }
  }), /offline/);
  assert.equal(installed, false);
});
