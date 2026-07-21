// Unified Discover Portal — ONE Leaflet map. Exports window.DPMap
//
// Progressive-disclosure map UX (GitHub map-marker redesign).
// Design principles wired in here:
//   1. ONE map instance. Marker set = pure function of (journey, level) → `layer`.
//   2. Three independent concerns, three effects — this is what kills the jitter:
//        • rebuild()      rebuilds markers    → fires on buildKey  (level + selection + result-set)
//        • camera move    flyTo / flyToBounds → fires only when cameraKey changes (level + selection)
//        • applyActive()  restyle + panInside → fires only when the focused listing changes
//      Hovering a card or clicking a pin NEVER re-runs the camera, so the view holds still.
//   3. Dense leaf markers (listings / homes / parcels) are CLUSTERED by pixel proximity at the
//      live zoom, and re-clustered on every zoom/pan. Clicking a cluster flies into its bounds,
//      which reveals the markers inside it — progressive disclosure, never a marker dump.
//   4. Leaf markers carry an infographic POPUP (image + price + facts) with ‹ / › to step
//      marker-to-marker without losing context, plus "Show in list" to highlight the panel card.
//   Agri keeps its own evergreen layers and never mixes with residential / school markers.

const { Icon: MIcon } = window.ReTrendsDesignSystem_f37966;
const CO = window.BLR_COUNTS;
const AG = window.BLR_AGRI;
const short = window.BLR_INR_SHORT;
const TIER_LABEL = { verified: "Verified", trusted: "Trusted", listed: "Listed" };

