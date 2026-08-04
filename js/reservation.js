const CAP = 600;
const LEVELS = [0, 128, 256, 384];
const PAST_H = 12;
const FUTURE_H = 24;
const VIEW_PAST_H = 6;
const VIEW_H = VIEW_PAST_H + FUTURE_H;
const HOLE = 300;
const SNAP = 600;
const MIN_NODES = 4;
const DELTA_RED = 8;
const REFRESH = 60000;
const MIN_W = 1100;
const MIN_H = 320;
const MAX_H = 1080;
const PAD_T = 16;
const PAD_B = 28;
const COLS = 6;

let usage = [];
let reservations = [];
let samples = [];
let t0 = 0;
let t1 = 1;
let W = 0;
let H = MIN_H;
let hoverT = null;
let drag = null;
let placed = false;
let plot, yaxis, wrap, pop, field, cursor, sel;

const $ = (id) => document.getElementById(id);
const x = (t) => ((t - t0) / (t1 - t0)) * W;
const invX = (px) => t0 + (px / W) * (t1 - t0);
const y = (n) => H - PAD_B - (n / CAP) * (H - PAD_T - PAD_B);
const snap = (t) => Math.round(t / SNAP) * SNAP;
const mask = (u) => (u ? u.slice(0, 3) + "***" : "***");
const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);

const p2 = (v) => String(v).padStart(2, "0");
const hm = (ts) => {
  const d = new Date(ts * 1000);
  return `${p2(d.getHours())}:${p2(d.getMinutes())}`;
};
const day = (ts) => {
  const d = new Date(ts * 1000);
  return `${p2(d.getDate())}.${p2(d.getMonth() + 1)}.`;
};
const today = (ts) =>
  new Date(ts * 1000).toDateString() === new Date().toDateString();
const stamp = (ts) => `${hm(ts)} ${day(ts)}`;
const clock = (ts) => (today(ts) ? hm(ts) : stamp(ts));
const clockHtml = (ts) =>
  today(ts) ? hm(ts) : `${hm(ts)} <span class="dt">${day(ts)}</span>`;

function parseWhen(s) {
  const m = s.trim().match(/^(\d{1,2}):(\d{2})(?:\s+(\d{1,2})\.(\d{1,2})\.?)?$/);
  if (!m) return null;
  const now = new Date();
  const d = new Date(
    now.getFullYear(),
    m[4] ? Number(m[4]) - 1 : now.getMonth(),
    m[3] ? Number(m[3]) : now.getDate(),
    Number(m[1]),
    Number(m[2]),
  );
  return Math.floor(d.getTime() / 1000);
}

async function main() {
  plot = $("plot");
  yaxis = $("yaxis");
  wrap = $("plotwrap");
  pop = $("pop");
  field = pop.elements;
  field.user.value = localStorage.getItem("resUser") || "";
  field.nodes.min = MIN_NODES;
  pop.addEventListener("submit", submit);
  field.close.addEventListener("click", closePop);
  plot.addEventListener("mousemove", onMove);
  plot.addEventListener("mouseleave", onLeave);
  plot.addEventListener("mouseover", (e) => highlight(e, true));
  plot.addEventListener("mouseout", (e) => highlight(e, false));
  plot.addEventListener("mousedown", onDown);
  wrap.addEventListener("scroll", updateFade);
  window.addEventListener("mouseup", onUp);
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closePop();
  });
  new ResizeObserver(render).observe(wrap);
  await load();
  setInterval(load, REFRESH);
}

async function load() {
  try {
    [usage, reservations] = await Promise.all([
      getJSON("/api/usage"),
      getJSON("/api/reservations"),
    ]);
  } catch (e) {
    $("when").innerHTML = `could not reach the api (${esc(e.message)}).`;
    return;
  }
  render();
}

function buildSamples() {
  const byTs = new Map();
  for (const u of usage) {
    if (u.ts < t0) continue;
    let s = byTs.get(u.ts);
    if (!s) {
      s = { ts: u.ts, total: 0, users: [] };
      byTs.set(u.ts, s);
    }
    s.total += u.nodes;
    s.users.push(u);
  }
  return [...byTs.values()].sort((a, b) => a.ts - b.ts);
}

