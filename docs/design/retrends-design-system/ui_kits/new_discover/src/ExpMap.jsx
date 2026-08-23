// Discover experience — map surface. Leaflet + CARTO Voyager, the same marker
// grammar as ui_kits/new_discover (area pill, price pin) plus the connected
// regional-cluster-marker card (which replaces the directional card here) and
// the drawn-boundary layer.
// The map owns no product state: everything it draws comes from `view`.
const EM = window.EXP;

const MG = {
  zoom: (c) => `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="2.4" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M11 8v6M8 11h6M20 20l-3.5-3.5"/></svg>`,
  pin: (c) => `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>`
};

// Top-level directional region/local-cluster card — same connected "Option B" component as
// regionalClusterCardHTML: navy info card (rounded top) flush against a white "Zoom in" footer
// (rounded bottom), one shared shadow/border, rust tail. Reuses the regional-cluster-marker
// design-component tag so it inherits the same hover/press/focus CSS.
function destCardHTML(o) {
  const w = Math.round(132 + Math.min(1, o.n / 240) * 38);
  const cf = Math.round(22 + Math.min(1, o.n / 240) * 9);
  // singular/plural: "1 LISTING" / "126 LISTINGS", "1 SCHOOL" / "9 SCHOOLS"
  const nounPlural = o.noun || "listings";
  const noun = o.n === 1 ? nounPlural.replace(/s$/, "") : nounPlural;
  const sel = !!o.sel;
  const label = o.ariaLabel || (o.names + ". " + o.n + " " + noun.toLowerCase() + (o.areasLine ? ". " + o.areasLine : "") + ". Activate to zoom in.");
  return `<div class="nd-nav${o.hov ? " nd-nav-on" : ""}${sel ? " nd-nav-sel" : ""}" data-design-component="regional-cluster-marker" tabindex="0" role="button" aria-label="${label}" style="position:relative;width:${w}px;margin-left:-${w / 2}px;transform:translateY(-50%);font-family:var(--font-sans);text-align:center;outline:none;">
    <div class="rc-shell" style="border-radius:var(--radius-lg);overflow:hidden;box-shadow:var(--shadow-lg);border:1.5px solid rgba(27,42,69,${sel ? 0.4 : 0.24});transition:transform .18s cubic-bezier(.4,0,.2,1),box-shadow .18s;${sel ? "outline:2px solid var(--navy-800);outline-offset:2px;" : ""}">
      <div style="padding:9px 14px 9px;background:var(--navy-800);color:#fff;display:flex;flex-direction:column;align-items:center;gap:2px;">
        <span style="font-size:12.5px;font-weight:700;letter-spacing:-0.01em;line-height:1.25;text-wrap:balance;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;max-width:${w - 28}px;">${o.names}</span>
        ${o.zero ? "" : `<span style="display:flex;align-items:baseline;gap:5px;margin-top:2px;">
          <span style="font-family:var(--font-mono);font-size:${cf}px;font-weight:800;line-height:1;letter-spacing:-0.02em;">${o.n.toLocaleString("en-IN")}</span>
          <span style="font-size:9.5px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:rgba(255,255,255,.72);">${noun}</span>
        </span>`}
        ${o.areasLine ? `<span style="margin-top:${o.zero ? 4 : 3}px;padding:1px 9px;border-radius:var(--radius-full);background:rgba(255,255,255,0.14);font-size:10px;font-weight:600;color:rgba(255,255,255,${o.zero ? .78 : .9});white-space:nowrap;">${o.areasLine}</span>` : ""}
      </div>
      <div class="rc-footer" style="background:#fff;padding:7px 10px;display:flex;align-items:center;justify-content:center;gap:5px;transition:background .15s ease;">
        ${MG.zoom("var(--copper-600)")}
        <span style="font-size:11.5px;font-weight:700;color:var(--copper-600);">Zoom in</span>
        <span style="font-size:13px;font-weight:700;color:var(--copper-600);line-height:1;">&#8250;</span>
      </div>
    </div>
    <div class="rc-tail" style="width:0;height:0;border-left:6px solid transparent;border-right:6px solid transparent;border-top:7px solid var(--copper-600);margin:0 auto;"></div>
  </div>`;
}
// Visual AREA cluster — presentation only. Same connected regional-cluster-marker
// grammar as destCardHTML / regionalClusterCardHTML (navy info block + white "Zoom in"
// footer + tail); it differs by its wider clamp and its "N areas with matches/schools"
// line, and it takes the plum footer accent in the schools journey.
function clusterChipHTML(o) {
  const w = Math.min(206, Math.max(150, Math.round(132 + Math.min(1, o.n / 240) * 38)));
  const cf = Math.round(20 + Math.min(1, o.n / 240) * 8);
  const schools = o.tone === "schools";
  const exact = o.members;
  const areasLine = exact + (exact === 1 ? " area with " : " areas with ") + (schools ? "schools" : "matches");
  const nounPlural = schools ? "schools" : (o.noun || "listings");
  const noun = o.n === 1 ? nounPlural.replace(/s$/, "") : nounPlural;
  const iconColor = schools ? "var(--plum-600)" : "var(--copper-600)";
  return `<div class="nd-nav${o.hov ? " nd-nav-on" : ""}" data-design-component="regional-cluster-marker" tabindex="0" role="button" aria-label="Zoom into the ${o.names} areas" style="position:relative;width:${w}px;margin-left:-${w / 2}px;transform:translateY(-50%);font-family:var(--font-sans);text-align:center;outline:none;">
    <div class="rc-shell" style="border-radius:var(--radius-lg);overflow:hidden;box-shadow:var(--shadow-lg);border:1.5px solid rgba(27,42,69,0.24);transition:transform .18s cubic-bezier(.4,0,.2,1),box-shadow .18s;">
      <div style="padding:9px 14px 9px;background:var(--navy-800);color:#fff;display:flex;flex-direction:column;align-items:center;gap:2px;">
        <span style="font-size:12.5px;font-weight:700;letter-spacing:-0.01em;line-height:1.25;text-wrap:balance;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;max-width:${w - 28}px;">${o.names}</span>
        <span style="display:flex;align-items:baseline;gap:5px;margin-top:2px;">
          <span style="font-family:var(--font-mono);font-size:${cf}px;font-weight:800;line-height:1;letter-spacing:-0.02em;">${o.n.toLocaleString("en-IN")}</span>
          <span style="font-size:9.5px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:rgba(255,255,255,.72);">${noun}</span>
        </span>
        <span style="margin-top:3px;padding:1px 9px;border-radius:var(--radius-full);background:rgba(255,255,255,0.14);font-size:10px;font-weight:600;color:rgba(255,255,255,.9);white-space:nowrap;">${areasLine}</span>
      </div>
      <div class="rc-footer" style="background:#fff;padding:7px 10px;display:flex;align-items:center;justify-content:center;gap:5px;transition:background .15s ease;">
        ${MG.zoom(iconColor)}
        <span style="font-size:11.5px;font-weight:700;color:${iconColor};">Zoom in</span>
        <span style="font-size:13px;font-weight:700;color:${iconColor};line-height:1;">&#8250;</span>
      </div>
    </div>
    <div class="rc-tail" style="width:0;height:0;border-left:6px solid transparent;border-right:6px solid transparent;border-top:7px solid ${iconColor};margin:0 auto;"></div>
  </div>`;
}
// Regional cluster marker (Option B) — one connected component: a navy info card with
// rounded TOP corners, flush against a white "Zoom in" footer with rounded BOTTOM
// corners, a single unified shadow/border around both, and a small rust-orange tail
// pointing at the cluster's map position. destCardHTML (top-level directional regions)
// now uses this same grammar and design-component tag; this builder differs only in its
// wider clamp and its "N areas with matches" line.
function regionalClusterCardHTML(o) {
  const w = Math.min(206, Math.max(150, Math.round(132 + Math.min(1, o.n / 240) * 38)));
  const cf = Math.round(20 + Math.min(1, o.n / 240) * 8);
  const nounPlural = o.noun || "listings";
  const noun = o.n === 1 ? nounPlural.replace(/s$/, "") : nounPlural;
  const areasLine = (o.exact || 0) + ((o.exact || 0) === 1 ? " area with matches" : " areas with matches");
  const sel = !!o.sel;
  const label = o.ariaLabel || ("Zoom into the " + o.names + " areas");
  return `<div class="nd-nav${o.hov ? " nd-nav-on" : ""}${sel ? " nd-nav-sel" : ""}" data-design-component="regional-cluster-marker" tabindex="0" role="button" aria-label="${label}" style="position:relative;width:${w}px;margin-left:-${w / 2}px;transform:translateY(-50%);font-family:var(--font-sans);text-align:center;outline:none;">
    <div class="rc-shell" style="border-radius:var(--radius-lg);overflow:hidden;box-shadow:var(--shadow-lg);border:1.5px solid rgba(27,42,69,${sel ? 0.4 : 0.24});transition:transform .18s cubic-bezier(.4,0,.2,1),box-shadow .18s;${sel ? "outline:2px solid var(--navy-800);outline-offset:2px;" : ""}">
      <div style="padding:9px 14px 9px;background:var(--navy-800);color:#fff;display:flex;flex-direction:column;align-items:center;gap:2px;">
        <span style="font-size:12.5px;font-weight:700;letter-spacing:-0.01em;line-height:1.25;text-wrap:balance;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;max-width:${w - 28}px;">${o.names}</span>
        <span style="display:flex;align-items:baseline;gap:5px;margin-top:2px;">
          <span style="font-family:var(--font-mono);font-size:${cf}px;font-weight:800;line-height:1;letter-spacing:-0.02em;">${o.n.toLocaleString("en-IN")}</span>
          <span style="font-size:9.5px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:rgba(255,255,255,.72);">${noun}</span>
        </span>
        <span style="margin-top:3px;padding:1px 9px;border-radius:var(--radius-full);background:rgba(255,255,255,0.14);font-size:10px;font-weight:600;color:rgba(255,255,255,.9);white-space:nowrap;">${areasLine}</span>
      </div>
      <div class="rc-footer" style="background:#fff;padding:7px 10px;display:flex;align-items:center;justify-content:center;gap:5px;transition:background .15s ease;">
        ${MG.zoom("var(--copper-600)")}
        <span style="font-size:11.5px;font-weight:700;color:var(--copper-600);">Zoom in</span>
        <span style="font-size:13px;font-weight:700;color:var(--copper-600);line-height:1;">&#8250;</span>
      </div>
    </div>
    <div class="rc-tail" style="width:0;height:0;border-left:6px solid transparent;border-right:6px solid transparent;border-top:7px solid var(--copper-600);margin:0 auto;"></div>
  </div>`;
}
function areaPinHTML(o) {
  const sel = o.sel, cand = o.candidate;
  const bg = "var(--navy-800)", fg = "#fff";
  const bd = `1.5px solid rgba(255,255,255,${sel ? 0.9 : 0.42})`;
  // draft candidate: a subtle dashed LABEL — must never read as a committed search area
  if (cand) {
    return `<div data-design-component="area-candidate-label" style="position:relative;width:210px;margin-left:-105px;transform:translateY(-100%);text-align:center;font-family:var(--font-sans);">
      <span style="display:inline-flex;align-items:center;gap:6px;padding:4px 9px;border-radius:var(--radius-full);background:rgba(255,255,255,0.88);color:var(--text-body);border:1px dashed var(--border-strong);box-shadow:var(--shadow-xs);white-space:nowrap;font-size:11.5px;font-weight:600;">
        ${MG.pin("var(--grey-500)")}${o.name}<span style="font-family:var(--font-mono);font-size:10.5px;color:var(--text-muted);">${o.n}</span>
      </span>
    </div>`;
  }
  // SCHOOLS journey: the primary metric is schools located inside the area, listings are
  // secondary context, and the caption names the action the tap actually performs.
  if (o.schoolsMode) {
    // Schools-journey leaf marker — same connected split-capsule family as the homes area
    // marker (am-leaf), plum-accented: identity half (icon + name + listings count stacked)
    // flush against a "View N schools" action half. One shell/shadow/tail. Kept at the same
    // compact scale as the homes marker — areas in a schools cluster sit at real, often close,
    // map coordinates, so an oversized capsule here collides with neighbours / clips the map.
    const schoolNoun = o.n === 1 ? "school" : "schools";
    const listingNoun = o.listings === 1 ? "listing" : "listings";
    const actionText = `View ${o.n} ${schoolNoun}`;
    const nameBoxW = Math.min(130, Math.max(50, Math.round(o.name.length * 8.1)));
    const leftW = nameBoxW + 42;
    const actionW = Math.round(actionText.length * 7.4) + 42;
    const w = leftW + actionW;
    const label = o.ariaLabel || `View ${o.n} ${schoolNoun} in ${o.name}`;
    return `<div class="nd-nav am-leaf am-leaf-school${o.hov ? " nd-nav-on" : ""}" data-design-component="area-marker" tabindex="0" role="button" aria-label="${label}" style="position:relative;width:${w}px;margin-left:-${Math.round(w / 2)}px;transform:translateY(-100%);font-family:var(--font-sans);outline:none;">
      <div class="am-shell" style="display:flex;align-items:stretch;border-radius:var(--radius-full);overflow:hidden;box-shadow:${sel ? "var(--shadow-lg)" : "var(--shadow-md)"};border:1.5px solid rgba(94,82,134,${sel ? 0.4 : 0.26});transition:transform .18s cubic-bezier(.4,0,.2,1),box-shadow .18s ease;">
        <div style="flex:none;display:flex;align-items:center;gap:7px;padding:8px 12px 8px 12px;background:var(--plum-600);color:#fff;min-width:0;">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="flex:none;"><path d="m22 10-10-5L2 10l10 5 10-5z"/><path d="M6 12v5c0 1.7 2.7 3 6 3s6-1.3 6-3v-5"/></svg>
          <span style="display:flex;flex-direction:column;gap:1px;min-width:0;">
            <span style="font-size:13.5px;font-weight:800;letter-spacing:-0.01em;line-height:1.1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:${nameBoxW}px;">${o.name}</span>
            <span style="font-size:10px;font-weight:600;color:rgba(255,255,255,0.68);white-space:nowrap;">${o.listings} ${listingNoun}</span>
          </span>
        </div>
        <div class="am-action" style="flex:none;display:flex;align-items:center;gap:4px;padding:9px 14px;background:var(--canvas-100);color:var(--plum-600);white-space:nowrap;transition:background .15s ease;">
          <span style="font-size:12.5px;font-weight:800;letter-spacing:-0.01em;">${actionText}</span>
          <span style="font-size:14px;font-weight:800;line-height:1;">&#8250;</span>
        </div>
      </div>
      <div class="am-tail" style="width:0;height:0;border-left:7px solid transparent;border-right:7px solid transparent;border-top:8px solid var(--plum-600);margin:-1px auto 0;"></div>
    </div>`;
  }
  // leaf-level individual area marker — one connected split capsule: navy identity (left) +
  // rust "View N homes" action (right), flush together, single border/shadow, tail below.
  // Distinct from cluster markers: activating this opens listings directly, never a further zoom.
  const noun = o.n === 1 ? "home" : "homes";
  const actionText = `View ${o.n} ${noun}`;
  const nameBoxW = Math.min(150, Math.max(56, Math.round(o.name.length * 8.2)));
  const leftW = nameBoxW + 46;
  const actionW = Math.round(actionText.length * 7.3) + 50;
  const w = leftW + actionW;
  const label = o.ariaLabel || `View ${o.n} ${noun} in ${o.name}`;
  return `<div class="nd-nav am-leaf${o.hov ? " nd-nav-on" : ""}" data-design-component="area-marker" tabindex="0" role="button" aria-label="${label}" style="position:relative;width:${w}px;margin-left:-${Math.round(w / 2)}px;transform:translateY(-100%);font-family:var(--font-sans);outline:none;">
    <div class="am-shell" style="display:flex;align-items:stretch;border-radius:var(--radius-full);overflow:hidden;box-shadow:${sel ? "var(--shadow-lg)" : "var(--shadow-md)"};border:1.5px solid rgba(27,42,69,${sel ? 0.42 : 0.24});transition:transform .18s cubic-bezier(.4,0,.2,1),box-shadow .18s ease;">
      <div style="flex:none;display:flex;align-items:center;gap:7px;padding:9px 12px 9px 13px;background:${bg};color:#fff;min-width:0;">
        ${MG.pin("#fff")}
        <span style="font-size:14px;font-weight:700;letter-spacing:-0.01em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:${nameBoxW}px;">${o.name}</span>
      </div>
      <div class="am-action" style="flex:none;display:flex;align-items:center;gap:4px;padding:9px 15px;background:var(--canvas-100);color:var(--copper-600);white-space:nowrap;transition:background .15s ease;">
        <span style="font-size:12.5px;font-weight:700;">${actionText}</span>
        <span style="font-size:14px;font-weight:700;line-height:1;">&#8250;</span>
      </div>
    </div>
    <div class="am-tail" style="width:0;height:0;border-left:7px solid transparent;border-right:7px solid transparent;border-top:8px solid ${bg};margin:-1px auto 0;"></div>
  </div>`;
}
function pricePinHTML(l, on, f) {
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
  const cap = tone === "agri" ? "parcels" : "homes";
  return `<div class="nd-cluster" data-design-component="listing-cluster" style="transform:translate(-50%,-50%);font-family:var(--font-sans);text-align:center;cursor:pointer;">
    <div class="nd-cluster-disc" style="width:${size}px;height:${size}px;border-radius:var(--radius-full);background:${bg};color:#fff;box-shadow:var(--shadow-lg);border:3px solid rgba(255,255,255,0.9);display:flex;flex-direction:column;align-items:center;justify-content:center;line-height:1;margin:0 auto;transition:transform .18s cubic-bezier(.4,0,.2,1);">
      <span style="font-family:var(--font-mono);font-size:17px;font-weight:700;">${count}</span>
      <span style="font-size:8px;font-weight:700;letter-spacing:.05em;opacity:.82;text-transform:uppercase;">${cap}</span>
    </div></div>`;
}
function clusterLeaves(items, map, px) {
  const pts = items.map((it) => ({ it, p: map.latLngToContainerPoint([it.lat, it.lon]) }));
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

function ExpMap({ view, isMobile, onPick, onCluster, onArea, onOpenListing, hover, onHover, onCameraMove, onSearchThisArea, dirty, phase, onCrumb, showAllAreas, onFitAll, onSchool, onSchoolHover, schoolHover, onAgriNav, onAgriTown, onParcel, agriActive }) {
  const elRef = React.useRef(null), mapRef = React.useRef(null);
  const navG = React.useRef(null), leafG = React.useRef(null), shapeG = React.useRef(null);
  const progRef = React.useRef(false), fitRef = React.useRef(null);
  const [tick, setTick] = React.useState(0);
  const markersRef = React.useRef({});
  const viewRef = React.useRef(view); viewRef.current = view;
  const cbRef = React.useRef({}); cbRef.current = { onPick, onCluster, onArea, onOpenListing, onHover, onSchool, onSchoolHover, onAgriNav, onAgriTown, onParcel, onCameraMove };

  React.useEffect(() => {
    const map = L.map(elRef.current, { zoomControl: false, attributionControl: true, preferCanvas: false });
    map.setView([EM.city.lat, EM.city.lon], 11);
    L.tileLayer("https://basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", { maxZoom: 19, attribution: '&copy; OpenStreetMap contributors &copy; CARTO' }).addTo(map);
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
    fitRef.current = view.fitKey;
    progRef.current = true;
    map.flyToBounds(view.fitBounds, { paddingTopLeft: [56, isMobile ? 108 : 82], paddingBottomRight: [40, isMobile ? 168 : 56], duration: 0.65, easeLinearity: 0.25, maxZoom: view.maxZoom || 15 });
    // eslint-disable-next-line
  }, [view.fitKey]);

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
    const icon = (html, cls) => L.divIcon({ html, className: "upt-pin " + (cls || ""), iconSize: [0, 0] });
    const wire = (mk, key) => { markersRef.current[key] = mk; mk.on("mouseover", () => cb.onHover(key)); mk.on("mouseout", () => cb.onHover(null)); };
    // keyboard activation — the focusable card inside the divIcon has tabindex=0;
    // Enter/Space bubbles up to this listener on the marker's root element
    const wireKeyboard = (mk, fn) => { const el = mk.getElement(); if (el) el.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fn(); } }); };
    // Compass layout: at navigation levels the destination cards sit by BEARING around
    // the map centre (an orientation canvas), exactly as in the approved V2 map.
    const size = map.getSize();
    const SLOT = { N: [0.5, 0.17], E: [0.83, 0.46], S: [0.5, 0.81], W: [0.17, 0.46], C: [0.5, 0.5] };
    const compassAt = (d, i, total) => {
      let fx, fy;
      if (d.slot && SLOT[d.slot]) { fx = SLOT[d.slot][0]; fy = SLOT[d.slot][1]; }
      else {
        const b = ((d.bearing != null ? d.bearing : (360 / total) * i) * Math.PI) / 180;
        fx = 0.5 + Math.sin(b) * 0.3;
        fy = 0.5 - Math.cos(b) * 0.31;
      }
      return map.containerPointToLatLng([fx * size.x, fy * size.y]);
    };
    // dense-map collision handling: nodes without a fixed compass slot (regional
    // clusters, e.g. Hebbal · Yelahanka / Devanahalli · Airport / Hennur · Thanisandra)
    // sit by real bearing and can land close together — enforce a minimum angular gap
    // so cards never overlap; direction cards (fixed N/E/S/W/C slots) are untouched.
    const noSlot = (v.destinations || []).filter((d) => !d.slot);
    if (noSlot.length > 1) {
      const MIN_GAP = 30;
      const order = noSlot.map((d) => ({ d, b: ((d.bearing || 0) % 360 + 360) % 360 })).sort((a, b) => a.b - b.b);
      for (let k = 1; k < order.length; k++) { const gap = order[k].b - order[k - 1].b; if (gap < MIN_GAP) order[k].b = order[k - 1].b + MIN_GAP; }
      const wrap = order[0].b + 360 - order[order.length - 1].b;
      if (wrap < MIN_GAP) order[order.length - 1].b -= (MIN_GAP - wrap);
      order.forEach((o) => (o.d.__bearing = o.b));
    }
    (v.destinations || []).forEach((d, i) => {
      const ll = v.compass ? compassAt({ ...d, bearing: d.__bearing != null ? d.__bearing : d.bearing }, i, v.destinations.length) : L.latLng(d.center.lat, d.center.lon);
      const schoolsJ = v.journey === "schools";
      if (d.kind === "local") {
        const mk = L.marker(ll, { icon: icon(regionalClusterCardHTML({ names: d.names.join(" · "), n: d.n, noun: v.noun || "listings", exact: d.matchAreas || 0, sel: !!d.sel })), zIndexOffset: d.sel ? 260 : 200, riseOnHover: true });
        mk.on("click", () => cb.onPick(d));
        wire(mk, d.key);
        mk.addTo(g);
        wireKeyboard(mk, () => cb.onPick(d));
        return;
      }
      const areaWord = (d.matchAreas || 0) === 1 ? " area with " : " areas with ";
      const areasLine = d.n === 0 ? "No matches with current filters" : (d.matchAreas || 0) + areaWord + (schoolsJ ? "schools" : "matches");
      const mk = L.marker(ll, { icon: icon(destCardHTML({ names: d.names.join(" · "), n: d.n, noun: schoolsJ ? "schools" : (v.noun || "listings"), areasLine, zero: d.n === 0, sel: !!d.sel })), zIndexOffset: d.sel ? 260 : 200, riseOnHover: true });
      mk.on("click", () => cb.onPick(d));
      wire(mk, d.key);
      mk.addTo(g);
      wireKeyboard(mk, () => cb.onPick(d));
    });
    (v.mapClusters || []).forEach((c) => {
      const mk = L.marker([c.center.lat, c.center.lon], { icon: icon(clusterChipHTML({ names: c.names.join(" · "), more: c.more, members: c.members.length, n: v.journey === "schools" ? (c.listings || 0) : c.n, schools: c.schools, noun: v.noun || "listings", tone: v.journey === "schools" ? "schools" : null })), zIndexOffset: 300, riseOnHover: true });
      mk.on("click", () => cb.onCluster(c));
      wire(mk, c.key);
      mk.addTo(g);
      wireKeyboard(mk, () => cb.onCluster(c));
    });
    (v.areaMarkers || []).forEach((a) => {
      const mk = L.marker([a.center.lat, a.center.lon], { icon: icon(areaPinHTML({ name: a.label, n: a.n, listings: a.listings, schoolsMode: v.journey === "schools" && !a.candidate, sel: a.selected, candidate: a.candidate })), zIndexOffset: a.selected ? 900 : a.candidate ? 300 : 400, riseOnHover: !a.candidate });
      if (!a.candidate) mk.on("click", () => cb.onArea(a.key));
      if (!a.candidate) wire(mk, a.key);
      mk.addTo(g);
      if (!a.candidate) wireKeyboard(mk, () => cb.onArea(a.key));
    });
    (v.discs || []).forEach((d) => {
      const mk = L.marker([d.center.lat, d.center.lon], { icon: icon(discHTML(d.n)), zIndexOffset: 250 });
      mk.on("click", () => (d.areaKey ? cb.onArea(d.areaKey) : null));
      mk.addTo(g);
    });
    (v.schoolPins || []).forEach((s) => {
      const interactive = !!cb.onSchool;
      const mk = L.marker([s.lat, s.lon], { icon: icon(schoolPinHTML(s, !!(v.school && v.school.id === s.id), schoolHover === s.id)), zIndexOffset: schoolHover === s.id ? 900 : 500, interactive });
      if (interactive) { mk.on("click", () => cb.onSchool(s.id)); mk.on("mouseover", () => cb.onSchoolHover(s.id)); mk.on("mouseout", () => cb.onSchoolHover(null)); markersRef.current["sch-" + s.id] = mk; }
      mk.addTo(g);
    });
    // agri: outbound-direction cards, town discs, parcel pins, origin marker
    (v.navCards || []).forEach((c) => {
      const mk = L.marker([c.center.lat, c.center.lon], { icon: icon(agriCardHTML({ label: c.label, n: c.n, range: c.range })), zIndexOffset: 200 });
      mk.on("click", () => cb.onAgriNav && cb.onAgriNav(c.key));
      wire(mk, c.key);
      mk.addTo(g);
    });
    (v.townDiscs || []).forEach((t) => {
      const mk = L.marker([t.center.lat, t.center.lon], { icon: icon(townDiscHTML({ name: t.name, n: t.n })), zIndexOffset: 300 });
      mk.on("click", () => cb.onAgriTown && cb.onAgriTown(t.key));
      wire(mk, t.key);
      mk.addTo(g);
    });
    if (v.originMarker) L.marker([v.originMarker.lat, v.originMarker.lon], { icon: icon(originPinHTML(v.originMarker.name)), zIndexOffset: 150, interactive: false }).addTo(g);
    (v.parcelPins || []).length && clusterLeaves(v.parcelPins, map, CLUSTER_PX).forEach((grp) => {
      if (grp.length === 1) {
        const p = grp[0].it;
        const mk = L.marker([p.lat, p.lon], { icon: icon(parcelPinHTML(p, p.id === agriActive)), zIndexOffset: p.id === agriActive ? 900 : 100 });
        mk.on("click", () => cb.onParcel && cb.onParcel(p.id));
        mk.addTo(lg);
        return;
      }
      const lat = grp.reduce((s, x) => s + x.it.lat, 0) / grp.length;
      const lon = grp.reduce((s, x) => s + x.it.lon, 0) / grp.length;
      const mk = L.marker([lat, lon], { icon: icon(clusterBubbleHTML(grp.length, "agri")), zIndexOffset: 60 });
      mk.on("click", () => {
        progRef.current = true;
        map.flyToBounds(L.latLngBounds(grp.map((x) => [x.it.lat, x.it.lon])).pad(0.25), { duration: 0.55, maxZoom: 16 });
      });
      mk.addTo(lg);
    });
    (v.pins || []).length && clusterLeaves(v.pins, map, CLUSTER_PX).forEach((grp) => {
      if (grp.length === 1) {
        const l = grp[0].it;
        const mk = L.marker([l.lat, l.lon], { icon: icon(pricePinHTML(l, false, v.filters)), zIndexOffset: 100 });
        mk.on("click", () => cb.onOpenListing(l.id));
        wire(mk, l.id);
        mk.addTo(lg);
        return;
      }
      const lat = grp.reduce((s, g) => s + g.it.lat, 0) / grp.length;
      const lon = grp.reduce((s, g) => s + g.it.lon, 0) / grp.length;
      const mk = L.marker([lat, lon], { icon: icon(clusterBubbleHTML(grp.length)), zIndexOffset: 60 });
      mk.on("click", () => {
        progRef.current = true;
        map.flyToBounds(L.latLngBounds(grp.map((g) => [g.it.lat, g.it.lon])).pad(0.25), { duration: 0.55, maxZoom: 17 });
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
    if (view.poly) {
      L.polygon(view.poly, view.polyDraft
        ? { color: "#1B2A45", weight: 2, dashArray: "6 5", fillColor: "#1B2A45", fillOpacity: 0.05 }
        : { color: "#B05C3A", weight: 2.4, fillColor: "#B05C3A", fillOpacity: 0.1 }).addTo(g);
    }
    if (view.scopeRect) L.rectangle(view.scopeRect, { color: "#1B2A45", weight: 1.5, dashArray: "5 4", fill: false }).addTo(g);
    if (view.radiusRing) L.circle([view.radiusRing.lat, view.radiusRing.lon], { radius: view.radiusRing.km * 1000, color: "#5E5286", weight: 1.6, dashArray: "5 4", fillColor: "#5E5286", fillOpacity: 0.07 }).addTo(g);
    // agri directional search SECTOR + cumulative distance bands (scope overlay only)
    if (view.wedge) {
      const w = view.wedge;
      const arc = (km) => {
        const pts = [];
        for (let a = -w.half; a <= w.half; a += 6) { const p = window.EXJ.offsetPt(w.origin, w.bearing + a, km); pts.push([p.lat, p.lon]); }
        return pts;
      };
      L.polygon(window.EXJ.wedge(w.origin, w.bearing, w.half, w.km), { color: "#1F7A5C", weight: 2, dashArray: "5 4", fillColor: "#1F7A5C", fillOpacity: 0.06 }).addTo(g);
      (w.bands || []).filter((b) => b < w.km).forEach((b) => L.polyline(arc(b), { color: "#1F7A5C", weight: 1, opacity: 0.5, dashArray: "3 5" }).addTo(g));
    }
  }, [view.poly, view.polyDraft, view.scopeRect, view.radiusRing, view.wedge]);

  const navFade = view.level === "city" || view.level === "direction" || view.level === "agri-corridors" || (view.level === "schools-nav" && !(view.areaList || []).length);
  return (
    <div data-design-component="map-surface" style={{ position: "relative", height: "100%", width: "100%", overflow: "hidden" }}>
      <div ref={elRef} className={navFade ? "nd-navmode" : ""} style={{ position: "absolute", inset: 0 }} />
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
        {view.scopeKind === "AREA_SET" && view.committed.length > 1 && (
          <button onClick={onFitAll} style={{ padding: "7px 12px", borderRadius: "var(--radius-full)", border: "1px solid var(--border-strong)", background: "var(--paper)", cursor: "pointer", fontFamily: "var(--font-sans)", fontSize: "12px", fontWeight: 600, color: "var(--text-strong)", boxShadow: "var(--shadow-sm)" }}>Fit all {view.committed.length} areas</button>
        )}
      </div>
      {view.listingCapable && (dirty || phase === "loading") && (
        <div style={{ position: "absolute", left: "50%", transform: "translateX(-50%)", bottom: isMobile ? "128px" : "22px", zIndex: 500, transition: "opacity var(--dur-normal), transform var(--dur-normal)" }}>
          <button onClick={onSearchThisArea} disabled={phase === "loading"} style={{ display: "inline-flex", alignItems: "center", gap: "8px", padding: "10px 16px", borderRadius: "var(--radius-full)", border: "1px solid var(--border-strong)", background: "var(--paper)", boxShadow: "var(--shadow-lg)", cursor: phase === "loading" ? "default" : "pointer", fontFamily: "var(--font-sans)", fontSize: "13px", fontWeight: 700, color: "var(--accent)" }}>
            <span dangerouslySetInnerHTML={{ __html: MG.zoom("var(--accent)") }} />{phase === "loading" ? "Searching…" : "Search this area"}
          </button>
        </div>
      )}
      {view.cameraNote && (
        <div style={{ position: "absolute", right: "14px", top: "14px", zIndex: 500, maxWidth: "230px", padding: "8px 11px", borderRadius: "var(--radius-md)", background: "rgba(255,255,255,0.95)", border: "1px solid var(--border)", boxShadow: "var(--shadow-md)", fontSize: "11.5px", lineHeight: 1.4, color: "var(--text-body)" }}>{view.cameraNote}</div>
      )}
    </div>
  );
}

Object.assign(window, { ExpMap });
