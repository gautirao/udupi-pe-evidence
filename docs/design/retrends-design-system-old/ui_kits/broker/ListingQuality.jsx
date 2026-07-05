// ReTrends — Broker Listing Quality page. Exports window.RTListingQuality.
// Answers one question: "Which of my listings are weak, why, and what do I fix first?"
// Own-listings worklist + selected-listing fix panel. Approved Pan-India theme.
const { Button, Icon, Badge, Select, Card } = window.ReTrendsDesignSystem_f37966;

// ---- tone helpers ----------------------------------------------------------
const STATUS_DOT = {
  positive: "var(--positive)",
  caution:  "var(--caution)",
  negative: "var(--negative)",
  muted:    "var(--text-muted)",
};
const STATUS_FG = {
  positive: "var(--positive)",
  caution:  "var(--caution)",
  negative: "var(--negative)",
  muted:    "var(--text-muted)",
};
const PRIORITY = {
  High:   { tone: "negative", bg: "var(--brick-50)",  fg: "var(--negative)" },
  Medium: { tone: "caution",  bg: "var(--ochre-50)",  fg: "var(--caution)" },
  Low:    { tone: "neutral",  bg: "var(--surface-subtle)", fg: "var(--text-muted)" },
};

// Quality score pill — calm: brick only when truly low, ochre for caution.
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
  return <span style={{ width: "7px", height: "7px", flex: "none", borderRadius: "var(--radius-full)", background: STATUS_DOT[tone] || STATUS_DOT.muted }} />;
}

function SectionHead({ title, sub, right }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: "16px", marginBottom: "16px" }}>
      <div>
        <h2 style={{ margin: 0, fontFamily: "var(--font-sans)", fontSize: "19px", fontWeight: 700, lineHeight: 1.2, letterSpacing: "-0.01em", color: "var(--text-strong)" }}>{title}</h2>
        {sub && <p style={{ margin: "5px 0 0", fontSize: "14px", color: "var(--text-muted)" }}>{sub}</p>}
      </div>
      {right}
    </div>
  );
}

// ---- 1. Header band (compact, workspace) -----------------------------------
function HeaderBand() {
  const crumb = ["Broker dashboard", "Listing quality"];
  return (
    <section style={{ background: "var(--navy-800)" }}>
      <div style={{ maxWidth: "1280px", margin: "0 auto", padding: "16px 24px 28px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
          {crumb.map((c, i) => (
            <React.Fragment key={i}>
              <span style={{ fontSize: "12px", fontWeight: i === crumb.length - 1 ? 600 : 500, color: i === crumb.length - 1 ? "#fff" : "rgba(255,255,255,0.55)", cursor: i < crumb.length - 1 ? "pointer" : "default" }}>{c}</span>
              {i < crumb.length - 1 && <Icon name="chevron-right" size={12} color="rgba(255,255,255,0.35)" />}
            </React.Fragment>
          ))}
        </div>
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: "20px", flexWrap: "wrap" }}>
          <div>
            <h1 style={{ margin: "0 0 5px", fontFamily: "var(--font-serif)", fontSize: "28px", fontWeight: 600, letterSpacing: "-0.01em", color: "#fff", lineHeight: 1.12 }}>Listing quality</h1>
            <p style={{ margin: 0, fontSize: "14px", color: "rgba(255,255,255,0.65)", maxWidth: "560px", lineHeight: 1.45 }}>Fix location, photos and key details so buyers trust your listings and contact you more often.</p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "16px", flexWrap: "wrap" }}>
            <a href="/broker/listings/new" style={{ textDecoration: "none" }}>
              <Button variant="accent"><Icon name="plus" size={17} />Add new listing</Button>
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}

