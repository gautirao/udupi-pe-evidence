// Transitions page — composition. Hero, sticky journey selector, marker legend,
// one player per journey (Before → action → After + delta annotations), a
// full-flow overview, the journey-step → issue → state mapping table and the
// decisions that genuinely remain open.
const { Icon: PIcon, Badge: PBadge } = window.ReTrendsDesignSystem_f37966;
const SPLAYER = (id, device) => `../discover-scopes/state.html?state=${id}&device=${device || "desktop"}`;

function TXEyebrow({ children, tone }) {
  return <div style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "var(--tracking-caps)", textTransform: "uppercase", color: tone || "var(--accent)" }}>{children}</div>;
}

function TXHero() {
  return (
    <header style={{ background: "linear-gradient(180deg, var(--paper) 0%, var(--background) 100%)", borderBottom: "1px solid var(--border)" }}>
      <div style={{ maxWidth: "1280px", margin: "0 auto", padding: "40px 24px 30px" }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "28px", flexWrap: "wrap" }}>
          <div style={{ maxWidth: "68ch" }}>
            <TXEyebrow>Discover V2 · Journey transitions · #2020</TXEyebrow>
            <h1 style={{ margin: "9px 0 0", fontFamily: "var(--font-serif)", fontSize: "42px", fontWeight: 600, letterSpacing: "-0.02em", lineHeight: 1.06, color: "var(--text-strong)" }}>How Discover moves from one state to the next</h1>
            <p style={{ margin: "14px 0 0", fontSize: "15.5px", lineHeight: 1.55, color: "var(--text-body)", textWrap: "pretty" }}>Seven journeys, read as <strong>before → action → after</strong>. Every transition names what changed: the canonical <span style={{ fontFamily: "var(--font-mono)", fontSize: "14px" }}>node=</span> and breadcrumb, the one active result scope, the filters, the camera, and whether browser history was touched. Hierarchy navigation, visual area zoom and property clusters are three different things here — and they never borrow each other's shape. To <em>use</em> these journeys instead of reading them, open the <a href="experience.html">interactive Discover experience</a>.</p>
          </div>
          <div style={{ flex: "none", display: "flex", flexDirection: "column", gap: "10px", alignItems: "flex-start" }}>
            <a href="experience.html" style={{ display: "inline-flex", alignItems: "center", gap: "8px", padding: "12px 18px", borderRadius: "var(--radius-md)", background: "var(--accent)", color: "#fff", fontSize: "14px", fontWeight: 700, textDecoration: "none", boxShadow: "var(--shadow-md)" }}>Open interactive Discover experience →</a>
            <PBadge tone="accent" pill>7 journeys · 40 transitions</PBadge>
            <a href="index.html" style={{ fontSize: "13px", fontWeight: 600 }}>← Discover V2 shell</a>
            <a href="../discover-scopes/index.html" style={{ fontSize: "13px", fontWeight: 600 }}>52-state library ↗</a>
          </div>
        </div>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginTop: "22px" }}>
          {[["Desktop", "1366 × 768 shell, drawn at 560 × 340"], ["Mobile", "390 × 844, list-first, true size"], ["Scopes", "one of AREA_SET · POLYGON · VIEWPORT"], ["Rule", "nothing broadens itself"]].map(([k, v]) => (
            <div key={k} style={{ padding: "8px 12px", background: "var(--surface-card)", border: "1px solid var(--border)", borderRadius: "var(--radius-md)", boxShadow: "var(--shadow-xs)" }}>
              <div style={{ fontSize: "10px", fontWeight: 700, letterSpacing: "var(--tracking-caps)", textTransform: "uppercase", color: "var(--text-muted)" }}>{k}</div>
              <div style={{ fontSize: "12.5px", color: "var(--text-strong)", marginTop: "2px" }}>{v}</div>
            </div>
          ))}
        </div>
      </div>
    </header>
  );
}

