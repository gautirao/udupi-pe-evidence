// Discover experience — map surface. Leaflet + CARTO Voyager, the same marker
// grammar as ui_kits/new_discover (directional card, area pill, price pin) plus
// the dashed visual-cluster chip and the drawn-boundary layer.
// The map owns no product state: everything it draws comes from `view`.
/* Lazy view of window.EXP: the design-system bundle evaluates this file
// before EXP exists, so a value capture here would be undefined forever in that copy.
// A Proxy resolves each property at access time instead. */
// ---- coordinate fence -------------------------------------------------------
// ExpMap feeds roughly a dozen Leaflet consumers (markers, clusters, polygons,
// circles, rectangles, polylines, container-point maths). EVERY one of them throws
// "Invalid LatLng object: (NaN, NaN)" on a single non-finite value, and because they
// run inside commit effects React responds by unmounting the entire shell. Rather
// than guard each consumer, coordinates are screened at the choke points: EXP_OK
// rejects a bad point, EXP_PTS filters a list, and safeLL (defined per-effect, since
// it needs the map for its fallback) sanitises an individual pair.
const EXP_OK = (o) => !!o && Number.isFinite(o.lat) && Number.isFinite(o.lon);
const EXP_PTS = (list) => (list || []).filter(EXP_OK);
const EXP_CENTRED = (list) => (list || []).filter((x) => x && EXP_OK(x.center));

const EM = new Proxy({}, { get: (_t, k) => (window.EXP ? window.EXP[k] : undefined), has: (_t, k) => !!window.EXP && k in window.EXP });

const MG = {
  zoom: (c) => `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="2.4" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M11 8v6M8 11h6M20 20l-3.5-3.5"/></svg>`,
  pin: (c) => `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>`,
  // "Explore" identity glyph — compass, distinct from the magnifier (Zoom) and home (View homes)
  compass: (c) => `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="m15.2 8.8-1.8 4.6-4.6 1.8 1.8-4.6z" fill="${c}" stroke="none"/></svg>`,
  home: (c) => `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10v9a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1v-9"/><path d="M9.5 20v-5.5a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1V20"/></svg>`,
  cap: (c) => `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m22 10-10-5L2 10l10 5 10-5z"/><path d="M6 12v5c0 1.7 2.7 3 6 3s6-1.3 6-3v-5"/></svg>`
};

