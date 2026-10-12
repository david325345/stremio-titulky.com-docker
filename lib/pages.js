'use strict';

// HTML stránky: konfigurace a dashboard. Všechna data do stránek jdou buď escapovaná,
// nebo jako JSON v <script type="application/json"> a vykreslují se přes textContent.

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function jsonForScript(obj) {
  return JSON.stringify(obj).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
}

const BASE_CSS = `
  :root {
    --bg: #0c0e14; --surface: #151821; --surface-2: #1c2030; --border: #2a2e40;
    --accent: #4f8cff; --accent-hover: #6ba0ff; --accent-glow: rgba(79,140,255,0.15);
    --text: #e4e7f0; --text-dim: #8891a8; --danger: #ff5c5c; --success: #4fdb8a; --radius: 12px;
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'DM Sans', sans-serif; background: var(--bg); color: var(--text); min-height: 100vh; }
  .subtitle { color: var(--text-dim); font-size: 14px; line-height: 1.5; }
  label { display: block; font-size: 13px; font-weight: 600; color: var(--text-dim); margin-bottom: 6px; }
  input[type="text"], input[type="password"], select {
    width: 100%; padding: 12px 16px; background: var(--surface-2); border: 1px solid var(--border);
    border-radius: var(--radius); color: var(--text); font-family: inherit; font-size: 14px; outline: none;
  }
  input:focus, select:focus { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-glow); }
  .btn {
    width: 100%; padding: 14px; border: none; border-radius: var(--radius); font-family: inherit;
    font-size: 15px; font-weight: 600; cursor: pointer; transition: all 0.2s;
    display: flex; align-items: center; justify-content: center; gap: 8px; text-decoration: none;
  }
  .btn-primary { background: var(--accent); color: #fff; }
  .btn-primary:hover { background: var(--accent-hover); }
  .btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
  .btn-install { background: var(--success); color: #0c0e14; margin-top: 12px; }
  .btn-secondary { background: var(--surface-2); border: 1px solid var(--border); color: var(--text); margin-top: 8px; }
  .btn-secondary:hover { border-color: var(--accent); }
  .status { text-align: center; font-size: 14px; margin-top: 16px; min-height: 20px; }
  .status.error { color: var(--danger); }
  .status.ok { color: var(--success); }
`;

const FONTS = `<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">`;

// ── Konfigurace ─────────────────────────────────────────────────

const LOGO_URL = 'https://raw.githubusercontent.com/david325345/stremio-titulky.com-docker/main/public/logo.png';