function TXNav({ active }) {
  const items = window.TX.journeys.map((j) => ({ id: j.id, label: j.id + " · " + j.name, href: "#" + j.id }));
  return (
    <nav style={{ position: "sticky", top: 0, zIndex: 20, background: "rgba(255,255,255,0.94)", backdropFilter: "blur(8px)", borderBottom: "1px solid var(--border)" }}>
      <div style={{ maxWidth: "1280px", margin: "0 auto", padding: "9px 24px", display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
        <span style={{ fontSize: "10px", fontWeight: 700, letterSpacing: "var(--tracking-caps)", textTransform: "uppercase", color: "var(--text-muted)", marginRight: "4px" }}>Journeys</span>
        {items.map((it) => (
          <a key={it.id} href={it.href} style={{ padding: "5px 10px", borderRadius: "var(--radius-full)", fontSize: "12px", fontWeight: 600, textDecoration: "none", color: active === it.id ? "#fff" : "var(--text-body)", background: active === it.id ? "var(--navy-800)" : "var(--surface-card)", border: "1px solid " + (active === it.id ? "var(--navy-800)" : "var(--border)"), whiteSpace: "nowrap" }}>{it.label}</a>
        ))}
        <span style={{ marginLeft: "auto", display: "flex", gap: "6px" }}>
          {[["#legend", "Legend"], ["#overview", "Full flow"], ["#mapping", "Mapping"], ["#open", "Open questions"]].map(([h, l]) => (
            <a key={h} href={h} style={{ padding: "5px 10px", borderRadius: "var(--radius-full)", fontSize: "12px", fontWeight: 600, textDecoration: "none", color: "var(--text-muted)", border: "1px solid var(--border)", whiteSpace: "nowrap" }}>{l}</a>
          ))}
        </span>
      </div>
    </nav>
  );
}

function TXSection({ id, eyebrow, title, sub, children, tint }) {
  return (
    <section id={id} style={{ background: tint || "transparent", borderTop: "1px solid var(--border)" }}>
      <div style={{ maxWidth: "1280px", margin: "0 auto", padding: "34px 24px 40px" }}>
        <TXEyebrow>{eyebrow}</TXEyebrow>
        <h2 style={{ margin: "8px 0 0", fontFamily: "var(--font-serif)", fontSize: "27px", fontWeight: 600, letterSpacing: "-0.02em", color: "var(--text-strong)" }}>{title}</h2>
        {sub && <p style={{ margin: "9px 0 0", fontSize: "14px", lineHeight: 1.5, color: "var(--text-body)", maxWidth: "78ch", textWrap: "pretty" }}>{sub}</p>}
        <div style={{ marginTop: "22px" }}>{children}</div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- legend -----
const LEGEND_SPECIMEN = {
  dest: { k: "dest", x: 50, y: 50, names: "Yelahanka · Devanahalli", count: 186, more: 12 },
  cluster: { k: "cluster", x: 50, y: 50, names: "Hebbal · Nagawara", more: 3, count: 120, schools: 50 },
  area: { k: "area", x: 50, y: 56, name: "Hebbal", count: 42 },
  price: { k: "price", x: 50, y: 54, p: "₹1.05 Cr", on: true }
};

function TXLegend() {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(228px, 1fr))", gap: "14px" }}>
      {window.TX.legend.map((l) => (
        <div key={l.k} style={{ background: "var(--surface-card)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", overflow: "hidden", boxShadow: "var(--shadow-sm)" }}>
          <div style={{ position: "relative", height: "104px", background: "#EDEBE6", borderBottom: "1px solid var(--border)", overflow: "hidden" }}>
            {l.k === "chip"
              ? <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", background: "var(--background)" }}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "5px 9px", borderRadius: "var(--radius-xs)", background: "var(--surface-subtle)", border: "1px solid var(--border-strong)", fontSize: "12px", fontWeight: 600, color: "var(--text-strong)" }}>
                    <span dangerouslySetInnerHTML={{ __html: window.TXGL.pin("var(--copper-500)") }} />Hebbal<span style={{ opacity: 0.55 }}>×</span>
                  </span>
                </div>
              : <>
                  <div style={{ position: "absolute", inset: 0, background: "repeating-linear-gradient(0deg, rgba(17,24,39,0.05) 0 1px, transparent 1px 26px), repeating-linear-gradient(90deg, rgba(17,24,39,0.05) 0 1px, transparent 1px 26px)" }} />
                  <window.TXMarker mk={LEGEND_SPECIMEN[l.k] || LEGEND_SPECIMEN.price} />
                </>}
          </div>
          <div style={{ padding: "11px 12px 13px" }}>
            <div style={{ fontSize: "13.5px", fontWeight: 700, color: "var(--text-strong)" }}>{l.title}</div>
            <div style={{ fontSize: "12px", color: "var(--text-body)", marginTop: "4px", lineHeight: 1.4 }}>{l.behaviour}</div>
            <div style={{ fontSize: "11.5px", color: "var(--text-muted)", marginTop: "6px", lineHeight: 1.4 }}>{l.shape}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ------------------------------------------------------------- delta strip ---
const DELTA_KEYS = [["node", "node= / breadcrumb"], ["scope", "Result scope"], ["filters", "Filters"], ["camera", "Camera / focus"], ["history", "Browser history"]];

function TXDelta({ delta }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(206px, 1fr))", gap: "1px", background: "var(--border)", border: "1px solid var(--border)", borderRadius: "var(--radius-md)", overflow: "hidden" }}>
      {DELTA_KEYS.map(([k, label]) => {
        const v = (delta && delta[k]) || "unchanged";
        const same = v === "unchanged";
        return (
          <div key={k} style={{ background: same ? "var(--surface-subtle)" : "var(--paper)", padding: "8px 10px" }}>
            <div style={{ fontSize: "9.5px", fontWeight: 700, letterSpacing: "var(--tracking-caps)", textTransform: "uppercase", color: "var(--text-muted)" }}>{label}</div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: "11px", lineHeight: 1.4, marginTop: "3px", color: same ? "var(--grey-400)" : "var(--copper-600)", fontWeight: same ? 400 : 600 }}>{v}</div>
          </div>
        );
      })}
    </div>
  );
}

function TXStateLink({ state, device }) {
  if (!state) return <span style={{ fontSize: "11px", color: "var(--grey-400)", fontFamily: "var(--font-mono)" }}>no matching state page</span>;
  return (
    <span style={{ display: "inline-flex", gap: "8px", alignItems: "center" }}>
      <a href={SPLAYER(state, device)} target="_blank" rel="noreferrer" style={{ fontFamily: "var(--font-mono)", fontSize: "11px", fontWeight: 700 }}>{state} ↗</a>
      <a href={SPLAYER(state, device === "mobile" ? "desktop" : "mobile")} target="_blank" rel="noreferrer" style={{ fontSize: "11px", color: "var(--text-muted)" }}>{device === "mobile" ? "desktop" : "mobile"}</a>
    </span>
  );
}

function TXFrameSlot({ step, role, device }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px", flex: "none" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        <span style={{ padding: "2px 8px", borderRadius: "var(--radius-full)", background: role === "Before" ? "var(--surface-subtle)" : "var(--navy-800)", color: role === "Before" ? "var(--text-muted)" : "#fff", fontSize: "9.5px", fontWeight: 700, letterSpacing: "var(--tracking-caps)", textTransform: "uppercase" }}>{role}</span>
        <span style={{ fontSize: "12.5px", fontWeight: 700, color: "var(--text-strong)" }}>{step.label}</span>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: "10.5px", color: "var(--text-muted)" }}>{step.id}</span>
        <span style={{ marginLeft: "auto", paddingLeft: "10px" }}><TXStateLink state={step.state} device={device} /></span>
      </div>
      <window.TXFrame frame={step.frame} />
      {step.note && <p style={{ margin: 0, fontSize: "12px", lineHeight: 1.45, color: "var(--text-body)", maxWidth: "62ch", textWrap: "pretty" }}>{step.note}</p>}
    </div>
  );
}

