#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const DAY = 86_400_000;
const stable = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const exact = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
const help = `npm-age-pin <package> [...] [--age-days N] [--dry-run] [-D | -g]

Default: 3 days (72 hours). Bare names select the most recently published
eligible stable release. Tags and exact versions must themselves be old enough.
Public npm registry only. Direct dependencies only. Install scripts are disabled.
Supports scoped names; rejects ranges, URLs, paths and arbitrary npm flags.
REAL_NPM=/absolute/path/to/npm selects npm when a PATH shim is already installed.`;

export function parseSpec(spec) {
  const match = /^(@[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*|[a-z0-9][a-z0-9._-]*)(?:@([^\s]+))?$/.exec(spec);
  if (!match || match[1].length > 214) throw new Error(`Unsupported package: ${spec}`);
  const [, name, selector] = match;
  if (selector && !exact.test(selector) && !/^[a-zA-Z][a-zA-Z0-9._-]*$/.test(selector)) {
    throw new Error(`Use a bare name, tag, or exact version: ${spec}`);
  }
  return { name, selector };
}

export function parseArgs(args) {
  const options = { days: 3, dryRun: false, flags: [], specs: [] };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '--age-days' || arg.startsWith('--age-days=')) {
      const value = arg === '--age-days' ? args[++i] : arg.slice(11);
      if (!/^[1-9]\d*$/.test(value ?? '') || !Number.isSafeInteger(Number(value)) || Number(value) > 36500) {
        throw new Error('--age-days must be an integer from 1 to 36500');
      }
      options.days = Number(value);
    } else if (arg === '-D' || arg === '--save-dev') options.flags.push('--save-dev');
    else if (arg === '-g' || arg === '--global') options.flags.push('--global');
    else if (arg.startsWith('-')) throw new Error(`Unsupported option: ${arg}`);
    else options.specs.push(parseSpec(arg));
  }
  if (!options.specs.length) throw new Error(help);
  if (options.flags.includes('--global') && options.flags.includes('--save-dev')) throw new Error('Choose -D or -g, not both');
  return options;
}

export function resolve(spec, metadata, cutoff) {
  const { name, selector } = spec;
  if (metadata?.name !== name || !metadata.versions || !metadata.time) throw new Error(`Incomplete registry metadata for ${name}`);
  const eligible = version => {
    const entry = metadata.versions[version];
    const time = metadata.time[version];
    const published = typeof time === 'string' ? Date.parse(time) : NaN;
    return entry?.version === version && !entry.deprecated && Number.isFinite(published) && published <= cutoff;
  };
  let version;
  if (selector) {
    version = exact.test(selector) ? selector : metadata['dist-tags']?.[selector];
    if (typeof version !== 'string' || !exact.test(version) || !eligible(version)) {
      throw new Error(`${name}@${selector}: missing, deprecated, or younger than the cutoff; refusing`);
    }
  } else {
    version = Object.keys(metadata.versions).filter(v => stable.test(v) && eligible(v))
      .sort((a, b) => Date.parse(metadata.time[b]) - Date.parse(metadata.time[a]) || a.localeCompare(b))[0];
    if (!version) throw new Error(`${name}: no eligible stable release; refusing`);
  }
  return `${name}@${version}`;
}

export function installArgs(pins, flags) {
  return ['install', '--save-exact', '--ignore-scripts', '--registry=https://registry.npmjs.org/', ...flags, ...pins];
}

export async function main(args, { fetchMetadata, install, now = Date.now(), log = console.log } = {}) {
  if (args.length === 1 && ['--help', '-h'].includes(args[0])) { log(help); return 0; }
  const options = parseArgs(args);
  const cutoff = now - options.days * DAY;
  fetchMetadata ??= async name => {
    const response = await fetch(`https://registry.npmjs.org/${encodeURIComponent(name)}`, {
      signal: AbortSignal.timeout(30_000), redirect: 'error', headers: { Accept: 'application/json' }
    });
    if (!response.ok) throw new Error(`${name}: registry returned HTTP ${response.status}`);
    return response.json();
  };
  const pins = [];
  for (const spec of options.specs) pins.push(resolve(spec, await fetchMetadata(spec.name), cutoff));
  log(`Cutoff: ${new Date(cutoff).toISOString()} (${options.days} days)`);
  for (const pin of pins) log(pin);
  if (options.dryRun) return 0;
  install ??= argv => {
    const result = spawnSync(process.env.REAL_NPM || 'npm', argv, { stdio: 'inherit', shell: false });
    if (result.error) throw result.error;
    if (result.signal) throw new Error(`npm terminated by ${result.signal}`);
    return result.status ?? 1;
  };
  return install(installArgs(pins, options.flags));
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.exitCode = await main(process.argv.slice(2)); }
  catch (error) { console.error(`npm-age-pin: ${error.message}`); process.exitCode = 1; }
}
