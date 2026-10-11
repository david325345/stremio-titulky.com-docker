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

function configurePage({ dashboard = false } = {}) {
  return `<!DOCTYPE html>
<html lang="cs">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Titulky.com – Stremio / Nuvio addon</title>
${FONTS}
<style>
${BASE_CSS}
  body { display: flex; align-items: center; justify-content: center; padding: 32px 16px; overflow-x: hidden;
    background: radial-gradient(1200px 600px at 50% -10%, rgba(79,140,255,0.12), transparent 60%), var(--bg); }
  .card { background: var(--surface); border: 1px solid var(--border); border-radius: 20px; padding: 40px 36px;
    max-width: 480px; width: 100%; box-shadow: 0 24px 80px rgba(0,0,0,0.45); }
  .logo-row { display: flex; align-items: center; gap: 14px; margin-bottom: 10px; }
  .logo-icon { width: 46px; height: 46px; background: var(--accent-glow); border-radius: 12px; display: flex;
    align-items: center; justify-content: center; font-size: 22px; border: 1px solid rgba(79,140,255,0.25); flex: none; }
  h1 { font-size: 22px; font-weight: 700; line-height: 1.2; }
  h1 small { display: block; font-size: 13px; font-weight: 500; color: var(--text-dim); margin-top: 2px; }
  .lead { margin-bottom: 18px; }
  .notice { display: flex; gap: 10px; align-items: flex-start; background: rgba(255,196,0,0.07); border: 1px solid rgba(255,196,0,0.25);
    border-radius: var(--radius); padding: 12px 14px; font-size: 13px; line-height: 1.5; color: #e9dcb0; margin-bottom: 24px; }
  .notice a { color: #ffd45c; }
  .field { margin-bottom: 16px; }
  .hint { font-size: 12px; color: var(--text-dim); margin-top: 6px; line-height: 1.45; }
  details.adv { margin: 4px 0 20px; border: 1px solid var(--border); border-radius: var(--radius); padding: 0 14px; }
  details.adv summary { cursor: pointer; padding: 12px 0; font-size: 13px; font-weight: 600; color: var(--text-dim); list-style: none; }
  details.adv summary::-webkit-details-marker { display: none; }
  details.adv summary::before { content: '▸ '; }
  details.adv[open] summary::before { content: '▾ '; }
  details.adv[open] { padding-bottom: 4px; }
  .toggle { display: flex; align-items: center; gap: 12px; cursor: pointer; margin: 4px 0 16px; padding: 12px 14px;
    border: 1px solid var(--border); border-radius: var(--radius); background: var(--surface-2); }
  .toggle input { position: absolute; opacity: 0; pointer-events: none; }
  .toggle .switch { flex: none; width: 40px; height: 22px; border-radius: 11px; background: var(--border); position: relative; transition: background .2s; }
  .toggle .switch::after { content: ''; position: absolute; top: 3px; left: 3px; width: 16px; height: 16px; border-radius: 50%; background: #fff; transition: transform .2s; }
  .toggle input:checked + .switch { background: var(--accent); }
  .toggle input:checked + .switch::after { transform: translateX(18px); }
  .toggle input:focus-visible + .switch { box-shadow: 0 0 0 3px var(--accent-glow); }
  .toggle b { display: block; font-size: 14px; font-weight: 600; color: var(--text); }
  .toggle small { display: block; font-size: 12px; color: var(--text-dim); margin-top: 2px; line-height: 1.4; }
  .result { display: none; }
  .result.show { display: block; }
  .account { display: flex; gap: 12px; align-items: center; background: rgba(79,219,138,0.08); border: 1px solid rgba(79,219,138,0.25);
    border-radius: var(--radius); padding: 12px 14px; margin-bottom: 20px; }
  .account .ok { font-size: 20px; color: var(--success); font-weight: 700; }
  .account b { display: block; font-size: 14px; }
  .account span { font-size: 12px; color: var(--text-dim); }
  .btn + .btn { margin-top: 8px; }
  .btn-install { background: var(--success); color: #0c0e14; }
  .btn-web { background: var(--accent); color: #fff; }
  .btn-web:hover { background: var(--accent-hover); }
  .url-label { margin-top: 18px; }
  .url-box { background: var(--surface-2); border: 1px solid var(--border); border-radius: var(--radius); padding: 10px 14px;
    font-family: 'JetBrains Mono', monospace; font-size: 11.5px; color: var(--text-dim); word-break: break-all; line-height: 1.6;
    max-height: 84px; overflow: auto; user-select: all; }
  .legend { margin-top: 22px; border-top: 1px solid var(--border); padding-top: 18px; }
  .legend h2 { font-size: 13px; font-weight: 600; color: var(--text-dim); margin-bottom: 10px; text-transform: uppercase; letter-spacing: .04em; }
  .legend ul { list-style: none; display: grid; gap: 8px; }
  .legend li { display: grid; grid-template-columns: 26px 1fr; font-size: 13px; line-height: 1.45; }
  .legend li span:last-child { color: var(--text-dim); }
  .legend li b { color: var(--text); font-weight: 600; }
  .link-btn { background: none; border: none; color: var(--text-dim); font: inherit; font-size: 13px; cursor: pointer;
    margin: 18px auto 0; display: block; text-decoration: underline; text-underline-offset: 3px; }
  .link-btn:hover { color: var(--text); }
  .spinner { width: 18px; height: 18px; border: 2px solid rgba(255,255,255,0.3); border-top-color: #fff; border-radius: 50%;
    animation: spin 0.6s linear infinite; display: none; }
  @keyframes spin { to { transform: rotate(360deg); } }
  #rdField { display: none; }
  @media (max-width: 500px) { .card { padding: 28px 20px; } h1 { font-size: 20px; } }
</style>
</head>
<body>
<main class="card">
  <div class="logo-row"><div class="logo-icon">🎬</div><h1>Titulky.com<small>addon pro Stremio a Nuvio</small></h1></div>
  <p class="subtitle lead">České a slovenské titulky z premium.titulky.com přímo v přehrávači. Hledá se přesně podle IMDb, nejlépe sedící titulky jsou nahoře.</p>

  <div id="form">
    <div class="notice"><span>⚠️</span><span>Addon vyžaduje <b>aktivní VIP</b> (prémiový nebo překladatelský účet) na Titulky.com. <a href="https://premium.titulky.com/?Napoveda=1" target="_blank" rel="noopener">Co je premium →</a></span></div>
    <div class="field">
      <label for="username">Uživatelské jméno</label>
      <input type="text" id="username" autocomplete="username" placeholder="Login z Titulky.com">
    </div>
    <div class="field">
      <label for="password">Heslo</label>
      <input type="password" id="password" autocomplete="current-password" placeholder="Heslo">
    </div>
    <label class="toggle" for="catalog">
      <input type="checkbox" id="catalog" checked>
      <span class="switch"></span>
      <span><b>Katalog „Nejnovější titulky"</b><small>Filmy a seriály, ke kterým právě přibyly titulky (aktualizace v 6:00 a 12:00)</small></span>
    </label>
    <details class="adv">
      <summary>Pokročilé</summary>
      <div class="field">
        <label for="client">Přehrávač</label>
        <select id="client">
          <option value="auto">Automaticky (doporučeno)</option>
          <option value="stremio">Stremio</option>
          <option value="nuvio">Nuvio / NuvioTV</option>
          <option value="omni">Omni (Apple TV)</option>
        </select>
        <p class="hint">Addon sám pozná, odkud se ptáte. Ruční volbu použijte, jen když se titulky zobrazují špatně.</p>
      </div>
      <div class="field" id="rdField">
        <label for="rdToken">Real-Debrid API klíč (volitelné)</label>
        <input type="text" id="rdToken" placeholder="real-debrid.com/apitoken" style="font-family:'JetBrains Mono',monospace;font-size:12px">
        <p class="hint">Lepší párování titulků podle souboru z Real-Debridu (Omni neposílá název souboru).</p>
      </div>
    </details>
    <button class="btn btn-primary" id="verifyBtn"><span class="spinner" id="spinner"></span><span id="btnText">Přihlásit a nainstalovat</span></button>
    <div class="status" id="status" role="status"></div>
  </div>

  <div class="result" id="result">
    <div class="account"><span class="ok">✓</span><div><b id="accUser">Addon je nastavený</b><span id="accInfo"></span></div></div>
    <a class="btn btn-install" id="installLink" href="#">📦 Nainstalovat do Stremia</a>
    <a class="btn btn-web" id="webInstallLink" href="#" target="_blank" rel="noopener">🌐 Nainstalovat přes Stremio Web</a>
    <button class="btn btn-secondary" id="copyBtn">📋 Kopírovat URL pro Nuvio</button>
    <a class="btn btn-secondary" id="dashboardLink" href="#"${dashboard ? '' : ' style="display:none"'}>📺 Dashboard – vlastní titulky</a>
    <label class="url-label">URL addonu</label>
    <div class="url-box" id="addonUrl"></div>

    <section class="legend">
      <h2>Co znamenají ikony</h2>
      <ul>
        <li><span>✅</span><span><b>V cache</b> – stáhne se vždy a hned, nečerpá denní limit</span></li>
        <li><span>⬇️</span><span><b>Stáhne se z premium</b> – při kliknutí, čerpá denní limit stažení</span></li>
        <li><span>🎯</span><span><b>Stejná release skupina</b> jako přehrávaný soubor – nejspíš přesné časování</span></li>
        <li><span>⭐</span><span><b>Stejný zdroj</b> (BluRay, WEB, DVD…) – časování obvykle sedí</span></li>
      </ul>
    </section>
    <button class="link-btn" id="resetBtn">Odhlásit / změnit účet</button>
  </div>
</main>

<script>
(function () {
  var $ = function (id) { return document.getElementById(id); };
  var STORE_KEY = 'titulky_config_v2';
  var ACC_KEY = 'titulky_account';
  var COPY_TEXT = '📋 Kopírovat URL pro Nuvio';

  function toggleRd() { $('rdField').style.display = $('client').value === 'omni' ? 'block' : 'none'; }
  $('client').addEventListener('change', toggleRd);

  function fmtDate(iso) {
    var d = new Date(iso);
    return isNaN(d) ? '' : d.getDate() + '. ' + (d.getMonth() + 1) + '. ' + d.getFullYear();
  }

  function showResult(config, account) {
    var manifestUrl = location.origin + '/' + config + '/manifest.json';
    $('installLink').href = 'stremio://' + manifestUrl.replace(/^https?:\\/\\//, '');
    $('webInstallLink').href = 'https://web.stremio.com/#/addons?addon=' + encodeURIComponent(manifestUrl);
    $('dashboardLink').href = '/' + config + '/dashboard';
    $('addonUrl').textContent = manifestUrl;
    if (account && account.user) {
      $('accUser').textContent = 'Přihlášeno jako ' + account.user;
      $('accInfo').textContent = account.validUntil ? 'VIP platné do ' + fmtDate(account.validUntil) : '';
    } else {
      $('accUser').textContent = 'Addon je nastavený';
      $('accInfo').textContent = '';
    }
    $('form').style.display = 'none';
    $('result').classList.add('show');
  }

  async function verify() {
    var username = $('username').value.trim();
    var password = $('password').value;
    var status = $('status');
    if (!username || !password) { status.className = 'status error'; status.textContent = 'Vyplňte jméno i heslo'; return; }
    $('verifyBtn').disabled = true; $('spinner').style.display = 'block'; $('btnText').textContent = 'Ověřuji…';
    status.className = 'status'; status.textContent = '';
    try {
      var res = await fetch('/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username, password: password, client: $('client').value, rdToken: $('rdToken').value.trim(), catalog: $('catalog').checked }),
      });
      var data = await res.json();
      if (data.success && data.config) {
        var account = { user: data.user || username, validUntil: data.validUntil || null };
        try {
          localStorage.setItem(STORE_KEY, data.config);
          localStorage.setItem(ACC_KEY, JSON.stringify(account));
          localStorage.removeItem('titulky_config');
        } catch (e) {}
        $('password').value = '';
        showResult(data.config, account);
      } else {
        status.className = 'status error';
        status.textContent = data.error === 'server' ? '✗ Titulky.com teď neodpovídá, zkuste to později'
          : data.error === 'not_premium' ? '✗ Účet nemá aktivní VIP – addon vyžaduje prémiový nebo překladatelský účet'
          : data.error === 'rate' ? '✗ Příliš mnoho pokusů, zkuste to za pár minut'
          : '✗ Nesprávné přihlašovací údaje';
      }
    } catch (e) {
      status.className = 'status error'; status.textContent = 'Chyba připojení: ' + e.message;
    }
    $('verifyBtn').disabled = false; $('spinner').style.display = 'none'; $('btnText').textContent = 'Přihlásit a nainstalovat';
  }

  function copied(ok) {
    $('copyBtn').textContent = ok ? '✓ Zkopírováno' : 'Označte a zkopírujte URL níže';
    setTimeout(function () { $('copyBtn').textContent = COPY_TEXT; }, 2500);
  }

  $('verifyBtn').addEventListener('click', verify);
  $('username').addEventListener('keydown', function (e) { if (e.key === 'Enter') $('password').focus(); });
  $('password').addEventListener('keydown', function (e) { if (e.key === 'Enter') verify(); });
  $('copyBtn').addEventListener('click', function () {
    var text = $('addonUrl').textContent;
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(function () { copied(true); }, function () { copied(false); });
    } else {
      var r = document.createRange(); r.selectNodeContents($('addonUrl'));
      var s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
      var ok = false; try { ok = document.execCommand('copy'); } catch (e) {}
      copied(ok);
    }
  });
  $('resetBtn').addEventListener('click', function () {
    try { localStorage.removeItem(STORE_KEY); localStorage.removeItem(ACC_KEY); } catch (e) {}
    $('result').classList.remove('show'); $('form').style.display = 'block';
    $('username').focus();
  });

  // Uložený config (jen šifrovaný řetězec, žádné heslo)
  try {
    var saved = localStorage.getItem(STORE_KEY);
    localStorage.removeItem('titulky_config'); // stará verze ukládala heslo – smazat
    var acc = null;
    try { acc = JSON.parse(localStorage.getItem(ACC_KEY) || 'null'); } catch (e) {}
    if (saved && /^v2[A-Za-z0-9_-]+$/.test(saved)) showResult(saved, acc);
  } catch (e) {}
  toggleRd();
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