function TXAction({ text }) {
  return (
    <div style={{ flex: "none", width: "96px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "10px", padding: "0 2px" }}>
      <div style={{ width: "1px", flex: 1, minHeight: "18px", background: "var(--stone-400)" }} />
      <div style={{ display: "grid", placeItems: "center", width: "30px", height: "30px", borderRadius: "var(--radius-full)", background: "var(--accent)", color: "#fff", boxShadow: "var(--shadow-md)", fontSize: "15px", fontWeight: 700 }}>→</div>
      <div style={{ width: "100%", fontSize: "11px", lineHeight: 1.4, color: "var(--text-strong)", fontWeight: 600, textAlign: "center", textWrap: "pretty" }}>{text}</div>
      <div style={{ width: "1px", flex: 1, minHeight: "18px", background: "var(--stone-400)" }} />
    </div>
  );
}

function TXJourney({ j }) {
  const [i, setI] = React.useState(1);
  const n = j.steps.length;
  const before = j.steps[i - 1], after = j.steps[i];
  const mobile = j.device === "mobile";
  return (
    <section id={j.id} style={{ borderTop: "1px solid var(--border)", background: "var(--background)" }}>
      <div style={{ maxWidth: "1280px", margin: "0 auto", padding: "34px 24px 44px" }}>
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: "22px", flexWrap: "wrap" }}>
          <div style={{ maxWidth: "72ch" }}>
            <TXEyebrow>{j.id} · {j.issues.join(" · ")} · {mobile ? "mobile 390 × 844" : "desktop 1366 × 768"}</TXEyebrow>
            <h2 style={{ margin: "8px 0 0", fontFamily: "var(--font-serif)", fontSize: "27px", fontWeight: 600, letterSpacing: "-0.02em", color: "var(--text-strong)" }}>{j.name}</h2>
            <p style={{ margin: "8px 0 0", fontSize: "14px", lineHeight: 1.5, color: "var(--text-body)", textWrap: "pretty" }}>{j.intent}</p>
          </div>
          <div style={{ flex: "none", display: "flex", alignItems: "center", gap: "8px" }}>
            <button onClick={() => setI(Math.max(1, i - 1))} disabled={i === 1} style={btn(i === 1)}>‹ Previous</button>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: "12px", color: "var(--text-muted)", minWidth: "78px", textAlign: "center" }}>{i} / {n - 1}</span>
            <button onClick={() => setI(Math.min(n - 1, i + 1))} disabled={i === n - 1} style={btn(i === n - 1, true)}>Next transition ›</button>
          </div>
        </div>

        <div style={{ display: "flex", gap: "5px", flexWrap: "wrap", marginTop: "18px", padding: "8px", background: "var(--surface-card)", border: "1px solid var(--border)", borderRadius: "var(--radius-md)" }}>
          {j.steps.map((s, k) => {
            const on = k === i || k === i - 1;
            return (
              <button key={s.id} onClick={() => setI(Math.max(1, k))} style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "5px 9px", borderRadius: "var(--radius-full)", cursor: "pointer", fontFamily: "var(--font-sans)", fontSize: "11.5px", fontWeight: 600, border: "1px solid " + (on ? "var(--navy-800)" : "var(--border)"), background: k === i ? "var(--navy-800)" : k === i - 1 ? "var(--surface-subtle)" : "var(--paper)", color: k === i ? "#fff" : "var(--text-body)", transition: "all var(--dur-fast)" }}>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: "10px", opacity: 0.7 }}>{k + 1}</span>{s.label}
              </button>
            );
          })}
        </div>

        <div style={{ display: "flex", alignItems: "stretch", gap: "6px", marginTop: "20px", flexWrap: mobile ? "nowrap" : "nowrap", overflowX: "auto", paddingBottom: "6px" }}>
          <TXFrameSlot step={before} role="Before" device={mobile ? "mobile" : "desktop"} />
          <TXAction text={after.action || "—"} />
          <TXFrameSlot step={after} role="After" device={mobile ? "mobile" : "desktop"} />
        </div>

        <div style={{ marginTop: "16px" }}>
          <div style={{ fontSize: "10px", fontWeight: 700, letterSpacing: "var(--tracking-caps)", textTransform: "uppercase", color: "var(--text-muted)", marginBottom: "6px" }}>What changed in this transition</div>
          <TXDelta delta={after.delta} />
        </div>
      </div>
    </section>
  );
}

