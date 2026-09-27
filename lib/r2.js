'use strict';

// Cloudflare R2 (S3 API): cache titulků, metadata detailů, historie, vlastní titulky, záloha.

const {
  S3Client, GetObjectCommand, PutObjectCommand, ListObjectsV2Command, DeleteObjectCommand, HeadObjectCommand,
} = require('@aws-sdk/client-s3');

const BUCKET = process.env.R2_BUCKET;
const enabled = !!(process.env.R2_ENDPOINT && process.env.R2_ACCESS_KEY_ID && process.env.R2_SECRET_ACCESS_KEY && BUCKET);

const s3 = enabled
  ? new S3Client({
      region: 'auto',
      endpoint: process.env.R2_ENDPOINT,
      forcePathStyle: process.env.R2_FORCE_PATH_STYLE === '1',
      credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY },
    })
  : null;

console.log(enabled ? `[R2] Zapnuto (bucket: ${BUCKET})` : '[R2] Vypnuto (chybí env proměnné)');

// Metadata jdou do HTTP hlaviček → jen ASCII. Kódujeme přes encodeURIComponent.
function encMeta(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj || {})) if (v != null) out[k] = encodeURIComponent(String(v));
  return out;
}
function decMeta(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj || {})) {
    try { out[k] = decodeURIComponent(v); } catch { out[k] = v; }
  }
  return out;
}

function isNotFound(e) {
  return e && (e.name === 'NoSuchKey' || e.name === 'NotFound' || e.$metadata?.httpStatusCode === 404);
}

async function bodyToBuffer(body) {
  const chunks = [];
  for await (const c of body) chunks.push(c);
  return Buffer.concat(chunks);
}

async function getObject(key) {
  if (!s3) return null;
  try {
    const res = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
    return { body: await bodyToBuffer(res.Body), meta: decMeta(res.Metadata), contentType: res.ContentType };
  } catch (e) {
    if (!isNotFound(e)) console.log(`[R2] Get ${key}: ${e.message}`);
    return null;
  }
}

async function headObject(key) {
  if (!s3) return null;
  try {
    const res = await s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key }));
    return { meta: decMeta(res.Metadata), size: res.ContentLength };
  } catch (e) {
    if (!isNotFound(e)) console.log(`[R2] Head ${key}: ${e.message}`);
    return null;
  }
}

async function putObject(key, body, contentType, meta) {
  if (!s3) return false;
  try {
    await s3.send(new PutObjectCommand({ Bucket: BUCKET, Key: key, Body: body, ContentType: contentType, Metadata: encMeta(meta) }));
    return true;
  } catch (e) {
    console.log(`[R2] Put ${key}: ${e.message}`);
    return false;
  }
}

async function deleteObject(key) {
  if (!s3) return false;
  try {
    await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
    return true;
  } catch (e) {
    console.log(`[R2] Delete ${key}: ${e.message}`);
    return false;
  }
}