// ---- Unified navigation-marker shell ("Explore" / "Zoom in") ----------------------------
// One connected component throughout: an identity half (rounded top) flush against an
// attached action footer (rounded bottom), a single shared shadow/border, and a centred
// tail. Two variants share this shell but are never distinguished by colour alone:
//  - "explore"  → real hierarchy destination (Direction / Local Destination). Dark navy
//                 identity half + a SOLID accent footer in white text — the loud, dark
//                 marker signals a real move into the hierarchy (node/breadcrumb change).
//  - "zoom"     → temporary combined destinations, grouped only because every marker
//                 can't fit. Warm cream (schools: lavender) identity half + a WHITE
//                 footer in accent text — a deliberately lighter, lower-commitment mark.
//                 Never changes node/breadcrumb; only pans/zooms until members separate.
// domain: "homes" (copper accent) | "schools" (plum accent) — see VISUAL_RULES §Areas vs
// Schools palette mapping. Reused by destCardHTML / regionalClusterCardHTML / clusterChipHTML.
function navMarkerHTML(actionKind, o) {
  const schools = o.domain === "schools";
  const accent = schools ? "var(--plum-600)" : "var(--copper-500)";
  const accentText = schools ? "var(--plum-600)" : "var(--copper-600)";
  const accentTint = schools ? "var(--plum-tint)" : "var(--copper-100)";
  const sel = !!o.sel;
  const isZoom = actionKind === "zoom";
  const w = o.w, cf = o.cf;
  const bodyBg = isZoom ? accentTint : "var(--navy-800)";
  const bodyFg = isZoom ? "var(--navy-800)" : "#fff";
  const mutedFg = isZoom ? "var(--text-muted)" : "rgba(255,255,255,.72)";
  const pillBg = isZoom ? "rgba(27,42,69,0.08)" : "rgba(255,255,255,0.14)";
  const pillFg = isZoom ? "var(--text-body)" : `rgba(255,255,255,${o.zero ? 0.78 : 0.9})`;
  const borderColor = isZoom ? accent : `rgba(27,42,69,${sel ? 0.4 : 0.24})`;
  const footerBg = isZoom ? "#fff" : accent;
  const footerFg = isZoom ? accentText : "#fff";
  const icon = isZoom ? MG.zoom(footerFg) : MG.compass(footerFg);
  const actionLabel = isZoom ? "Zoom in" : "Explore";
  const kindClass = (isZoom ? "mk-zoom" : "mk-explore") + (schools ? " mk-schools" : "");
  return `<div class="nd-nav ${kindClass}${o.hov ? " nd-nav-on" : ""}${sel ? " nd-nav-sel" : ""}" data-design-component="regional-cluster-marker" data-action-kind="${actionKind}" tabindex="0" role="button" aria-label="${o.ariaLabel}" style="position:relative;width:${w}px;margin-left:-${w / 2}px;transform:translateY(-50%);font-family:var(--font-sans);text-align:center;outline:none;">
    <div class="rc-shell" style="border-radius:var(--radius-lg);overflow:hidden;box-shadow:var(--shadow-lg);border:1.5px solid ${borderColor};transition:transform .18s cubic-bezier(.4,0,.2,1),box-shadow .18s;${sel ? `outline:2px solid ${isZoom ? accent : "var(--navy-800)"};outline-offset:2px;` : ""}">
      <div style="padding:9px 14px 9px;background:${bodyBg};color:${bodyFg};display:flex;flex-direction:column;align-items:center;gap:2px;">
        <span style="font-size:12.5px;font-weight:700;letter-spacing:-0.01em;line-height:1.25;text-wrap:balance;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;max-width:${w - 28}px;">${o.names}</span>
        ${o.zero ? "" : `<span style="display:flex;align-items:baseline;gap:5px;margin-top:2px;">
          <span style="font-family:var(--font-mono);font-size:${cf}px;font-weight:800;line-height:1;letter-spacing:-0.02em;">${o.n.toLocaleString("en-IN")}</span>
          <span style="font-size:9.5px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:${mutedFg};">${o.noun}</span>
        </span>`}
        ${o.pillText ? `<span style="margin-top:${o.zero ? 4 : 3}px;padding:1px 9px;border-radius:var(--radius-full);background:${pillBg};font-size:10px;font-weight:600;color:${pillFg};white-space:nowrap;">${o.pillText}</span>` : ""}
      </div>
      <div class="rc-footer" style="background:${footerBg};padding:7px 10px;display:flex;align-items:center;justify-content:center;gap:5px;transition:background .15s ease,filter .15s ease;">
        ${icon}
        <span style="font-size:11.5px;font-weight:700;color:${footerFg};">${actionLabel}</span>
        <span style="font-size:13px;font-weight:700;color:${footerFg};line-height:1;">&#8250;</span>
      </div>
    </div>
    <div class="rc-tail" style="width:0;height:0;border-left:6px solid transparent;border-right:6px solid transparent;border-top:7px solid ${accent};margin:0 auto;"></div>
  </div>`;
}
// Real hierarchy destination (Direction / Local Destination) — "Explore". Clicking updates
// node=, breadcrumb, and pans/fits the destination's children.
function destCardHTML(o) {
  const w = Math.round(132 + Math.min(1, o.n / 240) * 38);
  const cf = Math.round(22 + Math.min(1, o.n / 240) * 9);
  const nounPlural = o.noun || "listings";
  const noun = o.n === 1 ? nounPlural.replace(/s$/, "") : nounPlural;
  const label = o.ariaLabel || (o.names + ". " + o.n + " " + noun.toLowerCase() + (o.areasLine ? ". " + o.areasLine : "") + ". Activate to explore.");
  return navMarkerHTML("explore", { ...o, noun, w, cf, pillText: o.areasLine, ariaLabel: label });
}
// Visual AREA cluster (dense markers grouped only for legibility) — "Zoom in". Same shell
// as the local-destination cluster below; activating only pans/zooms until members separate.
function clusterChipHTML(o) {
  const w = Math.min(206, Math.max(150, Math.round(132 + Math.min(1, o.n / 240) * 38)));
  const cf = Math.round(20 + Math.min(1, o.n / 240) * 8);
  const schools = o.tone === "schools";
  const exact = o.members;
  const areasLine = exact + (exact === 1 ? " area with " : " areas with ") + (schools ? "schools" : "matches");
  const nounPlural = schools ? "schools" : (o.noun || "listings");
  const noun = o.n === 1 ? nounPlural.replace(/s$/, "") : nounPlural;
  return navMarkerHTML("zoom", { names: o.names, n: o.n, noun, hov: o.hov, domain: schools ? "schools" : "homes", w, cf, pillText: areasLine, ariaLabel: "Zoom into the " + o.names + " areas" });
}
// Local destination — 2+ nearby destinations temporarily grouped because every marker
// can't fit. Same connected shell as clusterChipHTML, at the local-destination scale.
// "Zoom in" only pans/zooms until members separate; it never changes node/breadcrumb.
function regionalClusterCardHTML(o) {
  const w = Math.min(206, Math.max(150, Math.round(132 + Math.min(1, o.n / 240) * 38)));
  const cf = Math.round(20 + Math.min(1, o.n / 240) * 8);
  const nounPlural = o.noun || "listings";
  const noun = o.n === 1 ? nounPlural.replace(/s$/, "") : nounPlural;
  const areasLine = (o.exact || 0) + ((o.exact || 0) === 1 ? " area with matches" : " areas with matches");
  const label = o.ariaLabel || ("Zoom into the " + o.names + " areas");
  return navMarkerHTML("zoom", { ...o, noun, w, cf, pillText: areasLine, ariaLabel: label });
}
// Terminal AREA-leaf marker — "View homes" / "View schools". Represents ONE real area;
// activating it selects the area and opens its listings/schools directly — never a further
// zoom. Deliberately the INVERSE construction of "Explore": a light/white identity half
// (this is a leaf, not a hub) flush against a SOLID dark action footer in white text — the
// footer, not the body, now carries the strong colour, since the footer is the one and only
// thing this marker does. domain "schools" swaps navy → plum throughout (icon, border,
// footer, tail) per VISUAL_RULES §Areas vs Schools palette mapping; body stays white in both.
// Terminal AREA-leaf marker — "View homes" / "View schools". Represents ONE real area;
// activating it selects the area and opens its listings/schools directly — never a further
// zoom. Same VERTICAL connected-card family as Explore/Zoom (identity section stacked above
// an attached full-width footer, no gap, one shared shell/shadow/border, centred downward
// tail) — never the rejected horizontal split-capsule. White identity (this is a leaf, not a
// hub) + a SOLID dark action footer in white text: the footer, not the body, carries the
// strong colour, since the footer is the one and only thing this marker does. The listing/
// school COUNT lives in the identity section as the hero metric — never folded into the
// footer's action label. domain "schools" swaps navy → plum throughout (icon, border,
// footer, tail) per VISUAL_RULES §Areas vs Schools palette mapping; body stays white in both.
function areaPinHTML(o) {
  const sel = o.sel, cand = o.candidate;
  // draft candidate: a subtle dashed LABEL — must never read as a committed search area
  if (cand) {
    return `<div data-design-component="area-candidate-label" style="position:relative;width:210px;margin-left:-105px;transform:translateY(-100%);text-align:center;font-family:var(--font-sans);">
      <span style="display:inline-flex;align-items:center;gap:6px;padding:4px 9px;border-radius:var(--radius-full);background:rgba(255,255,255,0.88);color:var(--text-body);border:1px dashed var(--border-strong);box-shadow:var(--shadow-xs);white-space:nowrap;font-size:11.5px;font-weight:600;">
        ${MG.pin("var(--grey-500)")}${o.name}<span style="font-family:var(--font-mono);font-size:10.5px;color:var(--text-muted);">${o.n}</span>
      </span>
    </div>`;
  }
  const schools = !!o.schoolsMode;
  const primary = schools ? "var(--plum-600)" : "var(--navy-800)";
  const borderRGB = schools ? "94,82,134" : "27,42,69";
  const identityIcon = schools ? MG.cap(primary) : MG.pin(primary);
  const footerIcon = schools ? MG.cap("#fff") : MG.home("#fff");
  const heroNoun = schools ? (o.n === 1 ? "SCHOOL" : "SCHOOLS") : (o.n === 1 ? "LISTING" : "LISTINGS");
  // secondary metric: listings count on the schools variant, schools count on the homes
  // variant — shown only when the server actually supplied it (undefined ⇒ omit the line,
  // 0 ⇒ show "0 schools"/"0 listings" per spec).
  const secondary = schools ? o.listings : o.schools;
  const secondaryNoun = schools ? (secondary === 1 ? "listing" : "listings") : (secondary === 1 ? "school" : "schools");
  const w = 172;
  const label = o.ariaLabel || `View ${o.n} ${heroNoun.toLowerCase()} in ${o.name}` + (secondary != null ? `, ${secondary} ${secondaryNoun}` : "");
  const kindClass = schools ? "am-leaf-school" : "am-leaf-home";
  return `<div class="nd-nav am-leaf ${kindClass}${o.hov ? " nd-nav-on" : ""}" data-design-component="area-marker" data-action-kind="view-homes" tabindex="0" role="button" aria-label="${label}" style="position:relative;width:${w}px;margin-left:-${w / 2}px;transform:translateY(-100%);font-family:var(--font-sans);text-align:center;outline:none;">
    <div class="am-shell" style="border-radius:var(--radius-lg);overflow:hidden;box-shadow:${sel ? "var(--shadow-lg)" : "var(--shadow-md)"};border:1.5px solid rgba(${borderRGB},${sel ? 0.5 : 0.28});background:#fff;transition:transform .18s cubic-bezier(.4,0,.2,1),box-shadow .18s ease;${sel ? `outline:2px solid ${primary};outline-offset:2px;` : ""}">
      <div style="padding:10px 13px 9px;display:flex;flex-direction:column;align-items:flex-start;text-align:left;background:#fff;color:var(--navy-800);">
        <span style="display:flex;align-items:center;gap:6px;max-width:100%;">
          ${identityIcon}
          <span style="font-size:13.5px;font-weight:800;letter-spacing:-0.01em;line-height:1.2;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;">${o.name}</span>
        </span>
        <span style="display:flex;align-items:baseline;gap:5px;margin-top:6px;font-family:var(--font-mono);">
          <b style="font-size:22px;font-weight:800;letter-spacing:-0.02em;line-height:1;">${o.n}</b>
          <span style="font-size:9.5px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:var(--text-muted);">${heroNoun}</span>
        </span>
        ${secondary != null ? `<span style="margin-top:3px;font-size:11px;font-weight:600;color:var(--text-muted);">${secondary} ${secondaryNoun}</span>` : ""}
      </div>
      <div class="am-action" style="background:${primary};padding:9px 13px;display:flex;align-items:center;justify-content:center;gap:6px;transition:filter .15s ease;">
        ${footerIcon}
        <span style="font-size:12.5px;font-weight:700;color:#fff;">View ${schools ? "schools" : "homes"}</span>
        <span style="font-size:14px;font-weight:700;line-height:1;color:#fff;">&#8250;</span>
      </div>
    </div>
    <div class="am-tail" style="width:0;height:0;border-left:6px solid transparent;border-right:6px solid transparent;border-top:7px solid ${primary};margin:0 auto;"></div>
  </div>`;
}
// Commercial identity on the map: the SAME leaf pin, carrying the subtype label
// instead of a price — nothing price-gated ever reaches the map layer. Footprint,
// tail, selected treatment, clustering and camera behaviour are unchanged.
function pricePinHTML(l, on, f) {
  if (l.kind === "commercial") {
    const gold = "#8A6A22";
    return `<div style="transform:translate(-50%,-100%);font-family:var(--font-sans);text-align:center;">
      <span style="display:inline-flex;align-items:center;gap:5px;padding:5px 10px;border-radius:var(--radius-full);background:${on ? gold : "var(--paper)"};color:${on ? "#fff" : "var(--navy-800)"};border:1px solid ${on ? gold : "rgba(138,106,34,0.32)"};box-shadow:${on ? "var(--shadow-lg)" : "var(--shadow-sm)"};font-size:11.5px;font-weight:700;white-space:nowrap;">
        <span style="width:7px;height:7px;border-radius:50%;background:${on ? "#fff" : gold};flex:none;"></span>${EM.comLabel(l.comSub)}</span>
    </div>`;
  }
  return `<div style="transform:translate(-50%,-100%);font-family:var(--font-sans);">
    <span style="display:inline-block;padding:5px 10px;border-radius:var(--radius-full);background:${on ? "var(--accent)" : "var(--paper)"};color:${on ? "#fff" : "var(--navy-800)"};border:${on ? "none" : "1px solid var(--border)"};box-shadow:${on ? "var(--shadow-lg)" : "var(--shadow-sm)"};font-family:var(--font-mono);font-size:11.5px;font-weight:700;white-space:nowrap;">${EM.priceText(l, f)}</span>
  </div>`;
}
function discHTML(n) {
  const size = Math.round(40 + Math.min(n, 30) * 0.9);
  return `<div style="transform:translate(-50%,-50%);font-family:var(--font-sans);">
    <span style="display:grid;place-items:center;width:${size}px;height:${size}px;border-radius:var(--radius-full);background:var(--navy-800);color:#fff;border:2.5px solid rgba(255,255,255,0.9);box-shadow:var(--shadow-lg);font-family:var(--font-mono);font-size:${size > 52 ? 15 : 13}px;font-weight:700;">${n}</span>
  </div>`;
}
// Listing cluster bubble + proximity clustering — same treatment as the approved V2 map:
// crowded price pins collapse into a navy disc that zooms in when tapped.
function clusterBubbleHTML(count, tone) {
  const size = Math.round(42 + Math.min(count, 24) * 0.8);
  const bg = tone === "agri" ? "var(--evergreen-600)" : "var(--navy-800)";
  const cap = tone === "agri" ? "parcels" : tone === "commercial" ? "listings" : tone === "plot" ? "plots" : "homes";
  return `<div class="nd-cluster" data-design-component="listing-cluster" style="transform:translate(-50%,-50%);font-family:var(--font-sans);text-align:center;cursor:pointer;">
    <div class="nd-cluster-disc" style="width:${size}px;height:${size}px;border-radius:var(--radius-full);background:${bg};color:#fff;box-shadow:var(--shadow-lg);border:3px solid rgba(255,255,255,0.9);display:flex;flex-direction:column;align-items:center;justify-content:center;line-height:1;margin:0 auto;transition:transform .18s cubic-bezier(.4,0,.2,1);">
      <span style="font-family:var(--font-mono);font-size:17px;font-weight:700;">${count}</span>
      <span style="font-size:8px;font-weight:700;letter-spacing:.05em;opacity:.82;text-transform:uppercase;">${cap}</span>
    </div></div>`;
}
function clusterLeaves(items, map, px) {
  // latLngToContainerPoint throws "Invalid LatLng object" on a non-finite pair, from
  // inside a commit effect, which React answers by discarding the whole tree. Every
  // item is screened here so no caller has to remember to.
  const pts = (items || []).filter(EXP_OK).map((it) => ({ it, p: map.latLngToContainerPoint([it.lat, it.lon]) }));
  const used = new Array(pts.length).fill(false), out = [];
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
function schoolPinHTML(o, sel, hov) {
  const active = sel || hov;
  const bg = sel ? "var(--plum-600)" : "var(--paper)";
  const fg = sel ? "#fff" : "var(--text-strong)";
  return `<div class="nd-nav${hov ? " nd-nav-on" : ""}" data-design-component="school-marker" style="position:relative;width:220px;margin-left:-110px;transform:translateY(-100%);text-align:center;font-family:var(--font-sans);">
    <div class="nd-navcore" style="display:inline-flex;align-items:center;gap:7px;padding:5px 10px;border-radius:var(--radius-full);background:${bg};color:${fg};box-shadow:${active ? "var(--shadow-lg)" : "var(--shadow-sm)"};border:1px solid ${sel ? "var(--plum-600)" : "var(--plum-100)"};white-space:nowrap;max-width:210px;transform:scale(${active ? 1.05 : 1});transition:all .16s cubic-bezier(.4,0,.2,1);">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="${sel ? "#fff" : "var(--plum-600)"}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="flex:none;"><path d="m22 10-10-5L2 10l10 5 10-5z"/><path d="M6 12v5c0 1.7 2.7 3 6 3s6-1.3 6-3v-5"/></svg>
      <span style="font-size:11.5px;font-weight:700;overflow:hidden;text-overflow:ellipsis;">${o.name}</span>
    </div>
    <div style="width:8px;height:8px;background:${bg};border-right:1px solid ${sel ? "var(--plum-600)" : "var(--plum-100)"};border-bottom:1px solid ${sel ? "var(--plum-600)" : "var(--plum-100)"};transform:rotate(45deg);margin:-5px auto 0;"></div>
  </div>`;
}
// ---- agricultural layers (the separate agri model: evergreen throughout) ----
function agriCardHTML(o) {
  const w = 186;
  return `<div class="nd-nav${o.hov ? " nd-nav-on" : ""}" data-design-component="corridor-marker" style="position:relative;width:${w}px;margin-left:-${w / 2}px;transform:translateY(-50%);font-family:var(--font-sans);text-align:center;">
    <div class="nd-navcore" style="display:flex;flex-direction:column;align-items:center;gap:2px;padding:9px 13px 10px;border-radius:var(--radius-lg);background:#1F7A5C;color:#fff;box-shadow:var(--shadow-lg);border:1.5px solid rgba(255,255,255,${o.hov ? 0.9 : 0.42});transition:transform .18s cubic-bezier(.4,0,.2,1),box-shadow .18s,border-color .18s;">
      <span style="font-size:12.5px;font-weight:700;letter-spacing:-0.01em;line-height:1.2;">${o.label}</span>
      <span style="display:flex;align-items:baseline;gap:5px;">
        <span style="font-family:var(--font-mono);font-size:24px;font-weight:800;line-height:1;letter-spacing:-0.02em;">${o.n}</span>
        <span style="font-size:9.5px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:rgba(255,255,255,.75);">parcels</span>
      </span>
      <span style="font-family:var(--font-mono);font-size:10px;color:rgba(255,255,255,.8);">${o.range}</span>
    </div>
    <div class="nd-cap" style="margin-top:5px;display:inline-flex;padding:3px 10px;border-radius:var(--radius-full);background:var(--paper);box-shadow:var(--shadow-md);font-size:10px;font-weight:700;color:var(--evergreen-700,#1F694A);white-space:nowrap;">Explore &#8250;</div>
  </div>`;
}
function townDiscHTML(o) {
  return `<div class="nd-nav" data-design-component="town-marker" style="transform:translate(-50%,-100%);font-family:var(--font-sans);text-align:center;">
    <div class="nd-navcore" style="width:46px;height:46px;border-radius:var(--radius-full);background:var(--evergreen-600);border:3px solid rgba(255,255,255,0.92);box-shadow:var(--shadow-lg);display:grid;place-items:center;margin:0 auto;transition:transform .18s cubic-bezier(.4,0,.2,1);">
      <span style="font-family:var(--font-mono);font-size:16px;font-weight:800;color:#fff;">${o.n}</span>
    </div>
    <div style="margin-top:4px;display:inline-block;padding:3px 9px;border-radius:var(--radius-full);background:#fff;box-shadow:var(--shadow-sm);font-size:11px;font-weight:700;color:var(--text-strong);white-space:nowrap;">${o.name}</div>
  </div>`;
}
function parcelPinHTML(p, on) {
  return `<div style="transform:translate(-50%,-100%);font-family:var(--font-sans);">
    <span style="display:inline-block;padding:5px 10px;border-radius:var(--radius-full);background:${on ? "var(--evergreen-600)" : "var(--paper)"};color:${on ? "#fff" : "var(--evergreen-700,#1F694A)"};border:${on ? "none" : "1px solid var(--evergreen-100,#CFE6D9)"};box-shadow:${on ? "var(--shadow-lg)" : "var(--shadow-sm)"};font-family:var(--font-mono);font-size:11.5px;font-weight:700;white-space:nowrap;">${p.acres} ac · ${EM.inrShort(p.price)}</span>
  </div>`;
}
function originPinHTML(name) {
  return `<div style="transform:translate(-50%,-50%);font-family:var(--font-sans);text-align:center;">
    <span style="display:inline-flex;align-items:center;gap:6px;padding:5px 10px;border-radius:var(--radius-full);background:var(--navy-900);color:#fff;box-shadow:var(--shadow-md);font-size:11px;font-weight:700;white-space:nowrap;">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3"/></svg>Origin · ${name}
    </span>
  </div>`;
}
const CLUSTER_PX = 46;

// ---- Map info dock --------------------------------------------------------------
// ONE floating card owns every informational message over the map, top → bottom:
//   1. guidance  (anonymous + not yet in a result scope only)
//   2. count     "Showing N verified properties across <context>"
//   3. recenter  "Recenter on <context>" — exactly one, always the CURRENT node
// Desktop: pinned bottom-left of the map. Mobile: first block inside the bottom sheet.
// The dock adapts to the map — it never moves markers or changes the camera fit.
// Node names are never truncated away: labels wrap to at most 2 lines.
const dockPin = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="2.2" stroke-linecap="round"><path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/></svg>';
const dockAim = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></svg>';
function ExpMapInfoDock({ view, signedIn, onSignIn, compact, embedded }) {
  if (!view || view.journey !== "areas" || !view.info) return null;
  const i = view.info, guide = !signedIn && !view.listingCapable;
  const n = (i.total || 0).toLocaleString("en-IN");
  const recenter = () => window.dispatchEvent(new CustomEvent("exp:recenter"));
  const signIn = <button onClick={onSignIn} style={{ border: "none", background: "transparent", padding: 0, cursor: "pointer", fontFamily: "var(--font-sans)", fontSize: "inherit", fontWeight: 700, color: "var(--accent)", textDecoration: "underline", textUnderlineOffset: "2px" }}>sign in</button>;
  const aimBtn = (extra) => (
    <button className="exp-recenter" onClick={recenter} title={"Recenter on " + i.where} aria-label={"Recenter on " + i.where} data-design-component="map-recenter" style={{ display: "flex", alignItems: "center", gap: "7px", minWidth: 0, border: "none", cursor: "pointer", fontFamily: "var(--font-sans)", fontSize: "12.5px", fontWeight: 700, color: "var(--accent)", ...extra }}>
      <span style={{ flex: "none", display: "flex" }} dangerouslySetInnerHTML={{ __html: dockAim }} />
      <span style={{ minWidth: 0, overflow: "hidden", display: "-webkit-box", WebkitBoxOrient: "vertical", WebkitLineClamp: 2, lineHeight: 1.3, textAlign: "left", overflowWrap: "anywhere" }}>Recenter on {i.where}</span>
    </button>
  );
  return (
    <div data-design-component="map-info-dock" role="status" style={embedded ? { fontFamily: "var(--font-sans)", display: "flex", flexDirection: "column", gap: "4px" } : { background: "var(--paper)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", boxShadow: "var(--shadow-md)", overflow: "hidden", fontFamily: "var(--font-sans)" }}>
      {guide && embedded && (
        <div data-design-component="map-guidance" style={{ fontSize: "12px", lineHeight: 1.35, color: "var(--text-body)", textWrap: "pretty" }}>Select an area — or {signIn} for the full map</div>
      )}
      {guide && !embedded && (
        <div data-design-component="map-guidance" style={{ padding: compact ? "8px 12px" : "9px 12px", background: "var(--surface-subtle)", borderBottom: "1px solid var(--border)", fontSize: "12px", lineHeight: 1.4, color: "var(--text-body)", textWrap: "pretty" }}>
          {compact ? <>Select an area to see properties — or {signIn} for the full map</> : <>Select an area to see properties — or {signIn} to explore the full map</>}
        </div>
      )}
      {compact ? (
        <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: embedded ? 0 : "6px 6px 6px 12px" }}>
          <div data-design-component="map-count" style={{ flex: 1, minWidth: 0, lineHeight: 1.3 }}>
            <div style={{ fontSize: "12.5px", color: "var(--text-body)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}><strong style={{ fontFamily: "var(--font-mono)", color: "var(--text-strong)" }}>{n}</strong> verified properties</div>
            <div style={{ fontSize: "11.5px", color: "var(--text-muted)", overflow: "hidden", display: "-webkit-box", WebkitBoxOrient: "vertical", WebkitLineClamp: 2, overflowWrap: "anywhere" }}>across {i.where}</div>
          </div>
          {aimBtn({ flex: "0 1 auto", maxWidth: "56%", minHeight: "44px", padding: "6px 12px", borderRadius: "var(--radius-md)", background: "var(--surface-subtle)", boxShadow: "inset 0 0 0 1px var(--border-strong)" })}
        </div>
      ) : (
        <>
          <div data-design-component="map-count" style={{ display: "flex", gap: "8px", alignItems: "flex-start", padding: "10px 12px", fontSize: "12.5px", lineHeight: 1.4, color: "var(--text-body)" }}>
            <span style={{ flex: "none", display: "flex", marginTop: "1px" }} dangerouslySetInnerHTML={{ __html: dockPin }} />
            <span style={{ minWidth: 0 }}>Showing <strong style={{ fontFamily: "var(--font-mono)", color: "var(--text-strong)" }}>{n}</strong> verified properties across <strong style={{ color: "var(--text-strong)" }}>{i.where}</strong></span>
          </div>
          {aimBtn({ width: "100%", minHeight: "40px", padding: "8px 12px", background: "transparent", borderTop: "1px solid var(--border)", textAlign: "left" })}
        </>
      )}
    </div>
  );
}

function ExpMap({ signedIn, onSignIn, lead, view, isMobile, onPick, onCluster, onArea, onOpenListing, hover, onHover, onCameraMove, onSearchThisArea, dirty, phase, onCrumb, showAllAreas, onFitAll, onSchool, onSchoolHover, schoolHover, onAgriNav, onAgriTown, onParcel, agriActive }) {
  const elRef = React.useRef(null), mapRef = React.useRef(null);
  const navG = React.useRef(null), leafG = React.useRef(null), shapeG = React.useRef(null);
  const progRef = React.useRef(false), fitRef = React.useRef(null);
  const [tick, setTick] = React.useState(0);
  const markersRef = React.useRef({});
  const viewRef = React.useRef(view); viewRef.current = view;
  // Original fit call, unchanged; shared by the committed-view fit and the dock's Recenter.
  const flyFit = (b, mz) => {
    progRef.current = true;
    mapRef.current.flyToBounds(b, { paddingTopLeft: [56, isMobile ? 108 : 82], paddingBottomRight: [40, isMobile ? 168 : 56], duration: 0.65, easeLinearity: 0.25, maxZoom: mz || 15 });
  };
  const cbRef = React.useRef({}); cbRef.current = { onPick, onCluster, onArea, onOpenListing, onHover, onSchool, onSchoolHover, onAgriNav, onAgriTown, onParcel, onCameraMove };

  React.useEffect(() => {
    const map = L.map(elRef.current, { zoomControl: false, attributionControl: true, preferCanvas: false });
    map.setView([EM.city.lat, EM.city.lon], 11);
    L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", { maxZoom: 19, subdomains: "abcd", attribution: '&copy; OpenStreetMap contributors &copy; CARTO' }).addTo(map);
    L.control.zoom({ position: isMobile ? "topright" : "bottomright" }).addTo(map);
    navG.current = L.layerGroup().addTo(map);
    leafG.current = L.layerGroup().addTo(map);
    shapeG.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    const settle = () => {
      setTick((t) => t + 1);
      if (progRef.current) { progRef.current = false; return; }
      const b = map.getBounds();
      const cm = cbRef.current.onCameraMove;
      cm && cm({ south: b.getSouth(), west: b.getWest(), north: b.getNorth(), east: b.getEast() });
    };
    map.on("moveend", settle);
    setTimeout(() => map.invalidateSize(), 120);
    return () => map.remove();
    // eslint-disable-next-line
  }, []);

  React.useEffect(() => { const m = mapRef.current; if (m) setTimeout(() => m.invalidateSize(), 160); }, [isMobile, view.presentation]);

  // camera — one fit per committed view/scope change
  React.useEffect(() => {
    const map = mapRef.current;
    if (!map || !view.fitBounds || fitRef.current === view.fitKey) return;
    // Leaflet's isValid() only rejects NaN, so ±Infinity bounds pass validation and
    // then throw "Invalid LatLng object: (NaN, NaN)" from inside this commit effect.
    // Producers are guarded at source; this refuses to move the camera rather than
    // take the whole shell down if a non-finite pair ever reaches it.
    const flat = [].concat.apply([], view.fitBounds);
    if (flat.length !== 4 || !flat.every(Number.isFinite)) {
      console.warn("ExpMap: ignoring non-finite fitBounds", view.fitBounds);
      return;
    }
    // The bounds are finite, but flyToBounds DIVIDES BY the container size when it
    // computes its target centre, so a 0×0 container (cold load, before this flex
    // chain has been laid out) makes Leaflet itself produce (NaN, NaN) and throw from
    // inside this commit effect. Input validation cannot reach that — the geometry is
    // the problem — so the guard is on the container. fitRef is deliberately left
    // unset so the next render retries this same fitKey once the size resolves.
    // (fitBounds is safe at 0×0; only the animated flyToBounds is not.)
    let sz = map.getSize();
    if (!sz.x || !sz.y) {
      map.invalidateSize();
      sz = map.getSize();
    }
    if (!sz.x || !sz.y) {
      fitRef.current = null;
      setTimeout(() => { const m = mapRef.current; if (m) { m.invalidateSize(); setTick((t) => t + 1); } }, 120);
      return;
    }
    fitRef.current = view.fitKey;
    flyFit(view.fitBounds, view.maxZoom);
    // eslint-disable-next-line
  }, [view.fitKey, tick]);

  // Info dock → "Recenter on <context>": re-fly to the CURRENT node's fit. One listener,
  // one target; the dock never knows about the camera.
  React.useEffect(() => {
    const h = () => { const v = viewRef.current; const f = v && v.fitBounds ? [].concat.apply([], v.fitBounds) : []; if (mapRef.current && f.length === 4 && f.every(Number.isFinite)) flyFit(v.fitBounds, v.maxZoom); };
    window.addEventListener("exp:recenter", h);
    return () => window.removeEventListener("exp:recenter", h);
    // eslint-disable-next-line
  }, []);

  // markers — rebuilt only when the marker SET changes (hover is a class toggle below,
  // so the element under the cursor is never replaced mid-click)
  const sig = [view.paintKey, (view.destinations || []).map((d) => d.key + d.n).join(","), (view.mapClusters || []).map((c) => c.key + c.n).join(","),
    (view.areaMarkers || []).map((a) => a.key + a.n + (a.selected ? "!" : "")).join(","), (view.pins || []).map((p) => p.id).join(",") + "|z",
    (view.discs || []).map((d) => d.key + d.n).join(","), (view.schoolPins || []).map((s) => s.id).join(","),
    (view.navCards || []).map((c) => c.key + c.n).join(","), (view.townDiscs || []).map((t) => t.key + t.n).join(","),
    (view.parcelPins || []).map((p) => p.id).join(","), agriActive || "", view.originMarker ? view.originMarker.name : "", tick].join("|");
  React.useEffect(() => {
    const map = mapRef.current, g = navG.current, lg = leafG.current;
    if (!map) return;
    const v = viewRef.current, cb = cbRef.current;
    g.clearLayers(); lg.clearLayers();
    markersRef.current = {};
    // Sanitises a single pair; falls back to the map centre so a marker is still
    // placed (visibly wrong beats a dead shell) rather than throwing.
    const safeLL = (lat, lon) => (Number.isFinite(lat) && Number.isFinite(lon) ? L.latLng(lat, lon) : map.getCenter());
    // Average of a cluster group — a reduce over an empty group yields NaN.
    const groupLL = (grp) => {
      const ok = (grp || []).filter((x) => EXP_OK(x.it));
      if (!ok.length) return map.getCenter();
      return L.latLng(ok.reduce((a, x) => a + x.it.lat, 0) / ok.length, ok.reduce((a, x) => a + x.it.lon, 0) / ok.length);
    };
    const safeBounds = (pairsIn) => {
      const good = (pairsIn || []).filter((p) => Number.isFinite(p[0]) && Number.isFinite(p[1]));
      return good.length ? L.latLngBounds(good) : map.getBounds();
    };
    const icon = (html, cls) => L.divIcon({ html, className: "upt-pin " + (cls || ""), iconSize: [0, 0] });
    const wire = (mk, key) => { markersRef.current[key] = mk; mk.on("mouseover", () => cb.onHover(key)); mk.on("mouseout", () => cb.onHover(null)); };
    // keyboard activation — the focusable card inside the divIcon has tabindex=0;
    // Enter/Space bubbles up to this listener on the marker's root element
    const wireKeyboard = (mk, fn) => { const el = mk.getElement(); if (el) el.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fn(); } }); };
    // Compass layout: at navigation levels the destination cards sit by BEARING around
    // the map centre (an orientation canvas), exactly as in the approved V2 map.
    const size = map.getSize();
    const SLOT = { N: [0.5, 0.17], E: [0.83, 0.46], S: [0.5, 0.81], W: [0.17, 0.46], C: [0.5, 0.5] };
    // Every coordinate handed to Leaflet passes through here. A non-finite value
    // (a letter bearing reaching the numeric branch, an unresolved container size,
    // an empty bounds list) makes Leaflet throw from inside a commit effect, which
    // React answers by discarding the whole tree — a blank artifact. So the synthesis
    // is fenced: anything not finite falls back to the map centre.
    const compassAt = (d, i, total) => {
      let fx, fy;
      if (d.slot && SLOT[d.slot]) { fx = SLOT[d.slot][0]; fy = SLOT[d.slot][1]; }
      else {
        const raw = d.bearing != null && Number.isFinite(+d.bearing) ? +d.bearing : (360 / (total || 1)) * i;
        const b = (raw * Math.PI) / 180;
        fx = 0.5 + Math.sin(b) * 0.3;
        fy = 0.5 - Math.cos(b) * 0.31;
      }
      const px = fx * size.x, py = fy * size.y;
      if (!Number.isFinite(px) || !Number.isFinite(py)) return map.getCenter();
      const ll = map.containerPointToLatLng([px, py]);
      return ll && Number.isFinite(ll.lat) && Number.isFinite(ll.lng) ? ll : map.getCenter();
    };
    // dense-map collision handling: nodes without a fixed compass slot (regional
    // clusters, e.g. Hebbal · Yelahanka / Devanahalli · Airport / Hennur · Thanisandra)
    // sit by real bearing and can land close together — enforce a minimum angular gap
    // so cards never overlap; direction cards (fixed N/E/S/W/C slots) are untouched.
    const noSlot = (v.destinations || []).filter((d) => !d.slot);
    if (noSlot.length > 1) {
      const MIN_GAP = 30;
      const order = noSlot.map((d) => ({ d, b: ((Number.isFinite(+d.bearing) ? +d.bearing : 0) % 360 + 360) % 360 })).sort((a, b) => a.b - b.b);
      for (let k = 1; k < order.length; k++) { const gap = order[k].b - order[k - 1].b; if (gap < MIN_GAP) order[k].b = order[k - 1].b + MIN_GAP; }
      const wrap = order[0].b + 360 - order[order.length - 1].b;
      if (wrap < MIN_GAP) order[order.length - 1].b -= (MIN_GAP - wrap);
      order.forEach((o) => (o.d.__bearing = o.b));
    }
    (v.destinations || []).forEach((d, i) => {
      const ll = v.compass ? compassAt({ ...d, bearing: d.__bearing != null ? d.__bearing : d.bearing }, i, v.destinations.length) : safeLL(d.center && d.center.lat, d.center && d.center.lon);
      const schoolsJ = v.journey === "schools";
      if (d.kind === "local") {
        const mk = L.marker(ll, { icon: icon(regionalClusterCardHTML({ names: d.names.join(" · "), n: d.n, noun: schoolsJ ? "schools" : (v.noun || "listings"), domain: schoolsJ ? "schools" : "homes", exact: d.matchAreas || 0, sel: !!d.sel })), zIndexOffset: d.sel ? 260 : 200, riseOnHover: true });
        mk.on("click", () => cb.onPick(d));
        wire(mk, d.key);
        mk.addTo(g);
        wireKeyboard(mk, () => cb.onPick(d));
        return;
      }
      const areaWord = (d.matchAreas || 0) === 1 ? " area with " : " areas with ";
      const areasLine = d.n === 0 ? "No matches with current filters" : (d.matchAreas || 0) + areaWord + (schoolsJ ? "schools" : "matches");
      const mk = L.marker(ll, { icon: icon(destCardHTML({ names: d.names.join(" · "), n: d.n, noun: schoolsJ ? "schools" : (v.noun || "listings"), domain: schoolsJ ? "schools" : "homes", areasLine, zero: d.n === 0, sel: !!d.sel })), zIndexOffset: d.sel ? 260 : 200, riseOnHover: true });
      mk.on("click", () => cb.onPick(d));
      wire(mk, d.key);
      mk.addTo(g);
      wireKeyboard(mk, () => cb.onPick(d));
    });
    EXP_CENTRED(v.mapClusters).forEach((c) => {
      const mk = L.marker(safeLL(c.center.lat, c.center.lon), { icon: icon(clusterChipHTML({ names: c.names.join(" · "), more: c.more, members: c.members.length, n: v.journey === "schools" ? (c.listings || 0) : c.n, schools: c.schools, noun: v.noun || "listings", tone: v.journey === "schools" ? "schools" : null })), zIndexOffset: 300, riseOnHover: true });
      mk.on("click", () => cb.onCluster(c));
      wire(mk, c.key);
      mk.addTo(g);
      wireKeyboard(mk, () => cb.onCluster(c));
    });
    EXP_CENTRED(v.areaMarkers).forEach((a) => {
      const mk = L.marker(safeLL(a.center.lat, a.center.lon), { icon: icon(areaPinHTML({ name: a.label, n: a.n, listings: a.listings, schools: a.schools, schoolsMode: v.journey === "schools" && !a.candidate, sel: a.selected, candidate: a.candidate })), zIndexOffset: a.selected ? 900 : a.candidate ? 300 : 400, riseOnHover: !a.candidate });
      if (!a.candidate) mk.on("click", () => cb.onArea(a.key));
      if (!a.candidate) wire(mk, a.key);
      mk.addTo(g);
      if (!a.candidate) wireKeyboard(mk, () => cb.onArea(a.key));
    });
    EXP_CENTRED(v.discs).forEach((d) => {
      const mk = L.marker(safeLL(d.center.lat, d.center.lon), { icon: icon(discHTML(d.n)), zIndexOffset: 250 });
      mk.on("click", () => (d.areaKey ? cb.onArea(d.areaKey) : null));
      mk.addTo(g);
    });
    EXP_PTS(v.schoolPins).forEach((s) => {
      const interactive = !!cb.onSchool;
      const mk = L.marker(safeLL(s.lat, s.lon), { icon: icon(schoolPinHTML(s, !!(v.school && v.school.id === s.id), schoolHover === s.id)), zIndexOffset: schoolHover === s.id ? 900 : 500, interactive });
      if (interactive) { mk.on("click", () => cb.onSchool(s.id)); mk.on("mouseover", () => cb.onSchoolHover(s.id)); mk.on("mouseout", () => cb.onSchoolHover(null)); markersRef.current["sch-" + s.id] = mk; }
      mk.addTo(g);
    });
    // agri: outbound-direction cards, town discs, parcel pins, origin marker
    EXP_CENTRED(v.navCards).forEach((c) => {
      const mk = L.marker(safeLL(c.center.lat, c.center.lon), { icon: icon(agriCardHTML({ label: c.label, n: c.n, range: c.range })), zIndexOffset: 200 });
      mk.on("click", () => cb.onAgriNav && cb.onAgriNav(c.key));
      wire(mk, c.key);
      mk.addTo(g);
    });
    EXP_CENTRED(v.townDiscs).forEach((t) => {
      const mk = L.marker(safeLL(t.center.lat, t.center.lon), { icon: icon(townDiscHTML({ name: t.name, n: t.n })), zIndexOffset: 300 });
      mk.on("click", () => cb.onAgriTown && cb.onAgriTown(t.key));
      wire(mk, t.key);
      mk.addTo(g);
    });
    if (EXP_OK(v.originMarker)) L.marker(safeLL(v.originMarker.lat, v.originMarker.lon), { icon: icon(originPinHTML(v.originMarker.name)), zIndexOffset: 150, interactive: false }).addTo(g);
    EXP_PTS(v.parcelPins).length && clusterLeaves(v.parcelPins, map, CLUSTER_PX).forEach((grp) => {
      if (grp.length === 1) {
        const p = grp[0].it;
        const mk = L.marker(safeLL(p.lat, p.lon), { icon: icon(parcelPinHTML(p, p.id === agriActive)), zIndexOffset: p.id === agriActive ? 900 : 100 });
        mk.on("click", () => cb.onParcel && cb.onParcel(p.id));
        mk.addTo(lg);
        return;
      }
      const mk = L.marker(groupLL(grp), { icon: icon(clusterBubbleHTML(grp.length, "agri")), zIndexOffset: 60 });
      mk.on("click", () => {
        progRef.current = true;
        map.flyToBounds(safeBounds(grp.map((x) => [x.it.lat, x.it.lon])).pad(0.25), { duration: 0.55, maxZoom: 16 });
      });
      mk.addTo(lg);
    });
    EXP_PTS(v.pins).length && clusterLeaves(v.pins, map, CLUSTER_PX).forEach((grp) => {
      if (grp.length === 1) {
        const l = grp[0].it;
        const mk = L.marker(safeLL(l.lat, l.lon), { icon: icon(pricePinHTML(l, false, v.filters)), zIndexOffset: 100 });
        mk.on("click", () => cb.onOpenListing(l.id));
        wire(mk, l.id);
        mk.addTo(lg);
        return;
      }
      const mk = L.marker(groupLL(grp), { icon: icon(clusterBubbleHTML(grp.length, v.filters && v.filters.family === "Commercial" ? "commercial" : v.filters && v.filters.ptype === "Plot" ? "plot" : null)), zIndexOffset: 60 });
      mk.on("click", () => {
        progRef.current = true;
        map.flyToBounds(safeBounds(grp.map((g) => [g.it.lat, g.it.lon])).pad(0.25), { duration: 0.55, maxZoom: 17 });
      });
      mk.addTo(lg);
    });
  }, [sig]);

  // school marker hover ↔ row sync (class toggle, no rebuild)
  React.useEffect(() => {
    Object.keys(markersRef.current).filter((k) => k.indexOf("sch-") === 0).forEach((k) => {
      const id = k.slice(4);
      const el = markersRef.current[k].getElement && markersRef.current[k].getElement();
      const card = el && el.firstElementChild;
      if (card && card.classList) card.classList.toggle("nd-nav-on", id === schoolHover);
      markersRef.current[k].setZIndexOffset(id === schoolHover ? 900 : 500);
    });
  }, [schoolHover]);
  React.useEffect(() => {
    Object.keys(markersRef.current).forEach((k) => {
      const el = markersRef.current[k].getElement && markersRef.current[k].getElement();
      const card = el && el.firstElementChild;
      if (!card || !card.classList) return;
      card.classList.toggle("nd-nav-on", k === hover);
      markersRef.current[k].setZIndexOffset(k === hover ? 900 : markersRef.current[k].options.zIndexOffset || 200);
    });
  }, [hover, sig]);

  // drawn boundary + school radius ring
  React.useEffect(() => {
    const g = shapeG.current;
    if (!g) return;
    g.clearLayers();
    // Shapes are the remaining Leaflet consumers; same fence as the markers.
    const finPair = (p) => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]);
    const finPairs = (l) => Array.isArray(l) && l.length > 0 && l.every(finPair);
    if (finPairs(view.poly)) {
      L.polygon(view.poly, view.polyDraft
        ? { color: "#1B2A45", weight: 2, dashArray: "6 5", fillColor: "#1B2A45", fillOpacity: 0.05 }
        : { color: "#B05C3A", weight: 2.4, fillColor: "#B05C3A", fillOpacity: 0.1 }).addTo(g);
    }
    if (finPairs(view.scopeRect)) L.rectangle(view.scopeRect, { color: "#1B2A45", weight: 1.5, dashArray: "5 4", fill: false }).addTo(g);
    if (EXP_OK(view.radiusRing) && Number.isFinite(view.radiusRing.km)) L.circle([view.radiusRing.lat, view.radiusRing.lon], { radius: view.radiusRing.km * 1000, color: "#5E5286", weight: 1.6, dashArray: "5 4", fillColor: "#5E5286", fillOpacity: 0.07 }).addTo(g);
    // agri directional search SECTOR + cumulative distance bands (scope overlay only)
    if (view.wedge) {
      const w = view.wedge;
      const arc = (km) => {
        const pts = [];
        for (let a = -w.half; a <= w.half; a += 6) { const p = window.EXJ.offsetPt(w.origin, w.bearing + a, km); if (EXP_OK(p)) pts.push([p.lat, p.lon]); }
        return pts;
      };
      L.polygon(window.EXJ.wedge(w.origin, w.bearing, w.half, w.km), { color: "#1F7A5C", weight: 2, dashArray: "5 4", fillColor: "#1F7A5C", fillOpacity: 0.06 }).addTo(g);
      (w.bands || []).filter((b) => b < w.km).forEach((b) => L.polyline(arc(b), { color: "#1F7A5C", weight: 1, opacity: 0.5, dashArray: "3 5" }).addTo(g));
    }
  }, [view.poly, view.polyDraft, view.scopeRect, view.radiusRing, view.wedge]);

  const navFade = view.level === "city" || view.level === "direction" || view.level === "agri-corridors" || (view.level === "schools-nav" && !(view.areaList || []).length);
  return (
    <div data-design-component="map-surface" className={navFade ? "nd-navmode" : ""} style={{ position: "relative", height: "100%", width: "100%", overflow: "hidden" }}>
      {/* navFade sits on the WRAPPER, never on the element Leaflet initialises: React
          owns `class` on the elements it renders, so toggling it here would wipe every
          class Leaflet added (leaflet-container and friends) and strip the map's own
          styling — including the grab cursor. The .nd-navmode CSS targets descendant
          tile panes, so it works identically from the wrapper. */}
      <div ref={elRef} style={{ position: "absolute", inset: 0 }} />
      <div style={{ position: "absolute", left: "14px", top: "14px", zIndex: 500, display: "flex", flexDirection: "column", gap: "8px", alignItems: "flex-start", maxWidth: "calc(100% - 28px)" }}>
        {!isMobile && (
        <div data-design-component="breadcrumb" style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "9px 14px", borderRadius: "var(--radius-full)", background: "var(--paper)", border: "1px solid var(--border)", boxShadow: "var(--shadow-md)", fontSize: "13.5px", fontWeight: 600, maxWidth: "100%", overflow: "hidden", whiteSpace: "nowrap", transition: "all var(--dur-normal) var(--ease-standard)" }}>
          {view.crumb.map((c, i) => (
            <React.Fragment key={c.key}>
              {i > 0 && <span style={{ color: "var(--grey-400)" }}>›</span>}
              {i === view.crumb.length - 1
                ? <span style={{ color: "var(--text-strong)" }}>{c.label}</span>
                : <button onClick={() => onCrumb(c.key)} style={{ border: "none", background: "transparent", padding: 0, cursor: "pointer", fontFamily: "var(--font-sans)", fontSize: "13.5px", fontWeight: 600, color: "var(--text-muted)" }}>{c.label}</button>}
            </React.Fragment>
          ))}
        </div>
        )}
        {view.clusterFocus && (
          <div style={{ display: "inline-flex", alignItems: "center", gap: "10px", padding: "7px 9px 7px 12px", borderRadius: "var(--radius-full)", background: "var(--navy-800)", color: "#fff", boxShadow: "var(--shadow-lg)", fontSize: "12px", fontWeight: 600 }}>
            {view.clusterFocus.members.length} areas in this map view
            <button onClick={showAllAreas} style={{ border: "none", cursor: "pointer", padding: "4px 10px", borderRadius: "var(--radius-full)", background: "rgba(255,255,255,0.16)", color: "#fff", fontFamily: "var(--font-sans)", fontSize: "11.5px", fontWeight: 700 }}>Show all areas</button>
          </div>
        )}
        {/* #2627 — mobile Map: the Filters entry leads the top-left row; Fit all sits beside it */}
        {lead && (
          <div data-design-component="map-top-row" style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
            {lead}
            {view.scopeKind === "AREA_SET" && view.committed.length > 1 && (
              <button onClick={onFitAll} style={{ minHeight: "44px", padding: "0 13px", borderRadius: "var(--radius-full)", border: "1px solid var(--border-strong)", background: "var(--paper)", cursor: "pointer", fontFamily: "var(--font-sans)", fontSize: "12.5px", fontWeight: 600, color: "var(--text-strong)", boxShadow: "var(--shadow-sm)" }}>Fit all {view.committed.length} areas</button>
            )}
          </div>
        )}
        {!lead && view.scopeKind === "AREA_SET" && view.committed.length > 1 && (
          <button onClick={onFitAll} style={{ padding: "7px 12px", borderRadius: "var(--radius-full)", border: "1px solid var(--border-strong)", background: "var(--paper)", cursor: "pointer", fontFamily: "var(--font-sans)", fontSize: "12px", fontWeight: 600, color: "var(--text-strong)", boxShadow: "var(--shadow-sm)" }}>Fit all {view.committed.length} areas</button>
        )}
      </div>
      {view.listingCapable && (dirty || phase === "loading") && (
        <div style={{ position: "absolute", left: "50%", transform: "translateX(-50%)", ...(isMobile ? { top: "70px" } : { bottom: "22px" }), zIndex: 500, transition: "opacity var(--dur-normal), transform var(--dur-normal)" }}>
          <button onClick={onSearchThisArea} disabled={phase === "loading"} style={{ display: "inline-flex", alignItems: "center", gap: "8px", padding: "10px 16px", borderRadius: "var(--radius-full)", border: "1px solid var(--border-strong)", background: "var(--paper)", boxShadow: "var(--shadow-lg)", cursor: phase === "loading" ? "default" : "pointer", fontFamily: "var(--font-sans)", fontSize: "13px", fontWeight: 700, color: "var(--accent)" }}>
            <span dangerouslySetInnerHTML={{ __html: MG.zoom("var(--accent)") }} />{phase === "loading" ? "Searching…" : "Search this area"}
          </button>
        </div>
      )}
      {!isMobile && (
        <div data-design-component="map-info-dock-anchor" style={{ position: "absolute", left: "14px", bottom: "14px", zIndex: 500, width: "min(288px, calc(50% - 92px))" }}>
          <ExpMapInfoDock view={view} signedIn={signedIn} onSignIn={onSignIn} />
        </div>
      )}
      {view.cameraNote && (
        <div style={{ position: "absolute", right: "14px", top: "14px", zIndex: 500, maxWidth: "230px", padding: "8px 11px", borderRadius: "var(--radius-md)", background: "rgba(255,255,255,0.95)", border: "1px solid var(--border)", boxShadow: "var(--shadow-md)", fontSize: "11.5px", lineHeight: 1.4, color: "var(--text-body)" }}>{view.cameraNote}</div>
      )}
    </div>
  );
}

Object.assign(window, { ExpMap, ExpMapInfoDock });
