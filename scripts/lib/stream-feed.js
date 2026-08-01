// scripts/lib/stream-feed.js
// Lecture de flux produits en streaming : jamais plus de quelques Ko en mémoire,
// quelle que soit la taille du fichier distant.
//
// Aucune dépendance à la base de données — ce module est testable en isolation.
//
// Résout :
//   - FATAL ERROR: v8::ToLocalChecked Empty MaybeLocal (chaîne JS > ~256 Mo)
//   - absence de timeout (un marchand muet bloquait tout le run)
//   - téléchargement intégral alors qu'on ne garde que `limit` lignes

import { Readable } from 'node:stream';
import { StringDecoder } from 'node:string_decoder';
import zlib from 'node:zlib';

const DEFAULT_TIMEOUT_MS = 90_000;    // délai pour obtenir la réponse
const DEFAULT_STREAM_MS = 300_000;    // délai global de lecture du corps
const RETRYABLE = new Set([408, 425, 429, 500, 502, 503, 504]);

const sleep = ms => new Promise(r => setTimeout(r, ms));

/** Parse une ligne CSV (RFC 4180 : guillemets, séparateurs internes, "" échappé). */
export function parseCSVLine(line, sep) {
  const out = [];
  let field = '', inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQuotes && line[i + 1] === '"') { field += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (c === sep && !inQuotes) {
      out.push(field); field = '';
    } else {
      field += c;
    }
  }
  out.push(field);
  return out;
}

