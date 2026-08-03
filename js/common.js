async function getJSON(path) {
  const res = await fetch(API + path);
  if (!res.ok) throw new Error(res.status);
  return res.json();
}

function esc(s) {
  return String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
  );
}

function humancount(n) {
  for (const [scale, suffix] of [
    [1e9, "B"],
    [1e6, "M"],
    [1e3, "K"],
  ]) {
    if (n >= scale) return (n / scale).toFixed(1) + suffix;
  }
  return String(n);
}

function humansize(n) {
  for (const [scale, suffix] of [
    [1e12, "TB"],
    [1e9, "GB"],
    [1e6, "MB"],
    [1e3, "KB"],
  ]) {
    if (n >= scale) return (n / scale).toFixed(1) + " " + suffix;
  }
  return n + " B";
}

function commas(n) {
  return n.toLocaleString("en-US");
}

function whendate(ts) {
  const d = new Date(ts * 1000);
  const p = (x) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function showCopied(x, y) {
  const b = document.getElementById("copybubble");
  b.textContent = "copied";
  b.style.left = x + "px";
  b.style.top = y + "px";
  b.classList.add("show");
  clearTimeout(b._timer);
  b._timer = setTimeout(() => b.classList.remove("show"), 900);
}

function copyPath(el, ev) {
  navigator.clipboard.writeText(el.dataset.path);
  showCopied(ev.clientX, ev.clientY);
  el.classList.add("copied");
  setTimeout(() => el.classList.remove("copied"), 900);
}