function segments(now) {
  const segs = [];
  if (!samples.length) return [{ hole: true, from: t0, to: now }];
  if (samples[0].ts - t0 > HOLE)
    segs.push({ hole: true, from: t0, to: samples[0].ts });
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i];
    const end = i + 1 < samples.length ? samples[i + 1].ts : now;
    const cover = Math.min(end, s.ts + HOLE);
    if (cover > s.ts) segs.push({ from: s.ts, to: cover, level: s.total });
    if (end > cover) segs.push({ hole: true, from: cover, to: end });
  }
  return segs;
}

function lanes() {
  const cuts = [...new Set(reservations.flatMap((r) => [r.start, r.end]))].sort(
    (a, b) => a - b,
  );
  const out = new Map();
  for (let i = 0; i + 1 < cuts.length; i++) {
    const a = cuts[i];
    const b = cuts[i + 1];
    const active = reservations
      .filter((r) => r.start <= a && b <= r.end)
      .sort((p, q) => p.start - q.start || p.id - q.id);
    let base = 0;
    for (const r of active) {
      const arr = out.get(r.id) || [];
      const last = arr[arr.length - 1];
      if (last && last.to === a && last.base === base) last.to = b;
      else arr.push({ from: a, to: b, base });
      out.set(r.id, arr);
      base += r.nodes;
    }
  }
  return out;
}

function sampleAt(t) {
  let best = null;
  for (const s of samples) {
    if (s.ts <= t && t - s.ts <= HOLE) best = s;
    else if (s.ts > t) break;
  }
  return best;
}

function gridSvg() {
  const out = LEVELS.map(
    (n) => `<line class="grid" x1="0" y1="${y(n)}" x2="${W}" y2="${y(n)}"/>`,
  );
  out.push(`<line class="cap" x1="0" y1="${y(CAP)}" x2="${W}" y2="${y(CAP)}"/>`);
  for (let t = Math.ceil(t0 / 3600) * 3600; t <= t1; t += 3600) {
    if (new Date(t * 1000).getHours() % 3) continue;
    const xx = x(t);
    out.push(`<line class="grid" x1="${xx}" y1="${PAD_T}" x2="${xx}" y2="${H - PAD_B}"/>`);
    out.push(`<text class="axis xaxis" x="${xx}" y="${H - PAD_B + 12}" text-anchor="middle">${hm(t)}</text>`);
  }
  return out;
}

function usageSvg(now) {
  return segments(now).map((seg) => {
    const x1 = x(seg.from);
    const w = Math.max(0, x(seg.to) - x1);
    if (seg.hole)
      return `<rect fill="url(#stripes)" x="${x1}" y="${PAD_T}" width="${w}" height="${y(0) - PAD_T}"/>`;
    return `<rect class="usage" x="${x1}" y="${y(seg.level)}" width="${w}" height="${y(0) - y(seg.level)}"/>`;
  });
}

function bookingsSvg() {
  const byId = lanes();
  const out = [];
  for (const r of reservations) {
    for (const seg of byId.get(r.id) || []) {
      const x1 = x(Math.max(seg.from, t0));
      const w = Math.max(0, x(Math.min(seg.to, t1)) - x1);
      if (w <= 0) continue;
      const yt = y(seg.base + r.nodes);
      const yb = y(seg.base);
      const cid = `rc${out.length}`;
      out.push(`<rect class="res" data-res="${r.id}" x="${x1}" y="${yt}" width="${w}" height="${yb - yt}"/>
<clipPath id="${cid}"><rect x="${x1 + 3}" y="${yt}" width="${Math.max(0, w - 5)}" height="${yb - yt}"/></clipPath>
<text class="reslabel" clip-path="url(#${cid})" x="${x1 + 4}" y="${(yt + yb) / 2 + 4}">${esc(r.user)} ${r.nodes}</text>`);
    }
  }
  return out;
}