function btn(disabled, primary) {
  return { padding: "7px 13px", borderRadius: "var(--radius-md)", cursor: disabled ? "default" : "pointer", fontFamily: "var(--font-sans)", fontSize: "12.5px", fontWeight: 600, border: primary ? "none" : "1px solid var(--border-strong)", background: primary ? "var(--accent)" : "var(--paper)", color: primary ? "#fff" : "var(--text-strong)", opacity: disabled ? 0.45 : 1, transition: "background var(--dur-fast)" };
}

// ------------------------------------------------------------- full flow -----
const FLOW = [
  { title: "Canonical hierarchy", tone: "navy", rows: ["Bangalore", "→ Direction (max 5)", "→ Local destination (max 6, optional)", "→ Area"], foot: "node= and breadcrumb. In-app Back = one canonical parent." },
  { title: "Presentation only", tone: "plain", rows: ["Visual area cluster zoom", "Chip focus / Fit all", "Pan · zoom", "Map ↔ List"], foot: "No node=, no scope, no history entry." },
  { title: "One result scope", tone: "copper", rows: ["AREA_SET · 1–3 areas", "POLYGON · drawn boundary", "VIEWPORT · visible map area"], foot: "Exactly one. Kind changes are confirmed replacements." },
  { title: "Results & recovery", tone: "plain", rows: ["Listings + property detail", "Zero result — search preserved", "Nearby / filter previews (counted)", "Error + Retry ≠ zero"], foot: "Back to results restores scope, filters, camera, position." },
  { title: "Saved alerts", tone: "navy", rows: ["Create from any committed scope", "Persist scope + filters + fingerprint", "Manage · pause · delete", "Deep link restores exactly"], foot: "Success only after persistence." }
];

