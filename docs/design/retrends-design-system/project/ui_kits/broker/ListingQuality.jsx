// ReTrends — Broker Listing Quality, redesigned as a "fix-first listing workbench".
// Guides a first-time broker top-to-bottom: biggest problem → which listing first →
// why → exact fixes → expected result. Exports window.RTListingQuality.
;(function () {
const { Button, Icon, Badge, Select, Card } = window.ReTrendsDesignSystem_f37966;

// ---- tone helpers ----------------------------------------------------------
const TONE_FG = {
  positive: "var(--positive)",
  caution:  "var(--caution)",
  negative: "var(--negative)",
  muted:    "var(--text-muted)",
};
const IMPACT = {
  High:   { bg: "var(--brick-50)",      fg: "var(--negative)" },
  Medium: { bg: "var(--ochre-50)",      fg: "var(--caution)" },
  Low:    { bg: "var(--surface-subtle)", fg: "var(--text-muted)" },
};

function qualityTone(q) {
  if (q < 55) return { fg: "var(--negative)", bg: "var(--brick-50)" };
  if (q < 67) return { fg: "var(--caution)",  bg: "var(--ochre-50)" };
  return { fg: "var(--positive)", bg: "var(--evergreen-50)" };
}
function QualityPill({ q, size = 13 }) {
  const t = qualityTone(q);
  return (
    <span style={{ display: "inline-flex", alignItems: "baseline", gap: "1px", fontFamily: "var(--font-mono)", fontSize: `${size}px`, fontWeight: 600, color: t.fg, background: t.bg, borderRadius: "var(--radius-sm)", padding: "3px 8px", lineHeight: 1 }}>
      {q}<span style={{ fontSize: `${size - 3}px`, opacity: 0.7 }}>/100</span>
    </span>
  );
}
function SignalDot({ tone }) {
  return <span style={{ width: "7px", height: "7px", flex: "none", borderRadius: "var(--radius-full)", background: TONE_FG[tone] || TONE_FG.muted }} />;
}

// ---- 1. Header band --------------------------------------------------------
function HeaderBand() {
  const crumb = ["Broker dashboard", "Listing quality"];
  return (
    <section style={{ background: "var(--navy-800)" }}>
      <div style={{ maxWidth: "1280px", margin: "0 auto", padding: "16px 24px 28px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
          {crumb.map((c, i) => {
            const last = i === crumb.length - 1;
            const txt = (
              <span style={{ fontSize: "12px", fontWeight: last ? 600 : 500, color: last ? "#fff" : "rgba(255,255,255,0.55)" }}>{c}</span>
            );
            return (
              <React.Fragment key={i}>
                {last ? txt : <a href="/broker/dashboard" style={{ textDecoration: "none" }}>{txt}</a>}
                {!last && <Icon name="chevron-right" size={12} color="rgba(255,255,255,0.35)" />}
              </React.Fragment>
            );
          })}
        </div>
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: "20px", flexWrap: "wrap" }}>
          <div>
            <h1 style={{ margin: "0 0 6px", fontFamily: "var(--font-serif)", fontSize: "28px", fontWeight: 600, letterSpacing: "-0.01em", color: "#fff", lineHeight: 1.12 }}>Listing quality</h1>
            <p style={{ margin: "0 0 4px", fontSize: "15px", color: "rgba(255,255,255,0.82)", maxWidth: "580px", lineHeight: 1.45 }}>Fix weak listings so buyers trust them and contact you more often.</p>
            <p style={{ margin: 0, fontSize: "13px", color: "rgba(255,255,255,0.55)", maxWidth: "580px", lineHeight: 1.45 }}>Start with listings that have buyer interest but low trust signals.</p>
          </div>
          <a href="/broker/listings/new" style={{ textDecoration: "none" }}>
            <Button variant="outline" style={{ background: "transparent", color: "#fff", borderColor: "rgba(255,255,255,0.35)" }}><Icon name="plus" size={16} />Add new listing</Button>
          </a>
        </div>
      </div>
    </section>
  );
}

// ---- 2. Priority banner + compact health strip -----------------------------
function PriorityBanner() {
  const p = window.RT_LQ_PRIORITY;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "20px", flexWrap: "wrap", background: "var(--surface-card)", border: "1px solid var(--border)", borderLeft: "4px solid var(--accent)", borderRadius: "var(--radius-lg)", boxShadow: "var(--shadow-md)", padding: "22px 24px" }}>
      <div style={{ width: "46px", height: "46px", flex: "none", borderRadius: "var(--radius-md)", background: "var(--copper-100)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Icon name={p.icon} size={23} color="var(--accent)" />
      </div>
      <div style={{ flex: 1, minWidth: "260px" }}>
        <div style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "var(--tracking-caps)", textTransform: "uppercase", color: "var(--accent)", marginBottom: "5px" }}>{p.label}</div>
        <h2 style={{ margin: "0 0 6px", fontSize: "21px", fontWeight: 700, letterSpacing: "-0.01em", color: "var(--text-strong)", lineHeight: 1.2 }}>{p.title}</h2>
        <p style={{ margin: 0, fontSize: "14px", color: "var(--text-body)", lineHeight: 1.5, maxWidth: "620px" }}>{p.body}</p>
      </div>
      <a href={p.href} style={{ textDecoration: "none", flex: "none" }}>
        <Button variant="accent" size="lg"><Icon name={p.icon} size={17} />{p.cta}</Button>
      </a>
    </div>
  );
}