// ---- 2. Portfolio summary cards --------------------------------------------
const SUMMARY_ICON_BG = {
  positive: { bg: "var(--evergreen-50)", fg: "var(--positive)" },
  caution:  { bg: "var(--ochre-50)",     fg: "var(--caution)" },
  negative: { bg: "var(--brick-50)",     fg: "var(--negative)" },
};
function SummaryCards() {
  return (
    <div className="rt-lq-summary">
      {window.RT_LQ_SUMMARY.map((c, i) => {
        const ic = SUMMARY_ICON_BG[c.tone] || SUMMARY_ICON_BG.caution;
        const isText = c.value.length > 7;
        return (
          <div key={i} style={{ background: "var(--surface-card)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", padding: "18px", boxShadow: "var(--shadow-sm)", display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "14px" }}>
              <div style={{ width: "34px", height: "34px", borderRadius: "var(--radius-md)", background: ic.bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Icon name={c.icon} size={18} color={ic.fg} />
              </div>
              {c.status && (
                <span style={{ display: "inline-flex", alignItems: "center", gap: "5px", fontSize: "11px", fontWeight: 600, color: STATUS_FG[c.tone] }}>
                  <SignalDot tone={c.tone} />{c.status}
                </span>
              )}
            </div>
            <div style={{ fontFamily: isText ? "var(--font-sans)" : "var(--font-mono)", fontSize: isText ? "18px" : "27px", fontWeight: 600, lineHeight: 1.15, color: "var(--text-strong)", marginBottom: "6px", letterSpacing: isText ? "-0.01em" : "normal" }}>{c.value}</div>
            <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-body)", marginBottom: "3px" }}>{c.title}</div>
            <div style={{ fontSize: "12px", color: "var(--text-muted)", lineHeight: 1.4, flex: 1 }}>{c.helper}</div>
            {c.note && (
              <div style={{ marginTop: "8px", alignSelf: "flex-start", fontFamily: "var(--font-mono)", fontSize: "10.5px", fontWeight: 600, color: "var(--positive)", background: "var(--evergreen-50)", borderRadius: "var(--radius-sm)", padding: "3px 7px" }}>{c.note}</div>
            )}
            {c.link && (
              <a href={c.link.href} style={{ display: "inline-flex", alignItems: "center", gap: "5px", textDecoration: "none", marginTop: "12px", fontSize: "12px", fontWeight: 600, color: "var(--accent)" }}>
                {c.link.label}<Icon name="arrow-right" size={13} color="var(--accent)" />
              </a>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ---- inline insight strip: most common issue across the portfolio --------
function TopIssueStrip() {
  const t = window.RT_LQ_TOP_ISSUE;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "14px", flexWrap: "wrap", background: "var(--surface-card)", border: "1px solid var(--border)", borderLeft: "3px solid var(--navy-800)", borderRadius: "var(--radius-lg)", boxShadow: "var(--shadow-sm)", padding: "13px 16px", marginTop: "14px" }}>
      <div style={{ width: "32px", height: "32px", flex: "none", borderRadius: "var(--radius-md)", background: "var(--ochre-50)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Icon name="map-pin" size={17} color="var(--caution)" />
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: "8px", flexWrap: "wrap", flex: 1, minWidth: 0 }}>
        <span style={{ fontSize: "10.5px", fontWeight: 700, letterSpacing: "var(--tracking-caps)", textTransform: "uppercase", color: "var(--text-muted)" }}>{t.label}</span>
        <span style={{ fontSize: "14.5px", fontWeight: 700, color: "var(--text-strong)" }}>{t.value}</span>
        <span style={{ fontSize: "12.5px", color: "var(--text-muted)" }}>· {t.helper}</span>
      </div>
      <a href={t.href} style={{ textDecoration: "none" }}>
        <Button variant="accent" size="sm"><Icon name="map-pin" size={14} />{t.cta}</Button>
      </a>
    </div>
  );
}

// Score-meaning legend — what a number out of 100 means.
function ScoreLegend({ style }) {
  const bands = [
    { range: "80–100", label: "Good", fg: "var(--positive)" },
    { range: "60–79", label: "Needs improvement", fg: "var(--caution)" },
    { range: "Below 60", label: "Urgent fixes", fg: "var(--negative)" },
  ];
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "14px", flexWrap: "wrap", ...style }}>
      {bands.map((b, i) => (
        <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "11.5px", color: "var(--text-muted)" }}>
          <span style={{ width: "7px", height: "7px", flex: "none", borderRadius: "var(--radius-full)", background: b.fg }} />
          <strong style={{ fontFamily: "var(--font-mono)", fontWeight: 600, color: "var(--text-body)" }}>{b.range}</strong>
          <span>{b.label}</span>
        </span>
      ))}
    </div>
  );
}

// ---- 3. Filter + sort controls ---------------------------------------------
function FilterControls({ filter, setFilter }) {
  const periodControl = (
    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
      <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-muted)", whiteSpace: "nowrap" }}>Activity period</span>
      <Select size="sm" defaultValue="30" options={[{ value: "7", label: "Last 7 days" }, { value: "30", label: "Last 30 days" }, { value: "90", label: "Last 90 days" }]} style={{ minWidth: "140px" }} />
    </div>
  );
  return (
    <div>
      <SectionHead title="Fix these listings first" sub="Highest buyer interest with lowest listing quality shown first." right={periodControl} />
      <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginBottom: "14px" }}>
        {window.RT_LQ_FILTERS.map((f) => {
          const on = filter === f.key;
          return (
            <button key={f.key} onClick={() => setFilter(f.key)} style={{
              fontFamily: "var(--font-sans)", fontSize: "13px", fontWeight: 600, cursor: "pointer",
              padding: "7px 14px", borderRadius: "var(--radius-full)",
              border: `1px solid ${on ? "var(--navy-800)" : "var(--border-strong)"}`,
              background: on ? "var(--navy-800)" : "var(--surface-card)",
              color: on ? "#fff" : "var(--text-body)", transition: "all 120ms cubic-bezier(0.4,0,0.2,1)",
            }}>{f.label}</button>
          );
        })}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "12px", fontWeight: 600, color: "var(--text-muted)", paddingRight: "4px" }}>
          <Icon name="sliders-horizontal" size={14} color="var(--text-muted)" />Narrow
        </span>
        <Select size="sm" defaultValue="all" options={[{ value: "all", label: "All cities" }, { value: "udupi", label: "Udupi" }, { value: "blr", label: "Bengaluru" }]} style={{ minWidth: "130px" }} />
        <Select size="sm" defaultValue="all" options={[{ value: "all", label: "All areas" }, { value: "malpe", label: "Malpe" }, { value: "manipal", label: "Manipal" }, { value: "brahmavar", label: "Brahmavar" }]} style={{ minWidth: "130px" }} />
        <div style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: "8px" }}>
          <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>Sort</span>
          <Select size="sm" defaultValue="views" options={[{ value: "views", label: "Highest views with issues" }, { value: "quality", label: "Lowest quality first" }, { value: "stale", label: "Most stale first" }]} style={{ minWidth: "180px" }} />
        </div>
      </div>
    </div>
  );
}

