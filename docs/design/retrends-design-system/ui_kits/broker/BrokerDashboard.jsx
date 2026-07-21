/* ReTrends — Broker Dashboard v2
   Parent overview / command centre. Answers "how is my portfolio doing, and
   where should I go next?" — NOT "which exact listing should I fix and how?"
   (that lives in Listing Quality) or "which demand gaps should I source for?"
   (Demand Gaps). High-level health + performance, one or two top alerts, and
   clear navigation into the focused child workspaces. Built on the approved
   Pan-India tokens. Every signal carries an honest data-confidence label.   */

;(function () {
const { Button, Icon, Badge } = window.ReTrendsDesignSystem_f37966;

/* ---------------------------------------------------------------- data --- */

const METRICS = [
  {
    value: "1,284",
    label: "Views this week",
    helper: "Times buyers opened your listings.",
    footer: { text: "+12% vs last week", tone: "positive" },
    source: "Listing analytics — listing-card & detail opens",
  },
  {
    value: "86",
    label: "Enquiries",
    helper: "Calls, WhatsApp clicks and forms.",
    breakdown: "52 WhatsApp · 24 calls · 10 forms",
    footer: { text: "+4 vs last week", tone: "positive" },
    source: "Enquiry events — CTA clicks & form submissions",
  },
  {
    value: "6.7%",
    label: "Enquiry rate",
    helper: "Views that became an enquiry.",
    confidence: { text: "Above average", tone: "positive" },
    source: "Calculated — enquiries ÷ views",
  },
  {
    value: "23",
    suffix: "need fixes",
    label: "Listing quality",
    helper: "Missing info may reduce buyer trust.",
    confidence: { text: "Enough data", tone: "positive" },
    source: "Listing quality score & metadata completeness",
    href: "/broker/listing-quality",
    cta: "View details",
  },
  {
    value: "4",
    suffix: "gaps found",
    label: "Demand gaps",
    helper: "Buyer searches with low matching supply.",
    confidence: { text: "Limited data", tone: "caution" },
    source: "Demand & search analytics — ReTrends searches only",
    href: "/broker/demand-gaps",
    cta: "View details",
  },
];

/* Today's focus — at most 2-3 high-level alerts. Each routes into the right
   child workspace; it never tries to BE the workspace.                      */
const FOCUS = [
  {
    primary: true,
    eyebrow: "Listing quality",
    icon: "map-pin",
    tone: "caution",
    title: "Verify exact locations",
    desc: "18 listings have approximate or missing location. This may reduce buyer trust.",
    cta: "Open listing quality",
    href: "/broker/listing-quality?filter=location",
    filter: "Filter: Fix location",
    source: "Listing metadata completeness — location accuracy",
  },
  {
    eyebrow: "Incomplete listings",
    icon: "camera",
    tone: "neutral",
    title: "Finish incomplete listings",
    desc: "5 recently added listings need photos or location before buyers see them.",
    cta: "Complete listings",
    href: "/broker/listings?filter=incomplete",
    filter: "Filter: Incomplete",
    source: "Draft / new listing metadata — missing required fields",
  },
  {
    eyebrow: "Possible demand gap",
    icon: "trending-up",
    tone: "positive",
    title: "Family homes near schools",
    desc: "Buyers may be searching here, but matching supply looks limited.",
    cta: "View demand gaps",
    href: "/broker/demand-gaps",
    label: { text: "Limited data", tone: "caution" },
    source: "ReTrends search, filter & enquiry data",
  },
];

/* Broker workspaces — the parent-navigation grid into each child page.       */
const TOOLS = [
  {
    icon: "file-check",
    title: "Listing quality",
    desc: "Fix weak listings so buyers trust them and contact you.",
    cta: "Open workspace",
    href: "/broker/listing-quality",
  },
  {
    icon: "building",
    title: "My listings",
    desc: "Manage active, draft and incomplete listings.",
    cta: "Open workspace",
    href: "/broker/listings",
  },
  {
    icon: "map-pin",
    title: "Area insights",
    desc: "See what buyers want in a selected city and area.",
    cta: "Open workspace",
    href: "/broker/areas/udupi/malpe",
  },
  {
    icon: "trending-up",
    title: "Demand gaps",
    desc: "Find buyer searches with low matching supply.",
    cta: "Open workspace",
    href: "/broker/demand-gaps",
  },
];

const TONE = {
  negative: { fg: "var(--negative)", bg: "var(--negative-bg)" },
  caution:  { fg: "var(--caution)",  bg: "var(--caution-bg)" },
  positive: { fg: "var(--positive)", bg: "var(--positive-bg)" },
  neutral:  { fg: "var(--navy-700)", bg: "var(--surface-navy-tint)" },
};

/* --------------------------------------------------------------- pieces --- */

function SourceNote({ show, children }) {
  if (!show) return null;
  return (
    <div className="rt-src" style={{
      display: "flex", alignItems: "center", gap: "6px",
      marginTop: "12px", paddingTop: "10px", borderTop: "1px dashed var(--border-strong)",
      fontFamily: "var(--font-mono)", fontSize: "10.5px", lineHeight: 1.35,
      letterSpacing: "0.01em", color: "var(--text-muted)",
    }}>
      <Icon name="layers" size={12} color="var(--grey-400)" />
      <span>{children}</span>
    </div>
  );
}

function MetricCard({ m, showSources }) {
  const [hover, setHover] = React.useState(false);
  const interactive = !!m.href;
  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: "flex", flexDirection: "column",
        background: "var(--surface-card)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-lg)",
        padding: "20px",
        boxShadow: hover && interactive ? "var(--shadow-md)" : "var(--shadow-xs)",
        transform: hover && interactive ? "translateY(-2px)" : "none",
        transition: "transform var(--dur-normal) var(--ease-standard), box-shadow var(--dur-normal) var(--ease-standard)",
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", gap: "7px" }}>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: "32px", fontWeight: 600, letterSpacing: "-0.01em", color: "var(--text-strong)", lineHeight: 1 }}>
          {m.value}
        </span>
        {m.suffix && (
          <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-muted)" }}>{m.suffix}</span>
        )}
      </div>
      <div style={{ fontSize: "15px", fontWeight: 700, color: "var(--text-strong)", marginTop: "12px" }}>
        {m.label}
      </div>
      <div style={{ fontSize: "13px", color: "var(--text-muted)", lineHeight: 1.5, marginTop: "5px" }}>
        {m.helper}
      </div>

      {m.breakdown && (
        <div style={{ fontFamily: "var(--font-mono)", fontSize: "12px", color: "var(--text-body)", marginTop: "12px", lineHeight: 1.45 }}>
          {m.breakdown}
        </div>
      )}

      <div style={{ flex: 1 }} />

      <div style={{ marginTop: "16px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" }}>
        {m.footer && (
          <span style={{ fontFamily: "var(--font-mono)", fontSize: "12.5px", fontWeight: 600, color: `var(--${m.footer.tone})` }}>
            {m.footer.text}
          </span>
        )}
        {m.confidence && <Badge tone={m.confidence.tone} pill>{m.confidence.text}</Badge>}
      </div>

      {m.href && (
        <a href={m.href} style={{ textDecoration: "none", marginTop: "12px" }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: "5px", fontSize: "12.5px", fontWeight: 600, color: "var(--text-muted)", whiteSpace: "nowrap" }}>
            {m.cta}<Icon name="arrow-right" size={13} color="var(--text-muted)" style={{ transform: hover && interactive ? "translateX(2px)" : "none", transition: "transform var(--dur-fast) var(--ease-standard)" }} />
          </span>
        </a>
      )}

      <SourceNote show={showSources}>{m.source}</SourceNote>
    </div>
  );
}

