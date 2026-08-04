const PAGE = 10;
const SIMILAR = 8;
const id = new URLSearchParams(location.search).get("id");

let detail;
let columns = [];
let pages = 0;
let cur = 0;
let wrap, body;

async function main() {
  let d;
  try {
    d = await getJSON(`/api/datasets/${id}`);
  } catch (e) {
    document.getElementById("dhead").innerHTML =
      `<p class="empty">dataset ${esc(id)} not found (${esc(e.message)}).</p>`;
    return;
  }
  detail = d;
  document.title = `#${d.id} - katalog`;
  renderHead(d);
  renderSpec(d);
  renderReadme(d);
  if (d.preview) renderPreview(d.preview);
  renderCanonical(d);
  renderSimilar(d);
}

async function renderCanonical(d) {
  if (d.canonical_id == null) return;
  let c;
  try {
    c = await getJSON(`/api/canonicals/${d.canonical_id}`);
  } catch {
    return;
  }
  const members = c.datasets
    .map((o) =>
      o.id === d.id
        ? `<li>#${o.id} <span class="simpath">${esc(o.path)}</span> <span class="na">(this)</span></li>`
        : `<li><a href="detail.html?id=${o.id}">#${o.id}</a> <a class="simpath" href="detail.html?id=${o.id}">${esc(o.path)}</a></li>`,
    )
    .join("");
  const prints = c.fingerprints
    .map(
      (f) =>
        `<li><code>${esc(f.scheme)}</code> <span class="fpval" title="${esc(f.value)}">${esc(f.value.slice(0, 16))}</span> <a href="detail.html?id=${f.dataset_id}">#${f.dataset_id}</a></li>`,
    )
    .join("");
  const copies =
    c.datasets.length > 1
      ? `<h2 class="section">identical copies</h2><ul class="similar">${members}</ul>`
      : "";
  document.getElementById("dcanonical").innerHTML =
    copies +
    `<details class="meta"><summary>fingerprints</summary><ul class="fingerprints">${prints}</ul></details>`;
}

function renderHead(d) {
  document.getElementById("dhead").innerHTML =
    `<h1>#${d.id}<span class="fullpath" data-path="${esc(d.path)}" title="click to copy" onclick="copyPath(this, event)">${esc(d.path)}</span></h1>`;
}

function renderSpec(d) {
  const samples =
    d.sample_count == null
      ? '<span class="na">n/a</span>'
      : commas(d.sample_count);
  const specs = [
    ["kind", esc(d.kind || "")],
    ["status", `<span class="status status-${d.status}">${d.status}</span>`],
    ["samples", samples],
    ["size", `<span title="${commas(d.size_bytes)} bytes">${humansize(d.size_bytes)}</span>`],
    ["files", commas(d.file_count)],
    ["mtime", whendate(d.latest_mtime)],
  ];
  if (d.canonical_id != null)
    specs.push(["canonical ID", `<code>c${d.canonical_id}</code>`]);
  document.getElementById("dspec").innerHTML =
    `<table class="spec">${specs
      .map(([k, v]) => `<tr><th>${k}</th><td>${v}</td></tr>`)
      .join("")}</table>
<button type="button" class="ctxbtn" onclick="copyContext(event)">copy context</button>`;
}

function copyContext(ev) {
  const d = detail;
  const lines = [
    `path: ${d.path}`,
    `kind: ${d.kind || ""}`,
    `status: ${d.status}`,
    `samples: ${d.sample_count == null ? "n/a" : commas(d.sample_count)}`,
    `size: ${humansize(d.size_bytes)}`,
    `files: ${commas(d.file_count)}`,
  ];
  navigator.clipboard.writeText(lines.join("\n"));
  showCopied(ev.clientX, ev.clientY);
}

function renderReadme(d) {
  if (!d.readme) return;
  let meta = "";
  let text = d.readme;
  const fm = text.match(/^---\n([\s\S]*?)\n---\n?/);
  if (fm) {
    meta = `<details class="meta"><summary>metadata</summary><pre>${esc(fm[1])}</pre></details>`;
    text = text.slice(fm[0].length);
  }
  document.getElementById("dreadme").innerHTML =
    `<h2 class="section">readme</h2>${meta}<div class="readme">${DOMPurify.sanitize(marked.parse(text))}</div>`;
}

