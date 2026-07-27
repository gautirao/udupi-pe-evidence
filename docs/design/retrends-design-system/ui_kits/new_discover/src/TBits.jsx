// Transitions page — frame renderer. Schematic mini-shells in the approved
// Discover language: real CARTO Voyager tiles, the four marker families, and a
// compact panel block renderer. Desktop frames keep the 1366×768 shell
// proportions at 560×316; marker and row type is enlarged to stay legible.
const { Icon: TIcon } = window.ReTrendsDesignSystem_f37966;

const TILE = (z, x, y) => `https://basemaps.cartocdn.com/rastertiles/voyager/${z}/${x}/${y}.png`;
const GL = {
  pin: (c) => `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="2.6" stroke-linecap="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>`,
  zoom: (c) => `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="2.4" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M11 8v6M8 11h6M20 20l-3.5-3.5"/></svg>`,
  layers: (c) => `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 2 9 5-9 5-9-5 9-5Z"/><path d="m3 12 9 5 9-5"/></svg>`
};

function TXMapPlate({ frame, w, h, mobile }) {
  const m = frame.map || {};
  const cam = window.TX.CAM[m.preset || "city"] || window.TX.CAM.city;
  const off = m.offset || [0, 0];
  const x0 = Math.floor(cam.fx) - Math.ceil(w / 512) - 1, y0 = Math.floor(cam.fy) - Math.ceil(h / 512) - 1;
  const cols = Math.ceil(w / 256) + 3, rows = Math.ceil(h / 256) + 3;
  const tiles = [];
  for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
    tiles.push({ k: i + "-" + j, src: TILE(cam.z, x0 + i, y0 + j), l: w / 2 + (x0 + i - cam.fx) * 256 + off[0], t: h / 2 + (y0 + j - cam.fy) * 256 + off[1] });
  }
  const fade = m.nav ? { opacity: 0.62, filter: "saturate(0.75)" } : m.dim ? { opacity: 0.45, filter: "saturate(0.6)" } : {};
  return (
    <div data-design-component="map-surface" style={{ position: "relative", width: w + "px", height: h + "px", overflow: "hidden", background: "#EDEBE6", flex: "none" }}>
      <div style={{ position: "absolute", inset: 0, ...fade }}>
        {tiles.map((t) => <img key={t.k} src={t.src} alt="" width="256" height="256" style={{ position: "absolute", left: t.l + "px", top: t.t + "px", width: "256px", height: "256px" }} />)}
      </div>
      {m.poly && <TXPoly kind={m.poly} />}
      {m.viewportRect && <TXViewportRect />}
      {m.schoolRing && <div style={{ position: "absolute", left: "50%", top: "52%", width: "62%", height: "62%", transform: "translate(-50%,-50%)", borderRadius: "var(--radius-full)", border: "1.5px dashed #5E5286", background: "rgba(94,82,134,0.08)", pointerEvents: "none" }} />}
      {(m.schoolPins || []).map((sp, i) => (
        <div key={i} style={{ position: "absolute", left: sp[0] + "%", top: sp[1] + "%", transform: "translate(-50%,-100%)", zIndex: 5 }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", padding: "3px 8px", borderRadius: "var(--radius-full)", background: "var(--paper)", border: "1px solid var(--plum-100)", boxShadow: "var(--shadow-sm)", fontSize: "8.5px", fontWeight: 700, color: "var(--text-strong)", whiteSpace: "nowrap" }}>
            <span style={{ width: "12px", height: "12px", borderRadius: "var(--radius-xs)", background: "var(--plum-tint)", display: "grid", placeItems: "center", color: "var(--plum-600)", fontSize: "7px", fontWeight: 700 }}>S</span>{sp[2]}
          </span>
        </div>
      ))}
      {(m.markers || []).map((k, i) => <TXMarker key={i} mk={k} focus={m.focusCluster} mobile={mobile} />)}
      {frame.crumb && <TXCrumb crumb={frame.crumb} mobile={mobile} />}
      <div style={{ position: "absolute", right: "7px", top: mobile ? "58px" : "34px", display: "flex", flexDirection: "column", borderRadius: "var(--radius-sm)", overflow: "hidden", border: "1px solid var(--border-strong)", background: "var(--paper)", boxShadow: "var(--shadow-sm)" }}>
        <span style={{ width: "18px", height: "17px", display: "grid", placeItems: "center", fontSize: "12px", color: "var(--navy-800)", borderBottom: "1px solid var(--border)" }}>+</span>
        <span style={{ width: "18px", height: "17px", display: "grid", placeItems: "center", fontSize: "12px", color: "var(--navy-800)" }}>−</span>
      </div>
      {m.searchThisArea && (
        <div style={{ position: "absolute", left: "50%", transform: "translateX(-50%)", bottom: mobile ? "108px" : "12px", display: "inline-flex", alignItems: "center", gap: "6px", padding: "6px 12px", borderRadius: "var(--radius-full)", background: "var(--paper)", border: "1px solid var(--border-strong)", boxShadow: "var(--shadow-lg)", fontSize: "10.5px", fontWeight: 700, color: "var(--accent)", whiteSpace: "nowrap" }}>
          <span dangerouslySetInnerHTML={{ __html: GL.zoom("var(--accent)") }} />Search this area
        </div>
      )}
      {m.loading && (
        <div style={{ position: "absolute", left: "50%", top: "50%", transform: "translate(-50%,-50%)", padding: "5px 11px", borderRadius: "var(--radius-full)", background: "rgba(255,255,255,0.94)", boxShadow: "var(--shadow-md)", fontFamily: "var(--font-mono)", fontSize: "9.5px", color: "var(--text-body)" }}>searching…</div>
      )}
      {m.empty && (
        <div style={{ position: "absolute", left: "50%", top: "54%", transform: "translate(-50%,-50%)", padding: "5px 11px", borderRadius: "var(--radius-sm)", background: "rgba(255,255,255,0.92)", border: "1px solid var(--border)", fontSize: "9.5px", fontWeight: 600, color: "var(--text-muted)", whiteSpace: "nowrap" }}>No matches in this scope</div>
      )}
      <div style={{ position: "absolute", right: 0, bottom: 0, padding: "1px 4px", background: "rgba(255,255,255,0.7)", fontSize: "7px", color: "var(--grey-500)" }}>© OpenStreetMap · CARTO</div>
    </div>
  );
}