// ---- 4. Worklist table -----------------------------------------------------
const COLS = ["Listing", "Area", "Views", "Enquiries", "Signal", "Quality", "Main issue", "Action"];
function Worklist({ rows, selectedId, onSelect }) {
  return (
    <Card padding="none" style={{ overflow: "hidden" }}>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "var(--font-sans)", minWidth: "680px" }}>
          <thead>
            <tr style={{ background: "var(--navy-100)", textAlign: "left" }}>
              {COLS.map((h) => (
                <th key={h} style={{ padding: "12px 10px", fontSize: "10.5px", fontWeight: 700, letterSpacing: "var(--tracking-caps)", textTransform: "uppercase", color: "var(--navy-700)", whiteSpace: "nowrap", textAlign: h === "Action" ? "right" : "left" }}>{h}</th>
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
                  <td style={{ padding: "20px 10px", fontWeight: 600, color: "var(--text-strong)", fontSize: "14.5px", lineHeight: 1.35, minWidth: "150px" }}>
                    <span style={{ display: "inline-flex", alignItems: "flex-start", gap: "8px" }}>
                      {sel && <span style={{ width: "6px", height: "6px", flex: "none", marginTop: "6px", borderRadius: "var(--radius-full)", background: "var(--navy-800)" }} />}
                      {r.title}
                    </span>
                  </td>
                  <td style={{ padding: "20px 10px", fontSize: "13.5px", color: "var(--text-body)", whiteSpace: "nowrap" }}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: "5px" }}><Icon name="map-pin" size={14} color="var(--text-muted)" />{r.area}</span>
                  </td>
                  <td style={{ padding: "20px 10px", fontFamily: "var(--font-mono)", fontWeight: 600, fontSize: "14px", color: "var(--text-strong)" }}>{r.views}</td>
                  <td style={{ padding: "20px 10px", fontFamily: "var(--font-mono)", fontWeight: 600, fontSize: "14px", color: r.enquiries === 0 && r.enquiryAlert ? "var(--caution)" : "var(--text-body)" }}>{r.enquiries}</td>
                  <td style={{ padding: "20px 10px", minWidth: "116px" }}>
                    <span style={{ display: "inline-flex", alignItems: "flex-start", gap: "7px", fontSize: "13px", fontWeight: 600, color: "var(--text-body)", lineHeight: 1.35 }}><SignalDot tone={r.signalTone} /><span style={{ marginTop: "-1px" }}>{r.signal}</span></span>
                  </td>
                  <td style={{ padding: "20px 10px" }}><QualityPill q={r.quality} /></td>
                  <td style={{ padding: "20px 10px", minWidth: "108px" }}>
                    <span style={{ display: "inline-flex", alignItems: "flex-start", gap: "7px", fontSize: "13.5px", color: "var(--text-body)", lineHeight: 1.4 }}>
                      <Icon name="alert-triangle" size={14} color="var(--text-muted)" style={{ marginTop: "2px", flex: "none" }} />{r.issue}
                    </span>
                  </td>
                  <td style={{ padding: "20px 10px", textAlign: "right" }}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: "5px", fontSize: "12.5px", fontWeight: 600, color: "var(--accent)", border: "1px solid var(--accent-tint)", background: sel ? "var(--paper)" : "var(--copper-100)", borderRadius: "var(--radius-full)", padding: "6px 11px", whiteSpace: "nowrap" }}>
                      {r.action}
                    </span>
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

