'use strict';

// Nastavení uživatelů (jazyky, nepublikované titulky, katalog, přehrávač).
// Primárně na disku (DATA_DIR, v Coolify trvalé úložiště na /app/data), záloha na R2.
// Klíč = uživatelské jméno (malými písmeny) – jméno v configu ověřil login na Titulky.com.

const fs = require('fs');
const path = require('path');
const r2 = require('./r2');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const FILE = path.join(DATA_DIR, 'settings.json');
const R2_KEY = 'settings/settings.json';
const R2_DELAY = 5000;

const CLIENTS = ['auto', 'stremio', 'nuvio', 'omni'];
const LANGS = ['cze', 'slk'];
const DEFAULTS = Object.freeze({ langs: ['cze', 'slk'], unpublished: true, catalog: true, client: 'auto' });

let all = {};
let diskOk = true;
let r2Timer = null;
let loaded = false;

function key(user) {
  return String(user || '').trim().toLowerCase();
}

// Vyčištění vstupu (z webu) – jen povolené hodnoty
function sanitize(input, base = DEFAULTS) {
  const o = input && typeof input === 'object' ? input : {};
  let langs = Array.isArray(o.langs) ? o.langs.filter(l => LANGS.includes(l)) : base.langs;
  langs = [...new Set(langs)];
  if (!langs.length) langs = [...DEFAULTS.langs];
  return {
    langs,
    unpublished: typeof o.unpublished === 'boolean' ? o.unpublished : base.unpublished,
    catalog: typeof o.catalog === 'boolean' ? o.catalog : base.catalog,
    client: CLIENTS.includes(o.client) ? o.client : base.client,
  };
}

function writeDisk() {
  if (!diskOk) return;
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const tmp = `${FILE}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(all));
    fs.renameSync(tmp, FILE);
  } catch (e) {
    diskOk = false;
    console.log(`[Nastavení] Nejde zapisovat na disk (${DATA_DIR}): ${e.message} – ukládám jen na R2`);
  }
}

function scheduleR2() {
  if (!r2.enabled) return;
  clearTimeout(r2Timer);
  r2Timer = setTimeout(() => {
    r2Timer = null;
    r2.putObject(R2_KEY, JSON.stringify(all), 'application/json').catch(() => {});
  }, R2_DELAY);
  r2Timer.unref?.();
}

async function load() {
  try {
    all = JSON.parse(fs.readFileSync(FILE, 'utf8')) || {};
    console.log(`[Nastavení] Načteno z disku: ${Object.keys(all).length} uživatelů`);
  } catch (e) {
    if (e.code !== 'ENOENT') console.log(`[Nastavení] Soubor na disku nejde přečíst: ${e.message}`);
    const o = await r2.getObject(R2_KEY);
    if (o) {
      try {
        all = JSON.parse(o.body.toString('utf8')) || {};
        console.log(`[Nastavení] Disk prázdný → obnoveno ze zálohy na R2: ${Object.keys(all).length} uživatelů`);
        writeDisk();
      } catch { all = {}; }
    }
  }
  loaded = true;
}

// Nastavení uživatele; legacy = volby ze starého configu (c = přehrávač, k = katalog)
function get(user, legacy = null) {
  const s = all[key(user)];
  if (s) return sanitize(s);
  const base = { ...DEFAULTS };
  if (legacy) {
    if (CLIENTS.includes(legacy.c)) base.client = legacy.c;
    if (legacy.k === 0) base.catalog = false;
  }
  return base;
}

function save(user, input) {
  const s = sanitize(input, get(user));
  all[key(user)] = { ...s, updated: Date.now() };
  writeDisk();
  scheduleR2();
  return s;
}

async function flush() {
  if (!r2Timer || !r2.enabled) return;
  clearTimeout(r2Timer);
  r2Timer = null;
  await r2.putObject(R2_KEY, JSON.stringify(all), 'application/json');
}

module.exports = { load, get, save, flush, sanitize, DEFAULTS, isLoaded: () => loaded };
