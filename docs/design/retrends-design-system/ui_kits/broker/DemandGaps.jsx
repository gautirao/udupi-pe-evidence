/* ReTrends — Demand Gaps (cross-market opportunity workspace).
   Exports window.RTDemandGaps. Answers: "Where are buyer searches ahead of
   visible matching supply, and should I source a new listing, improve an
   existing one, compare an area, or wait for more data?"

   Scope: it surfaces cross-area demand signals and routes OUT to Listing
   Quality / My Listings / Area Intelligence. It deliberately does NOT
   reproduce the full Listing Quality fix workflow or the Area Intelligence
   page — only cautious previews. Built on the approved Pan-India tokens;
   restrained copper for the single primary CTA, muted evergreen/ochre for
   signals, soft red avoided. Every signal carries an honest confidence label. */

;(function () {
const { Button, Icon, Badge } = window.ReTrendsDesignSystem_f37966;

const REFRESHED = "20 Jun 2026";

/* -------------------------------------------------------------- data ----- */

const SUMMARY = [
  { icon: "search", value: "1,284", label: "Buyer searches", helper: "Searches and filters this week.", footer: { text: "+18% vs last week", tone: "positive" } },
  { icon: "message-circle", value: "86", label: "Buyer enquiries", helper: "Calls, WhatsApp clicks and forms.", footer: { text: "+7 since Monday", tone: "positive" } },
  { icon: "trending-up", value: "12", label: "Demand gaps found", helper: "4 new this week.", tile: "accent" },
  { icon: "building", value: "18", label: "Your matching listings", helper: "Listings that match active demand.", note: "vs 43 searches" },
  { icon: "shield-check", value: "5", label: "Opportunities to act on", helper: "Enough data to add or improve listings.", tile: "positive", highlight: true },
];

/* Three headline opportunities. `kind` drives the colour + the source-vs-improve
   framing: supply gaps need NEW listings, info/price gaps mean EXISTING
   listings can be improved. */
const OPPS = [
  {
    kind: "supply", id: "brahmavar-agri",
    accent: "var(--copper-500)", accentSoft: "var(--copper-100)", accentText: "var(--accent-hover)",
    eyebrow: "Supply gap · source new",
    tag: "Agri land · 1–2 acres", area: "Brahmavar",
    title: "Agricultural land near Brahmavar",
    copy: "23 buyers searched for 1–2 acre agricultural land with road access and water source. Only 3 matching listings are live.",
    searches: "23", matching: "3",
    signals: [["Demand", "High", "caution"], ["Supply", "Low", "positive"], ["Confidence", "Enough data", "positive"]],
    action: "Add or source 1–2 acre land with road and water details.",
    cta: { label: "Add matching listing", icon: "plus", variant: "accent", href: "/broker/listings/new?need=agri-land&area=brahmavar" },
  },
  {
    kind: "price", id: "malpe-plots",
    accent: "var(--navy-800)", accentSoft: "var(--navy-100)", accentText: "var(--navy-700)",
    eyebrow: "Price signal · review pricing",
    tag: "Plots · under ₹50L", area: "Malpe",
    title: "Plots under ₹50L in Malpe",
    copy: "41 buyer searches are under ₹50L. Most visible listings are above ₹65L, so there may be a budget mismatch.",
    searches: "41", matching: "5",
    signals: [["Demand", "High", "caution"], ["Supply", "Medium", "neutral"], ["Price signal", "High", "accent"]],
    action: "Source lower-budget verified plots or review pricing on suitable listings.",
    cta: { label: "Review this gap", icon: "arrow-right", variant: "primary", href: "/broker/demand-gaps?gap=malpe-plots" },
  },
  {
    kind: "info", id: "manipal-2bhk",
    accent: "var(--evergreen-600)", accentSoft: "var(--evergreen-50)", accentText: "var(--evergreen-600)",
    eyebrow: "Information gap · improve listing",
    tag: "2BHK · school proximity", area: "Manipal",
    title: "2BHK near schools in Manipal",
    copy: "18 buyers searched school-first for 2BHK homes. Several listings do not include school-distance information.",
    searches: "18", matching: "7",
    signals: [["Demand", "Medium", "neutral"], ["Supply", "Medium", "neutral"], ["Info gap", "High", "accent"]],
    action: "Add school-distance details to existing 2BHK listings.",
    cta: { label: "Improve my listings", icon: "file-check", variant: "outline", href: "/broker/listing-quality?filter=school-distance" },
  },
];

const SIGNAL_TONE = {
  "Demand ahead of supply": "caution",
  "Budget mismatch": "accent",
  "Info gap": "navy",
  "Possible gap": "neutral",
};
const ROWS = [
  { need: "Agricultural land", spec: "1–2 acres", area: "Brahmavar", demand: "23", matching: "3", signal: "Demand ahead of supply", action: "Add/source land", actKind: "add" },
  { need: "Plot", spec: "Under ₹50L", area: "Malpe", demand: "41", matching: "5", signal: "Budget mismatch", action: "Add lower-budget plots", actKind: "add" },
  { need: "2BHK", spec: "Near schools", area: "Manipal", demand: "18", matching: "7", signal: "Info gap", action: "Add school-distance details", actKind: "improve" },
  { need: "Villa", spec: "₹80L–₹1.2Cr", area: "Kaup", demand: "9", matching: "2", signal: "Possible gap", action: "Add verified villas", actKind: "add" },
];

const CAPTURE = [
  { title: "Agri land 1.5 acre — Brahmavar", note: "Add water source and road access to match 23 active searches.", searches: "23" },
  { title: "Plot in Malpe — Survey No. 142", note: "Verify location to appear in more under-₹50L demand results.", searches: "41" },
  { title: "2BHK Manipal — Near MIT campus", note: "Add nearby school details to match school-first searches.", searches: "18" },
];

/* ------------------------------------------------------------ pieces ----- */

const CONF = {
  "Enough data": "var(--positive)",
  "Limited data": "var(--caution)",
  "Not enough data": "var(--text-muted)",
};
function ConfidencePill({ level }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "12px", fontWeight: 500, color: "var(--text-muted)", whiteSpace: "nowrap" }}>
      <span style={{ width: "6px", height: "6px", borderRadius: "var(--radius-full)", background: CONF[level] || "var(--text-muted)", flex: "none" }} />
      {level}
    </span>
  );
}