// ---- marker HTML builders (navigation levels) ----
// `leader` (optional): subtle line + anchor dot drawn from the visible chip back to the
// TRUE geographic anchor when the chip has been offset in screen space (Part A declutter).
function leaderHTML(dx, dy, tone) {
  const len = Math.hypot(dx, dy);
  if (len < 16) return "";
  const ang = Math.atan2(dy, dx) * 180 / Math.PI;
  const c = tone === "plum" ? "var(--plum-500)" : "var(--navy-700, #2A3B5F)";
  return `<div style="position:absolute;left:50%;top:50%;width:${Math.round(len)}px;height:1.5px;background:${c};opacity:.38;transform-origin:0 50%;transform:rotate(${ang.toFixed(1)}deg);pointer-events:none;"></div>
    <div style="position:absolute;left:calc(50% + ${Math.round(dx)}px);top:calc(50% + ${Math.round(dy)}px);width:7px;height:7px;margin:-3.5px 0 0 -3.5px;border-radius:var(--radius-full);background:${c};border:1.5px solid #fff;box-shadow:var(--shadow-sm);pointer-events:none;"></div>`;
}
// Deterministic screen-space declutter (Part A). True anchors never move — only the
// visible chip shifts. Entries are placed in PRIORITY order (selected > count > rest);
// higher-priority chips move less (they claim their spot first). `dir` locks the shift
// direction (used to preserve N/S/E/W meaning for region bubbles).
function declutterPoints(entries, opts) {
  opts = opts || {};
  const out = (opts.obstacles || []).map((rect) => ({ rect, obstacle: true }));
  const nOb = out.length;
  const bd = opts.bounds; // {minX,minY,maxX,maxY} — clamp each rect fully inside
  const rectAt = (p, e) => ({ x: p.x - e.w / 2, y: p.y - e.h / 2, w: e.w, h: e.h });
  const clamp = (p, e) => {
    if (!bd) return p;
    let x = p.x, y = p.y;
    x = Math.max(bd.minX + e.w / 2, Math.min(bd.maxX - e.w / 2, x));
    y = Math.max(bd.minY + e.h / 2, Math.min(bd.maxY - e.h / 2, y));
    return window.L.point(x, y);
  };
  const overlap = (a, b) => a.x - 8 < b.x + b.w && b.x - 8 < a.x + a.w && a.y - 8 < b.y + b.h && b.y - 8 < a.y + a.h;
  const overlapArea = (r) => {
    let s = 0;
    out.forEach((o) => {
      const ix = Math.max(0, Math.min(r.x + r.w, o.rect.x + o.rect.w) - Math.max(r.x, o.rect.x));
      const iy = Math.max(0, Math.min(r.y + r.h, o.rect.y + o.rect.h) - Math.max(r.y, o.rect.y));
      s += ix * iy;
    });
    return s;
  };
  entries.slice().sort((a, b) => b.pri - a.pri).forEach((e) => {
    // Try the true anchor, then an expanding golden-angle spiral of candidates around it
    // (deterministic). Coincident anchors separate because the radius GROWS each step — a
    // fixed-radius nudge could orbit forever and let two cards stack fully.
    let best = null, bestOv = Infinity;
    for (let k = 0; k < 90; k++) {
      const ang = k * 2.399963;                  // golden angle
      const rad = k === 0 ? 0 : 12 + k * 6;       // px, grows outward
      const cand = clamp(window.L.point(e.pt.x + Math.cos(ang) * rad, e.pt.y + Math.sin(ang) * rad), e);
      const rect = rectAt(cand, e);
      if (!out.some((o) => overlap(rect, o.rect))) { best = cand; break; }
      const ov = overlapArea(rect);
      if (ov < bestOv) { bestOv = ov; best = cand; }
    }
    out.push({ e, p: best, rect: rectAt(best, e) });
  });
  return out.slice(nOb);
}
// --- Navigational (viewport-anchored) layout for the UPPER hierarchy -----------
// Region / area-group / zone markers are NAVIGATION controls, not geographic pins. In
// "Guided" mode we ignore centroids and arrange children in a deliberate pattern chosen by
// CHILD COUNT, inside a safe rect that clears the breadcrumb + instruction card (top-left),
// the legend + summary pill (bottom), and the panel edge. No leader lines — nothing pretends
// to sit on a real coordinate. Deterministic; recomputed on zoom/move/resize only.
// Spread a set of angles (radians) so no two are closer than minGap, moving each as little
// as possible while preserving their circular ORDER — lets navigation markers keep their real
// compass bearing when there's room, and fan out evenly only where bearings crowd. Deterministic.
function spreadAngles(raw, minGap) {
  const n = raw.length;
  if (n < 2) return raw.slice();
  const TWO = Math.PI * 2, gap = Math.min(minGap, TWO / n);
  const idx = raw.map((a, i) => ({ a: ((a % TWO) + TWO) % TWO, i })).sort((p, q) => p.a - q.a);
  const a = idx.map((o) => o.a);
  for (let k = 1; k < n; k++) if (a[k] < a[k - 1] + gap) a[k] = a[k - 1] + gap;
  if (a[0] + TWO - a[n - 1] < gap) { const start = a[0]; for (let k = 0; k < n; k++) a[k] = start + k * (TWO / n); }
  const out = new Array(n);
  idx.forEach((o, k) => { out[o.i] = a[k]; });
  return out;
}
function navSafeRect(map, isMobile) {
  const s = map.getSize();
  const topPad = isMobile ? 150 : 182;   // breadcrumb + persistent instruction card
  const botPad = isMobile ? 118 : 128;   // legend + centre summary pill
  const side = Math.max(72, Math.min(120, s.x * 0.13));
  return { x0: side, y0: topPad, x1: s.x - side, y1: s.y - botPad };
}
function navPoints(entries, map, isMobile) {
  const r = navSafeRect(map, isMobile);
  const cx = (r.x0 + r.x1) / 2, cy = (r.y0 + r.y1) / 2;
  const halfW = Math.max(60, (r.x1 - r.x0) / 2), halfH = Math.max(60, (r.y1 - r.y0) / 2);
  const P = (x, y) => window.L.point(x, y);
  const out = new Map();
  const n = entries.length;
  // Regions carry a compass direction → a stable plus-shaped layout (N up, S down, E/W sides,
  // Central in the middle) so the map still reads as a rough mental map of the city.
  if (entries.some((e) => e.compass)) {
    // Five region cards on a small (split-view) map can't sit in a strict plus — side cards would
    // clip or collide with the centre. Distribute them across 5 EVENLY-spaced rows (N,E,Central,
    // W,S top→bottom) so each owns its row (no vertical overlap), with E/W nudged to their sides
    // by a width-clamped amount (never off-screen) to keep the compass reading. North's row starts
    // below the instruction card. Everything derives from the live map size → adapts to any width.
    const s = map.getSize();
    const top = isMobile ? 152 : 178, bot = s.y - (isMobile ? 104 : 92);
    const rowY = (i) => top + (bot - top) * (i / 4);
    const rx = Math.max(64, Math.min(halfW * 0.72, s.x / 2 - 100));
    const row = { north: 0, northeast: 1, east: 1, southeast: 1, central: 2, northwest: 3, west: 3, southwest: 3, south: 4 };
    const xo = { northeast: rx, east: rx, southeast: rx, northwest: -rx, west: -rx, southwest: -rx };
    entries.forEach((e) => { const k = e.compass; out.set(e.id, P(cx + (xo[k] || 0), rowY(row[k] != null ? row[k] : 2))); });
    return out;
  }
  if (n === 1) { out.set(entries[0].id, P(cx, cy)); return out; }                       // one child, centred
  // Directional layout: children carry a real screen bearing from the parent centre. Keep that
  // bearing where there's room (so N-of-parent stays up, E stays right), fan out on an ellipse
  // only where bearings crowd — readable + collision-free while preserving approximate compass.
  if (entries.some((e) => typeof e.bearing === "number")) {
    if (n === 2) { const dx = Math.min(halfW * 0.6, 240); out.set(entries[0].id, P(cx - dx, cy)); out.set(entries[1].id, P(cx + dx, cy)); return out; }
    // Row-stagger (same approach that keeps the 5 region cards clean): cap the on-map set (entries
    // arrive ranked by count), order it north→south by the bearing's vertical component, give each
    // card its own evenly-spaced row (guarantees no vertical overlap on any height) and offset x by
    // the east/west component so the compass still reads. Dense levels let the panel carry the rest.
    const use = entries.slice(0, Math.min(n, 6));
    const ord = use.map((e) => e).sort((a, b) => Math.sin(a.bearing) - Math.sin(b.bearing));
    const s = map.getSize();
    const top = isMobile ? 150 : 172, bot = s.y - (isMobile ? 104 : 96);
    const rxMax = Math.max(48, Math.min(halfW * 0.7, s.x / 2 - 96));
    const m = ord.length;
    // With ≤4 cards there's room to honour each real east/west offset. With 5–6 the rows pack
    // close, so alternate sides in a clean zig-zag ladder — adjacent rows are always separated
    // horizontally, guaranteeing no overlap while still descending north→south.
    const zig = m >= 5;
    ord.forEach((e, k) => {
      const yy = m === 1 ? cy : top + (bot - top) * (k / (m - 1));
      const xo = zig ? (k % 2 ? rxMax : -rxMax) : Math.cos(e.bearing) * rxMax;
      out.set(e.id, P(cx + xo, yy));
    });
    return out;
  }
  if (n === 2) { const dx = Math.min(halfW * 0.58, 230); out.set(entries[0].id, P(cx - dx, cy)); out.set(entries[1].id, P(cx + dx, cy)); return out; } // balanced pair
  if (n <= 6) {                                                                         // radial ring
    const rx = Math.min(halfW * 0.8, 320), ry = Math.max(84, Math.min(halfH * 0.82, 220));
    entries.forEach((e, i) => { const a = -Math.PI / 2 + i * (2 * Math.PI / n); out.set(e.id, P(cx + Math.cos(a) * rx, cy + Math.sin(a) * ry)); });
    return out;
  }
  // 7–12 → two concentric ellipse rings (outer holds ~60%). Beyond 12 the on-map set caps and
  // the panel list carries the remainder (panel-assisted selection).
  const cap = Math.min(n, 12);
  const outerN = Math.ceil(cap * 0.6), innerN = Math.max(1, cap - outerN);
  const ring = (ids, rx, ry, phase) => ids.forEach((e, i) => { const a = -Math.PI / 2 + phase + i * (2 * Math.PI / ids.length); out.set(e.id, P(cx + Math.cos(a) * rx, cy + Math.sin(a) * ry)); });
  ring(entries.slice(0, outerN), Math.min(halfW * 0.86, 340), Math.min(halfH * 0.82, 240), 0);
  ring(entries.slice(outerN, cap), Math.min(halfW * 0.44, 175), Math.min(halfH * 0.42, 120), Math.PI / innerN);
  return out;
}
// City-landing region marker. Reads NAME first, then the property count with an
// explicit "properties" label so the number is self-explanatory. One hover/focus-
// revealed "Select to zoom in" caption (never persistent per-marker text). Emphasis
// and the caption are driven by the .dp-region-on class + CSS (see index.html) so the
// panel↔map hover sync never has to recreate the icon (keeps a11y listeners intact).
function regionBubble(r, count, sel, leader, hovered, sz) {
  sz = sz || 92;
  const nameF = sz >= 84 ? 13 : 11.5, cntF = sz >= 84 ? 18 : 15, nounF = sz >= 84 ? 8 : 7.5;
  const bg = sel ? "var(--navy-900)" : "var(--navy-800)";
  return `<div class="dp-region dp-nav${hovered ? " dp-region-on" : ""}" style="position:relative;width:154px;margin-left:-77px;transform:translateY(-50%);font-family:var(--font-sans);text-align:center;">
    ${leader || ""}
    <div class="dp-navcore dp-region-core" style="display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1px;width:${sz}px;height:${sz}px;margin:0 auto;border-radius:var(--radius-full);background:${bg};color:#fff;box-shadow:var(--shadow-lg);border:2px solid rgba(255,255,255,${sel ? "0.92" : "0.55"});transform:scale(${sel ? 1.06 : 1});transition:transform .18s cubic-bezier(.4,0,.2,1),box-shadow .18s cubic-bezier(.4,0,.2,1),border-color .18s;">
      <span style="font-size:${nameF}px;font-weight:700;letter-spacing:-0.01em;line-height:1.1;">${r.short}</span>
      <span style="font-family:var(--font-mono);font-size:${cntF}px;font-weight:700;line-height:1;margin-top:1px;">${count}</span>
      <span style="font-size:${nounF}px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;opacity:.8;">${count === 1 ? "property" : "properties"}</span>
    </div>
    <div class="dp-region-cap" style="margin-top:6px;display:inline-flex;align-items:center;gap:4px;padding:3px 10px;border-radius:var(--radius-full);background:var(--paper);box-shadow:var(--shadow-md);font-size:10.5px;font-weight:700;color:var(--copper-600);white-space:nowrap;">Tap to zoom in <span style="font-size:12px;line-height:1;">&#8250;</span></div>
  </div>`;
}
// City-landing region NAVIGATION card (Guided mode). Leads with representative AREA names
// (recognisable neighbourhoods) rather than the abstract region label, plus a "+N more" count
// and the unchanged regional property count. Same stacked hierarchy language as the group cards.
function regionNavCard(r, count, sel, hovered, shown, more) {
  const bg = sel ? "var(--navy-900)" : "var(--navy-800)";
  return `<div class="dp-region dp-nav${hovered ? " dp-region-on" : ""}" style="position:relative;width:192px;margin-left:-96px;transform:translateY(-50%);font-family:var(--font-sans);text-align:center;">
    <div class="dp-navcore dp-region-core" style="display:inline-flex;flex-direction:column;align-items:center;gap:2px;padding:7px 14px 8px;border-radius:var(--radius-md);background:${bg};color:#fff;box-shadow:var(--shadow-lg);border:1.5px solid rgba(255,255,255,${sel ? "0.9" : "0.5"});transform:scale(${sel ? 1.04 : 1});transition:transform .18s cubic-bezier(.4,0,.2,1),box-shadow .18s cubic-bezier(.4,0,.2,1),border-color .18s;">
      <span style="font-size:8px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;opacity:.66;">${r.short} \u00B7 ${count} ${count === 1 ? "property" : "properties"}</span>
      <span style="display:inline-flex;align-items:baseline;gap:5px;max-width:160px;"><span style="font-size:12.5px;font-weight:700;letter-spacing:-0.01em;line-height:1.1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${shown.join(" \u00B7 ")}</span>${more > 0 ? `<span style="font-size:9px;font-weight:700;opacity:.58;white-space:nowrap;">+${more}</span>` : ""}</span>
    </div>
    <div class="dp-region-cap" style="margin-top:6px;display:inline-flex;align-items:center;gap:4px;padding:3px 10px;border-radius:var(--radius-full);background:var(--paper);box-shadow:var(--shadow-md);font-size:10.5px;font-weight:700;color:var(--copper-600);white-space:nowrap;">Tap to zoom in <span style="font-size:12px;line-height:1;">&#8250;</span></div>
  </div>`;
}
// Secondary NAVIGATION marker — one family for area groups, school zones and agri
// corridors, sharing the region marker's stacked language (eyebrow · name · count ·
// noun) but a step smaller so the hierarchy reads region > zone/corridor > area. A
// hover/focus-revealed "Tap to zoom in ›" pill (never persistent) and emphasis are
// class/CSS-driven (.dp-navcard-on) so panel↔map sync never recreates the icon.
const NAV_GLYPH = {
  area: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83z"/><path d="M2 12a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 12"/></svg>`,
  school: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m22 10-10-5L2 10l10 5 10-5z"/><path d="M6 12v5c0 1.7 2.7 3 6 3s6-1.3 6-3v-5"/></svg>`,
  agri: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v20"/><path d="M5 8c4 0 7-3 7-6 0 3 3 6 7 6"/></svg>`,
};
function navCard(o) {
  const agri = o.tone === "agri";
  const bg = o.sel ? (agri ? "#154834" : "var(--navy-900)") : (agri ? "#1F7A5C" : "var(--navy-800)");
  const capColor = agri ? "var(--evergreen-700, #1F694A)" : "var(--copper-600)";
  const noun = (o.count === 1 && o.nounSingular) ? o.nounSingular : o.noun;
  const cw = o.compact ? 150 : 190, coreMax = o.compact ? 138 : 178, nameMax = o.compact ? 118 : 150;
  // Dense levels clamp the name to one line (full name stays in the tooltip / aria-label);
  // roomy levels allow two lines. Either way count + noun always render below.
  const nameClamp = o.compact
    ? `white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:${nameMax}px;`
    : `max-width:${nameMax}px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;`;
  return `<div class="dp-navcard dp-nav${o.hovered ? " dp-navcard-on" : ""}" style="position:relative;width:${cw}px;margin-left:-${cw / 2}px;transform:translateY(-50%);font-family:var(--font-sans);text-align:center;">
    ${o.leader || ""}
    <div class="dp-navcore dp-navcard-core" style="display:inline-flex;flex-direction:column;align-items:center;gap:1px;max-width:${coreMax}px;padding:8px 15px 9px;border-radius:var(--radius-lg);background:${bg};color:#fff;box-shadow:var(--shadow-lg);border:1.5px solid rgba(255,255,255,${o.sel ? "0.9" : "0.5"});transform:scale(${o.sel ? 1.05 : 1});transition:transform .18s cubic-bezier(.4,0,.2,1),box-shadow .18s cubic-bezier(.4,0,.2,1),border-color .18s;">
      <span style="display:inline-flex;align-items:center;gap:4px;opacity:.82;"><span style="display:inline-flex;">${NAV_GLYPH[o.tone] || NAV_GLYPH.area}</span><span style="font-size:8.5px;font-weight:700;letter-spacing:.09em;text-transform:uppercase;">${o.eyebrow}</span></span>
      <span style="font-size:13px;font-weight:700;letter-spacing:-0.01em;line-height:1.18;${nameClamp}">${o.name}</span>
      <span style="display:inline-flex;align-items:baseline;gap:4px;margin-top:1px;"><span style="font-family:var(--font-mono);font-size:16px;font-weight:700;line-height:1;">${o.count}</span><span style="font-size:8px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;opacity:.8;">${noun}</span></span>
    </div>
    <div class="dp-navcard-cap" style="margin-top:6px;display:inline-flex;align-items:center;gap:4px;padding:3px 10px;border-radius:var(--radius-full);background:var(--paper);box-shadow:var(--shadow-md);font-size:10.5px;font-weight:700;color:${capColor};white-space:nowrap;">Tap to zoom in <span style="font-size:12px;line-height:1;">&#8250;</span></div>
  </div>`;
}
function areaPin(name, count, sel, tone, o) {
  o = o || {};
  const hot = sel || o.promoted;
  const bg = sel ? "var(--navy-800)" : "var(--paper)";
  const fg = sel ? "#fff" : "var(--navy-800)";
  const sub = sel ? "rgba(255,255,255,0.7)" : "var(--text-muted)";
  const border = sel ? "none" : `1px solid ${o.promoted ? "var(--navy-800)" : "var(--border)"}`;
  const shadow = hot ? "var(--shadow-lg)" : "var(--shadow-md)";
  const pin = sel ? "#fff" : (tone === "plum" ? "var(--plum-500)" : tone === "agri" ? "var(--evergreen-600)" : "var(--copper-500)");
  const chev = sel ? "rgba(255,255,255,0.75)" : (tone === "plum" ? "var(--plum-600)" : "var(--copper-600)");
  const glyph = tone === "plum"
    ? `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="${pin}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m22 10-10-5L2 10l10 5 10-5z"/><path d="M6 12v5c0 1.7 2.7 3 6 3s6-1.3 6-3v-5"/></svg>`
    : `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="${pin}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>`;
  return `<div class="dp-nav" style="position:relative;width:230px;margin-left:-115px;transform:translateY(-100%);text-align:center;font-family:var(--font-sans);" title="${name} · ${count} ${o.noun || "properties"}">
    <div class="dp-navcore" style="display:inline-flex;align-items:center;gap:8px;padding:7px 13px;border-radius:var(--radius-full);background:${bg};color:${fg};box-shadow:${shadow};border:${border};white-space:nowrap;transition:all .18s cubic-bezier(.4,0,.2,1);transform:scale(${hot ? 1.07 : 1});">
      <span style="font-size:13px;font-weight:700;letter-spacing:-0.01em;">${name}</span>
      <span style="display:inline-flex;align-items:center;gap:4px;font-family:var(--font-mono);font-size:11px;color:${sub};">${glyph}${count}${o.noun ? ` ${o.noun}` : ""}</span>
      <span style="font-size:13.5px;font-weight:700;color:${chev};line-height:1;">&#8250;</span>
    </div>
    <div style="width:10px;height:10px;background:${bg};border-right:${border};border-bottom:${border};transform:rotate(45deg);margin:-6px auto 0;box-shadow:${shadow};"></div></div>`;
}
// Compact count-dot for demoted areas (9–15 band and grid leftovers) — hover/panel promotes it.
function areaDot(count, tone) {
  const ring = tone === "plum" ? "var(--plum-500)" : "var(--copper-500)";
  return `<div class="dp-nav" style="position:relative;width:24px;margin-left:-12px;transform:translateY(-50%);font-family:var(--font-mono);">
    <div class="dp-navcore" style="display:flex;align-items:center;justify-content:center;width:24px;height:24px;border-radius:var(--radius-full);background:var(--paper);border:1.5px solid ${ring};box-shadow:var(--shadow-sm);font-size:10.5px;font-weight:700;color:var(--text-strong);transition:all .18s cubic-bezier(.4,0,.2,1);">${count}</div></div>`;
}
// Area NAVIGATION cluster — dashed paper chip, area count (never a property sum),
// NEUTRAL label (never named after an area that has its own marker — no duplicate
// semantics). Visually distinct from the solid listing-cluster disc.
function areaClusterChip(n, tone, hiName, leader) {
  const ring = tone === "plum" ? "var(--plum-600)" : "var(--navy-800)";
  const glyph = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="${ring}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>`;
  return `<div class="dp-acluster dp-nav" style="position:relative;width:200px;margin-left:-100px;transform:translateY(-50%);font-family:var(--font-sans);text-align:center;">
    ${leader || ""}
    <div class="dp-acluster-chip" style="display:inline-flex;align-items:center;gap:7px;padding:7px 13px;border-radius:var(--radius-full);background:${hiName ? "var(--navy-100)" : "var(--paper)"};border:1.5px dashed ${ring};box-shadow:var(--shadow-md);white-space:nowrap;transition:transform .18s cubic-bezier(.4,0,.2,1);">
      ${glyph}<span style="font-size:12.5px;font-weight:700;color:var(--text-strong);">+${n} nearby areas</span>
    </div>
    <div style="margin-top:4px;display:inline-block;padding:2px 8px;border-radius:var(--radius-full);background:var(--paper);box-shadow:var(--shadow-sm);font-size:10px;font-weight:700;color:${hiName ? "var(--text-strong)" : "var(--text-muted)"};white-space:nowrap;">${hiName ? `Includes ${hiName}` : "Select to expand"}</div>
  </div>`;
}
function schoolPin(s, sel) {
  const bg = sel ? "var(--plum-600)" : "var(--paper)";
  const fg = sel ? "#fff" : "var(--navy-800)";
  const shadow = sel ? "var(--shadow-lg)" : "var(--shadow-sm)";
  const border = sel ? "none" : "1px solid var(--border)";
  return `<div class="dp-nav" style="position:relative;width:240px;margin-left:-120px;transform:translateY(-100%);text-align:center;font-family:var(--font-sans);">
    <div class="dp-navcore" style="display:inline-flex;align-items:center;gap:7px;padding:6px 11px;border-radius:var(--radius-full);background:${bg};color:${fg};box-shadow:${shadow};border:${border};white-space:nowrap;transition:all .18s cubic-bezier(.4,0,.2,1);transform:scale(${sel ? 1.06 : 1});max-width:220px;">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="${sel ? '#fff' : 'var(--plum-600)'}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="flex:none;"><path d="m22 10-10-5L2 10l10 5 10-5z"/><path d="M6 12v5c0 1.7 2.7 3 6 3s6-1.3 6-3v-5"/></svg>
      <span style="font-size:12.5px;font-weight:700;letter-spacing:-0.01em;overflow:hidden;text-overflow:ellipsis;">${s.name.split(",")[0]}</span>
      ${sel ? "" : `<span style="font-size:13.5px;font-weight:700;color:var(--plum-600);line-height:1;">&#8250;</span>`}
    </div>
    <div style="width:10px;height:10px;background:${bg};border-right:${border};border-bottom:${border};transform:rotate(45deg);margin:-6px auto 0;box-shadow:${shadow};"></div></div>`;
}
function homePin(l, active) {
  const bg = active ? "var(--accent)" : "var(--paper)";
  const fg = active ? "#fff" : "var(--navy-800)";
  return `<div style="transform:translate(-50%,-100%);font-family:var(--font-mono);">
    <div style="display:inline-flex;align-items:center;padding:5px 10px;border-radius:var(--radius-full);background:${bg};color:${fg};box-shadow:${active ? 'var(--shadow-lg)' : 'var(--shadow-sm)'};border:${active ? '1.5px solid #fff' : '1px solid var(--border)'};white-space:nowrap;font-size:12px;font-weight:600;transform:scale(${active ? 1.12 : 1});transition:all .18s cubic-bezier(.4,0,.2,1);z-index:${active ? 5 : 1};">${short(l.price)}</div></div>`;
}
function parcelPin(p, active) {
  const bg = active ? "var(--evergreen-600)" : "var(--paper)";
  const fg = active ? "#fff" : "var(--evergreen-700, #1F694A)";
  return `<div style="transform:translate(-50%,-100%);font-family:var(--font-mono);">
    <div style="display:inline-flex;align-items:center;gap:5px;padding:5px 10px;border-radius:var(--radius-full);background:${bg};color:${fg};box-shadow:${active ? 'var(--shadow-lg)' : 'var(--shadow-sm)'};border:${active ? '1.5px solid #fff' : '1px solid var(--border)'};white-space:nowrap;font-size:12px;font-weight:600;transform:scale(${active ? 1.1 : 1});transition:all .18s cubic-bezier(.4,0,.2,1);">${p.acres} ac</div></div>`;
}

// ---- cluster bubble (dense leaf markers). Sized by count. The action caption renders
// only on the LARGEST cluster in view (or on hover — CSS) so a busy map isn't wallpapered
// with repeated "Select to zoom in" labels. ----
function clusterBubble(count, tone, showCap) {
  const bg = tone === "agri" ? "var(--evergreen-600)" : "var(--navy-800)";
  const size = Math.round(42 + Math.min(count, 24) * 0.8);
  const cap = tone === "agri" ? "parcels" : "homes";
  return `<div class="dp-cluster" style="transform:translate(-50%,-50%);font-family:var(--font-sans);text-align:center;cursor:pointer;">
    <div class="dp-cluster-disc" style="width:${size}px;height:${size}px;border-radius:var(--radius-full);background:${bg};color:#fff;box-shadow:var(--shadow-lg);border:3px solid rgba(255,255,255,0.9);display:flex;flex-direction:column;align-items:center;justify-content:center;line-height:1;margin:0 auto;transition:transform .18s cubic-bezier(.4,0,.2,1);">
      <span style="font-family:var(--font-mono);font-size:17px;font-weight:700;">${count}</span>
      <span style="font-size:8px;font-weight:700;letter-spacing:.05em;opacity:.82;text-transform:uppercase;">${cap}</span>
    </div>
    <div class="dp-cluster-cap${showCap ? " on" : ""}" style="margin-top:5px;padding:2px 8px;border-radius:var(--radius-full);background:var(--paper);box-shadow:var(--shadow-sm);font-size:10px;font-weight:700;color:var(--text-muted);white-space:nowrap;">Select to zoom in</div>
  </div>`;
}

// ---- infographic popup bodies ----
function listingPopupHTML(l, idx, total) {
  return `<div class="dp-pop">
    <div class="dp-pop-img" style="background-image:url('${l.image}')">
      <span class="dp-pop-tier dp-tier-${l.trustTier}">${TIER_LABEL[l.trustTier] || "Listed"}</span>
      ${l.tag ? `<span class="dp-pop-tag">${l.tag}</span>` : ""}
    </div>
    <div class="dp-pop-body">
      <div class="dp-pop-row"><span class="dp-pop-price">${window.BLR_INR(l.price)}</span><span class="dp-pop-type">${l.propType}</span></div>
      <div class="dp-pop-title">${l.title}</div>
      <div class="dp-pop-loc">${l.locality}, ${l.area}</div>
      <div class="dp-pop-meta">${l.beds} BHK &middot; ${l.baths} bath &middot; ${l.sqft} sq.ft</div>
      <div class="dp-pop-foot">
        <div class="dp-pop-step">
          <button class="dp-pp dp-pp-prev" aria-label="Previous listing">&#8249;</button>
          <span class="dp-pp-idx">${idx + 1} / ${total}</span>
          <button class="dp-pp dp-pp-next" aria-label="Next listing">&#8250;</button>
        </div>
        <button class="dp-pp-show">Show in list</button>
      </div>
    </div>
  </div>`;
}
function parcelPopupHTML(p, idx, total) {
  return `<div class="dp-pop dp-pop-agri">
    <div class="dp-pop-img" style="background-image:url('${p.image}')">
      <span class="dp-pop-tier dp-tier-${p.trustTier}">${TIER_LABEL[p.trustTier] || "Listed"}</span>
      <span class="dp-pop-tag dp-pop-tag-agri">${p.acres} acres</span>
    </div>
    <div class="dp-pop-body">
      <div class="dp-pop-row"><span class="dp-pop-price">${window.BLR_INR(p.price)}</span><span class="dp-pop-type">${p.crop}</span></div>
      <div class="dp-pop-title">${p.title}</div>
      <div class="dp-pop-loc">${p.distKm} km out &middot; ${p.road}</div>
      <div class="dp-pop-meta">${p.water} &middot; ${p.soil}${p.survey ? " &middot; " + p.survey : ""}</div>
      <div class="dp-pop-foot">
        <div class="dp-pop-step">
          <button class="dp-pp dp-pp-prev" aria-label="Previous parcel">&#8249;</button>
          <span class="dp-pp-idx">${idx + 1} / ${total}</span>
          <button class="dp-pp dp-pp-next" aria-label="Next parcel">&#8250;</button>
        </div>
        <button class="dp-pp-show">Show in list</button>
      </div>
    </div>
  </div>`;
}

// ---- greedy pixel-proximity clustering at the live zoom ----
function clusterLeaves(items, map, px) {
  const pts = items.map((it) => ({ it, p: map.latLngToContainerPoint([it.lat, it.lon]) }));
  const used = new Array(pts.length).fill(false);
  const out = [];
  for (let i = 0; i < pts.length; i++) {
    if (used[i]) continue;
    const grp = [pts[i]]; used[i] = true;
    for (let j = i + 1; j < pts.length; j++) {
      if (used[j]) continue;
      const dx = pts[i].p.x - pts[j].p.x, dy = pts[i].p.y - pts[j].p.y;
      if (Math.sqrt(dx * dx + dy * dy) < px) { grp.push(pts[j]); used[j] = true; }
    }
    out.push(grp);
  }
  return out;
}

// ---- agri bubbles (unchanged) ----
function agriTownDisc(name, count, sel) {
  const size = sel ? 52 : 44;
  return `<div style="transform:translate(-50%,-100%);font-family:var(--font-sans);text-align:center;">
    <div style="width:${size}px;height:${size}px;border-radius:var(--radius-full);background:linear-gradient(160deg,#2E9B74,#1C5B43);border:3px solid #fff;box-shadow:0 4px 14px rgba(20,50,40,.35);display:flex;align-items:center;justify-content:center;margin:0 auto;transition:all .18s cubic-bezier(.4,0,.2,1);">
      <span style="font-family:var(--font-mono);font-size:17px;font-weight:800;color:#fff;">${count}</span>
    </div>
    <div style="margin-top:4px;display:inline-block;padding:3px 9px;border-radius:var(--radius-full);background:#fff;box-shadow:var(--shadow-sm);font-size:11px;font-weight:700;color:var(--text-strong);white-space:nowrap;">${name} &middot; ${count} agri</div>
  </div>`;
}

const CITY_LEGEND = {
  "region-bubbles": { dot: "var(--navy-800)", text: "Regions" },
  "region-hotspots": { dot: "var(--copper-500)", text: "Top areas", ring: true },
  "area-groups": { dot: "var(--navy-800)", text: "Area groups" },
  "area-areas": { dot: "var(--copper-500)", text: "Areas", ring: true },
  "area-listings": { dot: "var(--accent)", text: "Listings", cluster: true },
  "school-zones": { dot: "var(--navy-800)", text: "School zones" },
  "school-areas": { dot: "var(--plum-500)", text: "Areas", ring: true },
  "school-schools": { dot: "var(--plum-500)", text: "Schools", ring: true },
  "school-homes": { dot: "var(--accent)", text: "Homes", cluster: true },
  "agri-corridors": { dot: "var(--navy-800)", text: "Corridors" },
  "agri-clusters": { dot: "var(--evergreen-600)", text: "Village clusters", ring: true },
  "agri-parcels": { dot: "var(--evergreen-600)", text: "Parcels", cluster: true },
};

// consistent camera padding — extra bottom clears the summary pill, extra left clears the legend
const PAD = { paddingTopLeft: [82, 82], paddingBottomRight: [70, 96] };
const CAM = { duration: 0.85, easeLinearity: 0.22 };
const CLUSTER_PX = 46;

function DPMap({ layer, scope, selection, radiusKm, maxKm, activeListing, listings, parcels, crumb, summary, onActivate, onPickRegion, onPickGroup, onPickArea, onPickSchool, onPickZone, onPickCorridor, onPickCluster, hoverAreaId, hoverSrc, onAreaHover, onAreasShown, focusArea, regionGuide, guideDismissed, onDismissGuide, hoverRegionId, hoverRegionSrc, onRegionHover, hoverNavId, hoverNavSrc, onNavHover, isMobile }) {
  const D = window.BLR_DATA;
  const elRef = React.useRef(null);
  const mapRef = React.useRef(null);
  const layerRef = React.useRef(null);      // navigation / fixed markers
  const leafLayerRef = React.useRef(null);  // clustered leaf markers (rebuilt on zoom)
  const ringRef = React.useRef(null);
  const polyRef = React.useRef(null);
  const cameraKeyRef = React.useRef(null);
  const reclusterRef = React.useRef(null);
  const zoomDrawnRef = React.useRef(null);   // zoom at which the last leaf/area draw ran
  const singletonRef = React.useRef(new Map()); // id → { marker, item }
  const orderRef = React.useRef([]);            // ordered ids of on-map singletons (for ‹ ›)
  const kindRef = React.useRef("listing");
  const activeRef = React.useRef(activeListing);
  activeRef.current = activeListing;
  // Area-marker degradation state (AREA_MARKER_UX.md)
  const areaRef = React.useRef(new Map());      // areaId → { marker, area, count, tone, kind: 'label'|'dot' }
  const chipRef = React.useRef([]);             // area NAVIGATION clusters: { marker, members, tone, count, hi }
  const regionMarkerRef = React.useRef(new Map()); // city-landing region bubbles: id → { marker, region, count, ldx, ldy }
  const hoverRegionIdRef = React.useRef(null); hoverRegionIdRef.current = hoverRegionId;
  const navMarkerRef = React.useRef(new Map());    // group/zone/corridor markers: id → { marker, sel }
  const hoverNavIdRef = React.useRef(null); hoverNavIdRef.current = hoverNavId;
  const reclusterOnMoveRef = React.useRef(false); // area layers re-place on ANY moveend (no popups to protect)
  const focusAreaRef = React.useRef(null);      // "Show on map" area — force-kept as a label (never a duplicate pin)
  const areaToneRef = React.useRef("copper");
  const areaPickRef = React.useRef(null);
  const areaCountRef = React.useRef(null);
  // First-time helper hint (localStorage-remembered)
  const [hint, setHint] = React.useState(() => { try { return !localStorage.getItem("dp_map_hint_v1"); } catch (e) { return true; } });
  // Upper-hierarchy layout policy: "Guided" (viewport-anchored navigation controls, default)
  // vs "Geographic" (centroid + declutter, for comparison). Only affects region/group/zone.
  const [navMode, setNavMode] = React.useState(() => { try { return localStorage.getItem("dp_geo_nav") !== "1"; } catch (e) { return true; } });
  React.useEffect(() => { try { localStorage.setItem("dp_geo_nav", navMode ? "0" : "1"); } catch (e) {} }, [navMode]);
  const hintRef = React.useRef(hint); hintRef.current = hint;
  const dismissHint = () => { setHint(false); try { localStorage.setItem("dp_map_hint_v1", "1"); } catch (e) {} };
  const dismissRef = React.useRef(dismissHint); dismissRef.current = dismissHint;
  React.useEffect(() => {
    if (hint) document.body.setAttribute("data-dp-hint", "1");
    else document.body.removeAttribute("data-dp-hint");
    return () => document.body.removeAttribute("data-dp-hint");
  }, [hint]);
  const sel = selection || {};

  // --- stable keys -------------------------------------------------------
  const cameraKey = [layer, scope, sel.groupId, sel.zoneId, sel.areaId, sel.schoolId, sel.corridorId, sel.clusterId, radiusKm, maxKm, navMode].join("|");
  const listIds = (listings || []).map((l) => l.id).join(",");
  const parcelIds = (parcels || []).map((p) => p.id).join(",");
  const buildKey = cameraKey + "||" + listIds + "||" + parcelIds;

  const icon = (html) => window.L.divIcon({ html, className: "upt-pin", iconSize: [1, 1] });
  const region = (id) => D.regions.find((r) => r.id === id);

  // --- init once ---------------------------------------------------------
  React.useEffect(() => {
    if (mapRef.current || !window.L) return;
    const map = window.L.map(elRef.current, { center: [D.city.lat, D.city.lon], zoom: D.city.zoom, zoomControl: false, attributionControl: true, scrollWheelZoom: true });
    window.L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", { attribution: "© OpenStreetMap · © CARTO", maxZoom: 19, subdomains: "abcd" }).addTo(map);
    window.L.control.zoom({ position: "bottomright" }).addTo(map);
    map.attributionControl.setPosition("bottomleft");
    mapRef.current = map;
    layerRef.current = window.L.layerGroup().addTo(map);
    leafLayerRef.current = window.L.layerGroup().addTo(map);
    // Re-cluster leaf markers only on ZOOM change — pixel proximity is pan-invariant, so
    // panning (incl. autoPan for popups) must NOT rebuild markers, or it would close open popups.
    map.on("zoomend", () => { if (reclusterRef.current) reclusterRef.current(); });
    // Leaf (listing) layers re-cluster on ZOOM only — pixel proximity is pan-invariant and
    // panning must never close an open popup. AREA layers have no popups, so they re-place
    // on every settled move: this is what keeps label/chip placement exact after a fly
    // (zoomend alone can fire a few px before the pan fully settles).
    map.on("moveend", () => { if (reclusterRef.current && (reclusterOnMoveRef.current || zoomDrawnRef.current !== map.getZoom())) reclusterRef.current(); });
    setTimeout(() => { map.invalidateSize(); rebuild(); }, 60);
    // eslint-disable-next-line
  }, []);

  // --- keep Leaflet sized to its container (mobile sheet / layout changes) ---
  React.useEffect(() => {
    if (!elRef.current || !window.ResizeObserver) return;
    const ro = new ResizeObserver(() => { if (mapRef.current) mapRef.current.invalidateSize(); });
    ro.observe(elRef.current);
    return () => ro.disconnect();
  }, []);

  // --- rebuild markers + (conditionally) move camera --------------------
  React.useEffect(() => { if (mapRef.current) rebuild(); /* eslint-disable-next-line */ }, [buildKey]);

  // --- focused-listing restyle + gentle pan (never a full fly) ----------
  React.useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    singletonRef.current.forEach(({ marker, item }, id) => {
      const on = id === activeListing;
      marker.setIcon(icon(kindRef.current === "parcel" ? parcelPin(item, on) : homePin(item, on)));
    });
    if (activeListing && singletonRef.current.has(activeListing)) {
      map.panInside(singletonRef.current.get(activeListing).marker.getLatLng(), { padding: [80, 80] });
    }
    // eslint-disable-next-line
  }, [activeListing]);

  // --- panel-hover → marker promotion (no camera move, no rebuild) ----------
  // Map-originating hovers only highlight the PANEL row (CSS handles the marker's
  // own hover scale) — swapping the icon under the cursor would flicker.
  React.useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    areaRef.current.forEach((rec, id) => {
      if (!rec.hover) return;
      rec.hover = false;
      rec.marker.setIcon(icon(rec.kind === "dot" ? areaDot(rec.count, rec.tone) : areaPin(rec.area.name, rec.count, id === sel.areaId, rec.tone, {})));
      rec.marker.setZIndexOffset(rec.kind === "dot" ? 400 : 900);
    });
    chipRef.current.forEach((ch) => {
      if (!ch.hi) return;
      ch.hi = false;
      ch.marker.setIcon(icon(areaClusterChip(ch.count, ch.tone, null, leaderHTML(ch.ldx || 0, ch.ldy || 0, ch.tone))));
      ch.marker.setZIndexOffset(600);
    });
    if (!hoverAreaId || hoverSrc === "map") return;
    const rec = areaRef.current.get(hoverAreaId);
    if (rec) {
      rec.hover = true;
      rec.marker.setIcon(icon(areaPin(rec.area.name, rec.count, hoverAreaId === sel.areaId, rec.tone, { promoted: true })));
      rec.marker.setZIndexOffset(2000);
    } else {
      const ch = chipRef.current.find((c) => c.members.some((a) => a.id === hoverAreaId));
      if (ch) {
        ch.hi = true;
        const a = ch.members.find((x) => x.id === hoverAreaId);
        ch.marker.setIcon(icon(areaClusterChip(ch.count, ch.tone, a.name, leaderHTML(ch.ldx || 0, ch.ldy || 0, ch.tone))));
        ch.marker.setZIndexOffset(2000);
      }
    }
    // eslint-disable-next-line
  }, [hoverAreaId, hoverSrc]);

  // --- panel ↔ marker hover/focus sync for CITY-LANDING region bubbles ---
  // Toggle a class (never recreate the icon) so keyboard listeners + aria stay intact.
  // Map-originating hover is left to CSS :hover; only panel-originating hover restyles here.
  React.useEffect(() => {
    if (!mapRef.current) return;
    regionMarkerRef.current.forEach((rec, id) => {
      const el = rec.marker.getElement();
      const on = !!hoverRegionId && hoverRegionSrc !== "map" && id === hoverRegionId;
      if (el) { const node = el.querySelector(".dp-region"); if (node) node.classList.toggle("dp-region-on", on); }
      rec.marker.setZIndexOffset(id === scope ? 900 : on ? 2000 : 0);
    });
  }, [hoverRegionId, hoverRegionSrc, scope]);

  // --- panel ↔ marker hover/focus sync for GROUP / ZONE / CORRIDOR nav markers ---
  React.useEffect(() => {
    if (!mapRef.current) return;
    navMarkerRef.current.forEach((rec, id) => {
      const el = rec.marker.getElement();
      const on = !!hoverNavId && hoverNavSrc !== "map" && id === hoverNavId;
      if (el) { const node = el.querySelector(".dp-navcard"); if (node) node.classList.toggle("dp-navcard-on", on); }
      rec.marker.setZIndexOffset(rec.sel ? 900 : on ? 2000 : 0);
    });
  }, [hoverNavId, hoverNavSrc]);

  // --- "Show on map" → force-keep the area as a labeled pin + panInside (never a duplicate marker) ---
  React.useEffect(() => {
    const map = mapRef.current;
    if (!map || !focusArea || !focusArea.id) return;
    const a = D.areas.find((x) => x.id === focusArea.id);
    if (!a) return;
    focusAreaRef.current = a.id;
    if (reclusterRef.current) reclusterRef.current(); // re-place with the area force-kept
    const rec = areaRef.current.get(a.id);
    if (rec) rec.marker.setZIndexOffset(2200);
    map.panInside([a.lat, a.lon], { padding: [90, 90] });
    // eslint-disable-next-line
  }, [focusArea && focusArea.n]);

  function rebuild() {
    const map = mapRef.current, g = layerRef.current, leaf = leafLayerRef.current;
    if (!map || !g) return;
    g.clearLayers(); leaf.clearLayers();
    singletonRef.current.clear(); orderRef.current = [];
    areaRef.current.clear(); chipRef.current = [];
    reclusterRef.current = null;
    reclusterOnMoveRef.current = false;
    focusAreaRef.current = focusArea ? focusArea.id : null;
    if (ringRef.current) { map.removeLayer(ringRef.current); ringRef.current = null; }
    if (polyRef.current) { map.removeLayer(polyRef.current); polyRef.current = null; }

    const moveCam = cameraKey !== cameraKeyRef.current;
    cameraKeyRef.current = cameraKey;
    // Guided mode dims the basemap at the three navigation levels so the markers read as a
    // chooser rather than geography (class hook — see index.html).
    const navLevel = layer === "region-bubbles" || layer === "area-groups" || layer === "school-zones";
    if (elRef.current) elRef.current.classList.toggle("dp-navmode", navMode && navLevel);

    const add = (lat, lon, html, click, z) => window.L.marker([lat, lon], { icon: icon(html), zIndexOffset: z || 0 }).on("click", (e) => { if (hintRef.current) dismissRef.current(); (click || (() => {}))(e); }).addTo(g);
    const offsetPt = (bearing, km) => { const kLat = 1 / 111, kLon = 1 / (111 * Math.cos(D.city.lat * Math.PI / 180)), b = bearing * Math.PI / 180; return [D.city.lat + km * Math.cos(b) * kLat, D.city.lon + km * Math.sin(b) * kLon]; };
    const drawWedge = (c, km, faint) => { polyRef.current = window.L.polygon(window.BLR_WEDGE(D.city, c.bearing, c.half, km), { color: "#1F7A5C", weight: 2, opacity: faint ? 0.45 : 0.7, dashArray: "5 5", fillColor: "#2E9B74", fillOpacity: faint ? 0.05 : 0.09 }).addTo(map); };
    const fitBounds = (b, cLat, cLon, z) => { try { map.flyToBounds(b, { ...PAD, ...CAM, maxZoom: z || 15 }); } catch (e) { map.flyTo([cLat, cLon], z || 12, CAM); } };
    const fitCity = () => map.flyTo([D.city.lat, D.city.lon], D.city.zoom, CAM);
    // Fit a set of nav-marker anchors with generous pixel padding so the ~190px-wide
    // stacked cards clear the top-left instruction card + breadcrumb, the bottom-left
    // legend, and the right panel edge instead of being clipped at a map edge.
    const fitNav = (pts, maxZoom) => {
      try {
        const b = window.L.latLngBounds(pts.concat([[D.city.lat, D.city.lon]]));
        map.flyToBounds(b, { paddingTopLeft: [120, 208], paddingBottomRight: [150, 104], duration: 0.85, easeLinearity: 0.22, maxZoom: maxZoom || 12 });
      } catch (e) { fitCity(); }
    };

    // ------- clustered leaf renderer (listings / homes / parcels) -------
    function mountLeaves(items, kind, tone) {
      kindRef.current = kind;
      const drawLeaves = () => {
        zoomDrawnRef.current = map.getZoom();
        leaf.clearLayers();
        singletonRef.current.clear(); orderRef.current = [];
        const groups = clusterLeaves(items, map, CLUSTER_PX);
        // Merge multi-member clusters whose DISCS would overlap on screen (disc radius
        // grows with count) — keeps the cluster field readable at any density.
        const discR = (n) => (42 + Math.min(n, 24) * 0.8) / 2 + 5;
        const gc = (grp) => grp.reduce((s, x) => ({ x: s.x + x.p.x / grp.length, y: s.y + x.p.y / grp.length }), { x: 0, y: 0 });
        let merged = true, mguard = 0;
        while (merged && mguard++ < 8) {
          merged = false;
          outer: for (let i = 0; i < groups.length; i++) {
            if (groups[i].length < 2) continue;
            for (let j = i + 1; j < groups.length; j++) {
              if (groups[j].length < 2) continue;
              const ci = gc(groups[i]), cj = gc(groups[j]);
              if (Math.hypot(ci.x - cj.x, ci.y - cj.y) < discR(groups[i].length) + discR(groups[j].length)) {
                groups[i] = groups[i].concat(groups[j]);
                groups.splice(j, 1);
                merged = true;
                break outer;
              }
            }
          }
        }
        const maxN = groups.reduce((m, g0) => Math.max(m, g0.length > 1 ? g0.length : 0), 0);
        groups.forEach((grp) => {
          if (grp.length === 1) {
            const it = grp[0].it;
            const on = it.id === activeRef.current;
            const m = window.L.marker([it.lat, it.lon], { icon: icon(kind === "parcel" ? parcelPin(it, on) : homePin(it, on)), zIndexOffset: on ? 1000 : 0 }).addTo(leaf);
            m.bindPopup(kind === "parcel" ? parcelPopupHTML(it, 0, 1) : listingPopupHTML(it, 0, 1), { closeButton: true, autoPan: true, autoPanPadding: [40, 40], offset: [0, -14], minWidth: 232, maxWidth: 232 });
            m.on("click", () => { onActivate && onActivate(it.id); focusLeaf(it.id); });
            wirePopup(m, it.id, kind);
            singletonRef.current.set(it.id, { marker: m, item: it });
            orderRef.current.push(it.id);
          } else {
            const lat = grp.reduce((s, x) => s + x.it.lat, 0) / grp.length;
            const lon = grp.reduce((s, x) => s + x.it.lon, 0) / grp.length;
            const members = grp.map((x) => x.it);
            const m = window.L.marker([lat, lon], { icon: icon(clusterBubble(grp.length, tone, grp.length === maxN)) }).addTo(leaf);
            m.on("click", () => {
              const b = window.L.latLngBounds(members.map((x) => [x.lat, x.lon])).pad(0.25);
              try { map.flyToBounds(b, { ...PAD, duration: 0.7, easeLinearity: 0.22, maxZoom: 17 }); } catch (e) {}
            });
          }
        });
        // Rebuild popup contents so idx / total stay correct after re-clustering.
        orderRef.current.forEach((id, i) => {
          const rec = singletonRef.current.get(id);
          if (rec) rec.marker.setPopupContent(kind === "parcel" ? parcelPopupHTML(rec.item, i, orderRef.current.length) : listingPopupHTML(rec.item, i, orderRef.current.length));
        });
      };
      const focusLeaf = (id) => {
        const rec = singletonRef.current.get(id);
        if (!rec) return;
        onActivate && onActivate(id);
        map.panInside(rec.marker.getLatLng(), { padding: [90, 90] });
        rec.marker.openPopup();
      };
      const wirePopup = (marker, id, k) => {
        marker.on("popupopen", (ev) => {
          const el = ev.popup.getElement(); if (!el) return;
          const order = orderRef.current;
          const i = order.indexOf(id);
          const prev = el.querySelector(".dp-pp-prev");
          const next = el.querySelector(".dp-pp-next");
          const show = el.querySelector(".dp-pp-show");
          const step = el.querySelector(".dp-pop-step");
          if (order.length <= 1 && step) step.style.visibility = "hidden";
          if (prev) prev.onclick = (e) => { e.stopPropagation(); focusLeaf(order[(i - 1 + order.length) % order.length]); };
          if (next) next.onclick = (e) => { e.stopPropagation(); focusLeaf(order[(i + 1) % order.length]); };
          if (show) show.onclick = (e) => { e.stopPropagation(); onActivate && onActivate(id); };
        });
      };
      reclusterRef.current = drawLeaves;
      drawLeaves();
    }

    // ------- area-marker degradation renderer (AREA_MARKER_UX.md) -------
    // Bands: ≤8 all labeled · 9–15 top-8 labeled + count-dots · 16+ grid-bucketed
    // representatives (cap 12, quadrant coverage) + "+N areas" navigation clusters.
    // Panel stays the complete source of truth; onAreasShown reports the labeled set.
    function mountAreas(list, tone, countFn, pickFn) {
      areaToneRef.current = tone; areaPickRef.current = pickFn; areaCountRef.current = countFn;
      reclusterOnMoveRef.current = true;
      const pick = (id) => { if (hintRef.current) dismissRef.current(); pickFn(id); };
      const drawAreas = () => {
        zoomDrawnRef.current = map.getZoom();
        leaf.clearLayers();
        areaRef.current.clear(); chipRef.current = [];
        const ranked = list.slice().sort((a, b) => countFn(b.id) - countFn(a.id));
        const mk = (a, kind) => {
          const html = kind === "dot" ? areaDot(countFn(a.id), tone) : areaPin(a.name, countFn(a.id), a.id === sel.areaId, tone, {});
          const m = window.L.marker([a.lat, a.lon], { icon: icon(html), zIndexOffset: kind === "dot" ? 400 : 900 })
            .on("click", () => pick(a.id)).addTo(leaf);
          if (onAreaHover) {
            m.on("mouseover", () => onAreaHover(a.id, "map"));
            m.on("mouseout", () => onAreaHover(null, "map"));
          }
          areaRef.current.set(a.id, { marker: m, area: a, count: countFn(a.id), tone, kind });
        };
        let labeledIds;
        if (list.length <= 8) {
          ranked.forEach((a) => mk(a, "label"));
          labeledIds = ranked.map((a) => a.id);
        } else if (list.length <= 15) {
          ranked.forEach((a, i) => mk(a, i < 8 ? "label" : "dot"));
          labeledIds = ranked.map((a) => a.id); // every area is individually on the map
        } else {
          // Label-shaped grid cells (≈ pin footprint) → one labeled rep per cell = collision-free by construction.
          const CELL_W = 170, CELL_H = 64, CAP = map.getSize().x < 520 ? 8 : 12; // tighter label cap on small maps
          const cells = new Map();
          ranked.forEach((a) => {
            const p = map.latLngToContainerPoint([a.lat, a.lon]);
            const k = Math.floor(p.x / CELL_W) + "_" + Math.floor(p.y / CELL_H);
            if (!cells.has(k)) cells.set(k, []);
            cells.get(k).push(a); // ranked order → [0] = best in cell
          });
          let reps = Array.from(cells.values()).map((members) => members[0]);
          if (reps.length > CAP) {
            // keep ≥1 representative per quadrant, then fill by count
            const cLat = list.reduce((s, a) => s + a.lat, 0) / list.length;
            const cLon = list.reduce((s, a) => s + a.lon, 0) / list.length;
            const quad = (a) => (a.lat >= cLat ? 0 : 2) + (a.lon >= cLon ? 0 : 1);
            const byQuad = [null, null, null, null];
            reps.forEach((a) => { const q = quad(a); if (!byQuad[q] || countFn(a.id) > countFn(byQuad[q].id)) byQuad[q] = a; });
            const keep = byQuad.filter(Boolean);
            reps.sort((a, b) => countFn(b.id) - countFn(a.id)).forEach((a) => { if (keep.length < CAP && keep.indexOf(a) === -1) keep.push(a); });
            reps = keep;
          }
          const repSet = new Set(reps.map((a) => a.id));
          [sel.areaId, focusAreaRef.current].forEach((fid) => {
            if (fid && !repSet.has(fid)) { const a = list.find((x) => x.id === fid); if (a) { reps.push(a); repSet.add(a.id); } }
          });
          // Collision pass — the grid guarantees one label per cell, but near-boundary
          // points in ADJACENT cells can still collide. Keep labels greedily in rank
          // order (selected area always first); losers demote into their cell's
          // chip / dot so no two persistent labels overlap at this zoom.
          // Deterministic anchoring: labels are fixed-width blocks centered on the anchor
          // (see areaPin), so rects are exact by construction.
          const labelRect = (a) => {
            const p = map.latLngToContainerPoint([a.lat, a.lon]);
            const w = 8 * (a.name.length + String(countFn(a.id)).length) + 64;
            return { x: p.x - w / 2, y: p.y - 44, w, h: 44 };
          };
          const hits = (r, s, pad) => r.x - pad < s.x + s.w && s.x - pad < r.x + r.w && r.y - pad < s.y + s.h && s.y - pad < r.y + r.h;
          const forced = (id) => id === sel.areaId || id === focusAreaRef.current;
          const ordered = reps.slice().sort((a, b) => (forced(a.id) ? -1 : forced(b.id) ? 1 : countFn(b.id) - countFn(a.id)));
          const kept = [], keptRects = [];
          ordered.forEach((a) => {
            const r = labelRect(a);
            if (keptRects.some((s) => hits(r, s, 4))) { repSet.delete(a.id); return; }
            kept.push(a); keptRects.push(r);
          });
          kept.forEach((a) => mk(a, "label"));
          labeledIds = kept.map((a) => a.id);
          // Leftovers per cell → navigation chip (≥2) or count-dot (1)
          const chipCands = [];
          cells.forEach((members) => {
            const rest = members.filter((a) => !repSet.has(a.id));
            if (!rest.length) return;
            if (rest.length === 1) { mk(rest[0], "dot"); return; }
            chipCands.push({ members: rest });
          });
          // Merge chips whose footprints overlap, then nudge any chip clear of kept labels.
          const centroidPt = (members) => map.latLngToContainerPoint([
            members.reduce((s, a) => s + a.lat, 0) / members.length,
            members.reduce((s, a) => s + a.lon, 0) / members.length,
          ]);
          // Chips are fixed-width blocks centered on the anchor (see areaClusterChip).
          const chipRect = (pt) => ({ x: pt.x - 88, y: pt.y - 32, w: 176, h: 64 });
          const chipGroups = [];
          chipCands.forEach((c) => {
            const pt = centroidPt(c.members);
            const prev = chipGroups.find((g) => hits(chipRect(pt), chipRect(g.pt), 0));
            if (prev) { prev.members = prev.members.concat(c.members); prev.pt = centroidPt(prev.members); }
            else chipGroups.push({ members: c.members, pt });
          });
          const placedRects = [];
          const mapSz = map.getSize();
          const OFFS = [[0, 0], [0, 30], [0, -30], [-70, 30], [70, 30], [-70, -30], [70, -30], [-100, 0], [100, 0], [0, 62], [0, -62], [-140, 46], [140, 46], [-140, -46], [140, -46]];
          chipGroups.forEach((g) => {
            const inBounds = (p) => p.x > 84 && p.x < mapSz.x - 84 && p.y > 96 && p.y < mapSz.y - 84;
            // Pick the candidate with ZERO overlap if one exists, else the LEAST overlap —
            // never the raw centroid when a better spot is available.
            const overlapArea = (p) => {
              const c = chipRect(p);
              const r = { x: c.x - 6, y: c.y - 6, w: c.w + 12, h: c.h + 12 };
              let s = 0;
              const acc = (q) => {
                const ix = Math.max(0, Math.min(r.x + r.w, q.x + q.w) - Math.max(r.x, q.x));
                const iy = Math.max(0, Math.min(r.y + r.h, q.y + q.h) - Math.max(r.y, q.y));
                s += ix * iy;
              };
              keptRects.forEach(acc); placedRects.forEach(acc);
              return s;
            };
            let pt = g.pt, best = Infinity;
            for (let i = 0; i < OFFS.length; i++) {
              const c = window.L.point(g.pt.x + OFFS[i][0], g.pt.y + OFFS[i][1]);
              if (i > 0 && !inBounds(c)) continue;
              const a = overlapArea(c);
              if (a === 0) { pt = c; best = 0; break; }
              if (a < best) { best = a; pt = c; }
            }
            placedRects.push(chipRect(pt));
            const ll = map.containerPointToLatLng(pt);
            const members = g.members;
            // Offset chip → leader line + anchor dot back to the true member centroid.
            const ldx = g.pt.x - pt.x, ldy = g.pt.y - pt.y;
            const m = window.L.marker(ll, { icon: icon(areaClusterChip(members.length, tone, null, leaderHTML(ldx, ldy, tone))), zIndexOffset: 600 }).addTo(leaf);
            m.on("click", () => {
              if (hintRef.current) dismissRef.current();
              // Never zoom into an empty view: members are real in-scope areas, and if the
              // camera can't actually get closer (no split possible), guide to the panel
              // list instead of flying.
              const b = window.L.latLngBounds(members.map((a) => [a.lat, a.lon])).pad(0.45);
              let tz = map.getZoom() + 1;
              try { tz = Math.min(16, map.getBoundsZoom(b)); } catch (e) {}
              if (tz > map.getZoom()) {
                try { map.flyToBounds(b, { ...PAD, duration: 0.7, easeLinearity: 0.22, maxZoom: 16 }); } catch (e) {}
              } else if (onAreaHover) {
                onAreaHover(members[0].id, "map-spot"); // highlight + scroll the panel rows
              }
            });
            chipRef.current.push({ marker: m, members, tone, count: members.length, hi: false, ldx, ldy });
          });
        }
        if (onAreasShown) onAreasShown(labeledIds);
      };
      reclusterRef.current = drawAreas; // re-bucket on ZOOM only (pan-invariant)
      drawAreas();
    }

    // ------- decluttered pill renderer (group / zone pills) -------
    // True anchors stay put; colliding pills shift in screen space (priority: selected,
    // then count) with a leader line + anchor dot when offset. Deterministic; recomputed
    // on zoomend/moveend/resize only — never on hover.
    function mountPills(list, accent, countFn, selId, pickFn, meta) {
      meta = meta || {};
      reclusterOnMoveRef.current = true;
      const compact = navMode ? list.length > 6 : list.length > 4;
      const drawPills = () => {
        zoomDrawnRef.current = map.getZoom();
        leaf.clearLayers();
        navMarkerRef.current.clear();
        const ranked = list.slice().sort((a, b) => (b.id === selId ? 1 : 0) - (a.id === selId ? 1 : 0) || countFn(b.id) - countFn(a.id));
        let placed; // [{ it, p, dx, dy }]
        if (navMode) {
          const par = meta.parent;   // {lat,lon} — preserve each child's real bearing from parent
          const navEntries = ranked.map((it) => {
            const c = it.center || it;
            const e = { id: it.id };
            if (par) e.bearing = Math.atan2(par.lat - c.lat, c.lon - par.lon); // screen: south=+y, east=+x
            return e;
          });
          const pts = navPoints(navEntries, map, isMobile);
          placed = ranked.map((it) => ({ it, p: pts.get(it.id), dx: 0, dy: 0 }));
        } else {
          const entries = ranked.map((it) => ({
            item: it, pt: map.latLngToContainerPoint([it.center.lat, it.center.lon]),
            w: compact ? 156 : 184, h: compact ? 84 : 92,
            pri: (it.id === selId ? 100000 : countFn(it.id)), dir: null,
          }));
          const byId = new Map();
          declutterPoints(entries, {
            obstacles: [
              { x: 0, y: 0, w: 360, h: 206 },                          // breadcrumb + instruction card (top-left)
              { x: 0, y: map.getSize().y - 96, w: 240, h: 96 },        // legend (bottom-left)
            ],
            bounds: { minX: 6, minY: 6, maxX: map.getSize().x - 6, maxY: map.getSize().y - 6 },
          }).forEach(({ e, p }) => byId.set(e.item.id, { it: e.item, p, dx: e.pt.x - p.x, dy: e.pt.y - p.y }));
          placed = ranked.map((it) => byId.get(it.id)).filter(Boolean);
        }
        placed.forEach(({ it, p, dx, dy }) => {
          if (!p) return;
          const cnt = countFn(it.id), sel = it.id === selId;
          const noun = meta.noun || "properties", nounS = meta.nounSingular || noun.replace(/s$/, "");
          const label = `${it.name}, ${cnt} ${cnt === 1 ? nounS : noun}. Activate to zoom in and explore ${meta.childHint || "its areas"}.`;
          const hov = it.id === hoverNavIdRef.current;
          const m = window.L.marker(map.containerPointToLatLng(p), {
            icon: icon(navCard({ name: it.name, count: cnt, sel, tone: accent, eyebrow: meta.eyebrow || "AREA", noun, nounSingular: nounS, leader: navMode ? "" : leaderHTML(dx, dy), hovered: hov, compact })),
            zIndexOffset: sel ? 900 : (hov ? 2000 : 0), title: label, keyboard: true, riseOnHover: true,
          }).addTo(leaf);
          const pick = () => { if (hintRef.current) dismissRef.current(); pickFn(it.id); };
          m.on("click", pick);
          if (onNavHover) { m.on("mouseover", () => onNavHover(it.id, "map")); m.on("mouseout", () => onNavHover(null, "map")); }
          const el = m.getElement();
          if (el) {
            el.setAttribute("aria-label", label);
            el.addEventListener("keydown", (ev) => { if (ev.key === "Enter" || ev.key === " " || ev.key === "Spacebar") { ev.preventDefault(); pick(); } });
            if (onNavHover) { el.addEventListener("focus", () => onNavHover(it.id, "map")); el.addEventListener("blur", () => onNavHover(null, "map")); }
          }
          navMarkerRef.current.set(it.id, { marker: m, sel });
        });
      };
      reclusterRef.current = drawPills;
      drawPills();
    }

    switch (layer) {
      case "region-hotspots": {
        const r = region(scope);
        // Top area per GROUP (spatial diversity) — a single dense belt must not claim every hotspot pin.
        const best = new Map();
        D.areas.filter((a) => a.region === scope).forEach((a) => {
          const c = CO.homesArea(a.id);
          if (!best.has(a.group) || c > best.get(a.group).c) best.set(a.group, { a, c });
        });
        Array.from(best.values()).sort((x, y) => y.c - x.c).slice(0, 4)
          .forEach(({ a, c }) => add(a.lat, a.lon, areaPin(a.name, c, false, "copper", { noun: "properties" }), () => onPickArea(a.id), 900));
        if (moveCam && r) fitBounds(r.bounds, r.center.lat, r.center.lon, 12);
        return;
      }
      case "area-groups": {
        const groups = D.groups.filter((gr) => !scope || gr.region === scope);
        const rg = scope && region(scope);
        mountPills(groups, "area", (id) => CO.homesGroup(id), sel.groupId, onPickGroup, { eyebrow: "AREA GROUP", noun: "properties", nounSingular: "property", childHint: "its areas and properties", parent: rg ? rg.center : null });
        if (moveCam) {
          if (navMode) { if (rg) fitBounds(rg.bounds, rg.center.lat, rg.center.lon, 12.6); else fitCity(); }
          else fitNav(groups.map((g) => [g.center.lat, g.center.lon]), scope ? 12 : 12.4);
        }
        return;
      }
      case "area-areas": {
        const gr = D.groups.find((x) => x.id === sel.groupId);
        const areas = D.areas.filter((a) => a.group === sel.groupId);
        if (navMode) mountPills(areas, "area", (id) => CO.homesArea(id), sel.areaId, onPickArea, { eyebrow: "AREA", noun: "properties", nounSingular: "property", childHint: "its listings", parent: gr ? gr.center : null });
        else mountAreas(areas, "copper", (id) => CO.homesArea(id), onPickArea);
        if (moveCam && gr) fitBounds(gr.bounds, gr.center.lat, gr.center.lon, 14);
        return;
      }
      case "area-listings": {
        mountLeaves(listings || [], "listing", "home");
        if (moveCam) {
          const a = D.areas.find((x) => x.id === sel.areaId);
          if (a) fitBounds(a.bounds, a.lat, a.lon, 15);
          else if (scope) { const r = region(scope); fitBounds(r.bounds, r.center.lat, r.center.lon, 12); } else fitCity();
        }
        return;
      }
      case "school-zones": {
        const zones = D.zones.filter((z) => !scope || z.region === scope);
        const rgz = scope && region(scope);
        mountPills(zones, "school", (id) => CO.schoolsZone(id), sel.zoneId, onPickZone, { eyebrow: "SCHOOL ZONE", noun: "schools", nounSingular: "school", childHint: "its areas and schools", parent: rgz ? rgz.center : null });
        if (moveCam) {
          if (navMode) { if (rgz) fitBounds(rgz.bounds, rgz.center.lat, rgz.center.lon, 12.6); else fitCity(); }
          else fitNav(zones.map((z) => [z.center.lat, z.center.lon]), scope ? 12 : 12.4);
        }
        return;
      }
      case "school-areas": {
        const z = D.zones.find((x) => x.id === sel.zoneId);
        mountAreas(D.areas.filter((a) => a.zone === sel.zoneId), "plum", (id) => CO.schoolsArea(id), onPickArea);
        if (moveCam && z) fitBounds(z.bounds, z.center.lat, z.center.lon, 13);
        return;
      }
      case "school-schools": {
        const a = D.areas.find((x) => x.id === sel.areaId);
        D.schools.filter((s) => s.areaId === sel.areaId).forEach((s) => add(s.lat, s.lon, schoolPin(s, s.id === sel.schoolId), () => onPickSchool(s.id), 800));
        if (moveCam && a) fitBounds(a.bounds, a.lat, a.lon, 15);
        return;
      }
      case "school-homes": {
        const s = D.schools.find((x) => x.id === sel.schoolId);
        if (s) {
          if (typeof radiusKm === "number") {
            ringRef.current = window.L.circle([s.lat, s.lon], { radius: radiusKm * 1000, color: "var(--plum-500)", weight: 1.5, opacity: 0.6, fillColor: "var(--plum-500)", fillOpacity: 0.08, dashArray: "4 5" }).addTo(map);
          }
          add(s.lat, s.lon, schoolPin(s, true), () => {}, 1000);
          mountLeaves(listings || [], "listing", "home");
          if (moveCam) {
            if (ringRef.current) { try { map.flyToBounds(ringRef.current.getBounds(), { ...PAD, ...CAM }); } catch (e) { map.flyTo([s.lat, s.lon], 13, CAM); } }
            else map.flyTo([s.lat, s.lon], 13, CAM);
          }
        }
        return;
      }
      case "agri-corridors": {
        const corridorPts = [];
        const drawCorridors = () => {
          zoomDrawnRef.current = map.getZoom();
          leaf.clearLayers();
          navMarkerRef.current.clear();
          corridorPts.length = 0;
          D.agri.corridors.forEach((c) => {
            const [plat, plon] = offsetPt(c.bearing, Math.max(20, AG.maxTownDist(c.id) * 0.55));
            corridorPts.push([plat, plon]);
            const cnt = AG.dirProps(c.id), isSel = c.id === sel.corridorId;
            const label = `${c.label}, ${cnt} ${cnt === 1 ? "parcel" : "parcels"}. Activate to zoom in and explore properties along this corridor.`;
            const hov = c.id === hoverNavIdRef.current;
            const m = window.L.marker([plat, plon], {
              icon: icon(navCard({ name: c.short, count: cnt, sel: isSel, tone: "agri", eyebrow: "CORRIDOR", noun: "parcels", nounSingular: "parcel", leader: "", hovered: hov })),
              zIndexOffset: isSel ? 900 : (hov ? 2000 : 0), title: label, keyboard: true, riseOnHover: true,
            }).addTo(leaf);
            const pick = () => { if (hintRef.current) dismissRef.current(); onPickCorridor(c.id); };
            m.on("click", pick);
            if (onNavHover) { m.on("mouseover", () => onNavHover(c.id, "map")); m.on("mouseout", () => onNavHover(null, "map")); }
            const el = m.getElement();
            if (el) {
              el.setAttribute("aria-label", label);
              el.addEventListener("keydown", (ev) => { if (ev.key === "Enter" || ev.key === " " || ev.key === "Spacebar") { ev.preventDefault(); pick(); } });
              if (onNavHover) { el.addEventListener("focus", () => onNavHover(c.id, "map")); el.addEventListener("blur", () => onNavHover(null, "map")); }
            }
            navMarkerRef.current.set(c.id, { marker: m, sel: isSel });
          });
        };
        reclusterOnMoveRef.current = false;
        reclusterRef.current = drawCorridors;
        drawCorridors();
        // Fit ALL corridor markers (they sit OUTSIDE the city on each bearing) plus the
        // city centre, with generous padding so none is clipped at a map edge.
        if (moveCam) {
          try {
            const b = window.L.latLngBounds(corridorPts.concat([[D.city.lat, D.city.lon]]));
            map.flyToBounds(b, { paddingTopLeft: [70, 150], paddingBottomRight: [70, 96], duration: 0.85, easeLinearity: 0.22, maxZoom: 9 });
          } catch (e) { fitCity(); }
        }
        return;
      }
      case "agri-clusters": {
        const c = D.agri.corridors.find((x) => x.id === sel.corridorId);
        const km = maxKm || 100;
        if (c) {
          drawWedge(c, km);
          AG.visibleTowns(c.id, km).forEach((cl) => add(cl.lat, cl.lon, agriTownDisc(cl.name, AG.townProps(cl.id), cl.id === sel.clusterId), () => onPickCluster(cl.id), 900));
          if (moveCam) { try { map.flyToBounds(polyRef.current.getBounds(), { ...PAD, ...CAM }); } catch (e) { map.flyTo([D.city.lat, D.city.lon], 9, CAM); } }
        }
        return;
      }
      case "agri-parcels": {
        const c = D.agri.corridors.find((x) => x.id === sel.corridorId);
        const cl = D.agri.clusters.find((x) => x.id === sel.clusterId);
        if (c) drawWedge(c, maxKm || 100, true);
        mountLeaves(parcels || [], "parcel", "agri");
        if (moveCam && cl) fitBounds(cl.bounds, cl.lat, cl.lon, 13);
        return;
      }
      default: { // region-bubbles (city landing) — directional declutter (Part A)
        // N pushes up, S down, E right, W left; Central holds the centre. Anchors (region
        // centres) never move — offset bubbles carry a leader line back to the true point.
        reclusterOnMoveRef.current = true;
        const DIRV = { north: [0, -1], south: [0, 1], east: [1, 0], west: [-1, 0], central: null };
        // Representative AREA names + "+N more" for each region card (Guided mode). Aggregates the
        // region's group example-areas (curated, recognisable), deduped; "more" counts the rest.
        const regionReps = (id) => {
          const names = [];
          D.groups.filter((g) => g.region === id).forEach((g) => (g.exampleAreas || []).forEach((nm) => { if (!names.includes(nm)) names.push(nm); }));
          const total = D.areas.filter((a) => a.region === id).length;
          const shown = names.slice(0, 2);
          return { shown: shown.length ? shown : [region(id).name], more: Math.max(0, total - shown.length) };
        };
        const drawRegions = () => {
          zoomDrawnRef.current = map.getZoom();
          leaf.clearLayers();
          regionMarkerRef.current.clear();
          let placed; // [{ item, p, dx, dy }]
          if (navMode) {
            const pts = navPoints(D.regions.map((r) => ({ id: r.id, compass: r.id })), map, isMobile);
            placed = D.regions.map((r) => ({ item: r, p: pts.get(r.id), dx: 0, dy: 0 }));
          } else {
            const entries = D.regions.map((r) => ({
              item: r,
              pt: map.latLngToContainerPoint([r.center.lat, r.center.lon]),
              w: 104, h: 104,
              pri: r.id === scope ? 100000 : r.id === "central" ? 50000 : CO.homesRegion(r.id),
              dir: DIRV[r.id] || null,
            }));
            placed = declutterPoints(entries).map(({ e, p }) => ({ item: e.item, p, dx: e.pt.x - p.x, dy: e.pt.y - p.y }));
          }
          placed.forEach(({ item: r, p, dx, dy }) => {
            if (!p) return;
            const cnt = CO.homesRegion(r.id);
            const label = `${r.name}, ${cnt} ${cnt === 1 ? "property" : "properties"}. Activate to zoom into the region.`;
            const hov = r.id === hoverRegionIdRef.current;
            const reps = navMode ? regionReps(r.id) : null;
            const m = window.L.marker(map.containerPointToLatLng(p), {
              icon: icon(navMode ? regionNavCard(r, cnt, r.id === scope, hov, reps.shown, reps.more) : regionBubble(r, cnt, r.id === scope, leaderHTML(dx, dy), hov, 92)),
              zIndexOffset: r.id === scope ? 900 : (hov ? 2000 : 0), title: label, keyboard: true, riseOnHover: true,
            }).addTo(leaf);
            const pick = () => { if (hintRef.current) dismissRef.current(); onPickRegion(r.id, "map"); };
            m.on("click", pick);
            if (onRegionHover) {
              m.on("mouseover", () => onRegionHover(r.id, "map"));
              m.on("mouseout", () => onRegionHover(null, "map"));
            }
            const el = m.getElement();
            if (el) {
              el.setAttribute("aria-label", label);
              el.addEventListener("keydown", (ev) => { if (ev.key === "Enter" || ev.key === " " || ev.key === "Spacebar") { ev.preventDefault(); pick(); } });
              if (onRegionHover) {
                el.addEventListener("focus", () => onRegionHover(r.id, "map"));
                el.addEventListener("blur", () => onRegionHover(null, "map"));
              }
            }
            regionMarkerRef.current.set(r.id, { marker: m, region: r, count: cnt, ldx: dx, ldy: dy });
          });
        };
        reclusterRef.current = drawRegions;
        drawRegions();
        // Fit all region centres with generous top padding so no bubble crowds the
        // top edge or sits under the breadcrumb + map-instruction card.
        if (moveCam) {
          try {
            const b = window.L.latLngBounds(D.regions.map((r) => [r.center.lat, r.center.lon]));
            map.flyToBounds(b, { paddingTopLeft: [72, 150], paddingBottomRight: [60, 112], duration: 0.85, easeLinearity: 0.22, maxZoom: 11 });
          } catch (e) { fitCity(); }
        }
      }
    }
  }

  const lg = CITY_LEGEND[layer] || CITY_LEGEND["region-bubbles"];
  const isAgri = String(layer).startsWith("agri");
  const crumbColor = isAgri ? "var(--evergreen-600)" : "var(--plum-600)";
  // ---- Region-overview guidance (issue #1808) — only while a region is selected
  //      and no journey has been chosen yet (layer === region-hotspots). ----
  const navLevelUI = layer === "region-bubbles" || layer === "area-groups" || layer === "school-zones";
  const rObj = scope ? region(scope) : null;
  const rName = rObj ? rObj.name : null;
  const rShort = rObj ? rObj.short : null;
  const showGuide = layer === "region-hotspots" && !!regionGuide && !guideDismissed;
  const guideTitleId = "dp-guide-title";

  // ---- Persistent map instruction, one per navigation level (city → region → zone/
  //      corridor). Names the entities actually on the map and states that the map and
  //      the right-hand list are two controls for the same journey. Device-neutral. ----
  const cityName = ((crumb && crumb[0]) || "").replace(/^Discover\s+/, "") || "the city";
  const scopeName = rName || cityName;
  const NAV_INSTR = {
    "region-bubbles": { eyebrow: "Explore the map", body: "Select a region to zoom in, or choose one from the list — both start the same journey." },
    "area-groups": { eyebrow: `Explore ${scopeName}`, body: "Tap an area group to zoom in and explore its areas and properties, or choose one from the list — both open the same areas." },
    "school-zones": { eyebrow: `Explore ${scopeName}`, body: "Tap a zone to zoom in and explore its areas and schools, or choose one from the list — both open the same areas." },
    "agri-corridors": { eyebrow: "Explore agricultural land", body: "Tap a corridor to zoom in and explore its village clusters and parcels, or choose one from the list — both open the same clusters." },
  };
  const navInstr = NAV_INSTR[layer] || null;

  return (
    <div style={{ position: "relative", height: "100%", width: "100%" }}>
      <div ref={elRef} style={{ position: "absolute", inset: 0 }} />
      {/* Breadcrumb chip — mirrors the panel scope + journey */}
      <div style={{ position: "absolute", top: "18px", left: "18px", zIndex: 500, display: "flex", alignItems: "center", gap: "7px", padding: "9px 14px", background: "var(--paper)", borderRadius: "var(--radius-full)", boxShadow: "var(--shadow-md)", border: "1px solid var(--border)", fontFamily: "var(--font-sans)", fontSize: "13.5px", fontWeight: 600, color: "var(--text-strong)", width: "max-content", maxWidth: "calc(100% - 36px)", overflow: "hidden" }}>
        <MIcon name="map-pin" size={16} color={isAgri ? "var(--evergreen-600)" : "var(--accent)"} />
        {(crumb || ["Bangalore"]).map((c, i, arr) => (
          <React.Fragment key={i}>
            {i > 0 && <MIcon name="chevron-right" size={14} color="var(--grey-400)" />}
            <span style={{ color: i === arr.length - 1 ? (i === 0 ? "var(--text-strong)" : crumbColor) : "var(--text-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c}</span>
          </React.Fragment>
        ))}
      </div>
      {/* Layout-mode toggle (prototype comparison) — only at the three navigation levels.
          "Guided" = viewport-anchored navigation controls; "Geographic" = centroid + declutter. */}
      {navLevelUI && (
        <div role="group" aria-label="Marker layout mode" style={{ position: "absolute", top: "18px", right: "18px", zIndex: 540, display: "flex", alignItems: "center", gap: "2px", padding: "3px", background: "var(--paper)", borderRadius: "var(--radius-full)", boxShadow: "var(--shadow-md)", border: "1px solid var(--border)", fontFamily: "var(--font-sans)" }}>
          <span style={{ padding: "0 6px 0 8px", fontSize: "10px", fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--text-muted)" }}>Layout</span>
          {[["nav", "Guided"], ["geo", "Geographic"]].map(([v, l]) => {
            const on = (v === "nav") === navMode;
            return <button key={v} aria-pressed={on} onClick={() => setNavMode(v === "nav")} style={{ border: "none", cursor: "pointer", padding: "5px 11px", borderRadius: "var(--radius-full)", fontFamily: "var(--font-sans)", fontSize: "12px", fontWeight: 700, color: on ? "#fff" : "var(--text-muted)", background: on ? "var(--navy-800)" : "transparent", transition: "background var(--dur-fast), color var(--dur-fast)" }}>{l}</button>;
          })}
        </div>
      )}
      {/* Region-overview guidance card (issue #1808). Desktop: right edge, points
          right toward the panel. Mobile: top-centre, points down toward the sheet.
          Not an error state; dismissible; only on the region-overview layer. */}
      {showGuide && (
        <div role="note" aria-labelledby={guideTitleId} style={isMobile
          ? { position: "absolute", top: "58px", left: "14px", right: "14px", zIndex: 560, background: "var(--paper)", borderRadius: "var(--radius-lg)", boxShadow: "var(--shadow-lg)", border: "1px solid var(--border)", borderLeft: "3px solid var(--accent)", padding: "12px 12px 12px 14px", fontFamily: "var(--font-sans)" }
          : { position: "absolute", top: "18px", right: "18px", zIndex: 560, width: "258px", background: "var(--paper)", borderRadius: "var(--radius-lg)", boxShadow: "var(--shadow-lg)", border: "1px solid var(--border)", borderRight: "3px solid var(--accent)", padding: "14px 16px", fontFamily: "var(--font-sans)" }}>
          <button onClick={onDismissGuide} aria-label="Dismiss region guidance" style={{ position: "absolute", top: "8px", right: "8px", width: "22px", height: "22px", border: "none", background: "transparent", color: "var(--grey-500)", cursor: "pointer", borderRadius: "var(--radius-full)", fontSize: "15px", lineHeight: 1, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>×</button>
          <div style={{ display: "flex", alignItems: "center", gap: "7px", marginBottom: "6px" }}>
            <MIcon name="map-pin" size={14} color="var(--accent)" />
            <span style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "var(--tracking-caps)", textTransform: "uppercase", color: "var(--accent)" }}>Region selected</span>
          </div>
          <div id={guideTitleId} style={{ fontSize: "14.5px", fontWeight: 700, letterSpacing: "-0.01em", color: "var(--text-strong)" }}>{rName}</div>
          <p style={{ margin: "3px 0 10px", fontSize: "12.5px", lineHeight: 1.45, color: "var(--text-muted)", textWrap: "pretty" }}>Showing top areas only — a preview, not the full list.</p>
          <div style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "12.5px", fontWeight: 700, color: "var(--copper-600)" }}>
            {isMobile ? <>Choose how to search below <span className="dp-guide-arr dp-guide-arr-down" aria-hidden="true">&#8595;</span></> : <>Choose how to continue on the right <span className="dp-guide-arr" aria-hidden="true">&#8594;</span></>}
          </div>
        </div>
      )}
      {/* Persistent map instruction, one per navigation level (region / zone / corridor) —
          tells a first-time user the markers are selectable and that the map + list are two
          ways to start the same journey. Device-neutral copy; part of the product, not a tooltip. */}
      {navInstr && (
        <div style={{ position: "absolute", top: "66px", left: "18px", zIndex: 520, maxWidth: "min(320px, calc(100% - 36px))", background: "var(--paper)", borderRadius: "var(--radius-lg)", boxShadow: "var(--shadow-md)", border: "1px solid var(--border)", borderLeft: `3px solid ${layer === "agri-corridors" ? "var(--evergreen-600)" : "var(--accent)"}`, padding: "11px 14px", fontFamily: "var(--font-sans)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "7px", marginBottom: "3px" }}>
            <MIcon name="map-pin" size={14} color={layer === "agri-corridors" ? "var(--evergreen-600)" : "var(--accent)"} />
            <span style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "var(--tracking-caps)", textTransform: "uppercase", color: layer === "agri-corridors" ? "var(--evergreen-700, #1F694A)" : "var(--accent)" }}>{navInstr.eyebrow}</span>
          </div>
          <p style={{ margin: 0, fontSize: "12.5px", lineHeight: 1.45, color: "var(--text-body)", textWrap: "pretty" }}>{navInstr.body}</p>
        </div>
      )}
      {/* First-time helper hint — dismissible, localStorage-remembered (deeper levels only;
          navigation levels use the persistent instruction above instead) */}
      {hint && !showGuide && !navInstr && (
        <div style={{ position: "absolute", top: "66px", left: "18px", zIndex: 500, display: "flex", alignItems: "center", gap: "9px", padding: "9px 12px", background: "var(--navy-800)", color: "#fff", borderRadius: "var(--radius-md)", boxShadow: "var(--shadow-lg)", fontFamily: "var(--font-sans)", fontSize: "12.5px", fontWeight: 600, maxWidth: "min(300px, calc(100% - 36px))" }}>
          <MIcon name="map-pin" size={15} color="#fff" style={{ flex: "none" }} />
          Select map markers to explore
          <button onClick={dismissHint} aria-label="Dismiss hint" style={{ marginLeft: "2px", flex: "none", border: "none", background: "rgba(255,255,255,0.16)", color: "#fff", width: "20px", height: "20px", borderRadius: "var(--radius-full)", cursor: "pointer", fontSize: "13px", lineHeight: 1, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>×</button>
        </div>
      )}
      {/* Legend */}
      <div className="dp-legend" style={{ position: "absolute", bottom: "44px", left: "18px", zIndex: 500, display: "flex", flexDirection: "column", gap: "8px", padding: "11px 13px", background: "rgba(255,255,255,0.92)", backdropFilter: "blur(6px)", borderRadius: "var(--radius-md)", boxShadow: "var(--shadow-sm)", border: "1px solid var(--border)", fontFamily: "var(--font-sans)", fontSize: "12px", color: "var(--text-body)" }}>
        <span style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span style={{ width: "11px", height: "11px", borderRadius: "var(--radius-full)", background: lg.ring ? "var(--paper)" : lg.dot, border: lg.ring ? `1px solid ${lg.dot}` : "none" }} />{layer === "region-hotspots" && rShort ? `${rShort} overview` : lg.text}
        </span>
        {layer === "region-hotspots" && (
          <span style={{ paddingLeft: "19px", marginTop: "-3px", fontSize: "11px", color: "var(--text-muted)" }}>Top areas only · not all areas</span>
        )}
        {(layer === "area-areas" || layer === "school-areas") && (
          <span style={{ display: "flex", alignItems: "center", gap: "8px" }}><span style={{ width: "11px", height: "11px", borderRadius: "var(--radius-full)", border: `1.5px dashed ${layer === "school-areas" ? "var(--plum-600)" : "var(--navy-800)"}`, background: "var(--paper)" }} />&#43;N areas &middot; select to expand</span>
        )}
        {lg.cluster && (
          <span style={{ display: "flex", alignItems: "center", gap: "8px" }}><span style={{ width: "11px", height: "11px", borderRadius: "var(--radius-full)", background: isAgri ? "var(--evergreen-600)" : "var(--navy-800)", border: "1.5px solid #fff", boxShadow: "0 0 0 1px var(--border)" }} />Clusters &middot; select to open</span>
        )}
        {layer === "school-homes" && (
          <span style={{ display: "flex", alignItems: "center", gap: "8px" }}><span style={{ width: "11px", height: "11px", borderRadius: "var(--radius-full)", border: "1.5px dashed var(--plum-500)", background: "transparent" }} />{radiusKm} km radius</span>
        )}
      </div>
      {/* Summary pill */}
      <div style={{ position: "absolute", bottom: "20px", left: "50%", transform: "translateX(-50%)", zIndex: 500, display: "flex", alignItems: "center", gap: "8px", padding: "9px 16px", background: "var(--paper)", borderRadius: "var(--radius-full)", boxShadow: "var(--shadow-md)", border: "1px solid var(--border)", fontFamily: "var(--font-sans)", fontSize: "13px", fontWeight: 600, color: "var(--text-body)", whiteSpace: "nowrap" }}>
        <MIcon name={summary.icon} size={15} color={summary.color} />
        Showing <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700, color: "var(--text-strong)" }}>{summary.count.toLocaleString("en-IN")}</span> {summary.noun}
      </div>
    </div>
  );
}

window.DPMap = DPMap;