// ---- Table footer notes: signals explained + enquiry definition ------------
function TableNotes() {
  const [open, setOpen] = React.useState(false);
  return (
    <div style={{ marginTop: "12px", display: "flex", flexDirection: "column", gap: "10px" }}>
      <p style={{ margin: 0, fontSize: "12px", color: "var(--text-muted)", lineHeight: 1.5 }}>
        Listings are ordered by buyer interest against current quality. Plain-English signals are shown instead of enquiry-rate maths.
      </p>
      <div style={{ display: "flex", alignItems: "center", gap: "16px", flexWrap: "wrap" }}>
        <button onClick={() => setOpen(!open)} style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: 0, background: "transparent", border: "none", cursor: "pointer", fontFamily: "var(--font-sans)", fontSize: "12.5px", fontWeight: 600, color: "var(--navy-700)" }}>
          <Icon name="eye" size={14} color="var(--navy-700)" />Signals explained
          <Icon name="chevron-down" size={14} color="var(--navy-700)" style={{ transform: open ? "none" : "rotate(-90deg)", transition: "transform 200ms cubic-bezier(0.4,0,0.2,1)" }} />
        </button>
        <span style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "12px", color: "var(--text-muted)" }}>
          <Icon name="message-circle" size={13} color="var(--text-muted)" />Enquiries include call clicks, WhatsApp clicks and enquiry forms.
        </span>
      </div>
      {open && (
        <div style={{ fontSize: "12.5px", color: "var(--text-muted)", lineHeight: 1.55, background: "var(--surface-subtle)", border: "1px solid var(--border)", borderRadius: "var(--radius-md)", padding: "12px 14px", maxWidth: "640px" }}>
          Buyer signals use observed listing activity on ReTrends. For example, “many views, no enquiries” means the listing has enough views to suggest buyers are interested, but no enquiry actions yet.
        </div>
      )}
      <div style={{ display: "inline-flex", alignItems: "center", gap: "8px", flexWrap: "wrap", fontSize: "11.5px", color: "var(--text-muted)", paddingTop: "2px" }}>
        <Icon name="calendar" size={13} color="var(--text-muted)" />
        <strong style={{ fontWeight: 600, color: "var(--text-body)" }}>Data refreshed: 16 Jun 2026</strong>
        <span style={{ color: "var(--border-strong)" }}>·</span>
        <span>Views and enquiries are based on the selected activity period.</span>
      </div>
    </div>
  );
}

