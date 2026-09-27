'use strict';

// Automatická detekce přehrávače podle hlaviček požadavku na /subtitles.
// Pravidla jsou zatím opatrná – přesné User-Agenty Stremia a Nuvia se sbírají
// do tabulky (admin → Přehrávače) a podle skutečných dat se doladí.

const PROFILES = ['stremio', 'nuvio', 'omni'];

const RULES = [
  { profile: 'nuvio', test: (ua, origin) => /nuvio/i.test(ua) || /nuvio/i.test(origin) },
  { profile: 'omni', test: ua => /\bomni\b/i.test(ua) },
  { profile: 'stremio', test: (ua, origin) => /stremio/i.test(origin) || /stremio/i.test(ua) },
];

// Posbírané klienty (jen v paměti, max 200 záznamů)
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
function detectProfile(req, config) {
  const ua = String(req.get('user-agent') || '');
  const origin = String(req.get('origin') || req.get('referer') || '');
  let profile = null;
  let how = 'auto';
  if (config && PROFILES.includes(config.c)) {
    profile = config.c;
    how = 'ruční';
  } else {
    const rule = RULES.find(r => r.test(ua, origin));
    profile = rule ? rule.profile : 'stremio';
    how = rule ? 'auto' : 'výchozí';
  }
  record(ua, origin, `${profile} (${how})`);
  return { profile, how };
}

function listSeen() {
  return [...seen.values()].sort((a, b) => b.last - a.last);
}

module.exports = { detectProfile, listSeen, PROFILES };