function FocusCard({ f, showSources }) {
  const [hover, setHover] = React.useState(false);
  const t = TONE[f.tone];
  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: "flex", flexDirection: "column",
        background: f.primary ? "var(--accent-tint)" : "var(--surface-card)",
        border: f.primary ? "1px solid var(--copper-400)" : "1px solid var(--border)",
        borderRadius: "var(--radius-lg)",
        padding: "20px",
        boxShadow: hover ? "var(--shadow-md)" : "var(--shadow-xs)",
        transform: hover ? "translateY(-2px)" : "none",
        transition: "transform var(--dur-normal) var(--ease-standard), box-shadow var(--dur-normal) var(--ease-standard)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "11px" }}>
        <div style={{
          flex: "none", width: "40px", height: "40px", borderRadius: "var(--radius-md)",
          background: t.bg, color: t.fg, display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <Icon name={f.icon} size={20} color={t.fg} />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "3px", minWidth: 0 }}>
          <span style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "var(--tracking-caps)", textTransform: "uppercase", color: f.primary ? "var(--accent-hover)" : "var(--text-muted)" }}>
            {f.eyebrow}
          </span>
          {f.label && <Badge tone={f.label.tone} pill>{f.label.text}</Badge>}
        </div>
      </div>

      <div style={{ fontSize: "17px", fontWeight: 700, color: "var(--text-strong)", marginTop: "16px", lineHeight: 1.25 }}>
        {f.title}
      </div>
      <div style={{ fontSize: "13.5px", color: "var(--text-body)", lineHeight: 1.5, marginTop: "6px" }}>
        {f.desc}
      </div>

      <SourceNote show={showSources}>{f.source}</SourceNote>

      <div style={{ flex: 1, minHeight: "16px" }} />

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", marginTop: "4px" }}>
        <a href={f.href} style={{ textDecoration: "none", flex: "none" }}>
          <Button variant={f.primary ? "accent" : "outline"} size="md">
            {f.cta}<Icon name="arrow-right" size={15} />
          </Button>
        </a>
        {f.filter && (
          <span style={{ fontFamily: "var(--font-mono)", fontSize: "11px", color: "var(--text-muted)", whiteSpace: "nowrap" }}>
            {f.filter}
          </span>
        )}
      </div>
    </div>
  );
}

