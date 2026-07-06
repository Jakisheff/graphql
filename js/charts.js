/* Hand-built SVG charts: line/area, horizontal bars, donut. */

const NS = "http://www.w3.org/2000/svg";

function el(tag, attrs = {}, children = []) {
  const node = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  for (const child of children) node.appendChild(child);
  return node;
}

function text(str, attrs = {}) {
  const node = el("text", { class: "axis-label", ...attrs });
  node.textContent = str;
  return node;
}

/* ---------- tooltip ---------- */

const tooltip = () => document.getElementById("tooltip");

function showTip(evt, html) {
  const tip = tooltip();
  tip.innerHTML = html;
  tip.classList.remove("hidden");
  moveTip(evt);
}

function moveTip(evt) {
  const tip = tooltip();
  const pad = 14;
  let x = evt.clientX + pad;
  let y = evt.clientY + pad;
  const rect = tip.getBoundingClientRect();
  if (x + rect.width > window.innerWidth - 8) x = evt.clientX - rect.width - pad;
  if (y + rect.height > window.innerHeight - 8) y = evt.clientY - rect.height - pad;
  tip.style.left = `${x}px`;
  tip.style.top = `${y}px`;
}

function hideTip() {
  tooltip().classList.add("hidden");
}

function attachTip(node, htmlFn) {
  node.addEventListener("mouseenter", (e) => showTip(e, htmlFn()));
  node.addEventListener("mousemove", moveTip);
  node.addEventListener("mouseleave", hideTip);
}

/* ---------- helpers ---------- */

export function formatXP(n) {
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)} MB`;
  if (n >= 1e3) return `${Math.round(n / 1e3)} kB`;
  return `${Math.round(n)} B`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function fmtDate(d) {
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

// round the axis max up to a "nice" value and produce tick steps
function niceTicks(max, count = 4) {
  const rawStep = max / count;
  const mag = 10 ** Math.floor(Math.log10(rawStep || 1));
  const step = [1, 2, 2.5, 5, 10].find((m) => m * mag >= rawStep) * mag;
  const ticks = [];
  for (let v = 0; ; v += step) {
    ticks.push(v);
    if (v >= max) break;
  }
  return ticks;
}

/* ---------- line / area chart: cumulative XP over time ---------- */

export function xpOverTimeChart(container, points) {
  container.innerHTML = "";
  if (points.length === 0) {
    container.textContent = "No XP data yet.";
    return;
  }

  const W = 760, H = 300;
  const pad = { l: 58, r: 18, t: 16, b: 34 };
  const iw = W - pad.l - pad.r;
  const ih = H - pad.t - pad.b;

  const t0 = points[0].date.getTime();
  const t1 = points[points.length - 1].date.getTime();
  const span = Math.max(t1 - t0, 1);
  const maxY = points[points.length - 1].cum;
  const ticks = niceTicks(maxY);
  const yMax = ticks[ticks.length - 1] || 1;

  const X = (t) => pad.l + ((t - t0) / span) * iw;
  const Y = (v) => pad.t + ih - (v / yMax) * ih;

  const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, xmlns: NS });

  // gradient for the area fill
  const gradId = "xp-area-grad";
  svg.appendChild(el("defs", {}, [
    el("linearGradient", { id: gradId, x1: 0, y1: 0, x2: 0, y2: 1 }, [
      el("stop", { offset: "0%", "stop-color": "#7c5cff", "stop-opacity": 0.45 }),
      el("stop", { offset: "100%", "stop-color": "#7c5cff", "stop-opacity": 0.02 }),
    ]),
  ]));

  // horizontal grid + y labels
  for (const v of ticks) {
    const y = Y(v);
    svg.appendChild(el("line", { class: "grid-line", x1: pad.l, x2: W - pad.r, y1: y, y2: y }));
    svg.appendChild(text(formatXP(v), { x: pad.l - 8, y: y + 4, "text-anchor": "end" }));
  }

  // x labels: up to 6 evenly spaced dates
  const nLabels = Math.min(6, points.length);
  for (let i = 0; i < nLabels; i++) {
    const t = t0 + (span * i) / Math.max(nLabels - 1, 1);
    const d = new Date(t);
    svg.appendChild(text(`${MONTHS[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`, {
      x: X(t), y: H - 10, "text-anchor": "middle",
    }));
  }

  // step-after path (XP accumulates in jumps)
  let line = `M ${X(points[0].date.getTime())} ${Y(points[0].cum)}`;
  for (let i = 1; i < points.length; i++) {
    const x = X(points[i].date.getTime());
    line += ` L ${x} ${Y(points[i - 1].cum)} L ${x} ${Y(points[i].cum)}`;
  }
  const area = `${line} L ${X(t1)} ${Y(0)} L ${X(t0)} ${Y(0)} Z`;

  svg.appendChild(el("path", { d: area, fill: `url(#${gradId})` }));
  svg.appendChild(el("path", {
    d: line, fill: "none", stroke: "#7c5cff", "stroke-width": 2.5,
    "stroke-linejoin": "round",
  }));

  // hover: nearest point marker + tooltip
  const marker = el("circle", { r: 4.5, fill: "#2dd4bf", stroke: "#0d1117", "stroke-width": 2, opacity: 0 });
  svg.appendChild(marker);

  const overlay = el("rect", { x: pad.l, y: pad.t, width: iw, height: ih, fill: "transparent" });
  overlay.addEventListener("mousemove", (evt) => {
    const rect = svg.getBoundingClientRect();
    const mx = ((evt.clientX - rect.left) / rect.width) * W;
    const t = t0 + ((mx - pad.l) / iw) * span;
    let nearest = points[0];
    for (const p of points) {
      if (Math.abs(p.date.getTime() - t) < Math.abs(nearest.date.getTime() - t)) nearest = p;
    }
    marker.setAttribute("cx", X(nearest.date.getTime()));
    marker.setAttribute("cy", Y(nearest.cum));
    marker.setAttribute("opacity", 1);
    showTip(evt,
      `<b>${formatXP(nearest.cum)}</b> total<br>` +
      `${nearest.label} · +${formatXP(nearest.amount)}<br>` +
      `${fmtDate(nearest.date)}`);
  });
  overlay.addEventListener("mouseleave", () => {
    marker.setAttribute("opacity", 0);
    hideTip();
  });
  svg.appendChild(overlay);

  container.appendChild(svg);
}

/* ---------- horizontal bar chart ---------- */

export function barChart(container, items, { color = "#2dd4bf", valueFmt = formatXP } = {}) {
  container.innerHTML = "";
  if (items.length === 0) {
    container.textContent = "No data yet.";
    return;
  }

  const rowH = 34;
  const W = 760;
  const pad = { l: 170, r: 70, t: 8, b: 8 };
  const H = pad.t + pad.b + items.length * rowH;
  const iw = W - pad.l - pad.r;
  const max = Math.max(...items.map((d) => d.value)) || 1;

  const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, xmlns: NS });

  items.forEach((item, i) => {
    const y = pad.t + i * rowH;
    const w = Math.max((item.value / max) * iw, 2);

    const label = item.name.length > 22 ? `${item.name.slice(0, 21)}…` : item.name;
    svg.appendChild(text(label, {
      x: pad.l - 10, y: y + rowH / 2 + 4, "text-anchor": "end", fill: "#e6edf3",
    }));

    const bar = el("rect", {
      class: "bar-rect", x: pad.l, y: y + 7, width: w, height: rowH - 14,
      rx: 5, fill: color,
    });
    attachTip(bar, () => `<b>${item.name}</b><br>${valueFmt(item.value)}`);
    svg.appendChild(bar);

    svg.appendChild(text(valueFmt(item.value), {
      x: pad.l + w + 8, y: y + rowH / 2 + 4,
    }));
  });

  container.appendChild(svg);
}

