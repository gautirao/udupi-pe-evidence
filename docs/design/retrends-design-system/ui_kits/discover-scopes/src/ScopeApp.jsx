// Discover — Result Scopes · prototype shell + state player.
// Renders ONE named state at 1366×768 (desktop) or 390×844 (mobile), inside the
// existing Discover composition: map left / panel right on desktop, list-first
// with a map alternative on mobile.
const { Icon: AI } = window.ReTrendsDesignSystem_f37966;

function TopNav({ compact, signedOut }) {
  return (
    <header style={{ height: compact ? "52px" : "58px", flex: "none", display: "flex", alignItems: "center", gap: compact ? "12px" : "26px", padding: compact ? "0 14px" : "0 24px", background: "var(--paper)", borderBottom: "1px solid var(--border)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "10px", minWidth: 0 }}>
        <div style={{ width: "30px", height: "30px", flex: "none", borderRadius: "var(--radius-md)", background: "var(--navy-800)", display: "flex", alignItems: "center", justifyContent: "center" }}><AI name="map-pin" size={17} color="#fff" /></div>
        <div style={{ lineHeight: 1.1, minWidth: 0 }}>
          <div style={{ fontSize: compact ? "13px" : "14.5px", fontWeight: 700, letterSpacing: "-0.01em", color: "var(--text-strong)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>Bangalore Property Tracker</div>
          {!compact && <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>Real estate trends</div>}
        </div>
      </div>
      {!compact && (
        <nav style={{ display: "flex", alignItems: "center", gap: "4px" }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: "7px", padding: "8px 12px", borderRadius: "var(--radius-md)", fontSize: "13.5px", fontWeight: 600, color: "var(--text-strong)" }}><AI name="building" size={16} color="var(--navy-800)" />Discover</span>
        </nav>
      )}
      <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "14px" }}>
        <span style={{ border: "1px solid var(--border-strong)", background: "var(--paper)", padding: compact ? "6px 12px" : "7px 16px", borderRadius: "var(--radius-md)", fontSize: "13px", fontWeight: 600, color: "var(--text-strong)", whiteSpace: "nowrap" }}>{signedOut ? "Sign in" : "Priya R."}</span>
      </div>
    </header>
  );
}

// ---------------- the product surface for one state ----------------
function Surface({ st, compact, mobileView, setMobileView, onGo }) {
  const blocks = compact && st.mobileBlocks ? st.mobileBlocks : st.blocks;
  const map = compact && st.mobileMap ? st.mobileMap : st.map;
  const signedOut = !!st.signedOut;

  if (!compact) {
    return (
      <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "var(--background)" }}>
        <TopNav signedOut={signedOut} />
        <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
          <div style={{ flex: "0 0 50%", position: "relative", borderRight: "1px solid var(--border)" }}>
            <window.RSMap map={map} onAction={(a) => a && onGo(a.to)} />
          </div>
          <div className="rs-scroll" style={{ flex: 1, minWidth: 0, overflowY: "auto", padding: "20px 24px 32px" }}>
            <window.RSPanel blocks={blocks} onGo={onGo} />
          </div>
        </div>
      </div>
    );
  }

  // ---- mobile: list-first. The full-screen map is an alternative presentation
  //      of the SAME result scope — never a deeper hierarchy level. ----
  const onMap = mobileView === "map";
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "var(--background)" }}>
      <TopNav compact signedOut={signedOut} />
      {onMap ? (
        <div style={{ flex: 1, position: "relative", minHeight: 0 }}>
          <window.RSMap map={map} compact onAction={(a) => a && onGo(a.to)} />
        </div>
      ) : (
        <div className="rs-scroll" style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "14px 14px 18px" }}>
          <window.RSPanel blocks={blocks} compact onGo={onGo} />
        </div>
      )}
      <div style={{ flex: "none", borderTop: "1px solid var(--border)", background: "var(--paper)", padding: "9px 12px 12px", boxShadow: "0 -4px 18px rgba(20,26,40,0.07)" }}>
        {st.mobileCta && (
          <div style={{ marginBottom: "9px" }}>
            <window.RSBtn variant={st.mobileCta.variant || "primary"} full onClick={() => onGo(st.mobileCta.to)}>{st.mobileCta.label}</window.RSBtn>
          </div>
        )}
        <div style={{ display: "flex", gap: "8px" }}>
          <div style={{ display: "inline-flex", flex: 1, background: "var(--input-bg)", borderRadius: "var(--radius-full)", padding: "3px", border: "1px solid var(--border)" }}>
            {[["list", "List"], ["map", "View map"]].map(([k, label]) => {
              const on = mobileView === k;
              return (
                <button key={k} onClick={() => setMobileView(k)} style={{ flex: 1, border: "none", cursor: "pointer", padding: "8px 12px", borderRadius: "var(--radius-full)", fontFamily: "var(--font-sans)", fontSize: "13px", fontWeight: 700, background: on ? "var(--paper)" : "transparent", color: on ? "var(--text-strong)" : "var(--text-muted)", boxShadow: on ? "var(--shadow-sm)" : "none" }}>{label}</button>
              );
            })}
          </div>
          <span style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "0 12px", borderRadius: "var(--radius-full)", border: "1px solid var(--border)", background: "var(--surface-subtle)", fontFamily: "var(--font-sans)", fontSize: "11.5px", fontWeight: 700, color: "var(--text-muted)", whiteSpace: "nowrap" }}>
            <window.RSScopeGlyph kind={st.scopeKind === "polygon" ? "poly" : st.scopeKind === "viewport" ? "frame" : "pin"} size={13} color="var(--navy-800)" />{st.scopeShort || "Scope"}
          </span>
        </div>
      </div>
    </div>
  );
}