// ---- Empty state (no listings match) ---------------------------------------
function EmptyState({ filterLabel }) {
  return (
    <Card padding="lg" style={{ textAlign: "center", padding: "44px 28px" }}>
      <div style={{ width: "48px", height: "48px", margin: "0 auto 14px", borderRadius: "var(--radius-md)", background: "var(--evergreen-50)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Icon name="shield-check" size={24} color="var(--positive)" />
      </div>
      <h3 style={{ margin: "0 0 6px", fontSize: "17px", fontWeight: 600, color: "var(--text-strong)" }}>Your listings look healthy</h3>
      <p style={{ margin: "0 auto 18px", fontSize: "14px", color: "var(--text-muted)", lineHeight: 1.5, maxWidth: "420px" }}>
        No urgent listing quality issues were found{filterLabel ? ` for "${filterLabel}"` : ""}. Keep listings fresh by updating photos, price and key details regularly.
      </p>
      <a href="/broker/listings" style={{ textDecoration: "none" }}><Button variant="outline" size="sm">View all listings<Icon name="arrow-right" size={15} /></Button></a>
    </Card>
  );
}

// ---- 5+6+7. Selected listing detail panel ----------------------------------
function MetricTile({ value, label, mono = true, alert = false }) {
  return (
    <div style={{ background: alert ? "var(--ochre-50)" : "var(--surface-subtle)", borderRadius: "var(--radius-md)", padding: "12px 12px" }}>
      <div style={{ fontFamily: mono ? "var(--font-mono)" : "var(--font-sans)", fontSize: mono ? "19px" : "13px", fontWeight: 600, lineHeight: 1.2, color: alert ? "var(--caution)" : "var(--text-strong)" }}>{value}</div>
      <div style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "4px" }}>{label}</div>
    </div>
  );
}

function DetailPanel({ listing }) {
  const l = listing;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      {/* identity */}
      <Card style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span style={{ width: "7px", height: "7px", borderRadius: "var(--radius-full)", background: "var(--accent)" }} />
          <span style={{ fontSize: "10.5px", fontWeight: 700, letterSpacing: "var(--tracking-caps)", textTransform: "uppercase", color: "var(--text-muted)" }}>Selected listing</span>
        </div>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "10px" }}>
          <h3 style={{ margin: 0, fontSize: "17px", fontWeight: 600, color: "var(--text-strong)", lineHeight: 1.3 }}>{l.title}</h3>
          <Badge tone={l.statusTone}>{l.statusBadge}</Badge>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "12.5px", color: "var(--text-muted)", flexWrap: "wrap" }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}><Icon name="map-pin" size={13} />{l.area}</span>
          <span style={{ color: "var(--border-strong)" }}>·</span><span>Live</span>
          <span style={{ color: "var(--border-strong)" }}>·</span><span>Updated {l.updated}</span>
        </div>

        {/* metric tiles */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
          <MetricTile value={<QualityPill q={l.quality} size={17} />} label="Quality score" mono={false} />
          <MetricTile value={l.views} label="Views" />
          <MetricTile value={l.enquiries} label="Enquiries" alert={l.enquiries === 0 && l.enquiryAlert} />
          <MetricTile value={l.signal} label="Buyer signal" mono={false} />
        </div>

        {/* trust + data notes */}
        <div style={{ display: "flex", alignItems: "center", gap: "14px", flexWrap: "wrap", paddingTop: "2px" }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "12px", fontWeight: 600, color: STATUS_FG[l.confidenceTone] }}>
            <SignalDot tone={l.confidenceTone} />{l.confidence}
          </span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "12px", color: "var(--text-muted)" }}>
            <Icon name="map-pin" size={13} color="var(--text-muted)" />Location: <strong style={{ fontWeight: 600, color: l.locationNote === "Verified" ? "var(--positive)" : "var(--caution)" }}>{l.locationNote}</strong>
          </span>
        </div>
        <p style={{ margin: 0, fontSize: "12.5px", color: "var(--text-muted)", lineHeight: 1.5, background: "var(--surface-subtle)", borderRadius: "var(--radius-md)", padding: "10px 12px" }}>{l.note}</p>
      </Card>

      {/* fix checklist */}
      <Card padding="none" style={{ overflow: "hidden" }}>
        <div style={{ padding: "16px 18px 12px" }}>
          <h4 style={{ margin: "0 0 2px", fontSize: "15px", fontWeight: 700, color: "var(--text-strong)" }}>Top actions for this listing</h4>
          <p style={{ margin: 0, fontSize: "12.5px", color: "var(--text-muted)" }}>Do the high-priority fixes first.</p>
        </div>
        {l.checklist.map((a, i) => {
          const p = PRIORITY[a.priority] || PRIORITY.Low;
          return (
            <div key={i} style={{ display: "flex", gap: "12px", padding: "14px 18px", borderTop: "1px solid var(--border)" }}>
              <div style={{ width: "26px", height: "26px", flex: "none", borderRadius: "var(--radius-full)", background: i === 0 ? "var(--navy-800)" : "var(--navy-100)", color: i === 0 ? "#fff" : "var(--navy-800)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-mono)", fontSize: "12px", fontWeight: 600 }}>{i + 1}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "3px", flexWrap: "wrap" }}>
                  <span style={{ fontSize: "14px", fontWeight: 600, color: "var(--text-strong)" }}>{a.title}</span>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", fontSize: "10px", fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase", color: p.fg, background: p.bg, borderRadius: "var(--radius-full)", padding: "2px 8px" }}>{a.priority}</span>
                </div>
                <p style={{ margin: "0 0 10px", fontSize: "12.5px", color: "var(--text-muted)", lineHeight: 1.45 }}>{a.why}</p>
                <Button variant={i === 0 ? "accent" : "outline"} size="sm"><Icon name={a.icon} size={14} />{a.cta}</Button>
              </div>
            </div>
          );
        })}
      </Card>
    </div>
  );
}

