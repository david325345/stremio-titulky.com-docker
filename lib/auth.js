'use strict';

// Šifrovaný a podepsaný config v URL addonu (AES-256-GCM).
// Config vyrábí VÝHRADNĚ server po úspěšném přihlášení na Titulky.com,
// takže uživatelské jméno v něm je ověřené a nejde podvrhnout.

const crypto = require('crypto');

const VERSION = 'v2';
let key = null;

function init() {
  let secret = process.env.CONFIG_SECRET || '';
  if (secret.length < 32) {
    secret = crypto.randomBytes(32).toString('hex');
    console.warn('================================================================');
    console.warn('[Auth] CONFIG_SECRET chybí nebo je kratší než 32 znaků!');
    console.warn('[Auth] Používám náhodný klíč – po restartu přestanou fungovat');
    console.warn('[Auth] všechny nainstalované addony. Nastav CONFIG_SECRET v env.');
    console.warn('================================================================');
  }
  key = crypto.createHash('sha256').update(secret).digest();
}

function encryptConfig(obj) {
  if (!key) init();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const data = Buffer.concat([cipher.update(JSON.stringify(obj), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return VERSION + Buffer.concat([iv, tag, data]).toString('base64url');
}

function decryptConfig(str) {
  if (!key) init();
  if (typeof str !== 'string' || !str.startsWith(VERSION) || str.length > 4096) return null;
  try {
    const buf = Buffer.from(str.slice(VERSION.length), 'base64url');
    if (buf.length < 29) return null;
    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const data = buf.subarray(28);
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    const json = Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
    const obj = JSON.parse(json);
    if (!obj || typeof obj.u !== 'string' || typeof obj.p !== 'string') return null;
    return obj;
  } catch {
    return null;
  }
}

// ── Admini ──────────────────────────────────────────────────────
// Bezpečné až díky šifrovanému configu: jméno v něm ověřil login na Titulky.com.
let adminSet = null;
function isAdmin(username) {
  if (!adminSet) {
    adminSet = new Set(
      (process.env.ADMIN_USERS || '').toLowerCase().split(',').map(s => s.trim()).filter(Boolean)
    );
  }
  return !!username && adminSet.has(String(username).toLowerCase());
}

// Krátký otisk hesla (pro klíč cache klientů) – nikdy se neloguje.
function passwordFingerprint(password) {
  return crypto.createHash('sha256').update(String(password)).digest('hex').slice(0, 16);
}

module.exports = { init, encryptConfig, decryptConfig, isAdmin, passwordFingerprint };