function configurePage({ dashboard = false } = {}) {
  return `<!DOCTYPE html>
<html lang="cs">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Titulky.com – addon pro Stremio a Nuvio</title>
<link rel="icon" href="${LOGO_URL}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible:ital,wght@0,400;0,700;1,400&display=swap" rel="stylesheet">
<style>
  :root {
    --ink: #0a1230; --panel: #111c42; --panel-2: #172453; --line: #26366c;
    --blue: #2b6cff; --blue-hi: #5a8dff; --caption: #ffe27a;
    --text: #eef2ff; --dim: #9fadd6; --ok: #5be3a0; --bad: #ff7a7a;
    --r-lg: 22px; --r: 12px;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Atkinson Hyperlegible', system-ui, sans-serif; background: var(--ink); color: var(--text);
    font-size: 16px; line-height: 1.5; min-height: 100vh; padding: 32px 16px 56px; }
  a { color: var(--blue-hi); }
  .wrap { max-width: 880px; margin: 0 auto; }

  /* Plátno s titulky – jediný výrazný prvek stránky */
  .screen { position: relative; border-radius: var(--r-lg); overflow: hidden; aspect-ratio: 16 / 5; min-height: 210px;
    background: radial-gradient(120% 140% at 70% 0%, #1b3a8f 0%, #0d1a46 45%, #050a1e 100%);
    border: 1px solid var(--line); display: flex; flex-direction: column; justify-content: space-between; padding: 22px 26px; }
  .screen::after { content: ''; position: absolute; inset: 0; pointer-events: none;
    background: repeating-linear-gradient(0deg, rgba(255,255,255,0.015) 0 2px, transparent 2px 4px); }
  .brand { display: flex; align-items: center; gap: 14px; position: relative; z-index: 1; }
  .brand img { width: 52px; height: 52px; border-radius: 13px; }
  .brand b { font-size: 22px; display: block; line-height: 1.15; }
  .brand span { font-size: 14px; color: var(--dim); }
  .account { margin-left: auto; text-align: right; font-size: 14px; color: var(--dim); display: none; }
  .account b { font-size: 15px; color: var(--text); display: block; }
  .account button { display: block; margin-left: auto; }
  .account button { background: none; border: 0; color: var(--dim); font: inherit; font-size: 13px; text-decoration: underline;
    text-underline-offset: 3px; cursor: pointer; margin-top: 2px; }
  .account button:hover { color: var(--text); }
  .caption { position: relative; z-index: 1; text-align: center; font-weight: 700; font-size: clamp(19px, 3.1vw, 28px); line-height: 1.35;
    color: var(--caption); text-shadow: 0 0 2px #000, 0 2px 0 #000, 0 -1px 0 #000, 1px 0 0 #000, -1px 0 0 #000, 0 3px 12px rgba(0,0,0,.7);
    max-width: 30ch; margin: 0 auto; min-height: 2.7em; display: flex; align-items: flex-end; justify-content: center; }
  .caption span { animation: sub .5s ease-out both; }
  @keyframes sub { from { opacity: 0; } to { opacity: 1; } }
  @media (prefers-reduced-motion: reduce) { .caption span { animation: none; } }

  main { margin-top: 28px; }
  h2 { font-size: 20px; margin-bottom: 4px; }
  .lead { color: var(--dim); margin-bottom: 20px; max-width: 60ch; }

  /* Přihlášení */
  .login { max-width: 440px; margin: 0 auto; }
  .vip { background: rgba(255,226,122,0.08); border: 1px solid rgba(255,226,122,0.3); border-radius: var(--r); padding: 12px 14px;
    font-size: 14px; color: #f3e6b4; margin-bottom: 22px; }
  .vip a { color: var(--caption); }
  label.f { display: block; font-size: 14px; font-weight: 700; margin-bottom: 6px; }
  .field { margin-bottom: 16px; }
  input[type=text], input[type=password], select { width: 100%; padding: 12px 14px; font: inherit; color: var(--text);
    background: var(--panel-2); border: 1px solid var(--line); border-radius: var(--r); outline: none; }
  input:focus-visible, select:focus-visible { border-color: var(--blue-hi); box-shadow: 0 0 0 3px rgba(90,141,255,.3); }
  details.more { margin: 2px 0 18px; font-size: 14px; color: var(--dim); }
  details.more summary { cursor: pointer; width: max-content; }
  details.more .field { margin-top: 12px; }
  .hint { font-size: 13px; color: var(--dim); margin-top: 6px; }

  .logout { display: block; margin: 18px auto 0; background: none; border: 0; color: var(--dim); font: inherit; font-size: 14px;
    text-decoration: underline; text-underline-offset: 3px; cursor: pointer; }
  .logout:hover { color: var(--text); }
  .btn { text-align: center; display: flex; align-items: center; justify-content: center; gap: 10px; width: 100%; padding: 13px 16px; border-radius: var(--r);
    font: inherit; font-weight: 700; font-size: 16px; text-decoration: none; cursor: pointer; border: 1px solid transparent; }
  .btn:focus-visible, .chip:focus-visible, .switch-row input:focus-visible + .sw, button:focus-visible { outline: 3px solid var(--caption); outline-offset: 2px; }
  .btn-main { background: var(--blue); color: #fff; }
  .btn-main:hover { background: var(--blue-hi); }
  .btn-main:disabled { opacity: .55; cursor: progress; }
  .btn-line { background: transparent; color: var(--text); border-color: var(--line); }
  .btn-line:hover { border-color: var(--blue-hi); }
  .btn + .btn { margin-top: 10px; }
  .msg { min-height: 22px; margin-top: 12px; font-size: 14px; }
  .msg.bad { color: var(--bad); }
  .msg.ok { color: var(--ok); }

  /* Po přihlášení */
  .grid { display: grid; grid-template-columns: 1.1fr 1fr; gap: 22px; align-items: start; }
  .panel { background: var(--panel); border: 1px solid var(--line); border-radius: var(--r-lg); padding: 24px; }
  .group { padding: 16px 0; border-top: 1px solid var(--line); }
  .group:first-of-type { border-top: 0; padding-top: 6px; }
  .group > b { display: block; margin-bottom: 10px; }
  .chips { display: flex; gap: 10px; flex-wrap: wrap; }
  .chip { display: inline-flex; align-items: center; gap: 8px; padding: 9px 14px; border-radius: 999px; font: inherit; font-size: 15px;
    background: transparent; color: var(--dim); border: 1px solid var(--line); cursor: pointer; }
  .chip[aria-pressed=true] { background: var(--blue); border-color: var(--blue); color: #fff; }
  .switch-row { display: flex; align-items: flex-start; gap: 14px; cursor: pointer; }
  .switch-row input { position: absolute; opacity: 0; width: 1px; height: 1px; }
  .sw { flex: none; width: 44px; height: 26px; border-radius: 13px; background: var(--line); position: relative; margin-top: 1px; transition: background .15s; }
  .sw::after { content: ''; position: absolute; top: 3px; left: 3px; width: 20px; height: 20px; border-radius: 50%; background: #fff; transition: transform .15s; }
  .switch-row input:checked + .sw { background: var(--blue); }
  .switch-row input:checked + .sw::after { transform: translateX(18px); }
  .switch-row b { display: block; }
  .switch-row small { display: block; color: var(--dim); font-size: 14px; }
  .save { margin-top: 18px; }

  .url { margin-top: 18px; }
  .url p { font-size: 14px; color: var(--dim); margin-bottom: 6px; }
  .url code { display: block; font-family: inherit; font-size: 13px; color: var(--dim); background: var(--panel-2); border: 1px solid var(--line);
    border-radius: var(--r); padding: 10px 12px; word-break: break-all; max-height: 92px; overflow: auto; user-select: all; }

  .legend { margin-top: 26px; display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 10px 22px; color: var(--dim); font-size: 14px; }
  .legend p { display: flex; gap: 10px; }
  .legend em { font-style: normal; color: var(--text); font-weight: 700; }
  footer { margin-top: 30px; text-align: center; font-size: 13px; color: var(--dim); }

  [hidden] { display: none !important; }
  @media (max-width: 760px) {
    .grid { grid-template-columns: 1fr; }
    .screen { aspect-ratio: auto; min-height: 240px; padding: 18px; }
    .account { display: none !important; }
  }
</style>
</head>
<body>
<div class="wrap">
  <header class="screen">
    <div class="brand">
      <img src="${LOGO_URL}" alt="" width="52" height="52">
      <div><b>Titulky.com</b><span>addon pro Stremio a Nuvio</span></div>
      <div class="account" id="account"><b id="accUser"></b><button type="button" id="logoutTop">Odhlásit</button></div>
    </div>
    <p class="caption" id="caption" aria-live="polite"><span>České a slovenské titulky přímo v přehrávači.</span></p>
  </header>

  <main>
    <!-- Přihlášení -->
    <section class="login" id="loginView">
      <h2>Přihlášení</h2>
      <p class="lead">Účet z Titulky.com. Titulky se hledají přesně podle IMDb a nejlépe sedící jsou nahoře.</p>
      <p class="vip">Addon potřebuje aktivní VIP (prémiový nebo překladatelský účet) na Titulky.com. <a href="https://premium.titulky.com/?Napoveda=1" target="_blank" rel="noopener">Co je premium</a></p>
      <form id="loginForm" novalidate>
        <div class="field"><label class="f" for="username">Uživatelské jméno</label><input type="text" id="username" autocomplete="username" required></div>
        <div class="field"><label class="f" for="password">Heslo</label><input type="password" id="password" autocomplete="current-password" required></div>
        <details class="more"><summary>Real-Debrid (jen pro Omni)</summary>
          <div class="field"><label class="f" for="rdToken">API klíč Real-Debridu</label><input type="text" id="rdToken" autocomplete="off" placeholder="real-debrid.com/apitoken">
          <p class="hint">Omni neposílá název souboru. Klíč pomůže titulky spárovat podle souboru z Real-Debridu.</p></div>
        </details>
        <button class="btn btn-main" id="loginBtn" type="submit">Přihlásit se</button>
        <p class="msg" id="loginMsg" role="status"></p>
      </form>
    </section>

    <!-- Po přihlášení -->
    <section id="appView" hidden>
      <div class="grid">
        <form class="panel" id="settingsForm">
          <h2>Nastavení</h2>
          <p class="lead">Změny platí hned, addon není potřeba přeinstalovat.</p>
          <div class="group">
            <b>Jazyk titulků</b>
            <div class="chips">
              <button type="button" class="chip" data-lang="cze" aria-pressed="true">🇨🇿 Čeština</button>
              <button type="button" class="chip" data-lang="slk" aria-pressed="true">🇸🇰 Slovenčina</button>
            </div>
          </div>
          <div class="group">
            <label class="switch-row"><input type="checkbox" id="unpublished"><span class="sw"></span>
              <span><b>Nepublikované titulky</b><small>Čerstvé titulky, které ještě nikdo na Titulky.com neschválil. V seznamu mají ⏳.</small></span></label>
          </div>
          <div class="group">
            <label class="switch-row"><input type="checkbox" id="catalog"><span class="sw"></span>
              <span><b>Katalog Nejnovější titulky</b><small>Filmy a seriály, ke kterým právě přibyly titulky. Obnovuje se ve 12:00 a v 18:00.</small></span></label>
          </div>
          <div class="group">
            <label class="f" for="client">Přehrávač</label>
            <select id="client">
              <option value="auto">Poznat automaticky</option>
              <option value="stremio">Stremio</option>
              <option value="nuvio">Nuvio / NuvioTV</option>
              <option value="omni">Omni (Apple TV)</option>
            </select>
            <p class="hint">Ruční volbu použijte, jen když se titulky v přehrávači zobrazují špatně.</p>
          </div>
          <button class="btn btn-main save" id="saveBtn" type="submit">Uložit nastavení</button>
          <p class="msg" id="saveMsg" role="status"></p>
        </form>

        <div class="panel">
          <h2>Instalace</h2>
          <p class="lead">Jednou nainstalovat, nastavení se pak mění tady.</p>
          <a class="btn btn-main" id="installLink" href="#">Nainstalovat do Stremia</a>
          <a class="btn btn-line" id="webInstallLink" href="#" target="_blank" rel="noopener">Nainstalovat přes Stremio Web</a>
          <button class="btn btn-line" id="copyBtn" type="button">Zkopírovat adresu pro Nuvio</button>
          <a class="btn btn-line" id="dashboardLink" href="#"${dashboard ? '' : ' hidden'}>Dashboard – vlastní titulky</a>
          <div class="url"><p>Adresa addonu</p><code id="addonUrl"></code></div>
          <button class="logout" type="button" id="logoutBottom">Odhlásit a přihlásit jiný účet</button>
        </div>
      </div>

      <div class="legend" aria-label="Co znamenají ikony u titulků">
        <p><span>✅</span><span><em>V cache.</em> Stáhne se hned a nečerpá denní limit.</span></p>
        <p><span>⬇️</span><span><em>Z premium.</em> Stáhne se po kliknutí a čerpá denní limit.</span></p>
        <p><span>🎯</span><span><em>Stejná release skupina</em> jako přehrávaný soubor, časování by mělo sedět přesně.</span></p>
        <p><span>⭐</span><span><em>Stejný zdroj</em> (BluRay, WEB, DVD), časování obvykle sedí.</span></p>
        <p><span>⏳</span><span><em>Čeká na schválení</em> na Titulky.com, stáhnout jde díky premium.</span></p>
      </div>
    </section>
  </main>
  <footer>Neoficiální addon. Titulky pocházejí z Titulky.com a patří jejich autorům.</footer>
</div>

<script>
(function () {
  var $ = function (id) { return document.getElementById(id); };
  var KEY = 'titulky_config_v2';
  var cfg = null;

  function caption(text) {
    var span = document.createElement('span');
    span.textContent = text;
    $('caption').replaceChildren(span);
  }
  function fmtDate(iso) {
    var d = new Date(iso);
    return isNaN(d) ? '' : d.getDate() + '. ' + (d.getMonth() + 1) + '. ' + d.getFullYear();
  }
  function msg(el, text, kind) { el.textContent = text || ''; el.className = 'msg' + (kind ? ' ' + kind : ''); }

  function showLogin() {
    cfg = null;
    $('appView').hidden = true; $('loginView').hidden = false; $('account').style.display = 'none';
    caption('České a slovenské titulky přímo v přehrávači.');
  }

  function fillSettings(s) {
    document.querySelectorAll('.chip').forEach(function (c) {
      c.setAttribute('aria-pressed', String(s.langs.indexOf(c.dataset.lang) >= 0));
    });
    $('unpublished').checked = !!s.unpublished;
    $('catalog').checked = !!s.catalog;
    $('client').value = s.client || 'auto';
  }

  function showApp(config, data) {
    cfg = config;
    var url = location.origin + '/' + config + '/manifest.json';
    $('installLink').href = 'stremio://' + url.replace(/^https?:\\/\\//, '');
    $('webInstallLink').href = 'https://web.stremio.com/#/addons?addon=' + encodeURIComponent(url);
    $('dashboardLink').href = '/' + config + '/dashboard';
    $('addonUrl').textContent = url;
    if (data.settings) fillSettings(data.settings);
    var vip = data.validUntil ? 'VIP platí do ' + fmtDate(data.validUntil) : '';
    $('accUser').textContent = data.user || '';
    $('account').style.display = data.user ? 'block' : 'none';
    caption(data.user ? 'Přihlášeno jako ' + data.user + (vip ? '. ' + vip + '.' : '.') : 'Addon je nastavený.');
    $('loginView').hidden = true; $('appView').hidden = false;
  }

  $('loginForm').addEventListener('submit', async function (e) {
    e.preventDefault();
    var u = $('username').value.trim(), p = $('password').value, m = $('loginMsg');
    if (!u || !p) { msg(m, 'Vyplňte jméno i heslo.', 'bad'); return; }
    $('loginBtn').disabled = true; $('loginBtn').textContent = 'Přihlašuji…'; msg(m, '');
    try {
      var r = await fetch('/verify', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: u, password: p, rdToken: $('rdToken').value.trim() }) });
      var d = await r.json();
      if (d.success && d.config) {
        try { localStorage.setItem(KEY, d.config); localStorage.removeItem('titulky_config'); localStorage.removeItem('titulky_account'); } catch (x) {}
        $('password').value = '';
        showApp(d.config, d);
      } else {
        msg(m, d.error === 'not_premium' ? 'Účet nemá aktivní VIP. Addon funguje jen s prémiovým nebo překladatelským účtem.'
          : d.error === 'server' ? 'Titulky.com teď neodpovídá. Zkuste to za chvíli.'
          : d.error === 'rate' ? 'Příliš mnoho pokusů. Zkuste to za pár minut.'
          : 'Jméno nebo heslo nesedí.', 'bad');
      }
    } catch (x) { msg(m, 'Spojení se serverem selhalo: ' + x.message, 'bad'); }
    $('loginBtn').disabled = false; $('loginBtn').textContent = 'Přihlásit se';
  });

  document.querySelectorAll('.chip').forEach(function (c) {
    c.addEventListener('click', function () {
      var on = c.getAttribute('aria-pressed') === 'true';
      var others = document.querySelectorAll('.chip[aria-pressed=true]').length;
      if (on && others <= 1) { msg($('saveMsg'), 'Aspoň jeden jazyk musí zůstat zapnutý.', 'bad'); return; }
      c.setAttribute('aria-pressed', String(!on)); msg($('saveMsg'), '');
    });
  });

  $('settingsForm').addEventListener('submit', async function (e) {
    e.preventDefault();
    if (!cfg) return;
    var body = {
      langs: Array.prototype.map.call(document.querySelectorAll('.chip[aria-pressed=true]'), function (c) { return c.dataset.lang; }),
      unpublished: $('unpublished').checked, catalog: $('catalog').checked, client: $('client').value,
    };
    $('saveBtn').disabled = true; msg($('saveMsg'), '');
    try {
      var r = await fetch('/' + cfg + '/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      var d = await r.json();
      if (d.success) {
        fillSettings(d.settings);
        msg($('saveMsg'), d.catalogChanged ? 'Uloženo. Změna katalogu se ve Stremiu projeví po přeinstalaci addonu.' : 'Uloženo.', 'ok');
      } else if (r.status === 403) { try { localStorage.removeItem(KEY); } catch (x) {} showLogin(); }
      else msg($('saveMsg'), 'Uložení selhalo. Zkuste to znovu.', 'bad');
    } catch (x) { msg($('saveMsg'), 'Spojení se serverem selhalo: ' + x.message, 'bad'); }
    $('saveBtn').disabled = false;
  });

  $('copyBtn').addEventListener('click', function () {
    var t = $('addonUrl').textContent, b = $('copyBtn');
    function done(ok) { b.textContent = ok ? 'Zkopírováno' : 'Označte adresu níže a zkopírujte ji'; setTimeout(function () { b.textContent = 'Zkopírovat adresu pro Nuvio'; }, 2500); }
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(t).then(function () { done(true); }, function () { done(false); });
    else { var r = document.createRange(); r.selectNodeContents($('addonUrl')); var s = getSelection(); s.removeAllRanges(); s.addRange(r); var ok = false; try { ok = document.execCommand('copy'); } catch (x) {} done(ok); }
  });

  function logout() {
    try { localStorage.removeItem(KEY); } catch (x) {}
    showLogin(); $('username').focus();
  }
  $('logoutTop').addEventListener('click', logout);
  $('logoutBottom').addEventListener('click', logout);

  // Uložený config (jen šifrovaný řetězec, žádné heslo) → načíst nastavení ze serveru
  var saved = null;
  try { saved = localStorage.getItem(KEY); localStorage.removeItem('titulky_config'); } catch (x) {}
  if (saved && /^v2[A-Za-z0-9_-]+$/.test(saved)) {
    fetch('/' + saved + '/settings').then(function (r) { return r.json().then(function (d) { return { r: r, d: d }; }); })
      .then(function (x) {
        if (x.d.success) showApp(saved, x.d);
        else { try { localStorage.removeItem(KEY); } catch (e) {} showLogin(); }
      })
      .catch(function () { showApp(saved, {}); });
  }
})();
</script>
</body>
</html>`;
}