function HealthStrip() {
  return (
    <div className="rt-lq-health">
      {window.RT_LQ_HEALTH.map((h, i) => (
        <div key={i} style={{ display: "flex", flexDirection: "column", gap: "3px", padding: "14px 18px", background: "var(--surface-card)", border: "1px solid var(--border)", borderRadius: "var(--radius-md)", boxShadow: "var(--shadow-sm)" }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: "1px" }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: "24px", fontWeight: 600, lineHeight: 1, color: TONE_FG[h.tone] }}>{h.value}</span>
            {h.suffix && <span style={{ fontFamily: "var(--font-mono)", fontSize: "14px", fontWeight: 600, color: TONE_FG[h.tone], opacity: 0.7 }}>{h.suffix}</span>}
          </div>
          <span style={{ fontSize: "12.5px", fontWeight: 600, color: "var(--text-muted)" }}>{h.label}</span>
        </div>
      ))}
    </div>
  );
}

// ---- 3. Action-oriented filter chips ---------------------------------------
function FilterChips({ filter, setFilter }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
      {window.RT_LQ_FILTERS.map((f) => {
        const on = filter === f.key;
        return (
          <button key={f.key} onClick={() => setFilter(f.key)} style={{
            display: "inline-flex", alignItems: "center", gap: "7px",
            fontFamily: "var(--font-sans)", fontSize: "13px", fontWeight: 600, cursor: "pointer",
            padding: "7px 13px", borderRadius: "var(--radius-full)",
            border: `1px solid ${on ? "var(--navy-800)" : "var(--border-strong)"}`,
            background: on ? "var(--navy-800)" : "var(--surface-card)",
            color: on ? "#fff" : "var(--text-body)", transition: "all 120ms cubic-bezier(0.4,0,0.2,1)",
          }}>
            {f.label}
            {f.count != null && (
              <span style={{ fontFamily: "var(--font-mono)", fontSize: "11.5px", fontWeight: 600, color: on ? "rgba(255,255,255,0.7)" : "var(--text-muted)", background: on ? "rgba(255,255,255,0.14)" : "var(--surface-subtle)", borderRadius: "var(--radius-full)", padding: "1px 7px", lineHeight: 1.5 }}>{f.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// Quieter narrowing controls (city / area / period / sort)
function NarrowControls({ area }) {
  const areaVal = ["malpe", "manipal", "brahmavar"].includes(area) ? area : "all";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", marginTop: "12px" }}>
      <span style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "12px", fontWeight: 600, color: "var(--text-muted)", paddingRight: "2px" }}>
        <Icon name="sliders-horizontal" size={14} color="var(--text-muted)" />Narrow
      </span>
      <Select size="sm" defaultValue="all" options={[{ value: "all", label: "All cities" }, { value: "udupi", label: "Udupi" }, { value: "blr", label: "Bengaluru" }]} style={{ minWidth: "120px" }} />
      <Select size="sm" defaultValue={areaVal} options={[{ value: "all", label: "All areas" }, { value: "malpe", label: "Malpe" }, { value: "manipal", label: "Manipal" }, { value: "brahmavar", label: "Brahmavar" }]} style={{ minWidth: "120px" }} />
      <Select size="sm" defaultValue="30" options={[{ value: "7", label: "Last 7 days" }, { value: "30", label: "Last 30 days" }, { value: "90", label: "Last 90 days" }]} style={{ minWidth: "130px" }} />
      <div style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: "8px" }}>
        <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>Sort</span>
        <Select size="sm" defaultValue="views" options={[{ value: "views", label: "Buyer interest + weakness" }, { value: "quality", label: "Lowest quality first" }, { value: "priority", label: "Highest priority first" }]} style={{ minWidth: "190px" }} />
      </div>
    </div>
  );
}

// ---- 4. Work queue table ---------------------------------------------------
const COLS = ["Listing", "Why fix this first", "Main fix", "Activity", "Quality", ""];
function Worklist({ rows, selectedId, onSelect }) {
  return (
    <Card padding="none" style={{ overflow: "hidden" }}>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "var(--font-sans)", minWidth: "560px" }}>
          <thead>
            <tr style={{ background: "var(--navy-100)", textAlign: "left" }}>
              {COLS.map((h, i) => (
                <th key={i} style={{ padding: "11px 12px", fontSize: "10.5px", fontWeight: 700, letterSpacing: "var(--tracking-caps)", textTransform: "uppercase", color: "var(--navy-700)", whiteSpace: "nowrap" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const sel = r.id === selectedId;
              return (
                <tr key={r.id} onClick={() => onSelect(r.id)} style={{
                  borderTop: "1px solid var(--border)", cursor: "pointer",
                  background: sel ? "var(--navy-100)" : "transparent",
                  boxShadow: sel ? "inset 3px 0 0 var(--navy-800)" : "none",
                  transition: "background 120ms cubic-bezier(0.4,0,0.2,1)",
                }}
                  onMouseEnter={(e) => { if (!sel) e.currentTarget.style.background = "var(--grey-50)"; }}
                  onMouseLeave={(e) => { if (!sel) e.currentTarget.style.background = "transparent"; }}>
                  {/* Listing */}
                  <td style={{ padding: "14px 12px", minWidth: "160px" }}>
                    <div style={{ display: "flex", alignItems: "flex-start", gap: "8px" }}>
                      {sel && <span style={{ width: "6px", height: "6px", flex: "none", marginTop: "6px", borderRadius: "var(--radius-full)", background: "var(--navy-800)" }} />}
                      <div>
                        <div style={{ fontWeight: 600, color: "var(--text-strong)", fontSize: "14px", lineHeight: 1.3 }}>{r.title}</div>
                        <div style={{ display: "inline-flex", alignItems: "center", gap: "4px", marginTop: "3px", fontSize: "12px", color: "var(--text-muted)" }}><Icon name="map-pin" size={12} color="var(--text-muted)" />{r.area}</div>
                      </div>
                    </div>
                  </td>
                  {/* Why fix this first — visually prominent */}
                  <td style={{ padding: "14px 12px", minWidth: "160px" }}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: "7px", fontSize: "13.5px", fontWeight: 700, color: r.signalTone === "muted" ? "var(--text-muted)" : "var(--text-strong)", lineHeight: 1.35 }}>
                      <SignalDot tone={r.signalTone} />{r.whyFix}
                    </span>
                  </td>
                  {/* Main fix */}
                  <td style={{ padding: "14px 12px", minWidth: "132px" }}>
                    <span style={{ display: "inline-flex", alignItems: "flex-start", gap: "6px", fontSize: "13px", color: "var(--text-body)", lineHeight: 1.4 }}>
                      <Icon name="alert-triangle" size={14} color="var(--caution)" style={{ marginTop: "2px", flex: "none" }} />{r.mainFix}
                    </span>
                  </td>
                  {/* Activity */}
                  <td style={{ padding: "14px 12px", fontFamily: "var(--font-mono)", fontSize: "12px", fontWeight: 600, color: "var(--text-body)", whiteSpace: "nowrap" }}>{r.activity}</td>
                  {/* Quality */}
                  <td style={{ padding: "14px 12px" }}><QualityPill q={r.quality} /></td>
                  {/* Selection affordance */}
                  <td style={{ padding: "14px 12px", textAlign: "right", width: "34px" }}>
                    <Icon name="chevron-right" size={18} color={sel ? "var(--accent)" : "var(--grey-300)"} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function EmptyState({ filterLabel }) {
  return (
    <Card padding="lg" style={{ textAlign: "center", padding: "44px 28px" }}>
      <div style={{ width: "48px", height: "48px", margin: "0 auto 14px", borderRadius: "var(--radius-md)", background: "var(--evergreen-50)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Icon name="shield-check" size={24} color="var(--positive)" />
      </div>
      <h3 style={{ margin: "0 0 6px", fontSize: "17px", fontWeight: 600, color: "var(--text-strong)" }}>Nothing to fix here</h3>
      <p style={{ margin: "0 auto 18px", fontSize: "14px", color: "var(--text-muted)", lineHeight: 1.5, maxWidth: "420px" }}>
        No listings match{filterLabel ? ` "${filterLabel}"` : ""}. Keep listings fresh by updating photos, price and key details regularly.
      </p>
      <a href="/broker/listings" style={{ textDecoration: "none" }}><Button variant="outline" size="sm">View all listings<Icon name="arrow-right" size={15} /></Button></a>
    </Card>
  );
}

// ---- 5. Right panel: Fix plan ----------------------------------------------
function FixPlan({ listing }) {
  const l = listing;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      <Card padding="none" style={{ overflow: "hidden" }}>
        {/* header + selected listing */}
        <div style={{ padding: "15px 16px 13px", borderBottom: "1px solid var(--border)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "10px" }}>
            <Icon name="check" size={16} color="var(--accent)" />
            <span style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "var(--tracking-caps)", textTransform: "uppercase", color: "var(--accent)" }}>Fix plan</span>
          </div>
          <h3 style={{ margin: "0 0 5px", fontSize: "16px", fontWeight: 700, color: "var(--text-strong)", lineHeight: 1.3 }}>{l.title}</h3>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: "11.5px", color: "var(--text-muted)" }}>{l.activity} · Updated {l.updated}</div>
        </div>

        {/* why this listing is first */}
        <div style={{ padding: "13px 16px", borderBottom: "1px solid var(--border)", background: "var(--surface-subtle)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "7px", marginBottom: "6px" }}>
            <SignalDot tone={l.signalTone} />
            <span style={{ fontSize: "12.5px", fontWeight: 700, color: "var(--text-strong)" }}>Why this listing is first</span>
          </div>
          <p style={{ margin: 0, fontSize: "12.5px", color: "var(--text-body)", lineHeight: 1.5 }}>{l.whyFirst}</p>
        </div>

        {/* do these fixes */}
        <div style={{ padding: "13px 16px 4px" }}>
          <h4 style={{ margin: "0 0 2px", fontSize: "14px", fontWeight: 700, color: "var(--text-strong)" }}>Do these fixes</h4>
          <p style={{ margin: 0, fontSize: "12px", color: "var(--text-muted)" }}>In order of impact on buyer trust.</p>
        </div>
        {l.checklist.map((a, i) => {
          const imp = IMPACT[a.impact] || IMPACT.Low;
          return (
            <div key={i} style={{ display: "flex", gap: "11px", padding: "12px 16px", borderTop: "1px solid var(--border)" }}>
              <div style={{ width: "22px", height: "22px", flex: "none", borderRadius: "var(--radius-full)", background: i === 0 ? "var(--navy-800)" : "var(--navy-100)", color: i === 0 ? "#fff" : "var(--navy-800)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-mono)", fontSize: "11.5px", fontWeight: 600 }}>{i + 1}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "3px", flexWrap: "wrap" }}>
                  <span style={{ fontSize: "13.5px", fontWeight: 600, color: "var(--text-strong)", lineHeight: 1.3 }}>{a.title}</span>
                  <span style={{ flex: "none", fontSize: "9.5px", fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase", color: imp.fg, background: imp.bg, borderRadius: "var(--radius-full)", padding: "2px 7px" }}>{a.impact} impact</span>
                </div>
                <p style={{ margin: "0 0 9px", fontSize: "12px", color: "var(--text-muted)", lineHeight: 1.45 }}>{a.why}</p>
                <Button variant={i === 0 ? "accent" : "outline"} size="sm"><Icon name={a.icon} size={14} />{a.cta}</Button>
              </div>
            </div>
          );
        })}

        {/* expected result */}
        <div style={{ display: "flex", gap: "10px", padding: "13px 16px", borderTop: "1px solid var(--border)", background: "var(--evergreen-50)" }}>
          <Icon name="trending-up" size={17} color="var(--positive)" style={{ flex: "none", marginTop: "1px" }} />
          <div>
            <div style={{ fontSize: "12px", fontWeight: 700, color: "var(--positive)", marginBottom: "2px" }}>Expected result</div>
            <p style={{ margin: 0, fontSize: "12px", color: "var(--text-body)", lineHeight: 1.5 }}>{l.expected}</p>
          </div>
        </div>
      </Card>
    </div>
  );
}

// ---- 6. Collapsed "How scoring works" --------------------------------------
function ScoreExplain({ listing, style }) {
  const [open, setOpen] = React.useState(false);
  const bands = [
    { range: "80\u2013100", label: "Good", fg: "var(--positive)" },
    { range: "60\u201379", label: "Need improvement", fg: "var(--caution)" },
    { range: "Below 60", label: "Fix first", fg: "var(--negative)" },
  ];
  return (
    <Card padding="none" style={{ overflow: "hidden", ...style }}>
      <button onClick={() => setOpen(!open)} style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", padding: "15px 18px", background: "transparent", border: "none", cursor: "pointer", textAlign: "left", fontFamily: "var(--font-sans)" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "3px" }}>
          <span style={{ fontSize: "15px", fontWeight: 700, color: "var(--text-strong)" }}>How scoring works</span>
          <span style={{ fontSize: "12.5px", color: "var(--text-muted)", lineHeight: 1.45, maxWidth: "640px" }}>Score is based on location confidence, photos, key details, freshness and verification. Buyer response helps decide which listings to fix first, but does not lower the score.</span>
        </div>
        <span style={{ display: "inline-flex", alignItems: "center", gap: "6px", flex: "none", fontSize: "12.5px", fontWeight: 600, color: "var(--navy-700)" }}>
          {open ? "Hide details" : "View scoring details"}
          <Icon name="chevron-down" size={16} color="var(--navy-700)" style={{ transform: open ? "none" : "rotate(-90deg)", transition: "transform 200ms cubic-bezier(0.4,0,0.2,1)" }} />
        </span>
      </button>
      {open && (
        <div style={{ padding: "4px 18px 18px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "14px", flexWrap: "wrap", marginBottom: "14px", paddingBottom: "14px", borderBottom: "1px solid var(--border)" }}>
            {bands.map((b, i) => (
              <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "11.5px", color: "var(--text-muted)" }}>
                <span style={{ width: "7px", height: "7px", flex: "none", borderRadius: "var(--radius-full)", background: b.fg }} />
                <strong style={{ fontFamily: "var(--font-mono)", fontWeight: 600, color: "var(--text-body)" }}>{b.range}</strong>
                <span>{b.label}</span>
              </span>
            ))}
          </div>
          <div style={{ fontSize: "10.5px", fontWeight: 700, letterSpacing: "var(--tracking-caps)", textTransform: "uppercase", color: "var(--text-muted)", marginBottom: "8px" }}>This listing — {listing.title}</div>
          <div style={{ display: "flex", flexDirection: "column", gap: "1px", background: "var(--border)", borderRadius: "var(--radius-md)", overflow: "hidden" }}>
            {listing.score.map((s, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", padding: "11px 13px", background: "var(--surface-card)" }}>
                <span style={{ fontSize: "13px", color: "var(--text-body)" }}>{s.label}</span>
                <span style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "12.5px", fontWeight: 600, color: TONE_FG[s.tone] }}>
                  <SignalDot tone={s.tone} />{s.status}
                </span>
              </div>
            ))}
          </div>
          <div style={{ marginTop: "12px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", padding: "12px", background: "var(--surface-subtle)", border: "1px dashed var(--border-strong)", borderRadius: "var(--radius-md)" }}>
            <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-body)" }}>Buyer response
              <span style={{ display: "block", fontSize: "11px", fontWeight: 400, color: "var(--text-muted)", marginTop: "1px" }}>Shown separately — does not lower the score</span>
            </span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "12.5px", fontWeight: 600, color: TONE_FG[listing.signalTone], whiteSpace: "nowrap" }}>
              <SignalDot tone={listing.signalTone} />{listing.whyFix}
            </span>
          </div>
        </div>
      )}
    </Card>
  );
}

// ---- assembled page --------------------------------------------------------
function RTListingQuality(props) {
  const seedFilter = props && props.initialFilter && window.RT_LQ_FILTERS.some((f) => f.key === props.initialFilter) ? props.initialFilter : "all";
  const initialArea = props && props.initialArea;
  const [filter, setFilter] = React.useState(seedFilter);
  const [selectedId, setSelectedId] = React.useState(window.RT_LQ_LISTINGS[0].id);

  const rows = window.RT_LQ_LISTINGS.filter((l) => filter === "all" || l.tags.includes(filter));
  const filterLabel = (window.RT_LQ_FILTERS.find((f) => f.key === filter) || {}).label;
  const selected = window.RT_LQ_LISTINGS.find((l) => l.id === selectedId) || window.RT_LQ_LISTINGS[0];

  return (
    <div style={{ background: "var(--background)", minHeight: "100vh", paddingBottom: "40px" }}>
      <HeaderBand />
      <div style={{ maxWidth: "1280px", margin: "0 auto", padding: "28px 24px 0", display: "flex", flexDirection: "column", gap: "28px" }}>
        {/* Priority + health */}
        <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
          <PriorityBanner />
          <HealthStrip />
        </div>

        {/* Worklist section */}
        <div>
          <div style={{ marginBottom: "14px" }}>
            <h2 style={{ margin: "0 0 4px", fontFamily: "var(--font-sans)", fontSize: "20px", fontWeight: 700, letterSpacing: "-0.01em", color: "var(--text-strong)" }}>Fix these listings first</h2>
            <p style={{ margin: 0, fontSize: "14px", color: "var(--text-muted)" }}>Ordered by buyer interest and listing weakness.</p>
          </div>
          <FilterChips filter={filter} setFilter={setFilter} />
          <NarrowControls area={initialArea} />
          {initialArea && ["malpe", "manipal", "brahmavar"].includes(initialArea) && (
            <p style={{ margin: "12px 0 0", display: "inline-flex", alignItems: "center", gap: "7px", fontSize: "12.5px", fontWeight: 600, color: "var(--navy-700)", background: "var(--navy-100)", border: "1px solid var(--border)", borderRadius: "var(--radius-full)", padding: "5px 12px" }}>
              <Icon name="map-pin" size={13} color="var(--accent)" />Showing area context: {initialArea.charAt(0).toUpperCase() + initialArea.slice(1)}
            </p>
          )}
          <p style={{ margin: "16px 0 0", display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "12.5px", color: "var(--text-muted)" }}>
            <Icon name="arrow-right" size={13} color="var(--accent)" />Select a listing to see the exact fix plan.
          </p>
          <div className="rt-lq-grid" style={{ marginTop: "12px" }}>
            <div>
              {rows.length ? <Worklist rows={rows} selectedId={selectedId} onSelect={setSelectedId} /> : <EmptyState filterLabel={filterLabel} />}
              <p style={{ margin: "12px 0 0", fontSize: "12px", color: "var(--text-muted)", lineHeight: 1.5 }}>
                <Icon name="message-circle" size={13} color="var(--text-muted)" style={{ verticalAlign: "-2px", marginRight: "5px" }} />
                Enquiries include call clicks, WhatsApp clicks and enquiry forms. Data refreshed 16 Jun 2026.
              </p>
              <ScoreExplain listing={selected} style={{ marginTop: "18px" }} />
            </div>
            <div className="rt-lq-panel">
              <FixPlan listing={selected} />
            </div>
          </div>
        </div>

        {/* Related links — quiet footer */}
        <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", paddingTop: "6px", borderTop: "1px solid var(--border)", fontSize: "13px", color: "var(--text-muted)" }}>
          <span style={{ fontWeight: 600 }}>Related:</span>
          <a href="/broker/areas/udupi/malpe" style={{ display: "inline-flex", alignItems: "center", gap: "5px", textDecoration: "none", color: "var(--navy-700)", fontWeight: 600 }}><Icon name="map-pin" size={14} color="var(--navy-700)" />Area insights</a>
          <span style={{ color: "var(--border-strong)" }}>·</span>
          <a href="/broker/demand-gaps" style={{ display: "inline-flex", alignItems: "center", gap: "5px", textDecoration: "none", color: "var(--navy-700)", fontWeight: 600 }}><Icon name="trending-up" size={14} color="var(--navy-700)" />Demand gaps</a>
        </div>
      </div>
    </div>
  );
}

window.RTListingQuality = RTListingQuality;
})();