function SectionHead({ eyebrow, title, sub, right }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: "16px", marginBottom: "18px" }}>
      <div>
        <h2 style={{ margin: 0, fontFamily: "var(--font-serif)", fontSize: "26px", fontWeight: 600, lineHeight: 1.15, letterSpacing: "-0.02em", color: "var(--text-strong)" }}>{title}</h2>
        {sub && <p style={{ margin: "8px 0 0", fontSize: "14.5px", color: "var(--text-muted)", maxWidth: "640px", lineHeight: 1.5 }}>{sub}</p>}
      </div>
      {right}
    </div>
  );
}

const TILE = {
  neutral: { bg: "var(--surface-navy-tint)", fg: "var(--navy-700)" },
  accent: { bg: "var(--accent-tint)", fg: "var(--accent-hover)" },
  positive: { bg: "var(--positive-bg)", fg: "var(--positive)" },
};
function SummaryCard({ m }) {
  const isText = m.value.length > 5;
  const tile = TILE[m.tile] || TILE.neutral;
  return (
    <div style={{
      display: "flex", flexDirection: "column",
      background: m.highlight ? "var(--positive-bg)" : "var(--surface-card)",
      border: m.highlight ? "1px solid rgba(31,122,92,0.25)" : "1px solid var(--border)",
      borderRadius: "var(--radius-lg)", padding: "18px", boxShadow: "var(--shadow-xs)",
    }}>
      <div style={{ width: "34px", height: "34px", borderRadius: "var(--radius-md)", background: m.highlight ? "var(--surface-card)" : tile.bg, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: "16px" }}>
        <Icon name={m.icon} size={17} color={tile.fg} />
      </div>
      <div style={{ fontFamily: isText ? "var(--font-sans)" : "var(--font-mono)", fontSize: isText ? "20px" : "28px", fontWeight: 600, lineHeight: 1, letterSpacing: "-0.01em", color: "var(--text-strong)" }}>{m.value}</div>
      <div style={{ fontSize: "14px", fontWeight: 700, color: "var(--text-strong)", marginTop: "10px" }}>{m.label}</div>
      <div style={{ fontSize: "12.5px", color: "var(--text-muted)", lineHeight: 1.45, marginTop: "4px", flex: 1 }}>{m.helper}</div>
      {m.footer && <div style={{ fontFamily: "var(--font-mono)", fontSize: "12px", fontWeight: 600, color: `var(--${m.footer.tone})`, marginTop: "12px" }}>{m.footer.text}</div>}
      {m.note && <div style={{ fontFamily: "var(--font-mono)", fontSize: "11.5px", color: "var(--text-muted)", marginTop: "12px" }}>{m.note}</div>}
    </div>
  );
}