function TXCrumb({ crumb, mobile }) {
  return (
    <div data-design-component="breadcrumb" style={{ position: "absolute", left: "7px", top: mobile ? "58px" : "7px", maxWidth: "calc(100% - 34px)", display: "inline-flex", alignItems: "center", gap: "4px", padding: "5px 9px", borderRadius: "var(--radius-full)", background: "var(--paper)", border: "1px solid var(--border)", boxShadow: "var(--shadow-md)", fontSize: "9.5px", fontWeight: 600, color: "var(--text-muted)", whiteSpace: "nowrap", overflow: "hidden" }}>
      {crumb.map((c, i) => (
        <React.Fragment key={i}>
          {i > 0 && <span style={{ color: "var(--grey-400)" }}>›</span>}
          <span style={{ color: i === crumb.length - 1 ? "var(--text-strong)" : "var(--text-muted)", fontWeight: i === crumb.length - 1 ? 700 : 600 }}>{c}</span>
        </React.Fragment>
      ))}
    </div>
  );
}

function TXPoly({ kind }) {
  const draft = kind === "draft";
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}>
      <polygon points="24,26 62,18 78,44 66,74 34,70 18,48" fill={draft ? "rgba(27,42,69,0.05)" : "rgba(176,92,58,0.14)"} stroke={draft ? "var(--navy-800)" : "var(--copper-500)"} strokeWidth="1" strokeDasharray={draft ? "3 2.5" : "0"} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function TXViewportRect() {
  return (
    <div style={{ position: "absolute", inset: "9px", border: "1.5px dashed var(--navy-800)", borderRadius: "var(--radius-sm)", background: "rgba(27,42,69,0.04)", pointerEvents: "none" }}>
      <span style={{ position: "absolute", left: "6px", top: "-9px", padding: "1px 6px", borderRadius: "var(--radius-xs)", background: "var(--navy-800)", color: "#fff", fontSize: "8px", fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase" }}>Visible map area</span>
    </div>
  );
}

// ---- the four marker families + result-scope chip specimen ------------------
function TXMarker({ mk, focus, mobile }) {
  const pos = { position: "absolute", left: mk.x + "%", top: mk.y + "%", zIndex: 4 };
  if (mk.k === "dest") {
    const w = mobile ? 108 : 92;
    return (
      <div data-design-component="directional-marker" style={{ ...pos, width: w + "px", marginLeft: -w / 2 + "px", transform: "translateY(-50%)", textAlign: "center" }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "1px", padding: "6px 8px 7px", borderRadius: "var(--radius-md)", background: "var(--navy-800)", color: "#fff", border: "1.5px solid rgba(255,255,255,0.45)", boxShadow: "var(--shadow-lg)" }}>
          <span style={{ fontSize: "9px", fontWeight: 700, lineHeight: 1.2, letterSpacing: "-0.01em" }}>{mk.names}</span>
          <span style={{ display: "flex", alignItems: "baseline", gap: "3px" }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: "15px", fontWeight: 800, lineHeight: 1, letterSpacing: "-0.02em" }}>{mk.count}</span>
            <span style={{ fontSize: "7px", fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", color: "rgba(255,255,255,0.72)" }}>homes</span>
          </span>
          {mk.more > 0 && <span style={{ marginTop: "1px", padding: "0 6px", borderRadius: "var(--radius-full)", background: "rgba(255,255,255,0.16)", fontSize: "7.5px", fontWeight: 600, whiteSpace: "nowrap" }}>+{mk.more} areas</span>}
        </div>
        <span style={{ display: "inline-block", marginTop: "3px", padding: "1px 7px", borderRadius: "var(--radius-full)", background: "var(--paper)", boxShadow: "var(--shadow-md)", fontSize: "7.5px", fontWeight: 700, color: "var(--copper-600)", whiteSpace: "nowrap" }}>Tap to explore ›</span>
      </div>
    );
  }
  if (mk.k === "cluster") {
    const w = mobile ? 148 : 152;
    return (
      <div data-design-component="area-cluster" style={{ ...pos, width: w + "px", marginLeft: -w / 2 + "px", transform: "translateY(-50%)", textAlign: "center", zIndex: 5 }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "1px", padding: "6px 8px", borderRadius: "var(--radius-md)", background: "rgba(255,255,255,0.94)", border: "1.5px dashed var(--navy-800)", boxShadow: focus ? "var(--shadow-lg)" : "var(--shadow-md)", transform: focus ? "scale(1.06)" : "none" }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", fontSize: "9px", fontWeight: 700, color: "var(--text-strong)" }}>
            <span dangerouslySetInnerHTML={{ __html: GL.zoom("var(--navy-800)") }} />{mk.names}
          </span>
          <span style={{ fontSize: "8px", fontWeight: 700, color: "var(--navy-700)" }}>+{mk.more} areas with matches</span>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: "9px", color: "var(--text-body)", whiteSpace: "nowrap" }}>{mk.count} listings{mk.schools ? " · " + mk.schools + " schools" : ""}</span>
        </div>
        <span style={{ display: "inline-block", marginTop: "3px", padding: "1px 7px", borderRadius: "var(--radius-full)", background: "var(--navy-800)", color: "#fff", fontSize: "7.5px", fontWeight: 700, whiteSpace: "nowrap" }}>Tap to zoom</span>
      </div>
    );
  }
  if (mk.k === "area") {
    const sel = mk.sel, bg = sel ? "var(--navy-800)" : "var(--paper)", fg = sel ? "#fff" : "var(--navy-800)";
    const bd = sel ? "none" : "1px solid var(--border)";
    return (
      <div data-design-component="area-marker" style={{ ...pos, width: "140px", marginLeft: "-70px", transform: "translateY(-100%)", textAlign: "center" }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: "5px", padding: "4px 9px", borderRadius: "var(--radius-full)", background: bg, color: fg, border: bd, boxShadow: sel ? "var(--shadow-lg)" : "var(--shadow-md)", whiteSpace: "nowrap", transform: sel ? "scale(1.05)" : "none" }}>
          <span dangerouslySetInnerHTML={{ __html: GL.pin(sel ? "#fff" : "var(--copper-500)") }} />
          <span style={{ fontSize: "10px", fontWeight: 700, letterSpacing: "-0.01em" }}>{mk.name}</span>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: "9.5px", color: sel ? "rgba(255,255,255,0.75)" : "var(--text-muted)" }}>{mk.count}</span>
          <span style={{ fontSize: "11px", fontWeight: 700, lineHeight: 1, color: sel ? "rgba(255,255,255,0.75)" : "var(--copper-600)" }}>›</span>
        </div>
        <div style={{ width: "8px", height: "8px", background: bg, borderRight: bd, borderBottom: bd, transform: "rotate(45deg)", margin: "-5px auto 0", boxShadow: sel ? "var(--shadow-lg)" : "var(--shadow-md)" }}></div>
        <span style={{ display: "inline-block", marginTop: "3px", padding: "1px 6px", borderRadius: "var(--radius-full)", background: "var(--paper)", boxShadow: "var(--shadow-sm)", fontSize: "7.5px", fontWeight: 700, color: "var(--copper-600)", whiteSpace: "nowrap" }}>Tap to view homes</span>
      </div>
    );
  }
  if (mk.k === "price") {
    return (
      <div data-design-component="listing-pin" style={{ ...pos, transform: "translate(-50%,-100%)" }}>
        <span style={{ display: "inline-block", padding: "3px 8px", borderRadius: "var(--radius-full)", background: mk.on ? "var(--accent)" : "var(--paper)", color: mk.on ? "#fff" : "var(--navy-800)", border: mk.on ? "none" : "1px solid var(--border)", boxShadow: mk.on ? "var(--shadow-lg)" : "var(--shadow-sm)", fontFamily: "var(--font-mono)", fontSize: "9.5px", fontWeight: 700, whiteSpace: "nowrap" }}>{mk.p}</span>
      </div>
    );
  }
  const size = 26 + Math.min(mk.n, 40) * 0.5;
  return (
    <div data-design-component="listing-cluster" style={{ ...pos, transform: "translate(-50%,-50%)" }}>
      <span style={{ display: "grid", placeItems: "center", width: size + "px", height: size + "px", borderRadius: "var(--radius-full)", background: "var(--accent)", color: "#fff", border: "2px solid rgba(255,255,255,0.85)", boxShadow: "var(--shadow-lg)", fontFamily: "var(--font-mono)", fontSize: "10px", fontWeight: 700 }}>{mk.n}</span>
    </div>
  );
}