async function listKeys(prefix) {
  if (!s3) return [];
  const out = [];
  let token;
  do {
    const res = await s3.send(new ListObjectsV2Command({ Bucket: BUCKET, Prefix: prefix, ContinuationToken: token }));
    for (const o of res.Contents || []) out.push({ key: o.Key, size: o.Size });
    token = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (token);
  return out;
}

// ── Cache stažených titulků (subs/<id>.srt nebo subs/<id>-S01E02.srt) ─

const cachedIds = new Set();

async function loadCacheIndex() {
  if (!s3) return;
  try {
    const keys = await listKeys('subs/');
    for (const { key } of keys) {
      const id = key.slice(5).replace(/\.srt$/, '');
      if (id) cachedIds.add(id);
    }
    console.log(`[R2] Index cache načten: ${cachedIds.size} titulků`);
  } catch (e) {
    console.log(`[R2] Chyba načtení indexu: ${e.message}`);
  }
}

function isCached(cacheId) {
  return cachedIds.has(String(cacheId));
}

async function getSub(cacheId) {
  const o = await getObject(`subs/${cacheId}.srt`);
  if (!o) return null;
  cachedIds.add(String(cacheId));
  return { content: o.body.toString('utf8'), filename: o.meta.filename || `${cacheId}.srt` };
}

async function putSub(cacheId, content, filename) {
  const ok = await putObject(`subs/${cacheId}.srt`, content, 'text/plain; charset=utf-8', { filename });
  if (ok) cachedIds.add(String(cacheId));
  return ok;
}

// ── Metadata z detailu titulku (meta/<id>.json) ────────────────

async function getMeta(subId) {
  const o = await getObject(`meta/${subId}.json`);
  if (!o) return null;
  try { return JSON.parse(o.body.toString('utf8')); } catch { return null; }
}

async function putMeta(subId, meta) {
  return putObject(`meta/${subId}.json`, JSON.stringify(meta), 'application/json');
}

// ── Historie přehrávání (history/<user>.json), zápis se sdružuje ─

const HISTORY_FLUSH_MS = 2 * 60 * 1000;
const historyState = new Map(); // user → { items, loaded, dirty, timer }

function historyKey(username) {
  const u = String(username);
  // Stejný klíč jako ve staré verzi (historie zůstane zachovaná)
  return `history/${/^[A-Za-z0-9._-]{1,64}$/.test(u) ? u : encodeURIComponent(u)}.json`;
}

async function loadHistory(username) {
  let st = historyState.get(username);
  if (st && st.loaded) return st;
  if (!st) { st = { items: [], loaded: false, dirty: false, timer: null }; historyState.set(username, st); }
  const o = await getObject(historyKey(username));
  let stored = [];
  if (o) { try { stored = JSON.parse(o.body.toString('utf8')); } catch { stored = []; } }
  // Sloučit s tím, co přibylo v paměti před načtením
  const seen = new Set(st.items.map(i => i.id));
  st.items = [...st.items, ...stored.filter(i => i && !seen.has(i.id))].slice(0, 10);
  st.loaded = true;
  return st;
}

async function getHistory(username) {
  if (!s3) return [];
  return (await loadHistory(username)).items;
}

function addToHistory(username, item) {
  if (!s3) return;
  let st = historyState.get(username);
  if (!st) { st = { items: [], loaded: false, dirty: false, timer: null }; historyState.set(username, st); }
  st.items = [item, ...st.items.filter(i => i.id !== item.id)].slice(0, 10);
  st.dirty = true;
  if (!st.timer) {
    st.timer = setTimeout(() => flushHistory(username).catch(() => {}), HISTORY_FLUSH_MS);
    st.timer.unref?.();
  }
}

async function flushHistory(username) {
  const st = historyState.get(username);
  if (!st) return;
  st.timer = null;
  if (!st.dirty) return;
  await loadHistory(username);
  st.dirty = false;
  await putObject(historyKey(username), JSON.stringify(st.items), 'application/json');
}

async function flushAllHistory() {
  await Promise.all([...historyState.keys()].map(u => flushHistory(u).catch(() => {})));
}

// ── Vlastní titulky (custom/<videoId>/<soubor>) ───────────────

const customCache = new Map(); // videoId → { time, subs }
const CUSTOM_TTL = 60 * 1000;

async function listCustomSubs(videoId) {
  if (!s3) return [];
  const c = customCache.get(videoId);
  if (c && Date.now() - c.time < CUSTOM_TTL) return c.subs;
  let subs = [];
  try {
    const keys = (await listKeys(`custom/${videoId}/`)).filter(k => /\.(srt|ssa|ass|sub|vtt)$/i.test(k.key));
    subs = await Promise.all(keys.map(async ({ key }) => {
      const h = await headObject(key);
      const filename = key.split('/').pop();
      const m = (h && h.meta) || {};
      return {
        key,
        filename,
        label: m.label || filename.replace(/\.(srt|ssa|ass|sub|vtt)$/i, ''),
        lang: m.lang || 'cze',
        uploader: m.uploader || 'unknown',
      };
    }));
  } catch (e) {
    console.log(`[R2] Seznam vlastních titulků: ${e.message}`);
  }
  customCache.set(videoId, { time: Date.now(), subs });
  return subs;
}

async function putCustomSub(videoId, filename, content, meta) {
  const ext = filename.split('.').pop().toLowerCase();
  const ct = (ext === 'vtt' ? 'text/vtt' : 'text/plain') + '; charset=utf-8';
  const ok = await putObject(`custom/${videoId}/${filename}`, content, ct, meta);
  customCache.delete(videoId);
  return ok;
}

function clearCustomCache() {
  customCache.clear();
}

async function deleteCustomSub(key) {
  const ok = await deleteObject(key);
  customCache.delete(key.split('/')[1]);
  return ok;
}

module.exports = {
  enabled, s3, BUCKET,
  getObject, headObject, putObject, deleteObject, listKeys, encMeta, decMeta,
  loadCacheIndex, isCached, getSub, putSub, cachedIds,
  getMeta, putMeta,
  getHistory, addToHistory, flushAllHistory,
  listCustomSubs, putCustomSub, deleteCustomSub, clearCustomCache,
};