function ToolCard({ t }) {
  const [hover, setHover] = React.useState(false);
  return (
    <a href={t.href} style={{ textDecoration: "none" }}>
      <div
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        style={{
          height: "100%", display: "flex", flexDirection: "column",
          background: "var(--surface-card)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-lg)",
          padding: "20px",
          boxShadow: hover ? "var(--shadow-md)" : "var(--shadow-xs)",
          transform: hover ? "translateY(-2px)" : "none",
          transition: "transform var(--dur-normal) var(--ease-standard), box-shadow var(--dur-normal) var(--ease-standard)",
        }}
      >
        <div style={{
          width: "38px", height: "38px", borderRadius: "var(--radius-md)",
          background: "var(--surface-navy-tint)", color: "var(--navy-700)",
          display: "flex", alignItems: "center", justifyContent: "center", marginBottom: "14px",
        }}>
          <Icon name={t.icon} size={19} color="var(--navy-700)" />
        </div>
        <div style={{ fontSize: "15px", fontWeight: 700, color: "var(--text-strong)" }}>{t.title}</div>
        <div style={{ fontSize: "13px", color: "var(--text-muted)", lineHeight: 1.5, marginTop: "5px" }}>{t.desc}</div>
        <div style={{ flex: 1, minHeight: "14px" }} />
        <span style={{ display: "inline-flex", alignItems: "center", gap: "5px", fontSize: "13px", fontWeight: 600, color: "var(--accent)", marginTop: "16px" }}>
          {t.cta}<Icon name="arrow-right" size={14} color="var(--accent)" style={{ transform: hover ? "translateX(2px)" : "none", transition: "transform var(--dur-fast) var(--ease-standard)" }} />
        </span>
      </div>
    </a>
  );
}

/* ----------------------------------------------------------------- page --- */