// ---- panel blocks ----------------------------------------------------------
const TONE = { info: ["var(--navy-100)", "var(--navy-700)"], warn: ["var(--ochre-50)", "var(--ochre-600)"], error: ["var(--brick-50)", "var(--brick-600)"], ok: ["var(--evergreen-50)", "var(--evergreen-600)"], muted: ["var(--surface-subtle)", "var(--text-muted)"] };
const SCOPE_LABEL = { AREA_SET: "Selected areas", POLYGON: "Drawn area", VIEWPORT: "Visible map area" };

function TXRowCard({ children, tall }) {
  return <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: tall ? "8px 9px" : "7px 9px", background: "var(--surface-card)", border: "1px solid var(--border)", borderRadius: "var(--radius-md)", boxShadow: "var(--shadow-xs)" }}>{children}</div>;
}

function TXBlock({ b, s }) {
  const f = (n) => (n * s).toFixed(1) + "px";
  if (b.t === "actions") return (
    <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "7px", padding: "6px 8px", borderRadius: "var(--radius-md)", background: "var(--plum-tint)", border: "1px solid var(--plum-100)" }}>
        <span style={{ flex: "none", width: (20 * s) + "px", height: (20 * s) + "px", borderRadius: "var(--radius-sm)", background: "var(--plum-600)", display: "grid", placeItems: "center", color: "#fff", fontWeight: 700, fontSize: f(9) }}>S</span>
        <span style={{ flex: 1, fontSize: f(10), fontWeight: 700, color: "var(--text-strong)" }}>Explore schools in Hebbal</span>
        <span style={{ fontSize: f(11), color: "var(--plum-600)", fontWeight: 700 }}>→</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: "7px", padding: "6px 8px", borderRadius: "var(--radius-md)", background: "var(--surface-card)", border: "1px solid var(--border)" }}>
        <span dangerouslySetInnerHTML={{ __html: GL.zoom("var(--grey-400)") }} />
        <span style={{ flex: 1, fontSize: f(9.5), color: "var(--text-muted)" }}>Search within Hebbal properties…</span>
        <span style={{ padding: "2px 7px", borderRadius: "var(--radius-sm)", background: "var(--navy-800)", color: "#fff", fontSize: f(8.5), fontWeight: 600 }}>Search</span>
      </div>
    </div>
  );
  if (b.t === "comparecards") return (
    <div>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
        <span style={{ fontSize: f(7.5), fontWeight: 700, letterSpacing: "var(--tracking-caps)", textTransform: "uppercase", color: "var(--text-muted)" }}>Add up to 2 nearby areas</span>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: f(8.5), color: "var(--text-muted)" }}>{b.count} / 3</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px", marginTop: "6px" }}>
        {b.rows.map((r) => (
          <div key={r.name} style={{ padding: "7px 8px", borderRadius: "var(--radius-md)", background: "var(--surface-card)", border: "1px solid " + (r.preview ? "var(--accent)" : "var(--border)"), boxShadow: r.preview ? "var(--shadow-md)" : "var(--shadow-xs)" }}>
            <div style={{ fontSize: f(11), fontWeight: 700, color: "var(--text-strong)" }}>{r.name}</div>
            <div style={{ fontSize: f(8.5), color: "var(--text-muted)", marginTop: "1px" }}>{r.rel}</div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: f(8.5), color: "var(--text-body)", marginTop: "3px" }}>{r.listings} listings · {r.schools} schools</div>
            <div style={{ display: "flex", gap: "4px", marginTop: "5px" }}>
              <span style={{ flex: 1, textAlign: "center", padding: "3px", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-strong)", fontSize: f(8.5), fontWeight: 600, color: "var(--text-strong)" }}>{r.preview ? "Previewing" : "Preview"}</span>
              <span style={{ flex: 1, textAlign: "center", padding: "3px", borderRadius: "var(--radius-sm)", background: "var(--navy-800)", color: "#fff", fontSize: f(8.5), fontWeight: 700 }}>Add</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
  if (b.t === "schoolsinarea") return (
    <div style={{ padding: "8px 9px", borderRadius: "var(--radius-md)", background: "var(--plum-tint)", border: "1px solid var(--plum-100)" }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
        <span style={{ fontFamily: "var(--font-serif)", fontSize: f(13), fontWeight: 600, color: "var(--text-strong)" }}>Schools in Hebbal</span>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: f(10), fontWeight: 700, color: "var(--plum-600)" }}>{b.n}</span>
      </div>
      <div style={{ marginTop: "3px", display: "inline-flex", alignItems: "center", gap: "4px", padding: "1px 7px", borderRadius: "var(--radius-full)", background: "var(--evergreen-50)", fontSize: f(7.5), fontWeight: 700, color: "var(--evergreen-600)" }}>✓ Your selected area Hebbal is kept</div>
      <div style={{ marginTop: "6px", display: "flex", alignItems: "center", gap: "4px", flexWrap: "wrap" }}>
        <span style={{ fontSize: f(7), fontWeight: 700, letterSpacing: "var(--tracking-caps)", textTransform: "uppercase", color: "var(--text-muted)" }}>Board</span>
        {["All", "CBSE", "ICSE", "State", "IB"].map((c) => <span key={c} style={{ padding: "2px 7px", borderRadius: "var(--radius-full)", fontSize: f(8), fontWeight: 600, background: c === b.board ? "var(--plum-600)" : "var(--surface-card)", color: c === b.board ? "#fff" : "var(--text-body)", border: "1px solid " + (c === b.board ? "var(--plum-600)" : "var(--border)") }}>{c}</span>)}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "4px", marginTop: "6px" }}>
        {b.rows.map((r) => (
          <div key={r.name} style={{ display: "flex", alignItems: "center", gap: "7px", padding: "5px 7px", background: "var(--surface-card)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)" }}>
            <span style={{ flex: "none", width: (16 * s) + "px", height: (16 * s) + "px", borderRadius: "var(--radius-xs)", background: "var(--plum-tint)", display: "grid", placeItems: "center", color: "var(--plum-600)", fontWeight: 700, fontSize: f(8) }}>S</span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: "block", fontSize: f(9.5), fontWeight: 700, color: "var(--text-strong)" }}>{r.name}</span>
              <span style={{ display: "block", fontSize: f(7.5), color: "var(--text-muted)" }}>{r.meta}</span>
            </span>
            <span style={{ flex: "none", padding: "2px 7px", borderRadius: "var(--radius-sm)", background: "var(--plum-600)", color: "#fff", fontSize: f(8), fontWeight: 700 }}>View homes</span>
          </div>
        ))}
      </div>
    </div>
  );
  if (b.t === "schoolradius") return (
    <div style={{ padding: "9px 10px", borderRadius: "var(--radius-md)", background: "var(--plum-tint)", border: "1px solid var(--plum-100)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" }}>
        <span style={{ display: "flex", alignItems: "center", gap: "6px", minWidth: 0 }}>
          <span style={{ flex: "none", width: (18 * s) + "px", height: (18 * s) + "px", borderRadius: "var(--radius-sm)", background: "var(--plum-600)", display: "grid", placeItems: "center", color: "#fff", fontWeight: 700, fontSize: f(8.5) }}>S</span>
          <span style={{ fontSize: f(11), fontWeight: 700, color: "var(--text-strong)" }}>{b.school}</span>
        </span>
        <span style={{ flex: "none", padding: "2px 8px", borderRadius: "var(--radius-md)", border: "1px solid var(--plum-500)", fontSize: f(8.5), fontWeight: 600, color: "var(--plum-600)" }}>Change school</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px", marginTop: "6px" }}>
        <span style={{ display: "inline-flex", padding: "2px", borderRadius: "var(--radius-full)", background: "var(--paper)", border: "1px solid var(--plum-100)" }}>
          {["5 km", "10 km"].map((k) => <span key={k} style={{ padding: "3px 11px", borderRadius: "var(--radius-full)", fontSize: f(8.5), fontWeight: 700, background: k === b.radius ? "var(--plum-600)" : "transparent", color: k === b.radius ? "#fff" : "var(--text-muted)" }}>{k}</span>)}
        </span>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: f(10), fontWeight: 700, color: "var(--text-strong)" }}>{b.n} listings</span>
      </div>
      <div style={{ fontSize: f(8), color: "var(--text-body)", marginTop: "5px", lineHeight: 1.35 }}>Homes near this school — a <b>school-radius</b> result state. Distinct from “schools in Hebbal”.</div>
    </div>
  );
  if (b.t === "head") return (
    <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: "8px" }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: f(8.5), fontWeight: 700, letterSpacing: "var(--tracking-caps)", textTransform: "uppercase", color: "var(--accent)" }}>{b.eyebrow}</div>
        <div style={{ fontFamily: "var(--font-serif)", fontSize: f(15), fontWeight: 600, letterSpacing: "-0.02em", color: "var(--text-strong)", lineHeight: 1.15, marginTop: "2px" }}>{b.title}</div>
      </div>
      {b.stat && <div style={{ flex: "none", textAlign: "right" }}><div style={{ fontFamily: "var(--font-mono)", fontSize: f(14), fontWeight: 700, color: "var(--text-strong)", lineHeight: 1 }}>{b.stat.v}</div><div style={{ fontSize: f(8), color: "var(--text-muted)" }}>{b.stat.l}</div></div>}
    </div>
  );
  if (b.t === "back") return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: "4px", fontSize: f(9.5), fontWeight: 700, color: "var(--accent)" }}><span style={{ fontSize: f(12), lineHeight: 1 }}>‹</span>{b.label}</div>
  );
  if (b.t === "pills") return (
    <div style={{ display: "flex", alignItems: "center", gap: "5px", flexWrap: "wrap" }}>
      <span style={{ fontSize: f(7.5), fontWeight: 700, letterSpacing: "var(--tracking-caps)", textTransform: "uppercase", color: "var(--text-muted)" }}>{b.label}</span>
      {b.items.map((p) => <span key={p} style={{ padding: "2px 7px", borderRadius: "var(--radius-full)", background: "var(--surface-card)", border: "1px solid var(--border)", fontFamily: "var(--font-mono)", fontSize: f(8.5), color: "var(--text-body)" }}>{p}</span>)}
    </div>
  );
  if (b.t === "navrows") return (
    <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
      {b.rows.map((r) => (
        <div key={r.title} data-design-component="directional-card"><TXRowCard>
          <span style={{ flex: "none", width: (24 * s) + "px", height: (24 * s) + "px", borderRadius: "var(--radius-sm)", background: "var(--navy-100)", display: "grid", placeItems: "center" }} dangerouslySetInnerHTML={{ __html: GL.layers("var(--navy-800)") }} />
          <span style={{ minWidth: 0, flex: 1 }}>
            <span style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "6px" }}>
              <span style={{ fontSize: f(11), fontWeight: 700, color: "var(--text-strong)", whiteSpace: "nowrap" }}>{r.title}</span>
              <span style={{ flex: "none", display: "inline-flex", alignItems: "baseline", gap: "3px" }}><span style={{ fontFamily: "var(--font-mono)", fontSize: f(11), fontWeight: 700, color: "var(--text-strong)" }}>{r.count}</span><span style={{ fontSize: f(8), color: "var(--text-muted)" }}>{r.noun}</span></span>
            </span>
            <span style={{ display: "block", fontSize: f(8.5), color: "var(--text-muted)", marginTop: "1px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.names}{r.more ? "  ·  +" + r.more + " areas" : ""}</span>
          </span>
          <span style={{ flex: "none", fontSize: f(12), color: "var(--grey-400)", lineHeight: 1 }}>›</span>
        </TXRowCard></div>
      ))}
    </div>
  );
  if (b.t === "arearows") return (
    <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
      {b.rows.map((r) => (
        <TXRowCard key={r.name}>
          <span style={{ flex: "none", width: (22 * s) + "px", height: (22 * s) + "px", borderRadius: "var(--radius-full)", background: "var(--accent-tint)", display: "grid", placeItems: "center" }} dangerouslySetInnerHTML={{ __html: GL.pin("var(--copper-600)") }} />
          <span style={{ flex: 1, minWidth: 0, fontSize: f(11), fontWeight: 700, color: "var(--text-strong)" }}>{r.name}</span>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: f(9.5), color: "var(--text-body)", whiteSpace: "nowrap" }}>{r.count} listings{r.schools ? " · " + r.schools + " schools" : ""}</span>
          <span style={{ flex: "none", fontSize: f(12), color: "var(--grey-400)", lineHeight: 1 }}>›</span>
        </TXRowCard>
      ))}
    </div>
  );
  if (b.t === "scopebar") {
    const draft = b.draft;
    return (
      <div data-design-component="scope-bar" style={{ padding: "7px 8px", borderRadius: "var(--radius-sm)", background: "var(--surface-card)", border: (draft ? "1.5px dashed var(--border-strong)" : "1px solid var(--border-strong)") }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "6px" }}>
          <span style={{ fontSize: f(7.5), fontWeight: 700, letterSpacing: "var(--tracking-caps)", textTransform: "uppercase", color: draft ? "var(--ochre-600)" : "var(--text-muted)" }}>Result scope — {SCOPE_LABEL[b.kind]}{draft ? " · draft" : ""}</span>
          {b.total != null && <span style={{ flex: "none", fontFamily: "var(--font-mono)", fontSize: f(10), fontWeight: 700, color: b.total === 0 ? "var(--brick-600)" : "var(--text-strong)" }}>{b.total} listings</span>}
          {b.loading && <span style={{ flex: "none", fontFamily: "var(--font-mono)", fontSize: f(9), color: "var(--text-muted)" }}>loading…</span>}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "4px", flexWrap: "wrap", marginTop: "5px" }}>
          {b.chips.map((c) => (
            <span key={c} style={{ display: "inline-flex", alignItems: "center", gap: "4px", padding: "3px 6px", borderRadius: "var(--radius-xs)", background: b.focus === c ? "var(--navy-800)" : "var(--surface-subtle)", color: b.focus === c ? "#fff" : "var(--text-strong)", border: draft ? "1px dashed var(--border-strong)" : "1px solid var(--border)", fontSize: f(9.5), fontWeight: 600 }}>
              <span dangerouslySetInnerHTML={{ __html: (b.kind === "AREA_SET" ? GL.pin(b.focus === c ? "#fff" : "var(--copper-500)") : GL.zoom(b.focus === c ? "#fff" : "var(--navy-700)")) }} />{c}<span style={{ opacity: 0.55, fontSize: f(10) }}>×</span>
            </span>
          ))}
          {(b.actions || []).map((a) => <span key={a} style={{ padding: "3px 7px", borderRadius: "var(--radius-full)", border: "1px solid var(--border-strong)", fontSize: f(9), fontWeight: 600, color: "var(--text-body)", whiteSpace: "nowrap" }}>{a}</span>)}
        </div>
      </div>
    );
  }
  if (b.t === "suggestions") return (
    <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
      <span style={{ fontSize: f(7.5), fontWeight: 700, letterSpacing: "var(--tracking-caps)", textTransform: "uppercase", color: "var(--text-muted)" }}>Nearby suggestions</span>
      {b.rows.map((r) => (
        <TXRowCard key={r.name}>
          <span style={{ flex: "none", width: (20 * s) + "px", height: (20 * s) + "px", borderRadius: "var(--radius-full)", background: "var(--accent)", color: "#fff", display: "grid", placeItems: "center", fontSize: f(12), fontWeight: 700, lineHeight: 1 }}>+</span>
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: "block", fontSize: f(10.5), fontWeight: 700, color: "var(--text-strong)" }}>{r.name}</span>
            <span style={{ display: "block", fontSize: f(8.5), color: "var(--text-muted)" }}>{r.rel}</span>
          </span>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: f(9), color: "var(--text-body)", whiteSpace: "nowrap" }}>{r.listings} listings · {r.schools} schools</span>
        </TXRowCard>
      ))}
    </div>
  );
  if (b.t === "cta") return (
    <div>
      <div style={{ padding: (7 * s) + "px 10px", borderRadius: "var(--radius-md)", background: "var(--accent)", color: "#fff", textAlign: "center", fontSize: f(11), fontWeight: 700, boxShadow: "var(--shadow-sm)" }}>{b.label}</div>
      {b.sub && <div style={{ marginTop: "3px", textAlign: "center", fontSize: f(8.5), color: "var(--text-muted)" }}>{b.sub}</div>}
    </div>
  );
  if (b.t === "listings") return (
    <div>
      {b.label && <div style={{ fontSize: f(8.5), fontWeight: 700, color: "var(--text-body)", marginBottom: "4px" }}>{b.label}</div>}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0,1fr))", gap: "6px" }}>
        {[0, 1].slice(0, b.n).map((i) => (
          <div key={i} data-design-component="listing-card" style={{ background: "var(--surface-card)", border: "1px solid var(--border)", borderRadius: "var(--radius-md)", overflow: "hidden", boxShadow: "var(--shadow-sm)" }}>
            <div style={{ height: (40 * s) + "px", background: "repeating-linear-gradient(45deg, var(--canvas-200) 0 6px, var(--stone-300) 6px 12px)", position: "relative" }}>
              <span style={{ position: "absolute", left: "4px", top: "4px", padding: "1px 5px", borderRadius: "var(--radius-full)", background: "var(--trust-verified-bg)", color: "var(--trust-verified-fg)", fontSize: f(7), fontWeight: 700 }}>Verified</span>
            </div>
            <div style={{ padding: "5px 6px 6px" }}>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: f(11), fontWeight: 700, color: "var(--text-strong)" }}>{i ? "₹92 L" : "₹1.05 Cr"}</div>
              <div style={{ fontSize: f(8.5), color: "var(--text-body)", marginTop: "1px" }}>{i ? "2 BHK · Nagawara" : "3 BHK · Hebbal"}</div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: f(7.5), color: "var(--text-muted)", marginTop: "2px" }}>{i ? "1,120 sq.ft" : "1,450 sq.ft"}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
  if (b.t === "skeleton") return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0,1fr))", gap: "6px" }}>
      {[0, 1].map((i) => <div key={i} style={{ height: (74 * s) + "px", borderRadius: "var(--radius-md)", background: "linear-gradient(100deg, var(--canvas-200) 30%, var(--stone-300) 50%, var(--canvas-200) 70%)", border: "1px solid var(--border)" }} />)}
    </div>
  );
  if (b.t === "note" || b.t === "subset") {
    const tone = TONE[b.tone] || TONE.info;
    return (
      <div style={{ display: "flex", alignItems: "center", gap: "6px", padding: "5px 8px", borderRadius: "var(--radius-sm)", background: b.t === "subset" ? "var(--surface-subtle)" : tone[0] }}>
        <span style={{ flex: "none", width: "5px", height: "5px", borderRadius: "var(--radius-full)", background: b.t === "subset" ? "var(--navy-700)" : tone[1] }} />
        <span style={{ flex: 1, fontSize: f(9), color: "var(--text-body)", lineHeight: 1.35 }}>{b.text}</span>
        {b.action && <span style={{ flex: "none", fontSize: f(9), fontWeight: 700, color: "var(--accent)", whiteSpace: "nowrap" }}>{b.action}</span>}
      </div>
    );
  }
  if (b.t === "relax") return (
    <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
      <span style={{ fontSize: f(7.5), fontWeight: 700, letterSpacing: "var(--tracking-caps)", textTransform: "uppercase", color: "var(--text-muted)" }}>{b.label}</span>
      {b.rows.map((r) => (
        <div key={r.label} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px", padding: "6px 8px", background: "var(--surface-card)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)" }}>
          <span style={{ fontSize: f(9.5), color: "var(--text-strong)", fontWeight: 600 }}>{r.label}</span>
          <span style={{ flex: "none", fontFamily: "var(--font-mono)", fontSize: f(9), color: "var(--accent)", fontWeight: 700 }}>{r.count}</span>
        </div>
      ))}
    </div>
  );
  if (b.t === "zero") return (
    <div style={{ padding: "8px 9px", borderRadius: "var(--radius-md)", background: "var(--ochre-50)", border: "1px solid var(--ochre-600)" }}>
      <div style={{ fontSize: f(11), fontWeight: 700, color: "var(--text-strong)", lineHeight: 1.25 }}>{b.title}</div>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: f(8.5), color: "var(--text-muted)", marginTop: "2px" }}>{b.sub}</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "4px", marginTop: "6px" }}>
        {b.actions.map((a, i) => <span key={a} style={{ padding: "4px 8px", borderRadius: "var(--radius-full)", background: i === 0 ? "var(--accent)" : "var(--paper)", color: i === 0 ? "#fff" : "var(--text-strong)", border: i === 0 ? "none" : "1px solid var(--border-strong)", fontSize: f(9), fontWeight: 600 }}>{a}</span>)}
      </div>
      <div style={{ marginTop: "6px", fontSize: f(9), color: "var(--text-body)" }}>8 matches in Kempapura · 6 matches in Amruthahalli</div>
    </div>
  );
  if (b.t === "confirm") return (
    <div style={{ padding: "10px", borderRadius: "var(--radius-md)", background: "var(--surface-card)", border: "1px solid var(--border-strong)", boxShadow: "var(--shadow-lg)" }}>
      <div style={{ fontSize: f(11.5), fontWeight: 700, color: "var(--text-strong)", lineHeight: 1.25 }}>{b.title}</div>
      <div style={{ fontSize: f(9.5), color: "var(--text-body)", lineHeight: 1.4, marginTop: "4px", textWrap: "pretty" }}>{b.body}</div>
      <div style={{ display: "flex", gap: "5px", marginTop: "8px" }}>
        <span style={{ padding: "5px 10px", borderRadius: "var(--radius-md)", background: "var(--accent)", color: "#fff", fontSize: f(10), fontWeight: 700 }}>{b.primary}</span>
        <span style={{ padding: "5px 10px", borderRadius: "var(--radius-md)", border: "1px solid var(--border-strong)", color: "var(--text-strong)", fontSize: f(10), fontWeight: 600 }}>{b.secondary}</span>
      </div>
    </div>
  );
  if (b.t === "alertform") return (
    <div style={{ padding: "9px", borderRadius: "var(--radius-md)", background: "var(--surface-card)", border: "1px solid var(--border-strong)", boxShadow: "var(--shadow-md)" }}>
      <div style={{ fontFamily: "var(--font-serif)", fontSize: f(13), fontWeight: 600, color: "var(--text-strong)" }}>Create alert</div>
      {[["Areas", b.areas], ["Filters", b.filters], ["Frequency", b.freq]].map(([k, v]) => (
        <div key={k} style={{ marginTop: "6px" }}>
          <div style={{ fontSize: f(7.5), fontWeight: 700, letterSpacing: "var(--tracking-caps)", textTransform: "uppercase", color: "var(--text-muted)" }}>{k}</div>
          <div style={{ fontFamily: k === "Areas" ? "var(--font-sans)" : "var(--font-mono)", fontSize: f(10), color: "var(--text-strong)", fontWeight: 600, marginTop: "1px" }}>{v}</div>
        </div>
      ))}
      <div style={{ marginTop: "8px", padding: "6px", borderRadius: "var(--radius-md)", background: "var(--accent)", color: "#fff", textAlign: "center", fontSize: f(10.5), fontWeight: 700 }}>Create alert</div>
    </div>
  );
  if (b.t === "alertlist") return (
    <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
      {b.rows.map((r) => (
        <TXRowCard key={r.label} tall>
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: "block", fontSize: f(10.5), fontWeight: 700, color: "var(--text-strong)" }}>{r.label}</span>
            <span style={{ display: "block", fontFamily: "var(--font-mono)", fontSize: f(8), color: "var(--text-muted)", marginTop: "1px" }}>{r.kind} · {r.freq} · {r.checked}</span>
          </span>
          <span style={{ flex: "none", display: "flex", alignItems: "center", gap: "4px" }}>
            {r.n > 0 && <span style={{ padding: "1px 6px", borderRadius: "var(--radius-full)", background: "var(--accent-tint)", color: "var(--copper-600)", fontFamily: "var(--font-mono)", fontSize: f(8), fontWeight: 700 }}>{r.n} new</span>}
            <span style={{ padding: "1px 6px", borderRadius: "var(--radius-full)", background: r.status === "Active" ? "var(--evergreen-50)" : "var(--ochre-50)", color: r.status === "Active" ? "var(--evergreen-600)" : "var(--ochre-600)", fontSize: f(8), fontWeight: 700 }}>{r.status}</span>
          </span>
        </TXRowCard>
      ))}
    </div>
  );
  if (b.t === "schools") return (
    <div style={{ display: "flex", alignItems: "center", gap: "7px", padding: "7px 8px", borderRadius: "var(--radius-md)", background: "var(--plum-tint)", border: "1px solid var(--plum-100)" }}>
      <span style={{ flex: "none", width: (22 * s) + "px", height: (22 * s) + "px", borderRadius: "var(--radius-sm)", background: "var(--plum-600)", display: "grid", placeItems: "center" }}><span style={{ color: "#fff", fontSize: f(10), fontWeight: 700 }}>S</span></span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: "block", fontSize: f(10), fontWeight: 700, color: "var(--text-strong)" }}>{b.title} · <span style={{ fontFamily: "var(--font-mono)" }}>{b.n}</span></span>
        <span style={{ display: "block", fontSize: f(8.5), color: "var(--text-muted)", lineHeight: 1.3 }}>{b.sub}</span>
      </span>
    </div>
  );
  if (b.t === "detail") return (
    <div style={{ borderRadius: "var(--radius-md)", background: "var(--surface-card)", border: "1px solid var(--border)", overflow: "hidden", boxShadow: "var(--shadow-sm)" }}>
      <div style={{ height: (76 * s) + "px", background: "repeating-linear-gradient(45deg, var(--canvas-200) 0 8px, var(--stone-300) 8px 16px)" }} />
      <div style={{ padding: "8px 9px 10px" }}>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: f(15), fontWeight: 700, color: "var(--text-strong)" }}>{b.price}</div>
        <div style={{ fontSize: f(10.5), fontWeight: 600, color: "var(--text-strong)", marginTop: "2px" }}>{b.title}</div>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: f(8.5), color: "var(--text-muted)", marginTop: "3px" }}>{b.meta}</div>
      </div>
    </div>
  );
  return null;
}