/** Devine l'encodage à partir des premiers octets décompressés. */
function sniffEncoding(chunk) {
  const head = chunk.subarray(0, 2048).toString('latin1');
  if (/charset\s*=\s*["']?(iso-8859|windows-1252)/i.test(head)) return 'latin1';
  if (/encoding\s*=\s*["'](iso-8859|windows-1252)/i.test(head)) return 'latin1';
  if (/charset\s*=\s*["']?utf-?8/i.test(head)) return 'utf8';

  // Pas de déclaration : on teste un décodage UTF-8 et on compte les
  // caractères de remplacement. Seuil haut car une coupure de chunk en
  // plein caractère multi-octets en produit légitimement quelques-uns.
  const asUtf8 = chunk.subarray(0, 65536).toString('utf8');
  const bad = (asUtf8.match(/\uFFFD/g) || []).length;
  return bad > 5 ? 'latin1' : 'utf8';
}

/** fetch avec timeout et retry sur erreurs transitoires. */
async function fetchWithRetry(url, { timeoutMs, retries, label }) {
  let lastErr = null;

  for (let attempt = 1; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timer);

      if (res.ok) return res;

      // 4xx définitif (hors 408/425/429) : inutile de réessayer
      if (!RETRYABLE.has(res.status)) {
        const err = new Error('HTTP ' + res.status);
        err.status = res.status;
        err.permanent = true;
        throw err;
      }

      lastErr = new Error('HTTP ' + res.status);
      lastErr.status = res.status;
      res.body?.cancel?.();
    } catch (e) {
      clearTimeout(timer);
      if (e.permanent) throw e;
      lastErr = e.name === 'AbortError' ? new Error('timeout ' + timeoutMs + 'ms') : e;
    }

    if (attempt < retries) {
      const wait = 2000 * Math.pow(2, attempt - 1);   // 2s, 4s, 8s…
      console.log('     ↻ ' + label + ' : ' + lastErr.message + ' — nouvelle tentative dans ' + (wait / 1000) + 's');
      await sleep(wait);
    }
  }
  throw lastErr;
}

/**
 * Lit un flux distant en streaming.
 *
 * @param {string} url
 * @param {object} opts
 * @param {string} opts.label        nom du flux (logs)
 * @param {number} [opts.timeoutMs]  délai d'obtention de la réponse
 * @param {number} [opts.streamMs]   délai global de lecture du corps
 * @param {number} [opts.retries]    tentatives (défaut 3)
 * @param {string} [opts.sep]        force le séparateur CSV (sinon auto : ; , |)
 * @param {(h:string)=>string} [opts.normalizeHeader]  transformation des en-têtes
 * @param {(headers:string[], sep:string)=>void} [opts.onHeaders]  CSV uniquement
 * @param {(rec:object|string)=>boolean} opts.onRecord
 *        CSV → objet indexé par en-tête minuscule ; XML → chaîne brute de l'item.
 *        Retourner false interrompt la lecture (connexion coupée).
 * @returns {Promise<{format:string, encoding:string, bytes:number, records:number, stopped:boolean}>}
 */
export async function streamFeed(url, opts) {
  const {
    label = 'flux',
    timeoutMs = DEFAULT_TIMEOUT_MS,
    streamMs = DEFAULT_STREAM_MS,
    retries = 3,
    sep: forcedSep = null,
    normalizeHeader = h => h.trim().replace(/^"|"$/g, '').toLowerCase(),
    onHeaders,
    onRecord,
  } = opts;

  const res = await fetchWithRetry(url, { timeoutMs, retries, label });
  if (!res.body) throw new Error('corps de réponse vide');

  const reader = res.body.getReader();

  // Premier chunk : sert à détecter gzip puis l'encodage.
  const first = await reader.read();
  if (first.done || !first.value?.length) {
    reader.cancel().catch(() => {});
    return { format: 'empty', encoding: 'utf8', bytes: 0, records: 0, stopped: false };
  }
  const firstChunk = Buffer.from(first.value);
  const isGzip = firstChunk[0] === 0x1f && firstChunk[1] === 0x8b;

  let bytes = 0;
  const source = Readable.from((async function* () {
    bytes += firstChunk.length;
    yield firstChunk;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.length;
      yield Buffer.from(value);
    }
  })());

  const stream = isGzip ? source.pipe(zlib.createGunzip()) : source;

  const deadline = setTimeout(() => {
    console.log('     ⏱ ' + label + ' : lecture interrompue après ' + (streamMs / 1000) + 's');
    stream.destroy();
  }, streamMs);

  let encoding = null, decoder = null;
  let format = null;          // 'csv' | 'xml'
  let buf = '';
  let headers = null, sep = ',';
  let xmlTag = null, xmlRe = null;
  let records = 0, stopped = false;

  const finish = () => {
    stopped = true;
    stream.destroy();
    reader.cancel().catch(() => {});
  };

  try {
    for await (const chunk of stream) {
      if (!decoder) {
        encoding = sniffEncoding(chunk);
        decoder = new StringDecoder(encoding);
      }
      buf += decoder.write(chunk);

      // ── Détection du format sur les premiers octets ──
      if (!format && buf.length > 200) {
        format = buf.trimStart().startsWith('<') ? 'xml' : 'csv';
      }
      if (!format) continue;

      if (format === 'xml') {
        if (!xmlTag) {
          const m = buf.match(/<(item|product|offer|annonce|article|produit)[\s>]/i);
          if (!m) {
            // Balise produit pas encore visible : on laisse le buffer grossir,
            // avec un garde-fou pour ne pas accumuler indéfiniment.
            if (buf.length > 2_000_000) { finish(); break; }
            continue;
          }
          xmlTag = m[1];
          const safe = xmlTag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          xmlRe = new RegExp('<' + safe + '[^>]*>[\\s\\S]*?<\\/' + safe + '>', 'i');
        }

        // Extrait tous les items complets présents, puis tronque le buffer :
        // on ne réanalyse jamais ce qui a déjà été consommé.
        let m;
        while ((m = buf.match(xmlRe)) !== null) {
          records++;
          const keepGoing = onRecord(m[0]);
          buf = buf.slice(m.index + m[0].length);
          if (keepGoing === false) { finish(); break; }
        }
        if (stopped) break;

      } else {
        // ── CSV : on ne traite que les lignes complètes, le reliquat attend ──
        let nl;
        while ((nl = buf.indexOf('\n')) !== -1) {
          const line = buf.slice(0, nl).replace(/\r$/, '');
          buf = buf.slice(nl + 1);
          if (!line.trim()) continue;

          if (!headers) {
            const hdrLine = line.replace(/^\uFEFF/, '');   // BOM éventuel
            sep = forcedSep && forcedSep !== 'none'
              ? forcedSep
              : (hdrLine.includes('|') ? '|' : hdrLine.includes(';') ? ';' : ',');
            headers = parseCSVLine(hdrLine, sep).map(normalizeHeader);
            onHeaders?.(headers, sep);
            continue;
          }

          const vals = parseCSVLine(line, sep);
          const rec = {};
          for (let i = 0; i < headers.length; i++) {
            rec[headers[i]] = (vals[i] || '').replace(/^"|"$/g, '').trim();
          }
          records++;
          if (onRecord(rec) === false) { finish(); break; }
        }
        if (stopped) break;
      }
    }

    // Reliquat sans saut de ligne final
    if (!stopped && format === 'csv' && headers && buf.trim()) {
      const vals = parseCSVLine(buf.replace(/\r$/, ''), sep);
      const rec = {};
      for (let i = 0; i < headers.length; i++) {
        rec[headers[i]] = (vals[i] || '').replace(/^"|"$/g, '').trim();
      }
      records++;
      onRecord(rec);
    }
  } catch (e) {
    // destroy() volontaire après atteinte de la limite → pas une erreur
    if (!stopped && e.code !== 'ERR_STREAM_PREMATURE_CLOSE') throw e;
  } finally {
    clearTimeout(deadline);
  }

  return { format: format || 'empty', encoding: encoding || 'utf8', bytes, records, stopped };
}