// ---------------- annotation rail ----------------
const NOTE_ORDER = [
  ["hierBack", "Hierarchy Back"], ["browserBack", "Browser Back"], ["edit", "Edit areas"],
  ["clear", "Clear selected areas"], ["returnScope", "Return to selected areas"], ["listMap", "List / Map toggle"],
  ["commit", "Search / Show listings"], ["propBack", "Back to results"],
];

function Rail({ st, all, device, setDevice, onGo }) {
  const idx = all.findIndex((s) => s.id === st.id);
  const prev = all[idx - 1], next = all[idx + 1];
  return (
    <aside className="rs-scroll" style={{ width: "352px", flex: "none", overflowY: "auto", background: "var(--paper)", borderLeft: "1px solid var(--border)", padding: "20px 20px 40px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "10px", flexWrap: "wrap" }}>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: "11px", fontWeight: 700, padding: "3px 8px", borderRadius: "var(--radius-sm)", background: "var(--navy-800)", color: "#fff" }}>{st.id}</span>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: "11px", fontWeight: 700, padding: "3px 8px", borderRadius: "var(--radius-sm)", background: "var(--accent-tint)", color: "var(--copper-600)" }}>{st.issue}</span>
        <span style={{ fontSize: "11px", fontWeight: 600, color: "var(--text-muted)" }}>Group {st.group}</span>
      </div>
      <h1 style={{ margin: "0 0 6px", fontFamily: "var(--font-serif)", fontSize: "21px", fontWeight: 600, letterSpacing: "-0.02em", color: "var(--text-strong)", lineHeight: 1.22 }}>{st.title}</h1>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: "11px", color: "var(--text-muted)", marginBottom: "14px" }}>{st.name}</div>
      {st.ac && (
        <div style={{ background: "var(--surface-subtle)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", padding: "12px 13px", marginBottom: "16px" }}>
          <div style={{ fontSize: "10.5px", fontWeight: 700, letterSpacing: "var(--tracking-caps)", textTransform: "uppercase", color: "var(--text-muted)", marginBottom: "6px" }}>Acceptance criterion represented</div>
          <p style={{ margin: 0, fontSize: "12.5px", lineHeight: 1.55, color: "var(--text-body)", textWrap: "pretty" }}>{st.ac}</p>
        </div>
      )}
      {st.intent && (
        <div style={{ marginBottom: "16px" }}>
          <div style={{ fontSize: "10.5px", fontWeight: 700, letterSpacing: "var(--tracking-caps)", textTransform: "uppercase", color: "var(--text-muted)", marginBottom: "6px" }}>What this state proves</div>
          <p style={{ margin: 0, fontSize: "13px", lineHeight: 1.6, color: "var(--text-body)", textWrap: "pretty" }}>{st.intent}</p>
        </div>
      )}
      {st.notes && (
        <div style={{ marginBottom: "16px" }}>
          <div style={{ fontSize: "10.5px", fontWeight: 700, letterSpacing: "var(--tracking-caps)", textTransform: "uppercase", color: "var(--text-muted)", marginBottom: "8px" }}>Back &amp; history behaviour</div>
          <div style={{ display: "flex", flexDirection: "column", gap: "1px", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", overflow: "hidden" }}>
            {NOTE_ORDER.filter(([k]) => st.notes[k]).map(([k, label], i) => (
              <div key={k} style={{ display: "flex", gap: "10px", padding: "9px 11px", background: i % 2 ? "var(--surface-subtle)" : "var(--surface-card)" }}>
                <span style={{ flex: "none", width: "104px", fontSize: "11px", fontWeight: 700, color: "var(--navy-800)" }}>{label}</span>
                <span style={{ flex: 1, fontSize: "11.5px", lineHeight: 1.5, color: "var(--text-body)", textWrap: "pretty" }}>{st.notes[k]}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {st.sync && (
        <div style={{ marginBottom: "16px" }}>
          <div style={{ fontSize: "10.5px", fontWeight: 700, letterSpacing: "var(--tracking-caps)", textTransform: "uppercase", color: "var(--text-muted)", marginBottom: "6px" }}>Map ↔ panel</div>
          <p style={{ margin: 0, fontSize: "12.5px", lineHeight: 1.6, color: "var(--text-body)", textWrap: "pretty" }}>{st.sync}</p>
        </div>
      )}
      {st.tryIt && st.tryIt.length > 0 && (
        <div style={{ marginBottom: "18px" }}>
          <div style={{ fontSize: "10.5px", fontWeight: 700, letterSpacing: "var(--tracking-caps)", textTransform: "uppercase", color: "var(--text-muted)", marginBottom: "8px" }}>Clickable in this mock</div>
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            {st.tryIt.map((t) => (
              <button key={t.label} onClick={() => onGo(t.to)} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px", textAlign: "left", padding: "9px 11px", borderRadius: "var(--radius-md)", border: "1px solid var(--border)", background: "var(--surface-card)", cursor: "pointer", fontFamily: "var(--font-sans)", fontSize: "12.5px", fontWeight: 600, color: "var(--text-strong)" }}>
                {t.label}<AI name="arrow-right" size={14} color="var(--grey-400)" />
              </button>
            ))}
          </div>
        </div>
      )}
      <div style={{ display: "flex", gap: "8px", marginBottom: "12px" }}>
        <window.RSBtn size="sm" variant="outline" disabled={!prev} onClick={() => prev && onGo(prev.id)}>‹ Previous</window.RSBtn>
        <window.RSBtn size="sm" variant="outline" disabled={!next} onClick={() => next && onGo(next.id)}>Next ›</window.RSBtn>
      </div>
      <div style={{ display: "inline-flex", background: "var(--input-bg)", borderRadius: "var(--radius-full)", padding: "3px", border: "1px solid var(--border)", marginBottom: "12px" }}>
        {[["desktop", "Desktop 1366×768"], ["mobile", "Mobile 390×844"]].map(([k, label]) => {
          const on = device === k;
          return <button key={k} onClick={() => setDevice(k)} style={{ border: "none", cursor: "pointer", padding: "6px 12px", borderRadius: "var(--radius-full)", fontFamily: "var(--font-sans)", fontSize: "11.5px", fontWeight: 700, background: on ? "var(--navy-800)" : "transparent", color: on ? "#fff" : "var(--text-muted)" }}>{label}</button>;
        })}
      </div>
      <a href="index.html" style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "12.5px", fontWeight: 600 }}>All states index</a>
    </aside>
  );
}

function App() {
  const all = window.RS_STATES;
  const params = new URLSearchParams(location.search);
  const [id, setId] = React.useState(() => (all.some((s) => s.id === params.get("state")) ? params.get("state") : all[0].id));
  const [device, setDevice] = React.useState(() => (params.get("device") === "mobile" ? "mobile" : "desktop"));
  const [mobileView, setMobileView] = React.useState("list");
  const [scale, setScale] = React.useState(1);
  const holder = React.useRef(null);
  const st = all.find((s) => s.id === id) || all[0];
  const compact = device === "mobile";
  const W = compact ? 390 : 1366, H = compact ? 844 : 768;

  React.useEffect(() => {
    const p = new URLSearchParams(); p.set("state", id); if (device === "mobile") p.set("device", "mobile");
    try { history.replaceState(null, "", location.pathname + "?" + p.toString()); } catch (e) { }
  }, [id, device]);

  React.useEffect(() => { setMobileView(st.mobileView || "list"); }, [id, device]);

  React.useEffect(() => {
    const fit = () => {
      if (!holder.current) return;
      const r = holder.current.getBoundingClientRect();
      setScale(Math.min(1, (r.width - 48) / W, (r.height - 48) / H));
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [W, H]);

  const go = (to) => { if (to && all.some((s) => s.id === to)) setId(to); };

  return (
    <div style={{ display: "flex", height: "100vh", background: "var(--canvas-200, #EFEDE8)" }}>
      <div ref={holder} style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", backgroundImage: "radial-gradient(var(--stone-400, #C9C4B8) 1px, transparent 1px)", backgroundSize: "22px 22px" }}>
        <div style={{ width: W * scale, height: H * scale, flex: "none" }}>
          <div style={{ width: W, height: H, transform: `scale(${scale})`, transformOrigin: "top left", background: "var(--background)", borderRadius: compact ? "26px" : "10px", overflow: "hidden", boxShadow: "0 22px 60px rgba(20,26,40,0.22)", border: "1px solid var(--border-strong)" }}>
            <Surface st={st} compact={compact} mobileView={mobileView} setMobileView={setMobileView} onGo={go} />
          </div>
        </div>
      </div>
      <Rail st={st} all={all} device={device} setDevice={setDevice} onGo={go} />
    </div>
  );
}

window.RSStateApp = App;