async function renderSimilar(d) {
  let all;
  try {
    all = await getJSON("/api/datasets");
  } catch {
    return;
  }
  const mine = tokenize(d.path);
  if (!mine.size) return;
  const scored = all
    .filter((o) => o.id !== d.id)
    .map((o) => [o, jaccard(mine, tokenize(o.path))])
    .filter(([, s]) => s >= 0.6)
    .sort((a, b) => b[1] - a[1])
    .slice(0, SIMILAR);
  if (!scored.length) return;
  document.getElementById("dsimilar").innerHTML =
    `<h2 class="section">similar datasets</h2><ul class="similar">${scored
      .map(
        ([o]) =>
          `<li><a href="detail.html?id=${o.id}">#${o.id}</a> <a class="simpath" href="detail.html?id=${o.id}">${esc(o.path)}</a></li>`,
      )
      .join("")}</ul>`;
}

function tokenize(path) {
  const base = path.split("/").filter(Boolean).pop() || "";
  return new Set(
    base
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length > 1),
  );
}

function jaccard(a, b) {
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  const union = a.size + b.size - inter;
  return union ? inter / union : 0;
}

function mediaUrl(name) {
  return `${API}/previews/${id}/${encodeURIComponent(name)}`;
}

function cellHtml(c) {
  if (c.images) {
    const imgs = c.images
      .map(
        (im) =>
          `<a href="${mediaUrl(im.full || im.image)}" target="_blank"><img class="cellimg" loading="lazy" src="${mediaUrl(im.image)}"></a>`,
      )
      .join("");
    let h = `<div class="imgrow">${imgs}</div>`;
    if (c.more) h += `<div class="clipnote">+${c.more} more</div>`;
    if (c.struct) h += `<div class="cellstruct">${esc(c.struct)}</div>`;
    return h;
  }
  if (c.image) {
    let h = `<a href="${mediaUrl(c.full || c.image)}" target="_blank"><img class="cellimg" loading="lazy" src="${mediaUrl(c.image)}"></a>`;
    if (c.struct) h += `<div class="cellstruct">${esc(c.struct)}</div>`;
    return h;
  }
  if (c.image_url) {
    const u = esc(c.image_url);
    return `<a href="${u}" target="_blank"><img class="cellimg" loading="lazy" src="${u}" alt="${u}" onerror="this.style.display='none';this.nextElementSibling.style.display='inline'"><span class="cellbroken">&#9888; unavailable</span></a><div class="cellurl"><a href="${u}" target="_blank">${u}</a></div>`;
  }
  if (c.video) {
    let h = `<video class="cellvideo" controls preload="none" src="${mediaUrl(c.video)}"></video>`;
    if (c.clipped) h += `<div class="clipnote">${esc(c.clipped)}</div>`;
    if (c.struct) h += `<div class="cellstruct">${esc(c.struct)}</div>`;
    return h;
  }
  if (c.audio) {
    let h = `<audio class="cellaudio" controls preload="none" src="${mediaUrl(c.audio)}"></audio>`;
    if (c.clipped) h += `<div class="clipnote">${esc(c.clipped)}</div>`;
    if (c.struct) h += `<div class="cellstruct">${esc(c.struct)}</div>`;
    return h;
  }
  if (c.audio_url) {
    const u = esc(c.audio_url);
    return `<audio class="cellaudio" controls preload="none" src="${u}"></audio><div class="cellurl"><a href="${u}" target="_blank">${u}</a></div>`;
  }
  if (c.struct) return `<div class="cellstruct">${esc(c.struct)}</div>`;
  if (c.url)
    return `<a class="celllink cellw" href="${esc(c.url)}" target="_blank">${esc(c.url)}</a>`;
  if (c.text) {
    const mark = c.truncated ? '<span class="truncmark"> [truncated]</span>' : "";
    const err = c.error ? " cellerror" : "";
    if (/^\s*[{[]/.test(c.text))
      return `<pre class="celltext cellw${err}"><code class="language-json">${esc(c.text)}</code>${mark}</pre>`;
    return `<pre class="celltext cellw${err}">${esc(c.text)}${mark}</pre>`;
  }
  return "";
}

function rowsHtml(rows) {
  return rows
    .map(
      (row, i) =>
        `<tr><td class="rownum">${cur * PAGE + i + 1}</td>${row.map((c) => `<td>${cellHtml(c)}</td>`).join("")}</tr>`,
    )
    .join("");
}

function renderPreview(preview) {
  columns = preview.columns;
  pages = Math.ceil(preview.row_count / PAGE);
  const head = `<th>#</th>` + columns.map((c) => `<th>${esc(c)}</th>`).join("");
  const pager = `<div class="pager" hidden>
<button type="button" class="parrow" data-delta="-1">&larr;</button>
<span class="pvlabel"></span>
<button type="button" class="parrow" data-delta="1">&rarr;</button>
</div>`;
  document.getElementById("dpreview").innerHTML =
    `<h2 class="section">preview</h2>${pager}
<div class="tablewrap" id="pvwrap"><table class="head"><thead><tr>${head}</tr></thead><tbody id="pvbody"></tbody></table></div>
${pager}`;
  wrap = document.getElementById("pvwrap");
  body = document.getElementById("pvbody");
  document.querySelectorAll(".parrow").forEach((b) => {
    b.addEventListener("click", () => pvPage(Number(b.dataset.delta)));
  });
  wrap.addEventListener("scroll", updateFade);
  new ResizeObserver(updateFade).observe(wrap);
  loadPage(0);
}

async function loadPage(n) {
  const { rows } = await getJSON(`/api/datasets/${id}/rows?page=${n}`);
  cur = n;
  body.innerHTML = rowsHtml(rows);
  initRows();
  renderPager();
}

function pvPage(delta) {
  const next = Math.min(pages - 1, Math.max(0, cur + delta));
  if (next !== cur) loadPage(next);
}

function renderPager() {
  const text = `${cur + 1} / ${pages}`;
  document.querySelectorAll(".pvlabel").forEach((el) => (el.textContent = text));
  document.querySelectorAll(".pager").forEach((p) => {
    p.hidden = pages <= 1;
    const arrows = p.querySelectorAll(".parrow");
    arrows[0].disabled = cur === 0;
    arrows[1].disabled = cur === pages - 1;
  });
  updateFade();
}

function hlJson(text) {
  const s = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return s.replace(
    /("(?:\\.|[^"\\])*"(?:\s*:)?|\b(?:true|false|null)\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g,
    (m) => {
      let cls = "num";
      if (m[0] === '"') cls = m[m.length - 1] === ":" ? "key" : "str";
      else if (m[0] === "t" || m[0] === "f") cls = "bool";
      else if (m[0] === "n") cls = "null";
      return `<span class="j-${cls}">${m}</span>`;
    },
  );
}

