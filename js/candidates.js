const BASE = "/capstor/store/cscs/swissai/infra01/";

let all = [];
let selected = [];
let me = null;

const $ = (id) => document.getElementById(id);
const auth = $("auth");
const authBox = $("authbox");

function token() {
  return localStorage.getItem("resToken") || "";
}

async function whoami() {
  if (!token()) return null;
  const res = await fetch(API + "/api/me", { headers: { "X-Token": token() } });
  if (!res.ok) {
    localStorage.removeItem("resToken");
    return null;
  }
  return (await res.json()).user;
}

function renderAuth() {
  $("whoami").textContent = me || "";
  $("authbtn").textContent = me ? "sign out" : "sign in";
}

function toggleAuth() {
  if (me) {
    localStorage.removeItem("resToken");
    me = null;
    all = [];
    selected = [];
    renderAuth();
    render();
    return;
  }
  authBox.hidden = !authBox.hidden;
  if (!authBox.hidden) auth.elements.token.focus();
}

async function signIn(e) {
  e.preventDefault();
  const err = auth.querySelector(".err");
  localStorage.setItem("resToken", auth.elements.token.value.trim());
  me = await whoami();
  if (!me) {
    err.textContent = "invalid token";
    return;
  }
  err.textContent = "";
  auth.elements.token.value = "";
  authBox.hidden = true;
  renderAuth();
  await load();
}

async function load() {
  if (!me) return render();
  const res = await fetch(API + "/api/candidates", {
    headers: { "X-Token": token() },
  });
  if (!res.ok) {
    $("rows").innerHTML = `<div class="note">${
      res.status === 403 ? "not an admin" : "no candidates yet"
    }</div>`;
    $("count").textContent = "";
    return;
  }
  all = await res.json();
  render();
}

function covering(path) {
  let best = null;
  for (const root of selected) {
    if (path === root || path.startsWith(root + "/")) {
      if (!best || root.length > best.length) best = root;
    }
  }
  return best;
}

function select(root) {
  if (covering(root)) return;
  selected = selected.filter((r) => !r.startsWith(root + "/"));
  selected.push(root);
  render();
}

function release(root) {
  selected = selected.filter((r) => r !== root);
  render();
}

function segments(path, root) {
  const rel = path.slice(BASE.length);
  const parts = rel.split("/");
  let prefix = BASE;
  return parts
    .map((part, i) => {
      prefix += (i ? "/" : "") + part;
      return `<span class="seg" data-prefix="${esc(prefix)}" data-root="${
        root ? esc(root) : ""
      }">${esc(part)}</span>`;
    })
    .join('<span class="sep">/</span>');
}

function render() {
  const box = $("rows");
  if (!me) {
    box.innerHTML = '<div class="note">sign in to resolve candidates</div>';
    $("count").textContent = "";
    return;
  }
  const showMeta = $("showmeta").checked;
  const absorbed = {};
  for (const row of all) {
    const root = covering(row.path);
    if (root) absorbed[root] = (absorbed[root] || 0) + 1;
  }
  const html = [];
  const emitted = new Set();
  let left = 0;
  for (const row of all) {
    const root = covering(row.path);
    if (root) {
      if (emitted.has(root)) continue;
      emitted.add(root);
      html.push(
        `<div class="cand picked">${segments(root, root)}` +
          `<span class="tag">${absorbed[root]} rows</span></div>`,
      );
      continue;
    }
    if (row.kind === "meta" && !showMeta) continue;
    left++;
    html.push(
      `<div class="cand">${segments(row.path, "")}` +
        `<span class="tag">${esc(row.kind)} ${commas(row.files)}</span></div>`,
    );
  }
  box.innerHTML = html.join("");
  $("count").textContent = `${commas(left)} left, ${commas(
    selected.length,
  )} selected`;
}

function onClick(e) {
  const seg = e.target.closest(".seg");
  if (!seg) return;
  const prefix = seg.dataset.prefix;
  const root = seg.dataset.root;
  if (root && prefix === root) release(root);
  else select(prefix);
}

function onHover(e) {
  const seg = e.target.closest(".seg");
  for (const el of document.querySelectorAll(".hl")) {
    el.classList.remove("hl");
  }
  if (!seg) return;
  for (const el of seg.parentElement.children) {
    el.classList.add("hl");
    if (el === seg) break;
  }
}

function copySelected(e) {
  if (!selected.length) return;
  navigator.clipboard.writeText([...selected].sort().join("\n") + "\n");
  showCopied(e.clientX, e.clientY);
}

async function init() {
  $("authbtn").addEventListener("click", toggleAuth);
  auth.addEventListener("submit", signIn);
  auth.querySelector('button[name="close"]').addEventListener("click", () => {
    authBox.hidden = true;
  });
  $("showmeta").addEventListener("change", render);
  $("copy").addEventListener("click", copySelected);
  $("rows").addEventListener("click", onClick);
  $("rows").addEventListener("mouseover", onHover);
  me = await whoami();
  renderAuth();
  await load();
}

init();