function ScoreExplain({ listing, style }) {
  const [open, setOpen] = React.useState(true);
  return (
    <Card padding="none" style={{ overflow: "hidden", ...style }}>
      <button onClick={() => setOpen(!open)} style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", padding: "15px 18px", background: "transparent", border: "none", cursor: "pointer", textAlign: "left", fontFamily: "var(--font-sans)" }}>
        <span style={{ fontSize: "15px", fontWeight: 700, color: "var(--text-strong)" }}>How listing quality is scored</span>
        <Icon name="chevron-down" size={18} color="var(--text-muted)" style={{ transform: open ? "none" : "rotate(-90deg)", transition: "transform 200ms cubic-bezier(0.4,0,0.2,1)" }} />
      </button>
      {open && (
        <div style={{ padding: "0 18px 16px" }}>
          <p style={{ margin: "0 0 12px", fontSize: "12.5px", color: "var(--text-muted)", lineHeight: 1.5 }}>
            Listing quality is based on information completeness and trust signals such as location confidence, photos, key details, freshness and verification status. Buyer response is shown separately to help prioritise fixes.
          </p>
          <ScoreLegend style={{ marginBottom: "14px", paddingBottom: "14px", borderBottom: "1px solid var(--border)" }} />
          <div style={{ fontSize: "10.5px", fontWeight: 700, letterSpacing: "var(--tracking-caps)", textTransform: "uppercase", color: "var(--text-muted)", marginBottom: "8px" }}>What you can fix</div>
          <div style={{ display: "flex", flexDirection: "column", gap: "1px", background: "var(--border)", borderRadius: "var(--radius-md)", overflow: "hidden" }}>
            {listing.score.map((s, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", padding: "11px 13px", background: "var(--surface-card)" }}>
                <span style={{ fontSize: "13px", color: "var(--text-body)" }}>{s.label}</span>
                <span style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "12.5px", fontWeight: 600, color: STATUS_FG[s.tone] }}>
                  <SignalDot tone={s.tone} />{s.status}
                </span>
              </div>
            ))}
          </div>
          {/* Buyer response is separate from quality — it does not lower the score. */}
          <div style={{ marginTop: "14px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", padding: "12px 12px", background: "var(--surface-subtle)", border: "1px dashed var(--border-strong)", borderRadius: "var(--radius-md)" }}>
            <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-body)" }}>Buyer response
              <span style={{ display: "block", fontSize: "11px", fontWeight: 400, color: "var(--text-muted)", marginTop: "1px" }}>Shown separately — does not lower the score</span>
            </span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "12.5px", fontWeight: 600, color: STATUS_FG[listing.signalTone], whiteSpace: "nowrap" }}>
              <SignalDot tone={listing.signalTone} />{listing.signal}
            </span>
          </div>
        </div>
      )}
    </Card>
  );
}

