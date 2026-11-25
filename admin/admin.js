// Åk Admin: granskningskö, ärenden, användare. Allt går via serverfunktionen "admin".
(function () {
  const cfg = window.AK_CONFIG || {};
  const demo = !cfg.url || !cfg.anonKey;
  const sb = demo ? null : window.supabase.createClient(cfg.url, cfg.anonKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });
  const root = document.getElementById("app");
  const state = { me: null, queue: [], queueFilter: "all", users: [], userFilter: "all", userQuery: "" };

  // MARK: Hjälp

  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const initials = (name) => String(name || "").split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join("").toUpperCase();
  const months = ["jan", "feb", "mar", "apr", "maj", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];
  const weekdays = ["sön", "mån", "tis", "ons", "tors", "fre", "lör"];
  const pad = (n) => String(n).padStart(2, "0");
  const time = (iso) => { const d = new Date(iso); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
  const day = (iso) => { const d = new Date(iso); return `${d.getDate()} ${months[d.getMonth()]}`; };
  const longDay = (iso) => { const d = new Date(iso); return `${weekdays[d.getDay()]} ${d.getDate()} ${months[d.getMonth()]}`; };
  const isToday = (iso) => new Date(iso).toDateString() === new Date().toDateString();
  const isYesterday = (iso) => new Date(iso).toDateString() === new Date(Date.now() - 86400000).toDateString();
  const lastActive = (iso) => !iso ? "–" : isToday(iso) ? `i dag ${time(iso)}` : isYesterday(iso) ? "i går" : day(iso);
  const waited = (iso) => {
    const s = (Date.now() - new Date(iso).getTime()) / 1000;
    if (s < 3600) return `${Math.max(1, Math.round(s / 60))} min`;
    if (s < 86400) return `${Math.round(s / 3600)} h`;
    return `${Math.round(s / 86400)} d`;
  };
  const sinceText = (iso) => {
    const [n, unit] = waited(iso).split(" ");
    const word = unit === "h" ? (n === "1" ? "timme" : "timmar") : unit === "d" ? (n === "1" ? "dag" : "dagar") : "min";
    return `för ${n} ${word} sedan`;
  };
  const avatar = (name, url, cls = "") => `<span class="avatar ${cls}">${url ? `<img src="${esc(url)}" alt="">` : esc(initials(name))}</span>`;
  const catClass = (c) => (c ? `c-${c}` : "");
  const suspended = (u) => u.suspended_until && new Date(u.suspended_until) > new Date();
  const forever = (iso) => new Date(iso).getFullYear() > 9000;
  const lower = (s) => s.charAt(0).toLowerCase() + s.slice(1);
  const dot = (s) => (/[.!?]$/.test(s) ? s : s + ".");

  const statusTag = {
    under_review: ["review", "Granskas"],
    stopped: ["stopped", "Stoppad"],
    hidden: ["hidden", "Dold"],
    visible: ["visible", "Syns"],
    approved: ["approved", "Godkänd"],
    rejected: ["rejected", "Avvisad"],
    removed: ["rejected", "Borttagen"],
  };
  const tag = (status) => { const [c, t] = statusTag[status] || ["neutral", status]; return `<span class="tag dot ${c}">${esc(t)}</span>`; };

  const icons = {
    ok: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
    no: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    play: '<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>',
  };

  function toast(text) {
    const t = document.createElement("div");
    t.className = "toast";
    t.textContent = text;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 2400);
  }

  async function api(action, body = {}) {
    if (demo) return window.AK_DEMO(action, body);
    const { data, error } = await sb.functions.invoke("admin", { body: { action, ...body } });
    if (error) {
      let message = error.message;
      try { message = (await error.context.json()).error || message; } catch (_) { /* inget */ }
      throw new Error(message);
    }
    return data;
  }

  // MARK: Inloggning

  function renderLogin(message) {
    let email = "";
    const draw = () => {
      root.innerHTML = `
        <div class="login-page">
          <div class="login-card">
            <div class="logo"><span class="sticker">Åk!</span><span class="logo-text">Admin</span></div>
            <p>Logga in för att granska rekord och rapporter.</p>
            <input class="field" id="email" type="email" autocomplete="username" placeholder="E-postadress" value="${esc(email)}">
            <input class="field" id="password" type="password" autocomplete="current-password" placeholder="Lösenord">
            <button class="btn btn-lime btn-block" id="send">Logga in</button>
            ${message ? `<p class="error">${esc(message)}</p>` : ""}
            <p class="small">Bara godkända admins kommer in. Admins läggs till i Supabase under Authentication > Users.</p>
          </div>
        </div>`;
      const input = document.getElementById("email");
      const pw = document.getElementById("password");
      (email ? pw : input).focus();
      const send = async () => {
        email = input.value.trim();
        if (demo) return start();
        if (!email || !pw.value) return;
        document.getElementById("send").disabled = true;
        const { error } = await sb.auth.signInWithPassword({ email, password: pw.value });
        if (error) { message = "Fel e-postadress eller lösenord."; draw(); return; }
        start();
      };
      document.getElementById("send").onclick = send;
      input.onkeydown = (e) => { if (e.key === "Enter") pw.focus(); };
      pw.onkeydown = (e) => { if (e.key === "Enter") send(); };
    };
    draw();
  }

  async function start() {
    if (!demo) {
      const { data } = await sb.auth.getSession();
      if (!data.session) return renderLogin();
    }
    try {
      state.me = await api("me");
    } catch (e) {
      if (!demo) await sb.auth.signOut();
      return renderLogin(e.message || "Bara godkända admins kommer in.");
    }
    route();
  }

  async function signOut() {
    if (!demo) await sb.auth.signOut();
    state.me = null;
    location.hash = "";
    renderLogin();
  }

  // MARK: Ram

  function shell(active, content) {
    const me = state.me || {};
    root.innerHTML = `
      <div class="shell">
        <aside class="sidebar">
          <div class="logo"><span class="sticker">Åk!</span><span class="logo-text">Admin</span></div>
          <nav class="nav">
            <a href="#/" class="${active === "queue" ? "on" : ""}">Granskningskö <span class="count">${me.queue ?? 0}</span></a>
            <a href="#/anvandare" class="${active === "users" ? "on" : ""}">Användare</a>
          </nav>
          <div class="me">
            ${avatar(me.name, null, "lime")}
            <div class="who"><div>${esc(me.name || "")}</div><div>Admin</div></div>
            <button class="btn" id="signout">Logga ut</button>
          </div>
        </aside>
        <main class="main">${demo ? '<div class="demo-banner">Exempeldata. Fyll i adressen och nyckeln i <b>admin/config.js</b> för att koppla adminsidan till servern.</div>' : ""}${content}</main>
      </div>`;
    document.getElementById("signout").onclick = signOut;
  }

  function loading(active) { shell(active, '<div class="loading">Hämtar …</div>'); }

  async function refreshCount() {
    try { state.me = await api("me"); } catch (_) { /* behåll */ }
  }

  // MARK: Granskningskö

  async function renderQueue() {
    loading("queue");
    const { rows } = await api("queue");
    state.queue = rows;
    state.me.queue = rows.length;
    drawQueue();
  }

  function drawQueue() {
    const rows = state.queue;
    const records = rows.filter((r) => r.type === "record");
    const reports = rows.filter((r) => r.type === "report");
    const shown = state.queueFilter === "record" ? records : state.queueFilter === "report" ? reports : rows;
    const chip = (id, label, n) => `<button class="chip ${state.queueFilter === id ? "on" : ""}" data-filter="${id}">${label} <span class="n">${n}</span></button>`;
    shell("queue", `
      <h1 class="page display">Granskningskö</h1>
      <p class="sub">${rows.length === 0 ? "Inga ärenden väntar." : `${rows.length} ${rows.length === 1 ? "ärende väntar" : "ärenden väntar"}: nya rekord på topp 3 och inlägg som har rapporterats`}</p>
      <div class="chips">${chip("all", "Alla", rows.length)}${chip("record", "Rekord", records.length)}${chip("report", "Rapporterat", reports.length)}</div>
      <div class="table-card"><div class="table-wrap">
        ${shown.length === 0 ? '<div class="empty">Tomt här. Bra jobbat!</div>' : `
        <table>
          <thead><tr><th>Typ</th><th>Användare</th><th>Värde</th><th>Signal</th><th>Status</th><th>Väntat</th><th></th></tr></thead>
          <tbody>${shown.map((r) => `
            <tr class="clickable" data-key="${esc(r.key)}">
              <td><span class="tag ${r.type}">${r.type === "record" ? "Rekord" : "Rapporterat"}</span></td>
              <td><div class="cell-user">${avatar(r.name)}${esc(r.name)}</div></td>
              <td><div class="value">${esc(r.value)}</div>${r.board ? `<div class="board ${catClass(r.category)}">${esc(r.board)}</div>` : ""}</td>
              <td><div class="signal">${esc(r.signal)}</div><div class="muted">${esc([r.place, time(r.time)].filter(Boolean).join(" · "))}</div></td>
              <td>${tag(r.status)}</td>
              <td class="muted">${waited(r.since)}</td>
              <td><div class="actions">
                <button class="icon-btn ok" data-ok="${esc(r.key)}" title="${r.type === "record" ? "Godkänn" : "Inget fel"}">${icons.ok}</button>
                <button class="icon-btn no" data-no="${esc(r.key)}" title="${r.type === "record" ? "Avvisa" : "Ta bort"}">${icons.no}</button>
                <a class="btn btn-outline btn-small" href="#/arende/${esc(r.key)}">Öppna</a>
              </div></td>
            </tr>`).join("")}
          </tbody>
        </table>`}
      </div></div>`);

    root.querySelectorAll("[data-filter]").forEach((b) => (b.onclick = () => { state.queueFilter = b.dataset.filter; drawQueue(); }));
    root.querySelectorAll("tr[data-key]").forEach((tr) => (tr.onclick = (e) => {
      if (e.target.closest("button, a")) return;
      location.hash = `#/arende/${tr.dataset.key}`;
    }));
    root.querySelectorAll("[data-ok]").forEach((b) => (b.onclick = () => quickDecision(b.dataset.ok, true)));
    root.querySelectorAll("[data-no]").forEach((b) => (b.onclick = () => quickDecision(b.dataset.no, false)));
  }

  async function quickDecision(key, ok) {
    const row = state.queue.find((r) => r.key === key);
    if (!row) return;
    try {
      if (row.type === "record") {
        const id = key.slice(2);
        if (ok) { await api("approve", { event_id: id }); toast("Godkänt"); }
        else return rejectDialog({ id, title: `${row.board} ${row.value}`, category: row.category, value: row.value, place: row.place, user: row.name }, afterDecision(key));
      } else {
        const [, kind, id] = key.split("/");
        if (ok) { await api("keep", { key }); toast("Inget fel, syns igen"); }
        else if (kind === "media") { await api("remove_media", { media_id: id }); toast("Borttaget"); }
        else if (kind === "avatar") { await api("remove_avatar", { user_id: id }); toast("Profilbilden borttagen"); }
        else return rejectDialog({ id, title: row.value, category: row.category, value: row.value, place: row.place, user: row.name }, afterDecision(key));
      }
      await afterDecision(key)();
    } catch (e) { toast(e.message); }
  }

  const afterDecision = (key) => async () => {
    state.queue = state.queue.filter((r) => r.key !== key);
    state.me.queue = Math.max(0, (state.me.queue || 1) - 1);
    if (location.hash.startsWith("#/arende/")) {
      const next = state.queue[0];
      location.hash = next ? `#/arende/${next.key}` : "#/";
    } else drawQueue();
  };

  // MARK: Ärende

  async function renderCase(key) {
    loading("queue");
    if (!state.queue.length) { try { state.queue = (await api("queue")).rows; } catch (_) { /* inget */ } }
    let c;
    try { c = await api("case", { key }); } catch (e) {
      shell("queue", `<div class="crumbs"><a href="#/">‹ Granskningskö</a></div><div class="card empty">${esc(e.message)}</div>`);
      return;
    }
    const e = c.event, u = c.user, r = c.report;
    const idx = state.queue.findIndex((q) => q.key === key);
    const next = state.queue[idx + 1] || state.queue.find((q) => q.key !== key);
    const caseNo = r ? r.case_no : e?.case_no;
    const queueRow = state.queue.find((q) => q.key === key);
    const title = r && r.kind === "avatar" ? "Profilbild" : r && r.kind === "media" ? `${c.media[0]?.kind === "photo" ? "Foto" : "Video"}${e ? ` · ${e.title}` : ""}` : e?.title;
    const status = queueRow?.status || e?.status;
    const signal = queueRow?.signal || e?.signal;
    const media = c.media[0];

    const valueCard = e ? `
      <div class="card value-card ${e.category}">
        <div class="label ${catClass(e.category)}">${esc(e.board === "Snabbast" ? "Toppfart" : e.board === "Mest rotation" ? "Rotation" : "Lufttid")}</div>
        <div><span class="big">${esc(e.value_text.replace(/ (s|km\/h)$/, ""))}</span><span class="big-unit ${catClass(e.category)}">${esc((e.value_text.match(/ (s|km\/h)$/) || ["", ""])[1])}</span></div>
        ${e.category === "jump" ? `<div class="est">${esc(estimate(e))}</div>` : ""}
        <div class="line">${esc([e.previous_first ? `Tidigare 1:a i ${e.resort_name}: ${e.previous_first.value_text}` : null, e.previous_pb ? `${firstName(u?.name)}s PB före detta: ${e.previous_pb}` : `Första åket i kategorin`].filter(Boolean).join(" · "))}</div>
        <div class="check ${e.checks.every((x) => x.ok) ? "ok" : "warn"}">${esc(e.checks_summary)} ${e.checks.filter((x) => !x.ok).map((x) => esc(x.text)).join(". ")}${e.status === "under_review" && e.checks.slice(0, 4).every((x) => x.ok) ? ", därför granskas det." : ""}</div>
        <ul class="checks">${e.checks.map((x) => `<li class="${x.ok ? "" : "bad"}">${esc(x.name)}: ${esc(x.text)}</li>`).join("")}</ul>
      </div>` : "";

    const mapCard = e && e.lat != null ? `
      <div class="card"><div class="label">Karta</div><div class="map" id="map"></div>
      <div class="map-note">${esc(`${e.title} i ${e.resort_name} kl ${time(e.time)}. Linjen är spåret från hela skiddagen.`)}</div></div>` : "";

    const mediaCard = media ? `
      <div class="card ${e ? "span2" : ""}"><div class="label">${media.kind === "video" ? "Video från åket" : "Foto från åket"}</div>
        <div class="media-box">${media.url ? (media.kind === "video" ? `<video src="${esc(media.url)}" ${media.poster ? `poster="${esc(media.poster)}"` : ""} controls playsinline></video>` : `<img src="${esc(media.url)}" alt="">`) : `<span style="width:56px;height:56px;border-radius:50%;background:#fff;color:#0B1533;display:grid;place-items:center">${icons.play}</span>`}</div>
        <div class="media-foot"><span>${media.duration ? `${Math.floor(media.duration / 60)}:${pad(Math.round(media.duration % 60))} · ` : ""}uppladdad ${time(media.created_at)}</span>
        ${media.filter_status === "flagged" ? `<span class="tag dot rejected">Bildfilter: ${esc(media.filter_label || "flaggad")}${media.filter_score ? ` ${Math.round(media.filter_score * 100)} %` : ""}</span>` : media.filter_status === "ok" ? '<span class="tag dot approved">Bildfilter ok</span>' : '<span class="tag dot private">Bildfilter av</span>'}</div>
      </div>` : "";

    const avatarCard = r && r.kind === "avatar" ? `<div class="card"><div class="label">Profilbild</div>${avatar(u?.name, u?.avatar, "xl")}</div>` : "";

    const reportsCard = r ? `
      <div class="card ${e ? "span2" : ""}"><div class="label">Rapporter</div>
        <ul class="report-list">${r.items.map((x) => `<li><b>${esc(x.by)}</b>: ${esc(x.reason)} <small>· ${day(x.created_at)} ${time(x.created_at)}</small></li>`).join("")}</ul>
      </div>` : "";

    let decision;
    if (!r || r.kind === "event") {
      decision = `
        <button class="btn btn-green" id="approve">Godkänn</button>
        <button class="btn btn-red-soft big-btn" id="reject">Avvisa</button>
        <hr>
        ${media && media.kind === "video" ? '<button class="btn btn-outline" id="remove-media">Ta bort video</button>' : media ? '<button class="btn btn-outline" id="remove-media">Ta bort foto</button>' : ""}
        <button class="btn btn-red-soft" id="suspend">Stäng av användare</button>`;
    } else {
      decision = `
        <button class="btn btn-green" id="keep">Inget fel, visa igen</button>
        <button class="btn btn-red-soft big-btn" id="${r.kind === "avatar" ? "remove-avatar" : "remove-media"}">${r.kind === "avatar" ? "Ta bort profilbild" : media?.kind === "photo" ? "Ta bort foto" : "Ta bort video"}</button>
        <hr>
        <button class="btn btn-red-soft" id="suspend">Stäng av användare</button>`;
    }

    shell("queue", `
      <div class="crumbs"><a href="#/">‹ Granskningskö</a><span>/</span><span>Ärende #${esc(caseNo)}</span><span class="spacer"></span>
        ${next ? `<a class="btn btn-outline btn-small" href="#/arende/${esc(next.key)}">Nästa ›</a>` : ""}</div>
      <div class="case-head"><h1 class="display">${esc(title)}</h1>${status ? tag(status) : ""}${signal ? `<span class="tag neutral">${esc(signal)}</span>` : ""}</div>
      <div class="case-meta">${avatar(u?.name, u?.avatar)}<strong><a href="#/anvandare/${esc(u?.id)}" style="color:inherit">${esc(u?.name || "")}</a></strong>
        ${e ? `<span>· ${esc(e.resort_name)} · ${longDay(e.time)} ${time(e.time)} · inskickat ${sinceText(e.created_at)}</span>` : ""}</div>
      <div class="case-grid">
        ${valueCard}${mapCard}${avatarCard}
        <div class="case-side">
          <div class="card"><div class="label">Beslut</div><div class="decision">${decision}</div></div>
          ${u ? `<div class="card"><div class="label">Användare</div>
            <div class="user-mini">${avatar(u.name, u.avatar, "lg")}<div><div class="name">${esc(u.name)}</div><div class="muted">Medlem sedan ${day(u.created_at)} · ${u.age} år${suspended(u) ? " · avstängd" : ""}</div></div></div>
            <div class="stats"><div class="stat"><b>${u.runs}</b><span>åk</span></div><div class="stat"><b>${u.records}</b><span>rekord</span></div><div class="stat red"><b>${u.rejected}</b><span>avvisad</span></div></div>
          </div>` : ""}
        </div>
        ${mediaCard}${reportsCard}
      </div>`);

    if (e && e.lat != null) drawMap(e);
    const done = afterDecision(key);
    const bind = (id, fn) => { const el = document.getElementById(id); if (el) el.onclick = fn; };
    bind("approve", async () => {
      try { await api("approve", { event_id: e.id }); toast("Godkänt"); await done(); } catch (err) { toast(err.message); }
    });
    bind("reject", () => rejectDialog({ id: e.id, title: e.title, category: e.category, value: e.value_text, place: e.resort_name, user: u?.name }, done));
    bind("keep", async () => {
      try { await api("keep", { key }); toast("Inget fel, syns igen"); await done(); } catch (err) { toast(err.message); }
    });
    bind("remove-media", () => confirmDialog({
      title: media?.kind === "photo" ? "Ta bort fotot?" : "Ta bort videon?",
      text: `${firstName(u?.name)} får en notis om att den tagits bort. Själva åket ligger kvar.`,
      confirm: "Ta bort",
      action: async () => { await api("remove_media", { media_id: media.id }); toast("Borttaget"); if (r) await done(); else renderCase(key); },
    }));
    bind("remove-avatar", () => confirmDialog({
      title: "Ta bort profilbilden?",
      text: `${firstName(u?.name)} får en notis och kan välja en ny bild.`,
      confirm: "Ta bort",
      action: async () => { await api("remove_avatar", { user_id: u.id }); toast("Profilbilden borttagen"); await done(); },
    }));
    bind("suspend", () => suspendDialog(u, () => renderCase(key)));
  }

  const firstName = (name) => String(name || "").split(" ")[0];

  function estimate(e) {
    const t = e.airtime || e.value;
    const g = 9.81;
    const d = Math.min(Math.max(e.jump_drop || 0, 0), (g * t * t) / 2);
    const v = (g * t * t / 2 - d) / t;
    const h = (v * v) / (2 * g) + d;
    const parts = [`ca ${h.toFixed(1).replace(".", ",")} m högt`];
    if (e.takeoff_speed_kmh) parts.push(`ca ${Math.round((e.takeoff_speed_kmh / 3.6) * t)} m långt`);
    return parts.join(" · ");
  }

  function drawMap(e) {
    if (!window.L) return;
    const map = L.map("map", { zoomControl: false, attributionControl: true }).setView([e.lat, e.lon], 15);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 18, attribution: "© OpenStreetMap" }).addTo(map);
    if (Array.isArray(e.track) && e.track.length > 1) {
      L.polyline(e.track, { color: "#0B1533", weight: 3, opacity: 0.8 }).addTo(map);
    }
    const color = { speed: "#FF5B3A", jump: "#20B4F0", rotation: "#8D6BFF" }[e.category] || "#2D5BFF";
    L.circleMarker([e.lat, e.lon], { radius: 10, color: "#fff", weight: 3, fillColor: color, fillOpacity: 1 })
      .addTo(map).bindTooltip(e.value_text, { permanent: true, direction: "right", offset: [12, 0] });
  }

  // MARK: Dialoger

  function dialog(html, bindFn) {
    const back = document.createElement("div");
    back.className = "backdrop";
    back.innerHTML = `<div class="dialog" role="dialog">${html}</div>`;
    document.body.appendChild(back);
    const close = () => back.remove();
    back.onclick = (ev) => { if (ev.target === back) close(); };
    document.addEventListener("keydown", function esc(ev) { if (ev.key === "Escape") { close(); document.removeEventListener("keydown", esc); } });
    bindFn(back, close);
  }

  function reasonPicker(back, reasons, onChange) {
    let chosen = 0;
    const opts = back.querySelector(".options");
    const draw = () => {
      opts.innerHTML = reasons.map((r, i) => `
        <div class="option ${i === chosen ? "on" : ""}" data-i="${i}"><span class="radio"></span>
          <div style="flex:1">${esc(r)}${r === "Annat" ? `<small>Skriv ett eget skäl</small>${i === chosen ? '<textarea id="own" placeholder="Skäl"></textarea>' : ""}` : ""}</div>
        </div>`).join("");
      opts.querySelectorAll(".option").forEach((o) => (o.onclick = (ev) => {
        if (ev.target.tagName === "TEXTAREA") return;
        chosen = Number(o.dataset.i);
        draw();
        const own = back.querySelector("#own");
        if (own) own.focus();
        onChange();
      }));
      const own = back.querySelector("#own");
      if (own) own.oninput = onChange;
    };
    draw();
    return () => (reasons[chosen] === "Annat" ? (back.querySelector("#own")?.value || "").trim() : reasons[chosen]);
  }

  const thing = (c) => (c === "jump" ? "Ditt hopp" : c === "speed" ? "Din toppfart" : "Din rotation");

  function rejectDialog(ev, done) {
    const reasons = ["Åkte i lift eller bil", "Orimligt värde", "Värdet stämmer inte med sensordatan", "Olämplig video eller bild", "Annat"];
    dialog(`
      <h2>Avvisa ${esc(lower(ev.title || ""))}?</h2>
      <p>Välj ett skäl. Det skickas till ${esc(firstName(ev.user))} som en notis i appen.</p>
      <div class="options"></div>
      <div class="preview"><b>${esc(firstName(ev.user))} får</b><span id="preview"></span></div>
      <div class="dialog-btns"><button class="btn btn-outline" id="cancel">Avbryt</button><button class="btn btn-red" id="go">Avvisa</button></div>`,
    (back, close) => {
      const preview = () => {
        const r = get();
        back.querySelector("#preview").textContent = `${thing(ev.category)} ${ev.value} i ${ev.place} godkändes inte: ${r ? dot(lower(r)) : "…"}`;
      };
      const get = reasonPicker(back, reasons, preview);
      preview();
      back.querySelector("#cancel").onclick = close;
      back.querySelector("#go").onclick = async () => {
        const reason = get();
        if (!reason) return toast("Skriv ett skäl");
        try { await api("reject", { event_id: ev.id, reason }); close(); toast("Avvisat"); await done(); } catch (e) { toast(e.message); }
      };
    });
  }

  function suspendDialog(u, done) {
    const reasons = ["Fusk, till exempel åk i lift eller bil", "Olämpliga videor eller bilder", "Trakasserier", "Annat"];
    let days = 30;
    dialog(`
      <h2>Stäng av ${esc(u.name)}?</h2>
      <p>${esc(firstName(u.name))} kan inte spela in, synas på topplistor eller ladda upp något så länge avstängningen gäller.</p>
      <div class="label">Skäl</div>
      <div class="options"></div>
      <div class="label">Hur länge</div>
      <div class="durations">${[[7, "7 dagar"], [30, "30 dagar"], [null, "Tills vidare"]].map(([d, t]) => `<button class="chip ${d === days ? "on" : ""}" data-days="${d}">${t}</button>`).join("")}</div>
      <div class="dialog-btns"><button class="btn btn-outline" id="cancel">Avbryt</button><button class="btn btn-red" id="go">Stäng av i 30 dagar</button></div>`,
    (back, close) => {
      const get = reasonPicker(back, reasons, () => {});
      back.querySelectorAll("[data-days]").forEach((b) => (b.onclick = () => {
        days = b.dataset.days === "null" ? null : Number(b.dataset.days);
        back.querySelectorAll("[data-days]").forEach((x) => x.classList.toggle("on", x === b));
        back.querySelector("#go").textContent = days ? `Stäng av i ${days} dagar` : "Stäng av tills vidare";
      }));
      back.querySelector("#cancel").onclick = close;
      back.querySelector("#go").onclick = async () => {
        const reason = get();
        if (!reason) return toast("Skriv ett skäl");
        try { await api("suspend", { user_id: u.id, reason, days }); close(); toast("Avstängd"); await done(); } catch (e) { toast(e.message); }
      };
    });
  }

  function removeRecordDialog(u, records, done) {
    const reasons = ["Fusk upptäckt i efterhand", "Fel i mätningen", "Annat"];
    let pick = 0;
    dialog(`
      <h2 id="ttl"></h2>
      <p>Åket är redan godkänt och ligger på topplistan. Det tas bort från alla topplistor och placeringarna under flyttas upp.</p>
      ${records.length > 1 ? `<div class="label">Vilket rekord?</div><div class="durations">${records.map((r, i) => `<button class="chip ${i === 0 ? "on" : ""}" data-pick="${i}">${esc(r.text)}</button>`).join("")}</div>` : ""}
      <div class="options"></div>
      <div class="preview"><b>${esc(firstName(u.name))} får</b><span id="preview"></span></div>
      <div class="dialog-btns"><button class="btn btn-outline" id="cancel">Avbryt</button><button class="btn btn-red" id="go">Ta bort från topplistan</button></div>`,
    (back, close) => {
      const names = { speed: "toppfart", jump: "lufttid", rotation: "rotation" };
      const preview = () => {
        const r = records[pick];
        back.querySelector("#ttl").textContent = `Ta bort ${names[r.category]} ${r.text}?`;
        const reason = get();
        back.querySelector("#preview").textContent = `${thing(r.category)} ${r.text} i ${r.resort} har tagits bort från topplistan: ${reason ? dot(lower(reason)) : "…"}`;
      };
      const get = reasonPicker(back, reasons, preview);
      back.querySelectorAll("[data-pick]").forEach((b) => (b.onclick = () => {
        pick = Number(b.dataset.pick);
        back.querySelectorAll("[data-pick]").forEach((x) => x.classList.toggle("on", x === b));
        preview();
      }));
      preview();
      back.querySelector("#cancel").onclick = close;
      back.querySelector("#go").onclick = async () => {
        const reason = get();
        if (!reason) return toast("Skriv ett skäl");
        try { await api("remove_record", { event_id: records[pick].id, reason }); close(); toast("Borttaget från topplistan"); await done(); } catch (e) { toast(e.message); }
      };
    });
  }

  function deleteUserDialog(u, done) {
    const word = u.name.toUpperCase();
    dialog(`
      <h2>Radera ${esc(u.name)} och all data?</h2>
      <p>Kontot, alla åk, sensordata, foton, videor, rekord och rapporter raderas för alltid. Det går inte att ångra. Gör det bara när personen själv har bett om det.</p>
      <ul class="lose">
        <li>• ${u.days.length} skiddagar med sensordata</li>
        <li>• ${u.days.reduce((s, d) => s + d.media, 0)} foton och videor</li>
        <li>• ${["speed", "jump", "rotation"].filter((c) => u.bests[c]).length} rekord på topplistor</li>
        <li>• Profil och profilbild</li>
      </ul>
      <div class="label">Skriv ${esc(word)} för att bekräfta</div>
      <input class="field" id="confirm" autocomplete="off" style="margin-bottom:16px">
      <div class="dialog-btns"><button class="btn btn-outline" id="cancel">Avbryt</button><button class="btn btn-red" id="go" disabled>Radera för alltid</button></div>`,
    (back, close) => {
      const input = back.querySelector("#confirm");
      const go = back.querySelector("#go");
      input.focus();
      input.oninput = () => { go.disabled = input.value.trim().toUpperCase() !== word; };
      back.querySelector("#cancel").onclick = close;
      go.onclick = async () => {
        try { await api("delete_user", { user_id: u.id, confirm: input.value }); close(); toast("Användaren är raderad"); await done(); } catch (e) { toast(e.message); }
      };
    });
  }

  function confirmDialog({ title, text, confirm, action }) {
    dialog(`<h2>${esc(title)}</h2><p>${esc(text)}</p>
      <div class="dialog-btns"><button class="btn btn-outline" id="cancel">Avbryt</button><button class="btn btn-red" id="go">${esc(confirm)}</button></div>`,
    (back, close) => {
      back.querySelector("#cancel").onclick = close;
      back.querySelector("#go").onclick = async () => { try { await action(); close(); } catch (e) { toast(e.message); } };
    });
  }

  // MARK: Användare

  async function renderUsers() {
    loading("users");
    state.users = (await api("users")).users;
    drawUsers();
  }

  function drawUsers() {
    const all = state.users;
    const susp = all.filter(suspended);
    const q = state.userQuery.toLowerCase();
    const shown = (state.userFilter === "suspended" ? susp : all)
      .filter((u) => !q || u.name.toLowerCase().includes(q) || (u.email || "").toLowerCase().includes(q));
    const chip = (id, label, n) => `<button class="chip ${state.userFilter === id ? "on" : ""}" data-filter="${id}">${label} <span class="n">${n.toLocaleString("sv-SE")}</span></button>`;
    shell("users", `
      <h1 class="page display">Användare</h1>
      <p class="sub">${all.length.toLocaleString("sv-SE")} användare · ${susp.length} avstängda</p>
      <div class="toolbar"><input class="search" id="q" placeholder="Sök på namn eller e-post" value="${esc(state.userQuery)}">
        <div class="chips">${chip("all", "Alla", all.length)}${chip("suspended", "Avstängda", susp.length)}</div></div>
      <div class="table-card"><div class="table-wrap">
        ${shown.length === 0 ? '<div class="empty">Ingen användare matchar.</div>' : `
        <table>
          <thead><tr><th>Användare</th><th>Inloggning</th><th>Ålder</th><th>Skiddagar</th><th>Senast aktiv</th><th>Status</th><th></th></tr></thead>
          <tbody>${shown.map((u) => `
            <tr class="clickable" data-id="${esc(u.id)}">
              <td><div class="cell-user">${avatar(u.name, u.avatar)}<div>${esc(u.name)}<div class="email">${esc(u.email || "")}</div></div></div></td>
              <td>${u.provider === "google" ? "Google" : u.provider === "apple" ? "Apple" : esc(u.provider || "")}</td>
              <td>${u.age} år</td>
              <td>${u.days}</td>
              <td class="muted">${lastActive(u.last_active_at)}</td>
              <td>${suspended(u) ? `<span class="tag dot suspended">Avstängd${forever(u.suspended_until) ? "" : ` ${Math.ceil((new Date(u.suspended_until) - Date.now()) / 86400000)} d`}</span>` : '<span class="tag dot active">Aktiv</span>'}</td>
              <td><div class="actions"><a class="btn btn-outline btn-small" href="#/anvandare/${esc(u.id)}">Öppna</a></div></td>
            </tr>`).join("")}
          </tbody>
        </table>`}
      </div></div>`);
    const input = document.getElementById("q");
    input.oninput = () => {
      state.userQuery = input.value;
      const pos = input.selectionStart;
      drawUsers();
      const again = document.getElementById("q");
      again.focus();
      again.setSelectionRange(pos, pos);
    };
    root.querySelectorAll("[data-filter]").forEach((b) => (b.onclick = () => { state.userFilter = b.dataset.filter; drawUsers(); }));
    root.querySelectorAll("tr[data-id]").forEach((tr) => (tr.onclick = (e) => {
      if (e.target.closest("a, button")) return;
      location.hash = `#/anvandare/${tr.dataset.id}`;
    }));
  }

  async function renderUser(id) {
    loading("users");
    let u;
    try { u = await api("user", { user_id: id }); } catch (e) {
      shell("users", `<div class="crumbs"><a href="#/anvandare">‹ Användare</a></div><div class="card empty">${esc(e.message)}</div>`);
      return;
    }
    const isSusp = suspended(u);
    const pbCard = (c, title, unit) => {
      const b = u.bests[c];
      if (!b) return `<div class="pb ${c}"><div class="top"><span class="ttl ${catClass(c)}">${title}</span></div><div class="v">–</div><div class="where">Inget åk än</div></div>`;
      const v = c === "rotation" ? String(Math.round(b.value)) : b.value_text.replace(/ (s|km\/h)$/, "");
      const est = c === "jump" ? `${estimate({ ...b, airtime: b.airtime || b.value })} · ` : "";
      return `<div class="pb ${c}"><div class="top"><span class="ttl ${catClass(c)}">${title}</span>${tag(b.status)}</div>
        <div class="v">${esc(v)}<small class="${catClass(c)}">${unit}</small></div><div class="where">${esc(est)}${esc(b.resort_name || "")} · ${day(b.time)}</div></div>`;
    };
    const cell = (x) => (x ? esc(x.text) : "–");
    shell("users", `
      <div class="crumbs"><a href="#/anvandare">‹ Användare</a><span>/</span><span>${esc(u.name)}</span></div>
      <div class="card profile-card">
        ${avatar(u.name, u.avatar, "xl")}
        <div class="grow">
          <h1 class="display">${esc(u.name)} ${isSusp ? `<span class="tag dot suspended">Avstängd${forever(u.suspended_until) ? "" : ` till ${day(u.suspended_until)}`}</span>` : '<span class="tag dot active">Aktiv</span>'}<span class="tag info">Ålder 13+ bekräftad</span></h1>
          <div class="muted" style="margin-top:6px">${u.age} år · medlem sedan ${day(u.created_at)} ${new Date(u.created_at).getFullYear()} · senast aktiv ${lastActive(u.last_active_at)}${u.home_town ? ` · hemort ${esc(u.home_town)}` : ""}${u.email ? ` · ${esc(u.email)}` : ""}</div>
          ${isSusp && u.suspended_reason ? `<div class="muted" style="margin-top:4px">Skäl: ${esc(u.suspended_reason)}</div>` : ""}
        </div>
        <div class="btns">
          ${isSusp ? '<button class="btn btn-outline" id="unsuspend">Häv avstängning</button>' : '<button class="btn btn-red-soft" id="suspend">Stäng av</button>'}
          <button class="btn btn-outline" id="delete">Radera användare</button>
        </div>
      </div>
      <div class="pb-grid">${pbCard("speed", "Toppfart", "km/h")}${pbCard("jump", "Lufttid", "s")}${pbCard("rotation", "Rotation", "°")}</div>
      <div class="private-note"><span class="tag private">Privat</span>Krasch-g är privat för användaren och visas inte här.</div>
      <div class="user-grid">
        <div class="table-card">
          <div class="label" style="padding:18px 16px 0">Senaste åk</div>
          <div class="table-wrap">
          ${u.days.length === 0 ? '<div class="empty">Inga skiddagar än.</div>' : `
          <table>
            <thead><tr><th>Dag</th><th>Skidort</th><th>Fart</th><th>Lufttid</th><th>Rotation</th><th>Media</th><th style="text-align:right">Status</th></tr></thead>
            <tbody>${u.days.map((d) => {
              const approved = ["speed", "jump", "rotation"].map((c) => d[c] && d[c].status === "approved" ? { ...d[c], category: c, resort: d.resort_name } : null).filter(Boolean);
              return `<tr>
                <td><b>${longDay(d.date)}</b></td><td><b>${esc(d.resort_name)}</b></td>
                <td>${cell(d.speed)}</td><td>${cell(d.jump)}</td><td>${cell(d.rotation)}</td><td>${d.media}</td>
                <td><div class="actions">${tag(d.status)}${approved.length ? `<button class="btn btn-red-soft btn-small" data-remove="${esc(d.id)}">Ta bort</button>` : ""}</div></td>
              </tr>`;
            }).join("")}</tbody>
          </table>`}
          </div>
        </div>
        <div class="card">
          <div class="label">Moderering</div>
          <div class="stats"><div class="stat red"><b>${u.moderation.rejected}</b><span>avvisade</span></div><div class="stat orange"><b>${u.moderation.reports_against}</b><span>rapporter mot</span></div><div class="stat"><b>${u.moderation.reports_made}</b><span>rapporter gjorda</span></div></div>
          <div style="font-weight:700;margin:18px 0 10px">Tidigare beslut</div>
          ${u.history.length === 0 ? '<div class="muted">Inga beslut än.</div>' : `<ul class="history">${u.history.map((h) => `<li><span class="dot ${h.kind === "report" ? "report" : /^Godkänd|hävd/.test(h.text) ? "ok" : ""}"></span><span class="date">${day(h.at)}</span><span>${esc(h.text)}</span></li>`).join("")}</ul>`}
        </div>
      </div>`);

    const reload = () => renderUser(id);
    const s = document.getElementById("suspend");
    if (s) s.onclick = () => suspendDialog(u, reload);
    const us = document.getElementById("unsuspend");
    if (us) us.onclick = () => confirmDialog({
      title: `Häv avstängningen för ${u.name}?`, text: `${firstName(u.name)} kan spela in och synas på topplistor igen direkt.`, confirm: "Häv avstängning",
      action: async () => { await api("unsuspend", { user_id: u.id }); toast("Avstängningen hävd"); reload(); },
    });
    document.getElementById("delete").onclick = () => deleteUserDialog(u, async () => { location.hash = "#/anvandare"; });
    root.querySelectorAll("[data-remove]").forEach((b) => (b.onclick = () => {
      const d = u.days.find((x) => x.id === b.dataset.remove);
      const records = ["speed", "jump", "rotation"].map((c) => d[c] && d[c].status === "approved" ? { ...d[c], category: c, resort: d.resort_name } : null).filter(Boolean);
      removeRecordDialog(u, records, reload);
    }));
  }

  // MARK: Vägar

  async function route() {
    if (!state.me) return start();
    const h = location.hash.replace(/^#\/?/, "");
    try {
      if (h.startsWith("arende/")) await renderCase(h.slice("arende/".length));
      else if (h === "anvandare") await renderUsers();
      else if (h.startsWith("anvandare/")) await renderUser(h.slice("anvandare/".length));
      else await renderQueue();
      refreshCount().then(() => {
        const c = root.querySelector(".nav .count");
        if (c && state.me) c.textContent = state.me.queue ?? 0;
      });
    } catch (e) {
      if (/inloggad|admins/i.test(e.message)) return signOut();
      shell("queue", `<div class="card empty">${esc(e.message)}</div>`);
    }
  }

  window.addEventListener("hashchange", route);
  if (sb) sb.auth.onAuthStateChange((event) => { if (event === "SIGNED_OUT" && state.me) { state.me = null; renderLogin(); } });
  start();
})();