function MiniMetric({ value, label, soft, fg }) {
  return (
    <div style={{ flex: 1, background: soft, borderRadius: "var(--radius-md)", padding: "12px 14px", textAlign: "center" }}>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: "24px", fontWeight: 600, lineHeight: 1, color: fg }}>{value}</div>
      <div style={{ fontSize: "11.5px", color: "var(--text-muted)", marginTop: "5px" }}>{label}</div>
    </div>
  );
}

function OpportunityCard({ o, highlight }) {
  const [hover, setHover] = React.useState(false);
  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: "flex", flexDirection: "column", overflow: "hidden",
        background: "var(--surface-card)", border: highlight ? "1.5px solid var(--accent)" : "1px solid var(--border)",
        borderRadius: "var(--radius-lg)",
        boxShadow: highlight ? "0 0 0 4px var(--accent-tint), var(--shadow-lg)" : (hover ? "var(--shadow-lg)" : "var(--shadow-sm)"),
        transform: hover && !highlight ? "translateY(-2px)" : "none",
        transition: "transform var(--dur-normal) var(--ease-standard), box-shadow var(--dur-normal) var(--ease-standard)",
      }}
    >
      <div style={{ height: "4px", background: o.accent }} />
      <div style={{ display: "flex", flexDirection: "column", padding: "20px", flex: 1 }}>
        {highlight && (
          <div style={{ display: "inline-flex", alignItems: "center", gap: "6px", alignSelf: "flex-start", marginBottom: "14px", fontSize: "10.5px", fontWeight: 700, letterSpacing: "var(--tracking-caps)", textTransform: "uppercase", color: "var(--accent)", background: "var(--accent-tint)", borderRadius: "var(--radius-full)", padding: "4px 10px" }}>
            <Icon name="check" size={12} color="var(--accent)" />Reviewing this gap
          </div>
        )}
        {/* tag + area */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px" }}>
          <span style={{ display: "inline-flex", alignItems: "center", fontFamily: "var(--font-mono)", fontSize: "11.5px", fontWeight: 600, color: "var(--text-body)", background: "var(--surface-subtle)", borderRadius: "var(--radius-full)", padding: "5px 11px" }}>{o.tag}</span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", fontSize: "12.5px", color: "var(--text-muted)", whiteSpace: "nowrap" }}>
            <Icon name="map-pin" size={13} color="var(--text-muted)" />{o.area}
          </span>
        </div>

        {/* type eyebrow */}
        <div style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "var(--tracking-caps)", textTransform: "uppercase", color: o.accentText, marginTop: "16px" }}>{o.eyebrow}</div>
        <h3 style={{ margin: "6px 0 0", fontSize: "19px", fontWeight: 700, lineHeight: 1.25, color: "var(--text-strong)" }}>{o.title}</h3>
        <p style={{ margin: "8px 0 0", fontSize: "13.5px", lineHeight: 1.55, color: "var(--text-body)" }}>{o.copy}</p>

        {/* metrics */}
        <div style={{ display: "flex", gap: "10px", marginTop: "18px" }}>
          <MiniMetric value={o.searches} label="searches" soft={o.accentSoft} fg={o.accentText} />
          <MiniMetric value={o.matching} label="matching" soft="var(--surface-subtle)" fg="var(--text-strong)" />
        </div>

        {/* signals */}
        <div style={{ display: "flex", gap: "8px", marginTop: "18px" }}>
          {o.signals.map(([label, val, tone], i) => (
            <div key={i} style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: "10px", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--text-muted)", marginBottom: "6px" }}>{label}</div>
              <Badge tone={tone} pill>{val}</Badge>
            </div>
          ))}
        </div>

        {/* recommended action */}
        <div style={{ display: "flex", alignItems: "flex-start", gap: "9px", marginTop: "18px", padding: "12px 13px", background: "var(--surface-subtle)", borderRadius: "var(--radius-md)" }}>
          <Icon name="arrow-up-right" size={15} color={o.accentText} style={{ marginTop: "1px" }} />
          <span style={{ fontSize: "13px", color: "var(--text-body)", lineHeight: 1.5 }}>{o.action}</span>
        </div>

        <div style={{ flex: 1, minHeight: "18px" }} />
        <a href={o.cta.href} style={{ textDecoration: "none" }}>
          <Button variant={o.cta.variant} fullWidth><Icon name={o.cta.icon} size={16} />{o.cta.label}</Button>
        </a>
      </div>
    </div>
  );
}