function TXPanel({ blocks, s, pad }) {
  return (
    <div data-design-component="results-panel" style={{ flex: 1, minWidth: 0, background: "var(--background)", padding: pad, display: "flex", flexDirection: "column", gap: (6 * s) + "px", overflow: "hidden" }}>
      {blocks.map((b, i) => <TXBlock key={i} b={b} s={s} />)}
    </div>
  );
}

// ---- frames ----------------------------------------------------------------
const DW = 560, DH = 340;

function TXDesktopFrame({ frame }) {
  const mapW = Math.round(DW * 0.52);
  return (
    <div style={{ width: DW + "px", height: DH + "px", borderRadius: "var(--radius-lg)", overflow: "hidden", border: "1px solid var(--border-strong)", background: "var(--paper)", boxShadow: "var(--shadow-md)", display: "flex", flexDirection: "column" }}>
      <div style={{ flex: "none", height: "26px", display: "flex", alignItems: "center", gap: "7px", padding: "0 8px", background: "var(--paper)", borderBottom: "1px solid var(--border)" }}>
        <span style={{ width: "14px", height: "14px", borderRadius: "var(--radius-xs)", background: "var(--navy-800)", display: "grid", placeItems: "center" }} dangerouslySetInnerHTML={{ __html: GL.pin("#fff") }} />
        <span style={{ fontSize: "9px", fontWeight: 700, color: "var(--text-strong)" }}>Bangalore Property Tracker</span>
        <span style={{ marginLeft: "6px", display: "inline-flex", borderRadius: "var(--radius-full)", background: "var(--surface-subtle)", padding: "1px" }}>
          <span style={{ padding: "1px 7px", borderRadius: "var(--radius-full)", background: "var(--navy-800)", color: "#fff", fontSize: "8px", fontWeight: 700 }}>Buy</span>
          <span style={{ padding: "1px 7px", fontSize: "8px", fontWeight: 600, color: "var(--text-muted)" }}>Rent</span>
        </span>
        {frame.search && <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", marginLeft: "4px", padding: "2px 7px", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-strong)", background: "var(--input-bg)", fontSize: "8.5px", color: "var(--text-strong)" }}><span dangerouslySetInnerHTML={{ __html: GL.zoom("var(--accent)") }} />{frame.search}</span>}
        <span style={{ marginLeft: "auto", fontSize: "8px", fontWeight: 700, color: "var(--text-muted)" }}>Areas</span>
      </div>
      <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
        <TXMapPlate frame={frame} w={mapW} h={DH - 26} />
        <TXPanel blocks={frame.panel ? frame.panel.blocks : []} s={1} pad="8px" />
      </div>
    </div>
  );
}

