const COLUMNS = [
  ["id", "id", (r) => r.id],
  ["status", "status", (r) => r.status],
  ["mtime", "seen", (r) => r.latest_mtime],
  ["kind", "", (r) => r.kind || ""],
  ["samples", "num", (r) => (r.sample_count == null ? -1 : r.sample_count)],
  ["size", "num", (r) => r.size_bytes],
  ["path", "path", (r) => r.path],
];

let datasets = [];
let sortKey = "id";
let sortDir = "asc";

async function main() {
  document.getElementById("export").href = API + "/api/datasets.csv";
  buildHead();
  try {
    datasets = await getJSON("/api/datasets");
  } catch (e) {
    document.getElementById("body").innerHTML =
      `<tr><td colspan="7" class="empty">could not reach the api (${esc(e.message)}).</td></tr>`;
    return;
  }
  render();
}

function buildHead() {
  const head = document.getElementById("head");
  head.innerHTML = COLUMNS.map(
    ([key, cls]) =>
      `<th data-key="${key}"${cls === "num" ? ' class="num"' : ""}>${key}<span class="arrow"></span></th>`,
  ).join("");
  head.querySelectorAll("th").forEach((th) => {
    th.addEventListener("click", () => {
      const key = th.dataset.key;
      if (key === sortKey) sortDir = sortDir === "asc" ? "desc" : "asc";
      else {
        sortKey = key;
        sortDir = "asc";
      }
      render();
    });
  });
}

function render() {
  const get = COLUMNS.find((c) => c[0] === sortKey)[2];
  const dir = sortDir === "asc" ? 1 : -1;
  const sorted = [...datasets].sort((a, b) => {
    const x = get(a),
      y = get(b);
    return x < y ? -dir : x > y ? dir : 0;
  });
  document.getElementById("body").innerHTML = sorted.map(rowHtml).join("");
  document.querySelectorAll("#head th").forEach((th) => {
    th.querySelector(".arrow").textContent =
      th.dataset.key === sortKey ? (sortDir === "asc" ? "↑" : "↓") : "";
  });
  applyFilter();
}

function rowHtml(r) {
  const samples =
    r.sample_count == null
      ? '<span class="na">n/a</span>'
      : `<span title="${commas(r.sample_count)} samples">${humancount(r.sample_count)}</span>`;
  return `<tr data-search="${esc(r.path.toLowerCase())}">
<td class="id"><a href="detail.html?id=${r.id}">#${r.id}</a></td>
<td class="status status-${r.status}">${r.status}</td>
<td class="seen">${whendate(r.latest_mtime)}</td>
<td>${esc(r.kind || "")}</td>
<td class="num">${samples}</td>
<td class="num"><span title="${commas(r.size_bytes)} bytes">${humansize(r.size_bytes)}</span></td>
<td class="path"><a class="pathlink" href="detail.html?id=${r.id}"><span class="pathtext" data-path="${esc(r.path)}">${esc(r.path)}</span></a></td>
</tr>`;
}

function markRange(text, start, end) {
  let out = "";
  for (let i = 0; i < text.length; i++) {
    if (i === start) out += "<mark>";
    if (i === end) out += "</mark>";
    out += esc(text[i]);
  }
  return out + (end === text.length ? "</mark>" : "");
}

function applyFilter() {
  const q = document.getElementById("search").value.trim().toLowerCase();
  document.querySelectorAll("#body tr[data-search]").forEach((row) => {
    const pt = row.querySelector(".pathtext");
    const path = pt.dataset.path;
    if (!q) {
      row.style.display = "";
      pt.textContent = path;
      return;
    }
    const i = row.dataset.search.indexOf(q);
    if (i < 0) {
      row.style.display = "none";
      return;
    }
    row.style.display = "";
    pt.innerHTML = markRange(path, i, i + q.length);
  });
}

document.getElementById("search").addEventListener("input", applyFilter);
main();