function overlaySvg(now) {
  const xn = x(now);
  return [
    `<line class="now" x1="${xn}" y1="${PAD_T}" x2="${xn}" y2="${H - PAD_B}"/>`,
    `<text class="axis" x="${xn}" y="${PAD_T - 4}" text-anchor="middle">now</text>`,
    `<line id="cursor" y1="${PAD_T}" y2="${H - PAD_B}"/>`,
    `<rect id="sel" y="${PAD_T}" height="${H - PAD_T - PAD_B}"/>`,
  ];
}

function render() {
  if (!plot) return;
  const now = Math.floor(Date.now() / 1000);
  H = clamp(wrap.clientHeight, MIN_H, MAX_H);
  t0 = now - PAST_H * 3600;
  t1 = now + FUTURE_H * 3600;
  for (const r of reservations) if (r.end > t1) t1 = r.end;
  const pxh = Math.max(wrap.clientWidth, MIN_W) / VIEW_H;
  W = ((t1 - t0) / 3600) * pxh;
  samples = buildSamples();

  plot.setAttribute("viewBox", `0 0 ${W} ${H}`);
  plot.style.width = W + "px";
  plot.style.height = H + "px";
  plot.innerHTML = [
    `<defs><pattern id="stripes" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line class="stripe" x1="0" y1="0" x2="0" y2="7"/></pattern></defs>`,
    ...gridSvg(),
    ...usageSvg(now),
    ...bookingsSvg(),
    ...overlaySvg(now),
  ].join("");
  cursor = $("cursor");
  sel = $("sel");

  yaxis.setAttribute("viewBox", `0 0 40 ${H}`);
  yaxis.style.height = H + "px";
  yaxis.innerHTML = [...LEVELS, CAP]
    .map((n) => `<text class="axis" x="34" y="${y(n) + 3}" text-anchor="end">${n}</text>`)
    .join("");

  if (!placed) {
    wrap.scrollLeft = (PAST_H - VIEW_PAST_H) * pxh;
    placed = true;
  }
  updateFade();
  renderTable();
}

function updateFade() {
  const max = wrap.scrollWidth - wrap.clientWidth;
  wrap.classList.toggle("fade-l", wrap.scrollLeft > 1);
  wrap.classList.toggle("fade-r", wrap.scrollLeft < max - 1);
}

function bookedAt(t) {
  const m = new Map();
  for (const r of reservations) {
    if (r.start > t || t >= r.end) continue;
    const e = m.get(r.user) || { nodes: 0, start: r.start, end: r.end };
    e.nodes += r.nodes;
    e.start = Math.min(e.start, r.start);
    e.end = Math.max(e.end, r.end);
    m.set(r.user, e);
  }
  return m;
}

function runningAt(t) {
  const s = sampleAt(t);
  if (!s) return null;
  const m = new Map();
  for (const u of s.users)
    if (u.nodes) m.set(u.user, (m.get(u.user) || 0) + u.nodes);
  return m;
}

function rowHtml(r, past) {
  const book = r.book;
  const name = esc(book ? r.user : mask(r.user));
  const used = !past ? "" : r.used == null ? "?" : r.used;
  const reserved = book ? book.nodes : "";
  const from = book ? `${clockHtml(book.start)} <span class="dt">-</span>` : "";
  const to = book ? clockHtml(book.end) : "";
  const diff = past && r.used != null ? r.used - (book ? book.nodes : 0) : null;
  const delta =
    diff == null ? "" : diff > 0 ? `-${diff}` : diff < 0 ? `+${-diff}` : "0";
  const cls = diff == null ? "" : diff > DELTA_RED ? " over" : " ok";
  return `<tr><td>${name}</td><td class="num">${used}</td><td class="num">${reserved}</td><td class="from">${from}</td><td class="to">${to}</td><td class="num${cls}">${delta}</td></tr>`;
}