// ── Dashboard ───────────────────────────────────────────────────

function dashboardPage({ configStr, username, isAdmin, history }) {
  const data = { config: configStr, user: username, admin: !!isAdmin, history: history || [] };
  return `<!DOCTYPE html>
<html lang="cs">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Dashboard – Titulky.com addon</title>
${FONTS}
<style>
${BASE_CSS}
  body { padding: 24px 16px; }
  .container { max-width: 680px; margin: 0 auto; }
  h1 { font-size: 24px; margin-bottom: 8px; }
  h2 { font-size: 18px; margin-bottom: 8px; }
  .container > .subtitle { margin-bottom: 24px; }
  .history-item { display: flex; gap: 16px; padding: 16px; background: var(--surface); border: 1px solid var(--border);
    border-radius: var(--radius); margin-bottom: 12px; }
  .poster { width: 70px; height: 100px; object-fit: cover; border-radius: 8px; flex-shrink: 0; background: var(--surface-2); }
  .history-info { flex: 1; min-width: 0; display: flex; flex-direction: column; justify-content: center; }
  .history-title { font-weight: 600; font-size: 16px; margin-bottom: 4px; overflow-wrap: anywhere; }
  .history-meta { color: var(--text-dim); font-size: 13px; margin-bottom: 12px; }
  .btn-small { display: inline-flex; width: auto; padding: 9px 16px; font-size: 14px; font-weight: 500;
    background: var(--surface-2); color: var(--accent); border: 1px solid var(--border); border-radius: var(--radius); cursor: pointer; }
  .btn-small:hover { background: var(--border); }
  .back { display: inline-flex; width: auto; margin-bottom: 24px; padding: 9px 16px; color: var(--text-dim);
    border: 1px solid var(--border); border-radius: var(--radius); text-decoration: none; font-size: 14px; }
  .modal { display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.7); z-index: 100; align-items: center;
    justify-content: center; padding: 16px; }
  .modal.show { display: flex; }
  .modal-card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 28px;
    max-width: 480px; width: 100%; max-height: 90vh; overflow-y: auto; }
  .modal-card h2 { margin-right: 28px; overflow-wrap: anywhere; }
  .close-btn { float: right; background: none; border: none; color: var(--text-dim); font-size: 20px; cursor: pointer; }
  .modal-card label { margin-top: 14px; }
  input[type="file"] { width: 100%; padding: 10px; background: var(--surface-2); border: 1px solid var(--border);
    border-radius: var(--radius); color: var(--text); }
  .existing-sub { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 10px 12px;
    background: var(--surface-2); border: 1px solid var(--border); border-radius: 8px; margin-bottom: 8px; }
  .existing-sub-info { flex: 1; min-width: 0; }
  .existing-sub-name { display: block; font-size: 14px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .existing-sub-meta { display: block; font-size: 12px; color: var(--text-dim); margin-top: 2px; overflow-wrap: anywhere; }
  .btn-delete { background: none; border: 1px solid var(--border); border-radius: 8px; color: var(--danger); cursor: pointer; padding: 6px 10px; }
  hr { border: none; border-top: 1px solid var(--border); margin: 28px 0; }
  .table-wrap { overflow-x: auto; }
  table.clients { width: 100%; border-collapse: collapse; font-size: 12px; }
  table.clients th, table.clients td { text-align: left; padding: 6px 8px; border-bottom: 1px solid var(--border); vertical-align: top; }
  table.clients td.ua { font-family: 'JetBrains Mono', monospace; word-break: break-all; min-width: 200px; }
  .row { display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 12px; }
</style>
</head>
<body>
<div class="container">
  <a href="/configure" class="back">← Zpět na konfiguraci</a>
  <h1>📺 Poslední přehrávané</h1>
  <p class="subtitle">Nahraj vlastní titulky k filmům a dílům seriálů, které jsi přehrával.</p>
  <div id="history"></div>
  <div id="admin" style="display:none">
    <hr>
    <h2>🔧 Admin</h2>
    <p class="subtitle" style="margin-bottom:12px">Záloha a obnova dat v Cloudflare R2.</p>
    <div class="row">
      <a class="btn-small" id="backupLink" href="#">💾 Stáhnout zálohu</a>
      <label class="btn-small" style="margin:0">📂 Nahrát zálohu<input type="file" id="restoreFile" accept=".zip" style="display:none"></label>
    </div>
    <div class="status" id="adminStatus"></div>
    <hr>
    <h2>🔎 Přehrávače (detekce)</h2>
    <p class="subtitle" style="margin-bottom:12px">Hlavičky požadavků na titulky od posledního restartu – podle nich se ladí automatická detekce.</p>
    <button class="btn-small" id="loadClients">Načíst</button>
    <div class="table-wrap" style="margin-top:12px"><table class="clients" id="clients"></table></div>
  </div>
</div>

<div class="modal" id="modal">
  <div class="modal-card">
    <button class="close-btn" id="closeModal" aria-label="Zavřít">✕</button>
    <h2 id="modalTitle"></h2>
    <div id="existing" style="margin-top:12px"></div>
    <hr style="margin:20px 0">
    <h3 style="font-size:15px">Nahrát nové titulky</h3>
    <label for="subFile">Soubor (.srt, .ssa, .ass, .sub, .vtt)</label>
    <input type="file" id="subFile" accept=".srt,.ssa,.ass,.sub,.vtt">
    <label for="subLabel">Popis (volitelné)</label>
    <input type="text" id="subLabel" maxlength="100" placeholder="např. CZ fansub, 1080p BluRay">
    <label for="subLang">Jazyk</label>
    <select id="subLang"><option value="cze">Čeština</option><option value="slk">Slovenčina</option><option value="eng">Angličtina</option></select>
    <button class="btn btn-primary" style="margin-top:20px" id="uploadBtn">📤 Nahrát</button>
    <div class="status" id="uploadStatus"></div>
  </div>
</div>

<script type="application/json" id="data">${jsonForScript(data)}</script>
<script>
(function () {
  var D = JSON.parse(document.getElementById('data').textContent);
  var $ = function (id) { return document.getElementById(id); };
  var base = '/' + D.config;
  var current = null;

  function el(tag, attrs, text) {
    var e = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) { e.setAttribute(k, attrs[k]); });
    if (text != null) e.textContent = text;
    return e;
  }
  function epLabel(h) {
    if (h.type !== 'series') return '';
    var p = String(h.id).split(':');
    if (p.length < 3) return '';
    return ' S' + String(p[1]).padStart(2, '0') + 'E' + String(p[2]).padStart(2, '0');
  }

  // Historie
  var hist = $('history');
  if (!D.history.length) {
    hist.appendChild(el('p', { 'class': 'subtitle' }, 'Zatím jsi nic nepřehrával. Pusť si film nebo seriál a vrať se sem.'));
  }
  D.history.forEach(function (h) {
    var item = el('div', { 'class': 'history-item' });
    var img = el('img', { 'class': 'poster', alt: '' });
    if (/^https:\\/\\//.test(h.poster || '')) img.src = h.poster;
    item.appendChild(img);
    var info = el('div', { 'class': 'history-info' });
    var name = (h.name || h.imdbId) + epLabel(h);
    info.appendChild(el('div', { 'class': 'history-title' }, name));
    info.appendChild(el('div', { 'class': 'history-meta' }, (h.type === 'series' ? 'Seriál' : 'Film') + ' · ' + h.imdbId));
    var btn = el('button', { 'class': 'btn-small' }, '📤 Nahrát titulky');
    btn.addEventListener('click', function () { openModal(String(h.id).replace(/:/g, '-'), name); });
    info.appendChild(btn);
    item.appendChild(info);
    hist.appendChild(item);
  });

  // Modal
  function openModal(videoId, name) {
    current = videoId;
    $('modalTitle').textContent = name;
    $('uploadStatus').textContent = '';
    $('subFile').value = '';
    $('subLabel').value = '';
    $('modal').classList.add('show');
    loadExisting();
  }
  function closeModal() { $('modal').classList.remove('show'); }
  $('closeModal').addEventListener('click', closeModal);
  $('modal').addEventListener('click', function (e) { if (e.target === this) closeModal(); });

  async function loadExisting() {
    var box = $('existing');
    box.textContent = 'Načítám…';
    try {
      var res = await fetch(base + '/custom-list/' + encodeURIComponent(current));
      var data = await res.json();
      renderExisting(data.subs || []);
    } catch (e) { box.textContent = 'Nepodařilo se načíst titulky'; }
  }

  function renderExisting(subs) {
    var box = $('existing');
    box.textContent = '';
    if (!subs.length) { box.appendChild(el('p', { 'class': 'subtitle' }, 'Žádné nahrané titulky')); return; }
    box.appendChild(el('p', { 'class': 'subtitle', style: 'margin-bottom:8px' }, 'Nahrané titulky:'));
    subs.forEach(function (s) {
      var row = el('div', { 'class': 'existing-sub' });
      var info = el('div', { 'class': 'existing-sub-info' });
      info.appendChild(el('span', { 'class': 'existing-sub-name' }, s.label));
      var lang = s.lang === 'cze' ? 'CZ' : s.lang === 'slk' ? 'SK' : String(s.lang || '').toUpperCase();
      var who = s.uploader && s.uploader !== 'unknown' ? ' · nahrál ' + s.uploader : '';
      info.appendChild(el('span', { 'class': 'existing-sub-meta' }, s.filename + ' · ' + lang + who));
      row.appendChild(info);
      var canDelete = D.admin || (s.uploader && s.uploader.toLowerCase() === String(D.user).toLowerCase());
      if (canDelete) {
        var del = el('button', { 'class': 'btn-delete', title: 'Smazat' }, '🗑');
        del.addEventListener('click', function () { deleteSub(s.key, del, row); });
        row.appendChild(del);
      }
      box.appendChild(row);
    });
  }

  async function deleteSub(key, btn, row) {
    if (!confirm('Opravdu smazat tyto titulky?')) return;
    btn.disabled = true; btn.textContent = '…';
    try {
      var res = await fetch(base + '/custom-delete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: key }) });
      var data = await res.json();
      if (data.success) { row.remove(); if (!$('existing').querySelector('.existing-sub')) renderExisting([]); }
      else { alert('Chyba: ' + (data.error || 'neznámá')); btn.disabled = false; btn.textContent = '🗑'; }
    } catch (e) { alert('Chyba: ' + e.message); btn.disabled = false; btn.textContent = '🗑'; }
  }

  $('uploadBtn').addEventListener('click', async function () {
    var st = $('uploadStatus');
    var f = $('subFile').files[0];
    if (!f) { st.className = 'status error'; st.textContent = 'Vyber soubor'; return; }
    if (!/\\.(srt|ssa|ass|sub|vtt)$/i.test(f.name)) { st.className = 'status error'; st.textContent = 'Podporované formáty: .srt, .ssa, .ass, .sub, .vtt'; return; }
    if (f.size > 1500000) { st.className = 'status error'; st.textContent = 'Soubor je moc velký (max 1,5 MB)'; return; }
    st.className = 'status'; st.textContent = 'Nahrávám…';
    try {
      var bytes = new Uint8Array(await f.arrayBuffer());
      var bin = '';
      for (var i = 0; i < bytes.length; i += 8192) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 8192));
      var res = await fetch(base + '/upload', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoId: current, content: btoa(bin), filename: f.name, label: $('subLabel').value.trim(), lang: $('subLang').value }),
      });
      var data = await res.json();
      if (data.success) { st.className = 'status ok'; st.textContent = '✓ Titulky nahrány'; $('subFile').value = ''; $('subLabel').value = ''; loadExisting(); }
      else { st.className = 'status error'; st.textContent = 'Chyba: ' + (data.error || 'neznámá'); }
    } catch (e) { st.className = 'status error'; st.textContent = 'Chyba: ' + e.message; }
  });

  // Admin
  if (D.admin) {
    $('admin').style.display = 'block';
    $('backupLink').href = base + '/admin/backup';
    $('restoreFile').addEventListener('change', async function () {
      var f = this.files[0];
      var st = $('adminStatus');
      if (!f) return;
      if (!confirm('Obnovit data ze zálohy ' + f.name + '? Existující soubory se stejným klíčem se přepíšou.')) { this.value = ''; return; }
      st.className = 'status'; st.textContent = 'Nahrávám zálohu… (' + (f.size / 1048576).toFixed(1) + ' MB)';
      try {
        var fd = new FormData(); fd.append('backup', f);
        var res = await fetch(base + '/admin/restore', { method: 'POST', body: fd });
        var data = await res.json();
        if (data.success) { st.className = 'status ok'; st.textContent = '✓ Obnoveno ' + data.count + ' souborů' + (data.skipped ? ', přeskočeno ' + data.skipped : ''); }
        else { st.className = 'status error'; st.textContent = 'Chyba: ' + (data.error || 'neznámá'); }
      } catch (e) { st.className = 'status error'; st.textContent = 'Chyba: ' + e.message; }
      this.value = '';
    });
    $('loadClients').addEventListener('click', async function () {
      var t = $('clients');
      t.textContent = '';
      try {
        var res = await fetch(base + '/admin/clients');
        var data = await res.json();
        var head = el('tr');
        ['User-Agent', 'Origin', 'Detekce', 'Počet', 'Naposledy'].forEach(function (h) { head.appendChild(el('th', null, h)); });
        t.appendChild(head);
        (data.clients || []).forEach(function (c) {
          var tr = el('tr');
          tr.appendChild(el('td', { 'class': 'ua' }, c.ua || '(prázdný)'));
          tr.appendChild(el('td', null, c.origin || ''));
          tr.appendChild(el('td', null, c.detected));
          tr.appendChild(el('td', null, String(c.count)));
          tr.appendChild(el('td', null, new Date(c.last).toLocaleString('cs-CZ')));
          t.appendChild(tr);
        });
        if (!(data.clients || []).length) t.appendChild(el('tr')).appendChild(el('td', null, 'Zatím žádné požadavky'));
      } catch (e) { t.appendChild(el('tr')).appendChild(el('td', null, 'Chyba: ' + e.message)); }
    });
  }
})();
</script>
</body>
</html>`;
}

module.exports = { configurePage, dashboardPage, escapeHtml };
