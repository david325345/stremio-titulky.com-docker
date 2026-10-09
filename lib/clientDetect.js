'use strict';

// Automatická detekce přehrávače podle hlaviček požadavku na /subtitles.
//
// Zjištěno z logů (29. 9. 2026):
//  • Stremio Web: Origin/Referer web.stremio.com (User-Agent je obyčejný prohlížeč)
//  • NuvioTV (Apple TV): manifest chodí s UA „NuvioTV/70 CFNetwork/… Darwin/…",
//    ALE dotaz na titulky s UA „Mozilla/5.0 (AppleTV; tvOS 18.0) AppleWebKit/…"
//  • Nuvio Android TV: UA „Nuvio/<verze>" (OkHttp interceptor v NetworkModule.kt)
//  • Nuvio iPhone (NuvioMobile): UA „ktor-client" (9. 10. 2026)
//
// Pořadí: ruční volba v konfiguraci → pravidla podle hlaviček → podle toho, kdo
// nedávno ze stejné IP a se stejným configem stáhl manifest → výchozí Stremio.

const crypto = require('crypto');

const PROFILES = ['stremio', 'nuvio', 'omni'];

const RULES = [
  { profile: 'nuvio', how: 'auto', test: (ua, origin) => /nuvio/i.test(ua) || /nuvio/i.test(origin) },
  { profile: 'omni', how: 'auto', test: ua => /\bomni\b/i.test(ua) },
  // Nuvio na iPhonu / Android telefonu (NuvioMobile, Kotlin Multiplatform → výchozí UA Ktoru)
  { profile: 'nuvio', how: 'auto mobil', test: ua => /^ktor-client/i.test(ua) },
  // Stremio nemá aplikaci pro tvOS → Apple TV = NuvioTV (Omni jen ruční volbou)
  { profile: 'nuvio', how: 'auto tvOS', test: ua => /AppleTV|tvOS/i.test(ua) },
  { profile: 'stremio', how: 'auto', test: (ua, origin) => /stremio/i.test(origin) || /stremio/i.test(ua) },
];

function headersOf(req) {
  return {
    ua: String(req.get('user-agent') || ''),
    origin: String(req.get('origin') || req.get('referer') || ''),
  };
}

function matchRule(ua, origin) {
  return RULES.find(r => r.test(ua, origin)) || null;
}

// ── Kdo stáhl manifest (config + IP → profil), platí 12 h ──────────
const MANIFEST_TTL = 12 * 60 * 60 * 1000;
const manifestSeen = new Map();

function manifestKey(configStr, ip) {
  const h = crypto.createHash('sha256').update(String(configStr)).digest('hex').slice(0, 16);
  return `${h}|${ip}`;
}

// Volá se z /:config/manifest.json (jen s platným configem)
function noteManifest(req, configStr) {
  const { ua, origin } = headersOf(req);
  const rule = matchRule(ua, origin);
  if (!rule || rule.profile === 'stremio') return; // pamatujeme jen jednoznačné ne-Stremio klienty
  manifestSeen.set(manifestKey(configStr, req.ip), { profile: rule.profile, ua: ua.slice(0, 80), t: Date.now() });
  if (manifestSeen.size > 5000) {
    const now = Date.now();
    for (const [k, v] of manifestSeen) if (now - v.t > MANIFEST_TTL) manifestSeen.delete(k);
    if (manifestSeen.size > 5000) manifestSeen.clear();
  }
}

// ── Posbírané klienty pro admin tabulku (jen v paměti, max 200) ────
const seen = new Map();

function record(ua, origin, detected) {
  const key = `${ua}|${origin}`.slice(0, 300);
  const e = seen.get(key) || { ua: ua.slice(0, 250), origin: origin.slice(0, 100), count: 0, first: Date.now(), last: 0, detected };
  e.count++;
  e.last = Date.now();
  e.detected = detected;
  seen.set(key, e);
  if (seen.size > 200) {
    const oldest = [...seen.entries()].sort((a, b) => a[1].last - b[1].last)[0];
    seen.delete(oldest[0]);
  }
}

// config.c = 'auto' | 'stremio' | 'nuvio' | 'omni'
function detectProfile(req, config, configStr) {
  const { ua, origin } = headersOf(req);
  let profile;
  let how;
  if (config && PROFILES.includes(config.c)) {
    profile = config.c;
    how = 'ruční';
  } else {
    const rule = matchRule(ua, origin);
    if (rule) {
      profile = rule.profile;
      how = rule.how;
    } else {
      const m = configStr ? manifestSeen.get(manifestKey(configStr, req.ip)) : null;
      if (m && Date.now() - m.t < MANIFEST_TTL) {
        profile = m.profile;
        how = `podle manifestu: ${m.ua}`;
      } else {
        profile = 'stremio';
        how = 'výchozí';
      }
    }
  }
  record(ua, origin, `${profile} (${how})`);
  return { profile, how };
}

function listSeen() {
  return [...seen.values()].sort((a, b) => b.last - a.last);
}

module.exports = { detectProfile, noteManifest, listSeen, PROFILES };