function TXMobileFrame({ frame }) {
  const W = 390, H = 844;
  const isMap = frame.kind === "map";
  return (
    <div style={{ width: W + "px", height: H + "px", borderRadius: "22px", overflow: "hidden", border: "1px solid var(--border-strong)", background: "var(--background)", boxShadow: "var(--shadow-lg)", display: "flex", flexDirection: "column", position: "relative" }}>
      <div style={{ flex: "none", height: "44px", display: "flex", alignItems: "center", gap: "8px", padding: "0 14px", background: "var(--paper)", borderBottom: "1px solid var(--border)" }}>
        <span style={{ width: "22px", height: "22px", borderRadius: "var(--radius-sm)", background: "var(--navy-800)", display: "grid", placeItems: "center" }} dangerouslySetInnerHTML={{ __html: GL.pin("#fff") }} />
        <span style={{ fontSize: "12.5px", fontWeight: 700, color: "var(--text-strong)" }}>Bangalore Property Tracker</span>
        <span style={{ marginLeft: "auto", fontSize: "10.5px", fontWeight: 700, color: "var(--text-muted)" }}>Areas</span>
      </div>
      {!isMap && (
        <div style={{ flex: "none", padding: "8px 14px", background: "var(--paper)", borderBottom: "1px solid var(--border)" }}>
          <div data-design-component="breadcrumb" style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "11px", fontWeight: 600, color: "var(--text-muted)", overflow: "hidden", whiteSpace: "nowrap" }}>
            {frame.crumb.map((c, i) => <React.Fragment key={i}>{i > 0 && <span style={{ color: "var(--grey-400)" }}>›</span>}<span style={{ color: i === frame.crumb.length - 1 ? "var(--text-strong)" : "var(--text-muted)", fontWeight: i === frame.crumb.length - 1 ? 700 : 600 }}>{c}</span></React.Fragment>)}
          </div>
        </div>
      )}
      {isMap
        ? <div style={{ flex: 1, position: "relative", minHeight: 0 }}><TXMapPlate frame={frame} w={W} h={H - 44} mobile /></div>
        : <TXPanel blocks={frame.panel ? frame.panel.blocks : []} s={1.35} pad="14px" />}
      {isMap && frame.sheet && (
        <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, padding: "12px 14px 18px", background: "var(--paper)", borderRadius: "16px 16px 0 0", boxShadow: "var(--shadow-xl)", borderTop: "1px solid var(--border)" }}>
          <div style={{ width: "36px", height: "4px", borderRadius: "999px", background: "var(--stone-400)", margin: "0 auto 10px" }} />
          {frame.sheet.scope && <div style={{ display: "inline-flex", alignItems: "center", gap: "5px", padding: "3px 8px", marginBottom: "7px", borderRadius: "var(--radius-xs)", border: "1px solid var(--border-strong)", background: "var(--surface-subtle)", fontSize: "11px", fontWeight: 700, color: "var(--text-strong)" }}><span dangerouslySetInnerHTML={{ __html: GL.zoom("var(--navy-700)") }} />Result scope — Visible map area</div>}
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "10px" }}>
            <span style={{ fontSize: "14px", fontWeight: 700, color: "var(--text-strong)" }}>{frame.sheet.title}</span>
            {frame.sheet.action && <span style={{ flex: "none", fontSize: "12px", fontWeight: 700, color: "var(--accent)" }}>{frame.sheet.action}</span>}
          </div>
          {(frame.sheet.rows || []).map((r) => (
            <div key={r.name} style={{ display: "flex", alignItems: "center", gap: "9px", marginTop: "8px", padding: "9px 10px", background: "var(--surface-card)", border: "1px solid var(--border)", borderRadius: "var(--radius-md)" }}>
              <span style={{ width: "26px", height: "26px", borderRadius: "var(--radius-full)", background: "var(--accent-tint)", display: "grid", placeItems: "center" }} dangerouslySetInnerHTML={{ __html: GL.pin("var(--copper-600)") }} />
              <span style={{ flex: 1, fontSize: "13px", fontWeight: 700, color: "var(--text-strong)" }}>{r.name}</span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: "12px", color: "var(--text-body)" }}>{r.count} listings</span>
              <span style={{ color: "var(--grey-400)" }}>›</span>
            </div>
          ))}
          <div style={{ marginTop: "12px", padding: "11px", borderRadius: "var(--radius-md)", border: "1px solid var(--border-strong)", textAlign: "center", fontSize: "13px", fontWeight: 700, color: "var(--text-strong)" }}>List</div>
        </div>
      )}
      {!isMap && frame.sticky && (
        <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, padding: "12px 14px 18px", background: "rgba(255,255,255,0.96)", borderTop: "1px solid var(--border)" }}>
          <div style={{ padding: "12px", borderRadius: "var(--radius-md)", background: frame.sticky.ghost ? "var(--paper)" : "var(--accent)", border: frame.sticky.ghost ? "1px solid var(--border-strong)" : "none", color: frame.sticky.ghost ? "var(--text-strong)" : "#fff", textAlign: "center", fontSize: "14px", fontWeight: 700 }}>{frame.sticky.label}</div>
        </div>
      )}
    </div>
  );
}

function TXFrame({ frame }) {
  return frame.device === "mobile" ? <TXMobileFrame frame={frame} /> : <TXDesktopFrame frame={frame} />;
}

Object.assign(window, { TXFrame, TXMarker, TXMapPlate, TXBlock, TXPanel, TXGL: GL, TXDims: { DW, DH } });