function TXFlow() {
  return (
    <div style={{ display: "flex", gap: "10px", alignItems: "stretch", overflowX: "auto", paddingBottom: "8px" }}>
      {FLOW.map((c, k) => (
        <React.Fragment key={c.title}>
          {k > 0 && <div style={{ flex: "none", display: "flex", alignItems: "center", color: "var(--stone-400)", fontSize: "20px" }}>→</div>}
          <div style={{ flex: "1 1 210px", minWidth: "210px", background: c.tone === "navy" ? "var(--navy-800)" : "var(--surface-card)", color: c.tone === "navy" ? "#fff" : "var(--text-strong)", border: c.tone === "copper" ? "1.5px solid var(--accent)" : "1px solid var(--border)", borderRadius: "var(--radius-lg)", padding: "13px 14px", boxShadow: "var(--shadow-sm)" }}>
            <div style={{ fontSize: "12.5px", fontWeight: 700, letterSpacing: "-0.01em" }}>{c.title}</div>
            <ul style={{ margin: "9px 0 0", padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: "5px" }}>
              {c.rows.map((r) => <li key={r} style={{ fontFamily: "var(--font-mono)", fontSize: "10.5px", lineHeight: 1.35, color: c.tone === "navy" ? "rgba(255,255,255,0.86)" : "var(--text-body)" }}>{r}</li>)}
            </ul>
            <div style={{ marginTop: "10px", paddingTop: "9px", borderTop: "1px solid " + (c.tone === "navy" ? "rgba(255,255,255,0.18)" : "var(--border)"), fontSize: "11px", lineHeight: 1.4, color: c.tone === "navy" ? "rgba(255,255,255,0.78)" : "var(--text-muted)" }}>{c.foot}</div>
          </div>
        </React.Fragment>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- mapping ----
function TXMapping() {
  const rows = [];
  window.TX.journeys.forEach((j) => j.steps.forEach((s, k) => rows.push({ j: j.id, step: k + 1, id: s.id, label: s.label, issue: j.issues[0], state: s.state, device: j.device })));
  return (
    <div style={{ background: "var(--surface-card)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", overflow: "hidden", boxShadow: "var(--shadow-sm)" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12.5px" }}>
        <thead>
          <tr style={{ background: "var(--surface-subtle)" }}>
            {["Journey step", "Screen", "Issue", "State page", "Device"].map((h) => <th key={h} style={{ textAlign: "left", padding: "9px 12px", fontSize: "10px", fontWeight: 700, letterSpacing: "var(--tracking-caps)", textTransform: "uppercase", color: "var(--text-muted)", borderBottom: "1px solid var(--border)" }}>{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td style={td()}><span style={{ fontFamily: "var(--font-mono)", fontWeight: 700 }}>{r.id}</span></td>
              <td style={td()}>{r.label}</td>
              <td style={td()}><span style={{ fontFamily: "var(--font-mono)", color: "var(--text-muted)" }}>{r.issue}</span></td>
              <td style={td()}>{r.state ? <a href={SPLAYER(r.state, r.device)} target="_blank" rel="noreferrer" style={{ fontFamily: "var(--font-mono)", fontWeight: 700 }}>{r.state}</a> : <span style={{ color: "var(--grey-400)" }}>—</span>}</td>
              <td style={td()}><span style={{ fontSize: "11.5px", color: "var(--text-muted)" }}>{r.device}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
function td() { return { padding: "8px 12px", borderBottom: "1px solid var(--border)", color: "var(--text-body)", verticalAlign: "top" }; }

// ------------------------------------------------------------------ open -----
function TXOpen() {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "12px" }}>
      {window.TX.unresolved.map((u, i) => (
        <div key={u.q} style={{ background: "var(--surface-card)", border: "1px solid var(--border)", borderLeft: "none", borderRadius: "var(--radius-lg)", padding: "13px 15px", boxShadow: "var(--shadow-xs)" }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: "8px" }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: "11px", color: "var(--text-muted)" }}>{String(i + 1).padStart(2, "0")}</span>
            <span style={{ fontSize: "13.5px", fontWeight: 700, color: "var(--text-strong)" }}>{u.q}</span>
            <span style={{ marginLeft: "auto", fontFamily: "var(--font-mono)", fontSize: "10.5px", color: "var(--accent)" }}>{u.tag}</span>
          </div>
          <p style={{ margin: "6px 0 0", fontSize: "12.5px", lineHeight: 1.5, color: "var(--text-body)", textWrap: "pretty" }}>{u.body}</p>
        </div>
      ))}
    </div>
  );
}

function TXApp() {
  return (
    <div>
      <TXHero />
      <TXNav />
      <TXSection id="legend" eyebrow="Visual grammar" title="Five marker families, five behaviours" sub="Shape, glyph and action label carry the behaviour — never colour alone. If two controls behave differently, they do not look alike.">
        <TXLegend />
      </TXSection>
      {window.TX.journeys.map((j) => <TXJourney key={j.id} j={j} />)}
      <TXSection id="overview" eyebrow="Full flow" title="The whole machine on one line" sub="Hierarchy navigation, presentation-only focus, the single result scope, results and recovery, and saved alerts. Only the copper column changes what is searched." tint="var(--paper)">
        <TXFlow />
      </TXSection>
      <TXSection id="mapping" eyebrow="Traceability" title="Journey step → issue → state page" sub="Every step that has a matching page in the 52-state library links straight into its player at the right device size.">
        <TXMapping />
      </TXSection>
      <TXSection id="open" eyebrow="Still undecided" title="Questions the source pack does not settle" sub="Everything else in the YAML is treated as decided — including the multi-area total: a single Hebbal draft shows 42, and 95 appears only once three areas are drafted." tint="var(--paper)">
        <TXOpen />
      </TXSection>
      <footer style={{ borderTop: "1px solid var(--border)", background: "var(--navy-800)", color: "rgba(255,255,255,0.8)" }}>
        <div style={{ maxWidth: "1280px", margin: "0 auto", padding: "22px 24px", display: "flex", gap: "18px", flexWrap: "wrap", alignItems: "center", fontSize: "12.5px" }}>
          <span style={{ color: "#fff", fontWeight: 700 }}>Discover V2 · journey transitions</span>
          <span>Frames are schematic: the 1366 × 768 shell proportions are kept and marker type is enlarged to stay legible. Mobile frames are true 390 × 844.</span>
          <span style={{ marginLeft: "auto", fontFamily: "var(--font-mono)", fontSize: "11px" }}>Frames drawn at 560 × 340 · basemap © OpenStreetMap contributors · © CARTO</span>
        </div>
      </footer>
    </div>
  );
}

Object.assign(window, { TXApp });
