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
function declutterPoints(entries) {
  const out = [];
  const rectAt = (p, e) => ({ x: p.x - e.w / 2, y: p.y - e.h / 2, w: e.w, h: e.h });
  const overlap = (a, b) => a.x - 8 < b.x + b.w && b.x - 8 < a.x + a.w && a.y - 8 < b.y + b.h && b.y - 8 < a.y + a.h;
  entries.slice().sort((a, b) => b.pri - a.pri).forEach((e) => {
    let p = e.pt, guard = 0;
    while (guard++ < 26) {
      const hit = out.find((o) => overlap(rectAt(p, e), o.rect));
      if (!hit) break;
      let vx, vy;
      if (e.dir) { vx = e.dir[0]; vy = e.dir[1]; }
      else {
        vx = p.x - (hit.rect.x + hit.rect.w / 2); vy = p.y - (hit.rect.y + hit.rect.h / 2);
        const n = Math.hypot(vx, vy);
        if (n < 0.5) { vx = 0; vy = 1; } else { vx /= n; vy /= n; }
      }
      p = window.L.point(p.x + vx * 14, p.y + vy * 14);
    }
    out.push({ e, p, rect: rectAt(p, e) });
  });
  return out;
}
function regionBubble(r, count, sel, leader) {
  const bg = sel ? "var(--navy-900)" : "rgba(27,42,69,0.95)";
  return `<div class="dp-nav" style="position:relative;width:130px;margin-left:-65px;transform:translateY(-50%);font-family:var(--font-sans);text-align:center;">
    ${leader || ""}
    <div class="dp-pulse" style="display:inline-block;border-radius:var(--radius-full);">
    <div class="dp-navcore" style="display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1px;width:86px;height:86px;border-radius:var(--radius-full);background:${bg};color:#fff;box-shadow:var(--shadow-lg);border:2px solid rgba(255,255,255,0.5);transform:scale(${sel ? 1.06 : 1});transition:all .18s cubic-bezier(.4,0,.2,1);">
      <span style="font-family:var(--font-mono);font-size:19px;font-weight:700;line-height:1;">${count}</span>
      <span style="font-size:11px;font-weight:700;">${r.short}</span>
    </div></div>
    <div class="dp-hint-cap" style="margin-top:4px;padding:2px 8px;border-radius:var(--radius-full);background:var(--paper);box-shadow:var(--shadow-sm);font-size:10px;font-weight:700;color:var(--text-muted);white-space:nowrap;">Tap to explore</div></div>`;
}
function bubblePill(name, count, sel, accent, leader) {
  const bg = sel ? "var(--navy-900)" : "rgba(27,42,69,0.95)";
  const svg = accent === "agri"
    ? `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v20"/><path d="M5 8c4 0 7-3 7-6 0 3 3 6 7 6"/></svg>`
    : accent === "school"
    ? `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m22 10-10-5L2 10l10 5 10-5z"/><path d="M6 12v5c0 1.7 2.7 3 6 3s6-1.3 6-3v-5"/></svg>`
    : `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83z"/><path d="M2 12a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 12"/></svg>`;
  return `<div class="dp-nav" style="position:relative;width:300px;margin-left:-150px;transform:translateY(-50%);font-family:var(--font-sans);text-align:center;">
    ${leader || ""}
    <div class="dp-pulse" style="display:inline-block;border-radius:var(--radius-full);">
    <div class="dp-navcore" style="display:inline-flex;align-items:center;gap:9px;padding:8px 14px;border-radius:var(--radius-full);background:${bg};color:#fff;box-shadow:var(--shadow-lg);white-space:nowrap;border:1.5px solid rgba(255,255,255,0.45);transform:scale(${sel ? 1.06 : 1});transition:all .18s cubic-bezier(.4,0,.2,1);">
      ${svg}<span style="font-size:13px;font-weight:700;letter-spacing:-0.01em;">${name}</span>
      <span style="font-family:var(--font-mono);font-size:11px;color:rgba(255,255,255,0.7);">${count}</span>
      <span style="font-size:13px;font-weight:700;color:rgba(255,255,255,0.65);">&#8250;</span>
    </div></div></div>`;
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
    <div style="margin-top:4px;display:inline-block;padding:2px 8px;border-radius:var(--radius-full);background:var(--paper);box-shadow:var(--shadow-sm);font-size:10px;font-weight:700;color:${hiName ? "var(--text-strong)" : "var(--text-muted)"};white-space:nowrap;">${hiName ? `Includes ${hiName}` : "Tap to expand"}</div>
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
// with repeated "Tap to zoom in" labels. ----
function clusterBubble(count, tone, showCap) {
  const bg = tone === "agri" ? "var(--evergreen-600)" : "var(--navy-800)";
  const size = Math.round(42 + Math.min(count, 24) * 0.8);
  const cap = tone === "agri" ? "parcels" : "homes";
  return `<div class="dp-cluster" style="transform:translate(-50%,-50%);font-family:var(--font-sans);text-align:center;cursor:pointer;">
    <div class="dp-cluster-disc" style="width:${size}px;height:${size}px;border-radius:var(--radius-full);background:${bg};color:#fff;box-shadow:var(--shadow-lg);border:3px solid rgba(255,255,255,0.9);display:flex;flex-direction:column;align-items:center;justify-content:center;line-height:1;margin:0 auto;transition:transform .18s cubic-bezier(.4,0,.2,1);">
      <span style="font-family:var(--font-mono);font-size:17px;font-weight:700;">${count}</span>
      <span style="font-size:8px;font-weight:700;letter-spacing:.05em;opacity:.82;text-transform:uppercase;">${cap}</span>
    </div>
    <div class="dp-cluster-cap${showCap ? " on" : ""}" style="margin-top:5px;padding:2px 8px;border-radius:var(--radius-full);background:var(--paper);box-shadow:var(--shadow-sm);font-size:10px;font-weight:700;color:var(--text-muted);white-space:nowrap;">Tap to zoom in</div>
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
function agriDirBubble(c, count, sel) {
  const bg = sel ? "#1C5B43" : "#1F7A5C";
  return `<div style="transform:translate(-50%,-50%);font-family:var(--font-sans);text-align:center;">
    <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;width:74px;height:74px;border-radius:var(--radius-full);background:${bg};color:#fff;box-shadow:0 4px 14px rgba(20,50,40,.35);border:3px solid #fff;transform:scale(${sel ? 1.06 : 1});transition:all .18s cubic-bezier(.4,0,.2,1);">
      <span style="font-family:var(--font-mono);font-size:18px;font-weight:800;line-height:1;">${count}</span>
      <span style="font-size:10px;font-weight:700;">${c.dir}</span>
    </div>
    <div style="margin-top:5px;display:inline-block;padding:3px 9px;border-radius:var(--radius-full);background:#fff;box-shadow:var(--shadow-sm);font-size:11px;font-weight:700;color:var(--text-strong);white-space:nowrap;">${c.short}</div>
  </div>`;
}
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

function DPMap({ layer, scope, selection, radiusKm, maxKm, activeListing, listings, parcels, crumb, summary, onActivate, onPickRegion, onPickGroup, onPickArea, onPickSchool, onPickZone, onPickCorridor, onPickCluster, hoverAreaId, hoverSrc, onAreaHover, onAreasShown, focusArea, regionGuide, guideDismissed, onDismissGuide, isMobile }) {
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
  const reclusterOnMoveRef = React.useRef(false); // area layers re-place on ANY moveend (no popups to protect)
  const focusAreaRef = React.useRef(null);      // "Show on map" area — force-kept as a label (never a duplicate pin)
  const areaToneRef = React.useRef("copper");
  const areaPickRef = React.useRef(null);
  const areaCountRef = React.useRef(null);
  // First-time helper hint (localStorage-remembered)
  const [hint, setHint] = React.useState(() => { try { return !localStorage.getItem("dp_map_hint_v1"); } catch (e) { return true; } });
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
  const cameraKey = [layer, scope, sel.groupId, sel.zoneId, sel.areaId, sel.schoolId, sel.corridorId, sel.clusterId, radiusKm, maxKm].join("|");
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

    const add = (lat, lon, html, click, z) => window.L.marker([lat, lon], { icon: icon(html), zIndexOffset: z || 0 }).on("click", (e) => { if (hintRef.current) dismissRef.current(); (click || (() => {}))(e); }).addTo(g);
    const offsetPt = (bearing, km) => { const kLat = 1 / 111, kLon = 1 / (111 * Math.cos(D.city.lat * Math.PI / 180)), b = bearing * Math.PI / 180; return [D.city.lat + km * Math.cos(b) * kLat, D.city.lon + km * Math.sin(b) * kLon]; };
    const drawWedge = (c, km, faint) => { polyRef.current = window.L.polygon(window.BLR_WEDGE(D.city, c.bearing, c.half, km), { color: "#1F7A5C", weight: 2, opacity: faint ? 0.45 : 0.7, dashArray: "5 5", fillColor: "#2E9B74", fillOpacity: faint ? 0.05 : 0.09 }).addTo(map); };
    const fitBounds = (b, cLat, cLon, z) => { try { map.flyToBounds(b, { ...PAD, ...CAM, maxZoom: z || 15 }); } catch (e) { map.flyTo([cLat, cLon], z || 12, CAM); } };
    const fitCity = () => map.flyTo([D.city.lat, D.city.lon], D.city.zoom, CAM);

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
    function mountPills(list, accent, countFn, selId, pickFn) {
      reclusterOnMoveRef.current = true;
      const drawPills = () => {
        zoomDrawnRef.current = map.getZoom();
        leaf.clearLayers();
        const entries = list.map((it) => ({
          item: it,
          pt: map.latLngToContainerPoint([it.center.lat, it.center.lon]),
          w: 8.5 * it.name.length + 110, h: 46,
          pri: (it.id === selId ? 100000 : countFn(it.id)), dir: null,
        }));
        declutterPoints(entries).forEach(({ e, p }) => {
          const dx = e.pt.x - p.x, dy = e.pt.y - p.y;
          window.L.marker(map.containerPointToLatLng(p), { icon: icon(bubblePill(e.item.name, countFn(e.item.id), e.item.id === selId, accent, leaderHTML(dx, dy))), zIndexOffset: e.item.id === selId ? 900 : 0 })
            .on("click", () => { if (hintRef.current) dismissRef.current(); pickFn(e.item.id); }).addTo(leaf);
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
        mountPills(groups, "area", (id) => CO.homesGroup(id), sel.groupId, onPickGroup);
        if (moveCam) { if (scope) { const r = region(scope); fitBounds(r.bounds, r.center.lat, r.center.lon, 12); } else fitCity(); }
        return;
      }
      case "area-areas": {
        const gr = D.groups.find((x) => x.id === sel.groupId);
        mountAreas(D.areas.filter((a) => a.group === sel.groupId), "copper", (id) => CO.homesArea(id), onPickArea);
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
        mountPills(zones, "school", (id) => CO.schoolsZone(id), sel.zoneId, onPickZone);
        if (moveCam) { if (scope) { const r = region(scope); fitBounds(r.bounds, r.center.lat, r.center.lon, 12); } else fitCity(); }
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
        D.agri.corridors.forEach((c) => {
          const [plat, plon] = offsetPt(c.bearing, Math.max(20, AG.maxTownDist(c.id) * 0.55));
          add(plat, plon, agriDirBubble(c, AG.dirProps(c.id), c.id === sel.corridorId), () => onPickCorridor(c.id));
        });
        if (moveCam) fitCity();
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
        const drawRegions = () => {
          zoomDrawnRef.current = map.getZoom();
          leaf.clearLayers();
          const entries = D.regions.map((r) => ({
            item: r,
            pt: map.latLngToContainerPoint([r.center.lat, r.center.lon]),
            w: 104, h: 104,
            pri: r.id === scope ? 100000 : r.id === "central" ? 50000 : CO.homesRegion(r.id),
            dir: DIRV[r.id] || null,
          }));
          declutterPoints(entries).forEach(({ e, p }) => {
            const dx = e.pt.x - p.x, dy = e.pt.y - p.y;
            window.L.marker(map.containerPointToLatLng(p), { icon: icon(regionBubble(e.item, CO.homesRegion(e.item.id), e.item.id === scope, leaderHTML(dx, dy))), zIndexOffset: e.item.id === scope ? 900 : 0 })
              .on("click", () => { if (hintRef.current) dismissRef.current(); onPickRegion(e.item.id, "map"); }).addTo(leaf);
          });
        };
        reclusterRef.current = drawRegions;
        drawRegions();
        if (moveCam) fitCity();
      }
    }
  }

  const lg = CITY_LEGEND[layer] || CITY_LEGEND["region-bubbles"];
  const isAgri = String(layer).startsWith("agri");
  const crumbColor = isAgri ? "var(--evergreen-600)" : "var(--plum-600)";
  // ---- Region-overview guidance (issue #1808) — only while a region is selected
  //      and no journey has been chosen yet (layer === region-hotspots). ----
  const rObj = scope ? region(scope) : null;
  const rName = rObj ? rObj.name : null;
  const rShort = rObj ? rObj.short : null;
  const showGuide = layer === "region-hotspots" && !!regionGuide && !guideDismissed;
  const guideTitleId = "dp-guide-title";

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
      {/* First-time helper hint — dismissible, localStorage-remembered */}
      {hint && !showGuide && (
        <div style={{ position: "absolute", top: "66px", left: "18px", zIndex: 500, display: "flex", alignItems: "center", gap: "9px", padding: "9px 12px", background: "var(--navy-800)", color: "#fff", borderRadius: "var(--radius-md)", boxShadow: "var(--shadow-lg)", fontFamily: "var(--font-sans)", fontSize: "12.5px", fontWeight: 600, maxWidth: "min(300px, calc(100% - 36px))" }}>
          <MIcon name="map-pin" size={15} color="#fff" style={{ flex: "none" }} />
          Tap map markers to explore
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
          <span style={{ display: "flex", alignItems: "center", gap: "8px" }}><span style={{ width: "11px", height: "11px", borderRadius: "var(--radius-full)", border: `1.5px dashed ${layer === "school-areas" ? "var(--plum-600)" : "var(--navy-800)"}`, background: "var(--paper)" }} />&#43;N areas &middot; tap to expand</span>
        )}
        {lg.cluster && (
          <span style={{ display: "flex", alignItems: "center", gap: "8px" }}><span style={{ width: "11px", height: "11px", borderRadius: "var(--radius-full)", background: isAgri ? "var(--evergreen-600)" : "var(--navy-800)", border: "1.5px solid #fff", boxShadow: "0 0 0 1px var(--border)" }} />Clusters &middot; tap to open</span>
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