function ActLink({ kind, href }) {
  const improve = kind === "improve";
  return (
    <a href={href} style={{ display: "inline-flex", alignItems: "center", gap: "4px", textDecoration: "none", fontSize: "12.5px", fontWeight: 600, color: improve ? "var(--evergreen-600)" : "var(--accent)", whiteSpace: "nowrap" }}>
      {improve ? "Improve" : "Add"}<Icon name="arrow-up-right" size={13} color={improve ? "var(--evergreen-600)" : "var(--accent)"} />
    </a>
  );
}

function GapsTable() {
  const cols = [
    { label: "Buyer need", w: "auto" },
    { label: "Area", w: "120px" },
    { label: "Demand", w: "96px" },
    { label: "Matching supply", w: "120px" },
    { label: "Signal", w: "150px" },
    { label: "Action", w: "260px" },
  ];
  return (
    <div style={{ background: "var(--surface-card)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", boxShadow: "var(--shadow-sm)", overflow: "hidden" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed", fontFamily: "var(--font-sans)" }}>
        <colgroup>{cols.map((c, i) => <col key={i} style={{ width: c.w }} />)}</colgroup>
        <thead>
          <tr style={{ background: "var(--navy-100)", textAlign: "left" }}>
            {cols.map((c) => (
              <th key={c.label} style={{ padding: "13px 18px", fontSize: "10.5px", fontWeight: 700, letterSpacing: "var(--tracking-caps)", textTransform: "uppercase", color: "var(--navy-700)" }}>{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ROWS.map((r, i) => (
            <tr key={i} style={{ borderTop: "1px solid var(--border)" }}>
              <td style={{ padding: "16px 18px" }}>
                <div style={{ fontSize: "14px", fontWeight: 700, color: "var(--text-strong)" }}>{r.need}</div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: "11.5px", color: "var(--text-muted)", marginTop: "2px" }}>{r.spec}</div>
              </td>
              <td style={{ padding: "16px 18px" }}>
                <a href={"/broker/areas/udupi/" + (({ malpe: "malpe", manipal: "manipal", brahmavar: "brahmavar", karkala: "karkala" })[r.area.toLowerCase()] || "malpe")} style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "13.5px", color: "var(--navy-700)", fontWeight: 600, textDecoration: "none" }}>
                  <Icon name="map-pin" size={13} color="var(--accent)" />{r.area}
                </a>
              </td>
              <td style={{ padding: "16px 18px" }}>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: "15px", fontWeight: 600, color: "var(--text-strong)", lineHeight: 1 }}>{r.demand}</div>
                <div style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "3px" }}>searches</div>
              </td>
              <td style={{ padding: "16px 18px" }}>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: "15px", fontWeight: 600, color: "var(--text-body)", lineHeight: 1 }}>{r.matching}</div>
                <div style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "3px" }}>listings</div>
              </td>
              <td style={{ padding: "16px 18px" }}><Badge tone={SIGNAL_TONE[r.signal] || "neutral"}>{r.signal}</Badge></td>
              <td style={{ padding: "16px 18px" }}>
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "10px" }}>
                  <span style={{ fontSize: "13px", color: "var(--text-body)", lineHeight: 1.45 }}>{r.action}</span>
                  <ActLink kind={r.actKind} href={r.actKind === "improve" ? "/broker/listing-quality" : "/broker/listings/new"} />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CaptureCard({ c }) {
  const [hover, setHover] = React.useState(false);
  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: "flex", flexDirection: "column",
        background: "var(--surface-card)", border: "1px solid var(--border)",
        borderRadius: "var(--radius-lg)", padding: "18px",
        boxShadow: hover ? "var(--shadow-md)" : "var(--shadow-xs)",
        transform: hover ? "translateY(-2px)" : "none",
        transition: "transform var(--dur-normal) var(--ease-standard), box-shadow var(--dur-normal) var(--ease-standard)",
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: "12px" }}>
        <div style={{ width: "36px", height: "36px", flex: "none", borderRadius: "var(--radius-md)", background: "var(--surface-navy-tint)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Icon name="building" size={17} color="var(--navy-700)" />
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: "14.5px", fontWeight: 700, color: "var(--text-strong)", lineHeight: 1.3 }}>{c.title}</div>
          <p style={{ margin: "6px 0 0", fontSize: "13px", color: "var(--text-muted)", lineHeight: 1.5 }}>{c.note}</p>
        </div>
      </div>
      <div style={{ flex: 1, minHeight: "16px" }} />
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px", marginTop: "16px" }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontFamily: "var(--font-mono)", fontSize: "12px", fontWeight: 600, color: "var(--accent)" }}>
          <Icon name="search" size={13} color="var(--accent)" />{c.searches} searches
        </span>
        <a href="/broker/listing-quality" style={{ textDecoration: "none" }}>
          <Button variant="outline" size="sm">Improve listing<Icon name="arrow-right" size={14} /></Button>
        </a>
      </div>
    </div>
  );
}

