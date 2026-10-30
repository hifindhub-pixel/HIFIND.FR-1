import { cp, mkdir, readdir, rm } from 'node:fs/promises';
const out = new URL('../dist/', import.meta.url);
await rm(out, { recursive:true, force:true });
await mkdir(out, { recursive:true });
// Publish only public assets, never server source, tests or configuration.
for (const name of await readdir(new URL('../', import.meta.url))) {
  if (/\.(html|png|svg|ico|webmanifest)$/.test(name) || name === 'robots.txt' || name === 'assets') {
    await cp(new URL('../' + name, import.meta.url), new URL(name, out), { recursive:true });
  }
}
console.log('Public assets prepared in dist/');