/* ---------- donut chart ---------- */

export function donutChart(container, segments, centerLabel, centerSub) {
  container.innerHTML = "";
  const total = segments.reduce((s, seg) => s + seg.value, 0);
  if (total <= 0) {
    container.textContent = "No data yet.";
    return;
  }

  const W = 340, H = 240;
  const cx = 120, cy = H / 2, r = 88, stroke = 26;
  const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, xmlns: NS });

  const arcPoint = (angle) => [
    cx + r * Math.cos(angle - Math.PI / 2),
    cy + r * Math.sin(angle - Math.PI / 2),
  ];

  let start = 0;
  for (const seg of segments) {
    const frac = seg.value / total;
    // full-circle arcs collapse to nothing, so cap just below 1
    const sweep = Math.min(frac, 0.99999) * Math.PI * 2;
    const [x0, y0] = arcPoint(start);
    const [x1, y1] = arcPoint(start + sweep);
    const large = sweep > Math.PI ? 1 : 0;

    const path = el("path", {
      class: "donut-seg",
      d: `M ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1}`,
      fill: "none",
      stroke: seg.color,
      "stroke-width": stroke,
      "stroke-linecap": frac >= 0.999 ? "butt" : "round",
    });
    attachTip(path, () =>
      `<b>${seg.label}</b><br>${seg.display ?? seg.value} · ${(frac * 100).toFixed(1)}%`);
    svg.appendChild(path);
    start += sweep;
  }

  const center = text(centerLabel, {
    x: cx, y: cy + 2, "text-anchor": "middle",
    fill: "#e6edf3", "font-size": 26, "font-weight": 700,
  });
  svg.appendChild(center);
  svg.appendChild(text(centerSub, { x: cx, y: cy + 24, "text-anchor": "middle" }));

  // legend
  segments.forEach((seg, i) => {
    const y = cy - 20 + i * 28;
    svg.appendChild(el("rect", { x: 236, y: y - 9, width: 12, height: 12, rx: 3, fill: seg.color }));
    svg.appendChild(text(`${seg.label}`, { x: 254, y, fill: "#e6edf3" }));
    svg.appendChild(text(seg.display ?? String(seg.value), { x: 254, y: y + 15 }));
  });

  container.appendChild(svg);
}