function renderTable() {
  const now = Math.floor(Date.now() / 1000);
  const t = hoverT == null ? now : hoverT;
  const past = t <= now;
  const booked = bookedAt(t);
  const run = past ? runningAt(t) : null;

  $("when").innerHTML =
    hoverT == null
      ? `<b>now</b> ${clock(now)}`
      : `${past ? "at" : "planned"} <b>${clock(t)}</b>`;

  const users = new Set(booked.keys());
  if (run) for (const u of run.keys()) users.add(u);
  const peak = (r) => Math.max(r.used || 0, r.book ? r.book.nodes : 0);
  const rows = [...users]
    .map((user) => ({
      user,
      used: run ? run.get(user) || 0 : null,
      book: booked.get(user),
    }))
    .sort((a, b) => peak(b) - peak(a));

  $("tbody").innerHTML = rows.length
    ? rows.map((r) => rowHtml(r, past)).join("")
    : `<tr><td colspan="${COLS}" class="empty">${past && !run ? "no usage recorded at this time." : "nothing here."}</td></tr>`;
}

function pointerX(e) {
  const r = plot.getBoundingClientRect();
  return ((e.clientX - r.left) / r.width) * W;
}

function highlight(e, on) {
  const id = e.target.dataset && e.target.dataset.res;
  if (!id) return;
  plot
    .querySelectorAll(`[data-res="${id}"]`)
    .forEach((el) => el.classList.toggle("hl", on));
}

function onMove(e) {
  if (!W) return;
  const px = pointerX(e);
  if (drag) {
    drag.x1 = clamp(px, 0, W);
    sel.setAttribute("x", Math.min(drag.x0, drag.x1));
    sel.setAttribute("width", Math.abs(drag.x1 - drag.x0));
    sel.style.visibility = "visible";
  }
  if (px < 0 || px > W) return;
  cursor.setAttribute("x1", px);
  cursor.setAttribute("x2", px);
  cursor.style.visibility = "visible";
  hoverT = Math.round(invX(px));
  renderTable();
}

function onLeave() {
  if (drag) return;
  if (cursor) cursor.style.visibility = "hidden";
  hoverT = null;
  renderTable();
}

function onDown(e) {
  if (e.target.dataset.res) return;
  closePop();
  drag = { x0: clamp(pointerX(e), 0, W) };
}

function onUp(e) {
  const d = drag;
  drag = null;
  if (sel) sel.style.visibility = "hidden";
  if (d && d.x1 != null && Math.abs(d.x1 - d.x0) > 4) {
    openPop(Math.min(d.x0, d.x1), Math.max(d.x0, d.x1));
    return;
  }
  const id = e.target.dataset && e.target.dataset.res;
  if (id) cancel(Number(id));
}

function openPop(xa, xb) {
  const from = snap(invX(xa));
  const to = Math.max(snap(invX(xb)), from + SNAP);
  field.from.value = stamp(from);
  field.to.value = stamp(to);
  setError("");
  pop.hidden = false;
  pop.style.left =
    Math.min(xa, wrap.scrollLeft + wrap.clientWidth - pop.offsetWidth - 8) + "px";
  pop.style.top = PAD_T + 8 + "px";
  (field.user.value ? field.nodes : field.user).focus();
}

function closePop() {
  if (pop) pop.hidden = true;
}

function setError(msg) {
  pop.querySelector(".err").textContent = msg;
}

async function submit(e) {
  e.preventDefault();
  const user = field.user.value.trim();
  const nodes = parseInt(field.nodes.value, 10);
  const start = parseWhen(field.from.value);
  const end = parseWhen(field.to.value);
  if (!user) return setError("enter a username");
  if (!(nodes >= MIN_NODES)) return setError(`book at least ${MIN_NODES} nodes`);
  if (!start || !end) return setError("time must be HH:MM or HH:MM DD.MM.");
  localStorage.setItem("resUser", user);
  try {
    const res = await fetch(API + "/api/reservations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user, nodes, start, end }),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      return setError(d.detail || `error ${res.status}`);
    }
  } catch (ex) {
    return setError(String(ex));
  }
  closePop();
  await load();
}

async function cancel(id) {
  const r = reservations.find((o) => o.id === id);
  if (!r) return;
  if (!confirm(`cancel ${r.user} ${r.nodes} nodes ${clock(r.start)} - ${clock(r.end)}?`))
    return;
  await fetch(API + "/api/reservations/" + id, { method: "DELETE" });
  await load();
}

main();