function AboutBox() {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: "14px", background: "var(--surface-subtle)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", padding: "20px 22px" }}>
      <div style={{ width: "34px", height: "34px", flex: "none", borderRadius: "var(--radius-md)", background: "var(--surface-card)", border: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Icon name="shield-check" size={17} color="var(--navy-700)" />
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: "14px", fontWeight: 700, color: "var(--text-strong)" }}>About these demand signals</div>
        <p style={{ margin: "6px 0 0", fontSize: "13px", color: "var(--text-muted)", lineHeight: 1.6, maxWidth: "760px" }}>
          Demand signals are based on searches, filters, listing views, saves and enquiry clicks on ReTrends. We only show insights when enough activity exists to suggest a useful signal. These are not full-market guarantees.
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "16px", marginTop: "14px" }}>
          <ConfidencePill level="Enough data" />
          <ConfidencePill level="Limited data" />
          <ConfidencePill level="Not enough data" />
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------- page ----- */

function PageHeader() {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "24px", flexWrap: "wrap" }}>
      <div>
        <div style={{ fontSize: "12px", fontWeight: 700, letterSpacing: "var(--tracking-caps)", textTransform: "uppercase", color: "var(--accent)" }}>Broker intelligence</div>
        <h1 style={{ fontFamily: "var(--font-serif)", fontWeight: 600, fontSize: "40px", lineHeight: 1.1, letterSpacing: "-0.02em", color: "var(--text-strong)", margin: "12px 0 0" }}>Demand gaps</h1>
        <p style={{ fontSize: "16px", color: "var(--text-muted)", margin: "10px 0 0", maxWidth: "560px", lineHeight: 1.5 }}>See where buyer searches are ahead of visible matching supply.</p>
      </div>
      <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
        <Button variant="outline" size="lg"><Icon name="route" size={16} />Refresh</Button>
        <Button variant="outline" size="lg"><Icon name="sliders-horizontal" size={16} />Filter</Button>
        <a href="/broker/listings/new" style={{ textDecoration: "none" }}>
          <Button variant="accent" size="lg"><Icon name="plus" size={16} />Add listing</Button>
        </a>
      </div>
    </div>
  );
}