// ---- 8. Quick fixes (bulk) -------------------------------------------------
function QuickFixes() {
  return (
    <Card style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: "12px" }}>
        <div style={{ width: "38px", height: "38px", flex: "none", borderRadius: "var(--radius-md)", background: "var(--navy-100)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Icon name="sliders-horizontal" size={19} color="var(--navy-800)" />
        </div>
        <div>
          <h3 style={{ margin: "0 0 2px", fontSize: "16px", fontWeight: 700, color: "var(--text-strong)" }}>Quick fixes</h3>
          <p style={{ margin: 0, fontSize: "13px", color: "var(--text-muted)" }}>Fix common issues across multiple listings.</p>
        </div>
      </div>
      <div className="rt-lq-quick">
        {window.RT_LQ_QUICKFIXES.map((q, i) => (
          <button key={i} style={{
            display: "flex", alignItems: "center", gap: "10px", cursor: "pointer", textAlign: "left",
            padding: "12px 14px", borderRadius: "var(--radius-md)", border: "1px solid var(--border)",
            background: "var(--surface-card)", fontFamily: "var(--font-sans)", transition: "all 120ms cubic-bezier(0.4,0,0.2,1)",
          }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--border-strong)"; e.currentTarget.style.boxShadow = "var(--shadow-sm)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.boxShadow = "none"; }}>
            <Icon name={q.icon} size={17} color="var(--navy-800)" />
            <span style={{ flex: 1 }}>
              <span style={{ display: "block", fontSize: "13px", fontWeight: 600, color: "var(--text-strong)" }}>{q.label}</span>
              <span style={{ display: "block", fontSize: "11.5px", color: "var(--text-muted)" }}><span style={{ fontFamily: "var(--font-mono)", fontWeight: 600 }}>{q.count}</span> listings</span>
            </span>
            <Icon name="arrow-right" size={15} color="var(--text-muted)" />
          </button>
        ))}
      </div>
    </Card>
  );
}

// ---- 9. Cross-links to other broker pages ----------------------------------
function CrossLinks() {
  const links = [
    { icon: "map-pin", title: "View area insights", text: "See what buyers want in a selected city and area.", href: "/broker/areas/udupi/malpe" },
    { icon: "trending-up", title: "View demand gaps", text: "See where buyer demand is ahead of visible supply.", href: "/broker/demand-gaps" },
  ];
  return (
    <div className="rt-lq-cross">
      {links.map((x, i) => (
        <a key={i} href={x.href} style={{ textDecoration: "none" }}>
          <Card interactive style={{ display: "flex", alignItems: "center", gap: "14px" }}>
            <div style={{ width: "40px", height: "40px", flex: "none", borderRadius: "var(--radius-md)", background: "var(--surface-subtle)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Icon name={x.icon} size={19} color="var(--navy-700)" />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <h3 style={{ margin: "0 0 2px", fontSize: "15px", fontWeight: 600, color: "var(--text-strong)" }}>{x.title}</h3>
              <p style={{ margin: 0, fontSize: "13px", color: "var(--text-muted)", lineHeight: 1.4 }}>{x.text}</p>
            </div>
            <Icon name="arrow-right" size={17} color="var(--text-muted)" />
          </Card>
        </a>
      ))}
    </div>
  );
}

// ---- assembled page --------------------------------------------------------
function RTListingQuality() {
  const [filter, setFilter] = React.useState("all");
  const [selectedId, setSelectedId] = React.useState(window.RT_LQ_LISTINGS[0].id);

  const rows = window.RT_LQ_LISTINGS.filter((l) => filter === "all" || l.tags.includes(filter));
  const filterLabel = (window.RT_LQ_FILTERS.find((f) => f.key === filter) || {}).label;
  const selected = window.RT_LQ_LISTINGS.find((l) => l.id === selectedId) || window.RT_LQ_LISTINGS[0];

  return (
    <div style={{ background: "var(--background)", minHeight: "100vh", paddingBottom: "48px" }}>
      <HeaderBand />
      <div style={{ maxWidth: "1280px", margin: "0 auto", padding: "28px 24px 0", display: "flex", flexDirection: "column", gap: "32px" }}>
        <div>
          <SummaryCards />
          <TopIssueStrip />
        </div>
        <div>
          <FilterControls filter={filter} setFilter={setFilter} />
          <div className="rt-lq-grid" style={{ marginTop: "20px" }}>
            <div>
              {rows.length ? <Worklist rows={rows} selectedId={selectedId} onSelect={setSelectedId} /> : <EmptyState filterLabel={filterLabel} />}
              <TableNotes />
              <ScoreExplain listing={selected} style={{ marginTop: "20px" }} />
            </div>
            <div className="rt-lq-panel">
              <DetailPanel listing={selected} />
            </div>
          </div>
        </div>
        <QuickFixes />
        <CrossLinks />
      </div>
    </div>
  );
}

window.RTListingQuality = RTListingQuality;