function BrokerDashboard() {
  const [showSources, setShowSources] = React.useState(false);

  return (
    <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "40px 24px 80px" }}>

      {/* header */}
      <div className="rt-dash-head" style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: "24px", flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: "12px", fontWeight: 700, letterSpacing: "var(--tracking-caps)", textTransform: "uppercase", color: "var(--accent)" }}>
            Broker dashboard
          </div>
          <h1 style={{ fontFamily: "var(--font-serif)", fontWeight: 600, fontSize: "42px", lineHeight: 1.1, letterSpacing: "-0.02em", color: "var(--text-strong)", margin: "10px 0 0", whiteSpace: "nowrap" }}>
            Welcome back, Broker
          </h1>
          <p style={{ fontSize: "16px", color: "var(--text-muted)", margin: "8px 0 0" }}>
            Here is your portfolio overview.
          </p>
        </div>
        <div style={{ display: "flex", gap: "12px" }}>
          <a href="/broker/listings" style={{ textDecoration: "none" }}>
            <Button variant="outline" size="lg"><Icon name="building" size={16} />View all listings</Button>
          </a>
          <a href="/broker/listings/new" style={{ textDecoration: "none" }}>
            <Button variant="primary" size="lg"><Icon name="plus" size={16} />Add new listing</Button>
          </a>
        </div>
      </div>

      {/* page-level data note + sources toggle */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "16px", flexWrap: "wrap", marginTop: "26px", marginBottom: "12px" }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: "7px", fontSize: "12.5px", color: "var(--text-muted)" }}>
          <Icon name="calendar" size={14} color="var(--grey-400)" />
          Based on your listings from the last 7 days. Some signals need more data.
        </span>
        <button
          onClick={() => setShowSources((s) => !s)}
          style={{
            display: "inline-flex", alignItems: "center", gap: "5px",
            background: "transparent", border: "none", padding: "2px 0",
            fontFamily: "var(--font-sans)", fontSize: "12.5px", fontWeight: 600,
            color: "var(--text-muted)", cursor: "pointer",
            textDecoration: "underline", textDecorationColor: "var(--border-strong)",
            textUnderlineOffset: "3px",
          }}
        >
          {showSources ? "Hide calculations" : "How are these calculated?"}
        </button>
      </div>

      {/* portfolio snapshot — overview metrics */}
      <div className="rt-kpi">
        {METRICS.map((m, i) => <MetricCard key={i} m={m} showSources={showSources} />)}
      </div>

      {/* start here today — 2-3 high-level alerts, each routing into a workspace */}
      <div style={{ margin: "52px 0 6px" }}>
        <h2 style={{ fontFamily: "var(--font-serif)", fontWeight: 600, fontSize: "28px", lineHeight: 1.15, letterSpacing: "-0.02em", color: "var(--text-strong)", margin: 0 }}>
          Start here today
        </h2>
        <p style={{ fontSize: "15px", color: "var(--text-muted)", margin: "8px 0 0" }}>
          Start with the area that can improve buyer response fastest.
        </p>
      </div>
      <div className="rt-cards3" style={{ marginTop: "18px", alignItems: "stretch" }}>
        {FOCUS.map((f, i) => <FocusCard key={i} f={f} showSources={showSources} />)}
      </div>

      {/* broker workspaces — parent navigation into the child pages */}
      <div style={{ margin: "52px 0 6px" }}>
        <h2 style={{ fontFamily: "var(--font-serif)", fontWeight: 600, fontSize: "22px", letterSpacing: "-0.02em", color: "var(--text-strong)", margin: 0 }}>
          Broker workspaces
        </h2>
        <p style={{ fontSize: "14px", color: "var(--text-muted)", margin: "8px 0 0" }}>
          Open a workspace when you need more detail.
        </p>
      </div>
      <div className="rt-cards4" style={{ marginTop: "18px" }}>
        {TOOLS.map((t, i) => <ToolCard key={i} t={t} />)}
      </div>
    </div>
  );
}

window.RTBrokerDashboard = BrokerDashboard;
})();
