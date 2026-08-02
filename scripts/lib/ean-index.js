// scripts/lib/ean-index.js
//
// Sync en deux phases.
//
// Phase A — RÉCOLTE : on lit chaque flux en ENTIER (plus de coupure à N lignes),
//   on ne garde en mémoire que l'EAN et le marchand, et on écrit les produits
//   sur le disque du runner en JSONL. Aucune écriture en base.
//
// Phase B — INGESTION : on connaît alors tous les EAN présents chez 2 marchands
//   ou plus. On relit les fichiers locaux et on n'insère que ceux-là.
//
// Bénéfice : on ne rate plus un produit parce qu'il se trouvait à la 40 000e ligne
// d'un catalogue tronqué à 4 000. Et la base ne reçoit que du comparable.

import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';

export const HARVEST_DIR = process.env.HARVEST_DIR || '/tmp/hifind-harvest';

/** Index EAN → marchands. Mémoire : ~100 octets par EAN unique. */
export class EanIndex {
  constructor() {
    this.owner = new Map();   // ean -> premier program_id vu
    this.multi = new Set();   // ean vus chez 2 marchands distincts ou plus
    this.seen = 0;
  }
  add(ean, programId) {
    if (!ean) return;
    this.seen++;
    const first = this.owner.get(ean);
    if (first === undefined) { this.owner.set(ean, programId); return; }
    if (first !== programId) this.multi.add(ean);
  }
  isMulti(ean) { return this.multi.has(ean); }
  stats() {
    return { lignes: this.seen, eansUniques: this.owner.size, eansPartages: this.multi.size };
  }
  /** Libère la Map une fois la phase A terminée : seul `multi` sert ensuite. */
  compact() { this.owner.clear(); }
}

/* ─────────────────────────── Écriture ─────────────────────────── */

export function resetHarvest() {
  fs.rmSync(HARVEST_DIR, { recursive: true, force: true });
  fs.mkdirSync(HARVEST_DIR, { recursive: true });
}

function harvestPath(programId) {
  return path.join(HARVEST_DIR, programId.replace(/[^a-z0-9_]/gi, '_') + '.jsonl');
}

/**
 * Flux d'écriture JSONL pour un marchand. Plusieurs feeds peuvent partager le
 * même programId (ManoMano A..E) : on ouvre en append.
 */
export class HarvestWriter {
  constructor(programId) {
    this.programId = programId;
    this.stream = fs.createWriteStream(harvestPath(programId), { flags: 'a' });
    this.count = 0;
    this.skippedNoEan = 0;
  }
  write(p) {
    if (!p.ean) { this.skippedNoEan++; return; }
    this.stream.write(JSON.stringify(p) + '\n');
    this.count++;
  }
  close() {
    return new Promise(res => this.stream.end(res));
  }
}

/* ─────────────────────────── Lecture ─────────────────────────── */

export function harvestedPrograms() {
  if (!fs.existsSync(HARVEST_DIR)) return [];
  return fs.readdirSync(HARVEST_DIR)
    .filter(f => f.endsWith('.jsonl'))
    .map(f => ({ programId: f.replace(/\.jsonl$/, ''), file: path.join(HARVEST_DIR, f) }));
}

/**
 * Relit un fichier de récolte et ne retient que les produits dont l'EAN est
 * partagé. Déduplique par EAN en gardant le prix le plus bas — un marchand liste
 * souvent le même article en plusieurs tailles ou coloris.
 */
export async function selectMatching(file, index) {
  const rl = readline.createInterface({
    input: fs.createReadStream(file),
    crlfDelay: Infinity,
  });
  const byEan = new Map();
  let scanned = 0;
  for await (const line of rl) {
    if (!line) continue;
    scanned++;
    let p;
    try { p = JSON.parse(line); } catch { continue; }
    if (!index.isMulti(p.ean)) continue;
    const prev = byEan.get(p.ean);
    if (!prev || p.price < prev.price) byEan.set(p.ean, p);
  }
  return { scanned, kept: Array.from(byEan.values()) };
}

export function harvestDiskUsage() {
  if (!fs.existsSync(HARVEST_DIR)) return 0;
  return fs.readdirSync(HARVEST_DIR)
    .reduce((n, f) => n + fs.statSync(path.join(HARVEST_DIR, f)).size, 0);
}
