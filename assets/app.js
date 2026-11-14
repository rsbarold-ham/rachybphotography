// rachybphotography: renders galleries from site data.
// Data comes from an inline <script id="site-data"> (artifact build) or data/site.json (static site).
// SITE.mode: 'hub' = artifact home page linking to one artifact per game (ev.url),
// 'game' = a single game's artifact, absent = the full static site.
// Photos are already watermarked by tools/add_event.py. In the artifact build, photos are packed
// into vertical strips (p.t / p.f = [strip, top, height]) so hundreds of photos fit in few files.
(async function () {
  const $ = id => document.getElementById(id);
  const app = $('app');
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const money = n => '$' + n.toFixed(n % 1 ? 2 : 0);

  let SITE;
  try {
    const inline = document.getElementById('site-data');
    SITE = inline ? JSON.parse(inline.textContent) : await (await fetch('data/site.json', { cache: 'no-cache' })).json();
  } catch (e) {
    app.innerHTML = '<p class="empty">The galleries could not load. Refresh the page to try again.</p>';
    return;
  }
  const CFG = SITE.config;
  const MODE = SITE.mode || 'site';
  if (MODE === 'hub') $('trayBtn').hidden = true;
  const EVENTS = SITE.events.slice().sort((a, b) => b.date.localeCompare(a.date));

  if (MODE === 'game' && SITE.hubUrl) { $('brand').href = SITE.hubUrl; $('brand').target = '_blank'; $('brand').rel = 'noopener'; }
  $('brandSub').textContent = CFG.tagline;
  if (CFG.email || CFG.phone) {
    const sec = document.createElement('section');
    sec.className = 'contact wrap';
    sec.id = 'contact';
    sec.innerHTML = `
      <div class="ctext"><span class="eyebrow">Contact</span><h2>Questions, custom orders, or a game you want covered?</h2>
        <p>Reach out directly. I usually reply the same day.</p></div>
      <div class="clist">
        ${CFG.email ? `<div class="crow"><span class="clabel">Email</span><a class="cval" href="mailto:${esc(CFG.email)}">${esc(CFG.email)}</a><button class="link copy" type="button" data-v="${esc(CFG.email)}">Copy</button></div>` : ''}
        ${CFG.phone ? `<div class="crow"><span class="clabel">Phone / text</span><a class="cval" href="tel:${esc(CFG.phone.replace(/[^\d+]/g, ''))}">${esc(CFG.phone)}</a><button class="link copy" type="button" data-v="${esc(CFG.phone)}">Copy</button></div>` : ''}
      </div>`;
    document.querySelector('footer').before(sec);
    sec.querySelectorAll('.copy').forEach(b => b.onclick = async () => {
      try { await navigator.clipboard.writeText(b.dataset.v); b.textContent = 'Copied ✓'; }
      catch (e) { const r = document.createRange(); r.selectNodeContents(b.previousElementSibling); const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r); b.textContent = 'Selected'; }
      setTimeout(() => b.textContent = 'Copy', 2000);
    });
  }
  $('footName').textContent = '© ' + new Date().getFullYear() + ' ' + CFG.name + '. Previews are watermarked; purchased files are not.';

  const dir = ev => 'photos/' + ev.id + '/';
  const full = (ev, i) => dir(ev) + ev.photos[i].file;
  const thumb = (ev, i) => dir(ev) + 'thumbs/' + ev.photos[i].file;
  // Strip images load when their visible box nears the screen. Native lazy loading misjudges
  // these (the strip image is much taller than the box showing it), so we watch the box instead.
  const io = 'IntersectionObserver' in window ? new IntersectionObserver(entries => entries.forEach(e => {
    if (!e.isIntersecting) return;
    const img = e.target.querySelector('img[data-src]');
    if (img) { img.src = img.dataset.src; img.removeAttribute('data-src'); }
    io.unobserve(e.target);
  }), { rootMargin: '1000px 0px' }) : null;
  function hydrate(root) {
    root.querySelectorAll('img[data-src]').forEach(img => {
      if (io) io.observe(img.parentElement);
      else { img.src = img.dataset.src; img.removeAttribute('data-src'); }
    });
  }
  // kind 't' = grid size, 'f' = viewer size
  function pic(ev, i, kind, alt = '') {
    const p = ev.photos[i], s = p[kind];
    if (s) {
      const [n, y, h] = s, W = SITE.strips[kind];
      return `<span class="sp" style="aspect-ratio:${W}/${h}"><img alt="${esc(alt)}" ${kind === 'f' ? 'src' : 'data-src'}="s/${ev.id}/${kind}${n}.jpg" style="top:${-(y / h * 100).toFixed(4)}%"></span>`;
    }
    return `<img alt="${esc(alt)}" src="${kind === 't' ? thumb(ev, i) : full(ev, i)}" loading="lazy" width="${p.w}" height="${p.h}" style="aspect-ratio:${p.w}/${p.h}">`;
  }
  const num = (ev, n) => String(n).padStart(Math.max(2, String(ev.photos.length).length), '0');
  const codeOf = (ev, i) => ev.code + '-' + num(ev, i + 1);
  const fmtDate = d => new Date(d + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  // full display name: "Hamilton Soccer 10/14", or just the title when dateInTitle is false
  const nameOf = ev => ev.title + (ev.dateInTitle === false ? '' : ' ' + shortDate(ev.date));
  const shortDate = d => { const [, m, dd] = d.split('-'); return +m + '/' + +dd; };

  // Order state, kept in this visitor's browser only
  let order = [];
  try { order = JSON.parse(localStorage.getItem('order') || '[]'); } catch (e) {}
  order = order.filter(o => EVENTS.some(e => e.id === o.ev && e.photos[o.i]));
  const save = () => { try { localStorage.setItem('order', JSON.stringify(order)); } catch (e) {} };
  const inOrder = (ev, i) => order.some(o => o.ev === ev.id && o.i === i);
  function toggle(ev, i) {
    if (inOrder(ev, i)) order = order.filter(o => !(o.ev === ev.id && o.i === i));
    else order.push({ ev: ev.id, i });
    save(); syncOrderUI();
  }

  let filter = 'All';
  function renderHome() {
    document.title = CFG.name;
    const cats = ['All', ...new Set(EVENTS.map(e => e.category))];
    const list = EVENTS.filter(e => filter === 'All' || e.category === filter);
    app.innerHTML = `
      <section class="intro">
        <img class="badge-logo" src="assets/badge.png" alt="" width="480" height="480">
        <span class="eyebrow">Go Continentals</span>
        <h1>Game day on the Hill, <em>in print.</em></h1>
        <p>Photos from Hamilton College games and campus events. Open an event, tap the shots you want, and send your order. Every photo has an order number so nothing gets mixed up.</p>
        <div class="prices"><span><b>${money(CFG.pricePerPhoto)}</b> per photo</span><span>${esc(CFG.delivery)}</span><span>Pay with Venmo</span></div>
      </section>
      <div class="chips" role="group" aria-label="Filter by category">
        ${cats.map(c => `<button class="chip" type="button" data-cat="${esc(c)}" aria-pressed="${c === filter}">${esc(c)}</button>`).join('')}
      </div>
      <section class="events">
        ${list.length ? list.map(e => `
          <a class="card" href="${MODE === 'hub' ? esc(e.url) : '#' + esc(e.id)}"${MODE === 'hub' ? ' target="_blank" rel="noopener"' : ''}>
            <div class="cover" style="--focus:${esc(e.coverFocus || '50% 50%')}">${e.coverSrc ? `<img alt="" src="${esc(e.coverSrc)}" loading="lazy">` : pic(e, e.cover || 0, 't')}${e.sample ? '<span class="badge">Sample</span>' : ''}</div>
            <div class="meta">
              <span class="eyebrow">${esc(e.category)} · ${esc(fmtDate(e.date))}</span>
              <h2>${esc(nameOf(e))}</h2>
              <div class="foot"><span>${e.count ?? e.photos.length} photos</span><span>View gallery →</span></div>
            </div>
          </a>`).join('') : '<p class="empty">No galleries here yet.</p>'}
      </section>`;
    hydrate(app);
    app.querySelectorAll('.chip').forEach(b => b.onclick = () => { filter = b.dataset.cat; renderHome(); });
  }

  let current = null;
  let player = null;      // jersey number being shown, or null for all photos
  let shown = [];         // photo indexes on the wall, in order
  const pLink = (ev, n) => '#' + (MODE === 'game' ? '' : ev.id + '/') + (n == null ? 'all' : 'p' + n);
  const playersOf = ev => [...new Set(ev.photos.flatMap(p => p.players || []))].sort((a, b) => a - b);
  const countFor = (ev, n) => ev.photos.filter(p => (p.players || []).includes(n)).length;
  function renderGallery(ev, jersey = null) {
    current = ev;
    player = jersey != null && playersOf(ev).includes(jersey) ? jersey : null;
    const roster = playersOf(ev);
    document.title = nameOf(ev) + ' · ' + CFG.name;
    app.innerHTML = `
      ${MODE === 'game' ? (SITE.hubUrl ? `<a class="back" href="${esc(SITE.hubUrl)}" target="_blank" rel="noopener">← All galleries</a>` : '') : '<a class="back" href="#">← All events</a>'}
      <div class="ghead">
        <div>
          <span class="eyebrow">${esc(ev.category)} · ${esc(fmtDate(ev.date))}</span>
          <h1>${esc(nameOf(ev))}</h1>
          ${ev.blurb ? `<p>${esc(ev.blurb)}</p>` : ''}
        </div>
        <div class="stats"><span>${ev.photos.length} photos</span><span>Order no. ${esc(ev.code)}-${num(ev, 1)} to -${num(ev, ev.photos.length)}</span></div>
      </div>
      ${ev.sample ? '<div class="notice">These are placeholder photos. The real photos from this event go here.</div>' : ''}
      ${roster.length ? `
      <nav class="players" aria-label="Photos by player">
        <span class="eyebrow">Find a player · Hamilton jersey number</span>
        <div class="pchips">
          <a class="pchip all" href="${pLink(ev, null)}" aria-current="${player == null}">All photos <span>${ev.photos.length}</span></a>
          ${roster.map(n => `<a class="pchip" href="${pLink(ev, n)}" aria-current="${player === n}"><b>#${n}</b><span>${countFor(ev, n)}</span></a>`).join('')}
        </div>
      </nav>` : ''}
      ${player != null ? `<div class="phead"><h2>#${player}</h2><p>${countFor(ev, player)} photos featuring Hamilton's #${player}. Numbers were matched by eye, so check the other players too if one seems missing.</p></div>` : ''}
      <section class="wall" id="wall"></section>`;
    layoutWall(ev);
    window.scrollTo(0, 0);
  }

  let wallCols = 0;
  const colCount = () => Math.max(1, Math.min(4, Math.floor(($('wall')?.clientWidth || 0) / 250)));
  function layoutWall(ev) {
    const wall = $('wall');
    wallCols = colCount();
    const cols = Array.from({ length: wallCols }, () => ({ html: [], h: 0 }));
    shown = ev.photos.map((p, i) => i).filter(i => player == null || (ev.photos[i].players || []).includes(player));
    shown.forEach(i => {
      const p = ev.photos[i];
      const c = cols.reduce((a, b) => (b.h < a.h ? b : a));
      c.h += p.t ? p.t[2] / SITE.strips.t : p.h / p.w;
      c.html.push(`
          <figure class="ph${inOrder(ev, i) ? ' in' : ''}" data-i="${i}">
            <button class="open" type="button" aria-label="View ${codeOf(ev, i)}">${pic(ev, i, 't', ev.title + ' photo ' + (i + 1))}</button>
            <div class="bar"><span class="code">${codeOf(ev, i)}</span><button class="add" type="button">${inOrder(ev, i) ? '✓ In order' : 'Add'}</button></div>
          </figure>`);
    });
    wall.innerHTML = cols.map(c => `<div class="col">${c.html.join('')}</div>`).join('');
    wall.querySelectorAll('.ph').forEach(f => {
      const i = +f.dataset.i;
      f.querySelector('.open').onclick = () => openLb(i);
      f.querySelector('.add').onclick = () => toggle(ev, i);
    });
    hydrate(wall);
  }
  window.addEventListener('resize', () => { if (current && $('wall') && colCount() !== wallCols) layoutWall(current); });

  // Lightbox
  let lbI = 0;
  function openLb(i) { lbI = i; $('lb').hidden = false; drawLb(); $('lbClose').focus(); }
  function drawLb() {
    const ev = current;
    const box = $('lbPic'), stage = box.parentElement, p = ev.photos[lbI];
    box.innerHTML = pic(ev, lbI, 'f', ev.title + ' photo ' + (lbI + 1));
    const k = Math.min(stage.clientWidth / p.w, (stage.clientHeight - 20) / p.h);
    box.style.width = Math.floor(p.w * k) + 'px';
    $('lbCode').textContent = codeOf(ev, lbI) + '  ·  ' + (shown.indexOf(lbI) + 1) + ' of ' + shown.length + (player != null ? '  ·  #' + player : '');
    $('lbAdd').textContent = inOrder(ev, lbI) ? '✓ In your order' : 'Add to order';
  }
  const step = d => { const k = shown.indexOf(lbI); lbI = shown[(k + d + shown.length) % shown.length]; drawLb(); };
  $('lbPrev').onclick = () => step(-1);
  $('lbNext').onclick = () => step(1);
  $('lbClose').onclick = () => { $('lb').hidden = true; };
  window.addEventListener('resize', () => { if (!$('lb').hidden) drawLb(); });
  $('lbAdd').onclick = () => { toggle(current, lbI); drawLb(); };
  document.addEventListener('keydown', e => {
    if (!$('lb').hidden) {
      if (e.key === 'Escape') $('lb').hidden = true;
      if (e.key === 'ArrowLeft') step(-1);
      if (e.key === 'ArrowRight') step(1);
    } else if (!$('tray').hidden && e.key === 'Escape') $('tray').hidden = true;
  });
  document.addEventListener('contextmenu', e => { if (e.target.tagName === 'IMG') e.preventDefault(); });

  // Order tray
  const EMAIL_SLOT = '[YOUR EMAIL HERE]';
  const total = () => order.length * CFG.pricePerPhoto;
  const venmoHandle = () => CFG.venmo.replace(/^@/, '');
  const venmoUrl = (amount, note) =>
    'https://venmo.com/' + encodeURIComponent(venmoHandle()) +
    '?txn=pay&amount=' + amount.toFixed(2) + '&note=' + encodeURIComponent(note);

  // Photos from the same event share one prefix: "SOC1014-02,05,11"
  function photoCodes() {
    const groups = new Map();
    order.forEach(o => {
      const ev = EVENTS.find(e => e.id === o.ev);
      if (!groups.has(ev.code)) groups.set(ev.code, { ev, nums: [] });
      groups.get(ev.code).nums.push(o.i + 1);
    });
    return [...groups].map(([code, g]) =>
      code + '-' + g.nums.sort((a, b) => a - b).map(n => num(g.ev, n)).join(',')).join(' ');
  }
  const venmoNote = () =>
    `${CFG.name} order: ${photoCodes()} | ${order.length} photo${order.length > 1 ? 's' : ''} ${money(total())} | email: ${EMAIL_SLOT}`;

  function syncOrderUI() {
    $('trayCount').textContent = order.length;
    if (current) {
      app.querySelectorAll('.ph').forEach(f => {
        const on = inOrder(current, +f.dataset.i);
        f.classList.toggle('in', on);
        f.querySelector('.add').textContent = on ? '✓ In order' : 'Add';
      });
    }
    if (!$('tray').hidden) renderTray();
  }
  function renderTray() {
    const list = $('trayList'), foot = $('trayFoot');
    if (!order.length) {
      list.innerHTML = '<p class="empty">Nothing here yet. Open an event and tap <b>Add</b> on the photos you want.</p>';
      foot.innerHTML = '';
      return;
    }
    list.innerHTML = order.map((o, k) => {
      const ev = EVENTS.find(e => e.id === o.ev);
      return `<div class="line">
        <div class="th">${pic(ev, o.i, 't')}</div>
        <div class="info"><span class="code">${codeOf(ev, o.i)}</span><span class="sub">${esc(nameOf(ev))} · ${money(CFG.pricePerPhoto)}</span></div>
        <button class="rm" type="button" data-k="${k}">Remove</button></div>`;
    }).join('');
    const note = venmoNote();
    foot.innerHTML = `
      <div class="total"><span>${order.length} photo${order.length > 1 ? 's' : ''} × ${money(CFG.pricePerPhoto)}</span><b>${money(total())}</b></div>
      <div class="pay">
        <div class="notehead"><span class="eyebrow">Your Venmo note</span><button class="link" id="copyNote" type="button">Copy note</button></div>
        <p class="vnote" id="vnote">${esc(note).replace(esc(EMAIL_SLOT), `<mark>${esc(EMAIL_SLOT)}</mark>`)}</p>
        <ol>
          <li>Copy the note above.</li>
          <li>Pay <b>${money(total())}</b> to <b>@${esc(venmoHandle())}</b> on Venmo and paste the note.</li>
          <li><b>Replace ${esc(EMAIL_SLOT)} with your email.</b> That's where your photos get sent.</li>
        </ol>
        <a class="btn" id="payBtn" href="${esc(venmoUrl(total(), note))}" target="_blank" rel="noopener">Pay ${money(total())} on Venmo →</a>
        <p class="fine">Paid already? <button class="link" id="clearOrder" type="button">Clear this order</button></p>
      </div>`;
    hydrate(list);
    list.querySelectorAll('.rm').forEach(b => b.onclick = () => { order.splice(+b.dataset.k, 1); save(); syncOrderUI(); renderTray(); });
    $('copyNote').onclick = async () => {
      const b = $('copyNote');
      try { await navigator.clipboard.writeText(note); b.textContent = 'Copied ✓'; }
      catch (e) {
        const r = document.createRange(); r.selectNodeContents($('vnote'));
        const s = getSelection(); s.removeAllRanges(); s.addRange(r);
        b.textContent = 'Selected. Press Ctrl+C / ⌘C';
      }
      setTimeout(() => { if ($('copyNote')) $('copyNote').textContent = 'Copy note'; }, 2500);
    };
    $('payBtn').onclick = () => notify(note);
    $('clearOrder').onclick = () => { order = []; save(); syncOrderUI(); renderTray(); };
  }

  // Optional heads-up email via Formspree when someone heads to Venmo
  function notify(note) {
    if (!CFG.orderEndpoint) return;
    fetch(CFG.orderEndpoint, {
      method: 'POST', keepalive: true,
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        _subject: `Photo order started: ${money(total())} (${order.length} photos)`,
        venmo_note: note,
        photos: order.map(o => {
          const ev = EVENTS.find(x => x.id === o.ev);
          return `${codeOf(ev, o.i)}  ${nameOf(ev)}  file ${ev.photos[o.i].source || ev.photos[o.i].file}`;
        }).join('\n'),
      }),
    }).catch(() => {});
  }

  $('trayBtn').onclick = () => { $('tray').hidden = false; renderTray(); $('trayClose').focus(); };
  $('trayClose').onclick = () => { $('tray').hidden = true; };

  function route() {
    $('lb').hidden = true;
    const [gid, sub = ''] = location.hash.slice(1).split('/');
    const ev = EVENTS.find(e => e.id === gid);
    const pm = /^p(\d+)$/.exec(MODE === 'game' ? gid : sub);
    if (MODE === 'game') { renderGallery(EVENTS[0], pm ? +pm[1] : null); return; }
    else if (ev) renderGallery(ev, pm ? +pm[1] : null); else { current = null; renderHome(); }
  }
  window.addEventListener('hashchange', route);
  route(); syncOrderUI();
})();