function DemandGaps(props) {
  const highlightId = props && props.highlightId;
  return (
    <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "40px 24px 80px" }}>
      <PageHeader />

      {/* data note */}
      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "22px", fontSize: "12.5px", color: "var(--text-muted)" }}>
        <Icon name="layers" size={14} color="var(--grey-400)" />
        Signals are based on ReTrends searches, filters, views, saves, calls, WhatsApp clicks and enquiry forms.
      </div>

      {/* summary cards */}
      <div className="rt-kpi" style={{ marginTop: "16px" }}>
        {SUMMARY.map((m, i) => <SummaryCard key={i} m={m} />)}
      </div>

      {/* top demand gaps */}
      <div style={{ margin: "52px 0 0" }}>
        <SectionHead
          title="Top demand gaps"
          sub="Highest-priority opportunities based on buyer interest and visible matching supply."
        />
        {/* legend: source vs improve */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: "18px", marginBottom: "18px" }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: "7px", fontSize: "12.5px", color: "var(--text-body)" }}>
            <span style={{ width: "10px", height: "10px", borderRadius: "var(--radius-xs)", background: "var(--copper-500)" }} />
            <strong style={{ fontWeight: 600 }}>Supply gap</strong> — source or add a new listing
          </span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: "7px", fontSize: "12.5px", color: "var(--text-body)" }}>
            <span style={{ width: "10px", height: "10px", borderRadius: "var(--radius-xs)", background: "var(--evergreen-600)" }} />
            <strong style={{ fontWeight: 600 }}>Information gap</strong> — improve an existing listing
          </span>
        </div>
        <div className="rt-cards3">
          {OPPS.map((o, i) => <OpportunityCard key={i} o={o} highlight={highlightId === o.id} />)}
        </div>
      </div>

      {/* all demand gaps */}
      <div style={{ margin: "52px 0 0" }}>
        <SectionHead
          title="All demand gaps"
          sub="Sorted by priority. Use filters to compare area, property type and budget."
        />
        <GapsTable />
      </div>

      {/* listings that can capture demand */}
      <div style={{ margin: "52px 0 0" }}>
        <SectionHead
          title="Listings that can capture demand"
          sub="Some of your listings may match buyer demand if key details are improved."
          right={<a href="/broker/listings" style={{ textDecoration: "none" }}><Button variant="ghost" size="sm">View all listings<Icon name="arrow-right" size={15} /></Button></a>}
        />
        <div className="rt-cards3">
          {CAPTURE.map((c, i) => <CaptureCard key={i} c={c} />)}
        </div>
        <p style={{ margin: "14px 2px 0", fontSize: "12px", color: "var(--text-muted)" }}>Previews only — open Listing Quality to see and fix each listing in full.</p>
      </div>

      {/* about + refreshed */}
      <div style={{ margin: "52px 0 0" }}>
        <AboutBox />
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "16px", flexWrap: "wrap", marginTop: "20px", paddingTop: "18px", borderTop: "1px solid var(--border)" }}>
          <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>ReTrends · Udupi property explorer · Broker intelligence</span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "12px", color: "var(--text-muted)" }}>
            <Icon name="calendar" size={13} color="var(--grey-400)" />Data refreshed · {REFRESHED}
          </span>
        </div>
      </div>
    </div>
  );
}

window.RTDemandGaps = DemandGaps;
})();