const TIERS = [
  [300, "narrow"],
  [3000, "mid"],
];

function applyWidths() {
  const rows = body.querySelectorAll("tr");
  if (!rows.length) return;
  for (let c = 0; c < rows[0].children.length; c++) {
    const cells = [];
    let len = 0;
    rows.forEach((row) => {
      const cw = row.children[c] && row.children[c].querySelector(".cellw");
      if (cw) {
        cells.push(cw);
        len = Math.max(len, cw.textContent.length);
      }
    });
    const tier = TIERS.find((t) => len <= t[0]);
    if (tier) cells.forEach((cw) => cw.classList.add(tier[1]));
  }
}

function markClamp(el) {
  if (el.classList.contains("truncated") || el.scrollHeight <= el.clientHeight + 1)
    return;
  el.classList.add("truncated");
  const td = el.closest("td");
  if (td.dataset.clamp) return;
  td.dataset.clamp = "1";
  td.addEventListener("click", (e) => {
    if (e.target.closest("a, audio")) return;
    const on = !td.querySelector(".truncated").classList.contains("expanded");
    td.closest("tr")
      .querySelectorAll(".truncated")
      .forEach((c) => c.classList.toggle("expanded", on));
  });
}

function initRows() {
  body
    .querySelectorAll("code.language-json")
    .forEach((el) => (el.innerHTML = hlJson(el.textContent)));
  applyWidths();
  body.querySelectorAll(".celltext").forEach(markClamp);
  body.querySelectorAll(".imgrow").forEach((el) => {
    markClamp(el);
    el.querySelectorAll("img").forEach((img) => {
      if (!img.complete) img.addEventListener("load", () => markClamp(el));
    });
  });
}

function updateFade() {
  if (!wrap) return;
  const max = wrap.scrollWidth - wrap.clientWidth;
  wrap.classList.toggle("fade-l", wrap.scrollLeft > 1);
  wrap.classList.toggle("fade-r", wrap.scrollLeft < max - 1);
}

main();
