// ReTrends — Buyer-facing Area Intelligence (#1528). Exports window.RTBuyerArea.
//
// A calm, premium AREA GUIDE for a home buyer — plain English, verified signals,
// honest null states. Answers, in order:
//   1. What is this area like?       (hero guide + summary + character)
//   2. How active is the market?     (at-a-glance metrics)
//   3. How confident is the data?    (confidence chip + "Why we show this" trust strip)
//   4. What should I know?           ("What this means for you")
//   5. Which metrics are unavailable? (null cards: "Not enough data yet")
//
// NO broker/demand-gap language. NO fake values. NO zero fallback. NO demand_score.
;(function () {
const { Button, Icon, Badge, Card } = window.ReTrendsDesignSystem_f37966;
const C = window.RT_CONFIDENCE;

// ---- shared bits -----------------------------------------------------------
const ACCENTS = {
  navy:  { bg: "var(--navy-100)",   fg: "var(--navy-700)" },
  clay:  { bg: "var(--copper-100)", fg: "var(--copper-600)" },
  green: { bg: "var(--evergreen-50)", fg: "var(--evergreen-600)" },
  gold:  { bg: "var(--gold-100)",   fg: "var(--gold-600)" },
};

const CONF = {
  "Enough data":         { dot: "var(--positive)", bg: "var(--evergreen-50)", fg: "var(--evergreen-600)" },
  "Limited data":        { dot: "var(--caution)",  bg: "var(--caution-bg)",   fg: "var(--caution)" },
  "Not enough data yet": { dot: "var(--grey-400)", bg: "var(--grey-100)",     fg: "var(--text-muted)" },
};

// Confidence as a soft tinted chip.
function ConfidenceChip({ level }) {
  const c = CONF[level] || CONF["Limited data"];
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: "7px", padding: "5px 12px", borderRadius: "var(--radius-full)", background: c.bg, fontSize: "12.5px", fontWeight: 600, color: c.fg, whiteSpace: "nowrap" }}>
      <span style={{ width: "7px", height: "7px", borderRadius: "var(--radius-full)", background: c.dot, flex: "none" }} />
      {level}
    </span>
  );
}

function Chip({ icon, children, muted }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: "7px", padding: "6px 13px", borderRadius: "var(--radius-full)", background: "var(--paper)", border: "1px solid var(--border)", fontSize: "13px", fontWeight: 600, color: muted ? "var(--text-muted)" : "var(--text-body)", whiteSpace: "nowrap" }}>
      {icon && <Icon name={icon} size={14} color="var(--text-muted)" />}{children}
    </span>
  );
}

function SectionHead({ eyebrow, title, sub }) {
  return (
    <div style={{ marginBottom: "20px", maxWidth: "640px" }}>
      {eyebrow && <div style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "var(--tracking-caps)", textTransform: "uppercase", color: "var(--accent)", marginBottom: "9px" }}>{eyebrow}</div>}
      <h2 style={{ margin: 0, fontFamily: "var(--font-serif)", fontSize: "26px", fontWeight: 600, lineHeight: 1.18, letterSpacing: "-0.015em", color: "var(--text-strong)" }}>{title}</h2>
      {sub && <p style={{ margin: "8px 0 0", fontSize: "15px", color: "var(--text-muted)", lineHeight: 1.5 }}>{sub}</p>}
    </div>
  );
}

// ---- app shell -------------------------------------------------------------
function TopNav() {
  const items = [
    { label: "Discover", icon: "search" },
    { label: "Areas", icon: "map-pin", active: true },
    { label: "Saved", icon: "heart" },
  ];
  return (
    <header style={{ position: "sticky", top: 0, zIndex: 40, background: "rgba(255,255,255,0.86)", backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)", borderBottom: "1px solid var(--border)" }}>
      <div style={{ maxWidth: "1180px", margin: "0 auto", padding: "0 28px", height: "64px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "24px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "11px", flex: "none" }}>
          <div style={{ width: "38px", height: "38px", borderRadius: "10px", background: "var(--navy-800)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Icon name="map-pin" size={20} color="#fff" strokeWidth={2.2} />
          </div>
          <div style={{ lineHeight: 1.05 }}>
            <div style={{ fontSize: "18px", fontWeight: 700, letterSpacing: "-0.02em", color: "var(--navy-800)" }}>ReTrends</div>
            <div style={{ fontSize: "11px", fontWeight: 500, color: "var(--text-muted)" }}>Real Estate Trends</div>
          </div>
        </div>
        <nav style={{ display: "flex", alignItems: "center", gap: "6px", flex: "1 1 auto", justifyContent: "center" }}>
          {items.map((it) => (
            <a key={it.label} href="#" style={{
              display: "inline-flex", alignItems: "center", gap: "7px", textDecoration: "none",
              padding: "8px 15px", borderRadius: "var(--radius-full)", fontSize: "14px", fontWeight: 600,
              color: it.active ? "#fff" : "var(--text-body)", background: it.active ? "var(--navy-800)" : "transparent",
            }}>
              <Icon name={it.icon} size={16} color={it.active ? "#fff" : "var(--text-muted)"} />{it.label}
            </a>
          ))}
        </nav>
        <div style={{ flex: "none" }}><Button variant="outline" size="sm">Sign in</Button></div>
      </div>
    </header>
  );
}

function Breadcrumb({ d }) {
  const crumb = ["Home", d.city, d.area];
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", marginBottom: "16px" }}>
      {crumb.map((c, i) => {
        const last = i === crumb.length - 1;
        return (
          <React.Fragment key={i}>
            <span style={{ fontSize: "13px", fontWeight: last ? 600 : 500, color: last ? "var(--text-strong)" : "var(--text-muted)" }}>{c}</span>
            {!last && <Icon name="chevron-right" size={13} color="var(--grey-400)" />}
          </React.Fragment>
        );
      })}
    </div>
  );
}

// ---- hero: area guide ------------------------------------------------------
function Hero({ d }) {
  const level = C[d.confidence];
  return (
    <div style={{
      position: "relative", overflow: "hidden",
      borderRadius: "var(--radius-2xl)", border: "1px solid var(--border)",
      background: "linear-gradient(135deg, #F4EDE6 0%, var(--canvas-200) 58%, var(--canvas-100) 100%)",
      boxShadow: "var(--shadow-sm)",
    }}>
      {/* faint decorative pin */}
      <div style={{ position: "absolute", top: "-36px", right: "-30px", width: "240px", height: "240px", borderRadius: "var(--radius-full)", background: "radial-gradient(circle at 30% 30%, rgba(176,92,58,0.10), transparent 65%)", pointerEvents: "none" }} />
      <div style={{ position: "relative", display: "flex", gap: "36px", padding: "38px 40px", flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 460px", minWidth: "300px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "14px", flexWrap: "wrap" }}>
            <span style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "var(--tracking-caps)", textTransform: "uppercase", color: "var(--accent)", whiteSpace: "nowrap" }}>Area · {d.city}</span>
            <span style={{ width: "4px", height: "4px", borderRadius: "var(--radius-full)", background: "var(--copper-400)" }} />
            <span style={{ fontSize: "11px", fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase", color: "var(--text-muted)", whiteSpace: "nowrap" }}>Area guide</span>
          </div>
          <h1 style={{ margin: "0 0 16px", fontFamily: "var(--font-serif)", fontSize: "46px", fontWeight: 600, lineHeight: 1.04, letterSpacing: "-0.02em", color: "var(--text-strong)" }}>{d.area}</h1>
          <p style={{ margin: "0 0 22px", fontSize: "16.5px", lineHeight: 1.6, color: "var(--text-body)", maxWidth: "560px", textWrap: "pretty" }}>{d.summary}</p>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap", marginBottom: "26px" }}>
            <Chip icon="map-pin">{d.context}</Chip>
            <ConfidenceChip level={level} />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "11px", flexWrap: "wrap" }}>
            <Button variant="primary" size="lg"><Icon name="arrow-right" size={17} />View homes in {d.area}</Button>
            <Button variant="outline" size="lg"><Icon name="heart" size={16} />Save area</Button>
          </div>
        </div>
        {/* quick-facts card — gives the area local character without photos */}
        <div style={{ flex: "0 1 280px", minWidth: "240px", alignSelf: "stretch" }}>
          <div style={{ background: "var(--paper)", border: "1px solid var(--border)", borderRadius: "var(--radius-xl)", padding: "22px", boxShadow: "var(--shadow-sm)", height: "100%" }}>
            <div style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "var(--tracking-caps)", textTransform: "uppercase", color: "var(--text-muted)", marginBottom: "16px" }}>What it's like</div>
            <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: "15px" }}>
              {d.character.map((f, i) => (
                <li key={i} style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                  <span style={{ width: "32px", height: "32px", flex: "none", borderRadius: "var(--radius-md)", background: "var(--copper-100)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <Icon name={f.icon} size={16} color="var(--copper-600)" />
                  </span>
                  <span style={{ fontSize: "14px", fontWeight: 600, color: "var(--text-body)" }}>{f.text}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---- at a glance -----------------------------------------------------------
function MetricCard({ icon, accent, label, value, suffix, helper, nullHelper, lowConf, prominent }) {
  const a = ACCENTS[accent] || ACCENTS.navy;
  const unavailable = value == null;
  const numeric = !unavailable && typeof value === "number";
  return (
    <div style={{
      position: "relative",
      background: prominent ? "linear-gradient(160deg, var(--gold-100), #FBF7EC)" : "var(--surface-card)",
      border: prominent ? "1px solid #E6D9B0" : "1px solid var(--border)",
      borderRadius: "var(--radius-xl)",
      padding: "22px",
      boxShadow: prominent ? "var(--shadow-md)" : "var(--shadow-sm)",
      display: "flex", flexDirection: "column", minHeight: "172px",
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "18px" }}>
        <span style={{ width: "40px", height: "40px", flex: "none", borderRadius: "var(--radius-md)", background: unavailable ? "var(--surface-subtle)" : a.bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Icon name={icon} size={19} color={unavailable ? "var(--grey-400)" : a.fg} strokeWidth={2.1} />
        </span>
        {prominent && !unavailable && <span style={{ fontSize: "10px", fontWeight: 700, letterSpacing: "var(--tracking-caps)", textTransform: "uppercase", color: "var(--gold-600)" }}>Most relevant</span>}
        {lowConf && !unavailable && <Badge tone="caution" pill style={{ fontSize: "10px", padding: "2px 9px" }}>Rough guide</Badge>}
      </div>

      {unavailable ? (
        <div style={{ display: "inline-flex", alignItems: "center", gap: "7px", marginBottom: "8px" }}>
          <Icon name="alert-triangle" size={15} color="var(--grey-400)" />
          <span style={{ fontSize: "16px", fontWeight: 600, lineHeight: 1.2, color: "var(--text-muted)" }}>Not enough data yet</span>
        </div>
      ) : (
        <div style={{ display: "flex", alignItems: "baseline", gap: "3px", marginBottom: "8px", whiteSpace: "nowrap" }}>
          <span style={{ fontFamily: numeric ? "var(--font-mono)" : "var(--font-sans)", fontSize: numeric ? "32px" : "23px", fontWeight: 600, lineHeight: 1.02, color: "var(--text-strong)" }}>{value}</span>
          {suffix && <span style={{ fontFamily: "var(--font-mono)", fontSize: "16px", fontWeight: 500, color: "var(--text-muted)" }}>{suffix}</span>}
        </div>
      )}

      <div style={{ fontSize: "13.5px", fontWeight: 700, color: "var(--text-strong)", marginBottom: "4px" }}>{label}</div>
      <div style={{ fontSize: "12.5px", color: "var(--text-muted)", lineHeight: 1.5 }}>
        {unavailable ? (nullHelper || "We need more verified activity before showing this.") : helper}
      </div>
    </div>
  );
}

// Data-confidence card — a small trust module, not a plain metric.
function ConfidenceCard({ level }) {
  const c = CONF[level] || CONF["Limited data"];
  const blurb = {
    "Enough data": "Enough recent listing and search activity here to show reliable figures.",
    "Limited data": "Some activity here, but a few figures are still settling — use them as a guide.",
    "Not enough data yet": "Not enough verified activity here yet to show reliable figures.",
  }[level];
  return (
    <div style={{ background: "var(--navy-800)", borderRadius: "var(--radius-xl)", padding: "22px", boxShadow: "var(--shadow-md)", display: "flex", flexDirection: "column", minHeight: "172px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "18px" }}>
        <span style={{ width: "40px", height: "40px", flex: "none", borderRadius: "var(--radius-md)", background: "rgba(255,255,255,0.10)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Icon name="shield-check" size={19} color="#fff" strokeWidth={2.1} />
        </span>
      </div>
      <div style={{ display: "inline-flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
        <span style={{ width: "9px", height: "9px", borderRadius: "var(--radius-full)", background: c.dot, flex: "none" }} />
        <span style={{ fontSize: "19px", fontWeight: 700, color: "#fff" }}>{level}</span>
      </div>
      <div style={{ fontSize: "13.5px", fontWeight: 700, color: "rgba(255,255,255,0.92)", marginBottom: "4px" }}>Data confidence</div>
      <div style={{ fontSize: "12.5px", color: "rgba(255,255,255,0.6)", lineHeight: 1.5 }}>{blurb}</div>
    </div>
  );
}

function MetricGrid({ d }) {
  const m = d.metrics, low = d.lowConfidence;
  const q = m.avgListingQuality.value;
  return (
    <div className="rt-metrics">
      <MetricCard icon="building" accent="navy" label="Active listings" value={m.activeListings.value} helper="Plots and homes live on ReTrends right now." lowConf={low} />
      <MetricCard icon="trending-up" accent="clay" label="Median price" value={m.medianPrice.value} helper="The middle asking price across current listings." lowConf={low} />
      <MetricCard icon="search" accent="gold" prominent label="Most searched budget" value={m.mostSearchedBudget.value}
        helper="The budget most buyers searching this area set." nullHelper="We need more verified search activity before showing this." lowConf={low} />
      <MetricCard icon="star" accent="green" label="Average listing quality" value={q} suffix={q != null ? "/ 100" : ""}
        helper="How complete listings are — location, photos and details." nullHelper="We need more verified listings before showing this." lowConf={low} />
      <MetricCard icon="calendar" accent="navy" label="Fresh listings" value={m.freshListings.value} helper="Listings added or updated in the last 30 days." lowConf={low} />
      <ConfidenceCard level={C[d.confidence]} />
    </div>
  );
}

// "Why we show this" — trust strip under the metrics.
function TrustStrip() {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: "16px", padding: "18px 22px", background: "var(--evergreen-50)", border: "1px solid rgba(31,122,92,0.18)", borderRadius: "var(--radius-lg)" }}>
      <span style={{ width: "34px", height: "34px", flex: "none", borderRadius: "var(--radius-md)", background: "var(--paper)", display: "flex", alignItems: "center", justifyContent: "center", marginTop: "1px" }}>
        <Icon name="shield-check" size={17} color="var(--evergreen-600)" strokeWidth={2.2} />
      </span>
      <div>
        <div style={{ fontSize: "14px", fontWeight: 700, color: "var(--text-strong)", marginBottom: "3px" }}>Why we show this</div>
        <p style={{ margin: 0, fontSize: "13.5px", lineHeight: 1.55, color: "var(--text-body)", maxWidth: "860px", textWrap: "pretty" }}>
          We only show a figure when there's enough verified listing or search activity to be reliable. When there isn't, we show “Not enough data yet” instead of guessing.
        </p>
      </div>
    </div>
  );
}

// ---- what this means (promoted) --------------------------------------------
function MeaningColumn({ tone, icon, title, items }) {
  const good = tone === "good";
  const fg = good ? "var(--evergreen-600)" : "var(--caution)";
  const tint = good ? "var(--evergreen-50)" : "var(--caution-bg)";
  return (
    <div style={{ background: "var(--paper)", border: "1px solid var(--border)", borderRadius: "var(--radius-xl)", padding: "26px", boxShadow: "var(--shadow-sm)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "20px" }}>
        <span style={{ width: "38px", height: "38px", flex: "none", borderRadius: "var(--radius-md)", background: tint, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Icon name={icon} size={19} color={fg} strokeWidth={2.3} />
        </span>
        <h3 style={{ margin: 0, fontSize: "17px", fontWeight: 700, color: "var(--text-strong)" }}>{title}</h3>
      </div>
      <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: "16px" }}>
        {items.map((t, i) => (
          <li key={i} style={{ display: "flex", gap: "12px", fontSize: "14.5px", lineHeight: 1.55, color: "var(--text-body)" }}>
            <Icon name={good ? "check" : "alert-triangle"} size={16} color={fg} strokeWidth={2.2} style={{ flex: "none", marginTop: "2px" }} />
            <span style={{ textWrap: "pretty" }}>{t}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
function WhatThisMeans({ d }) {
  return (
    <div style={{ background: "var(--surface-subtle)", borderRadius: "var(--radius-2xl)", padding: "32px", border: "1px solid var(--border)" }}>
      <SectionHead eyebrow="The takeaway" title="What this means for you" sub="A plain-English read on the area, based only on what we can verify — not advice on whether to buy." />
      <div className="rt-two">
        <MeaningColumn tone="good" icon="check" title="Good to know" items={d.good} />
        <MeaningColumn tone="check" icon="alert-triangle" title="Worth checking" items={d.check} />
      </div>
    </div>
  );
}

// ---- compare nearby --------------------------------------------------------
function NearbyAreas({ d }) {
  return (
    <div>
      <SectionHead title="Compare nearby areas" sub="Open another area to see the same plain-English guide." />
      <div className="rt-nearby">
        {d.nearby.map((n) => (
          <a key={n.name} href="#" className="rt-nearby-card">
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <span style={{ width: "34px", height: "34px", flex: "none", borderRadius: "var(--radius-md)", background: "var(--navy-100)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Icon name="map-pin" size={16} color="var(--navy-700)" />
              </span>
              <div>
                <div style={{ fontSize: "15px", fontWeight: 700, color: "var(--text-strong)", lineHeight: 1.2 }}>{n.name}</div>
                <div style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "2px" }}>{n.tag}</div>
              </div>
            </div>
            <Icon name="arrow-right" size={16} color="var(--text-muted)" />
          </a>
        ))}
      </div>
    </div>
  );
}

// ---- premium CTA -----------------------------------------------------------
function CtaBand({ d, view = true }) {
  return (
    <div style={{ position: "relative", overflow: "hidden", background: "var(--navy-800)", borderRadius: "var(--radius-2xl)", padding: "40px 44px" }}>
      <div style={{ position: "absolute", bottom: "-60px", right: "-40px", width: "260px", height: "260px", borderRadius: "var(--radius-full)", background: "radial-gradient(circle at 40% 40%, rgba(176,92,58,0.30), transparent 65%)", pointerEvents: "none" }} />
      <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "28px", flexWrap: "wrap" }}>
        <div style={{ maxWidth: "520px" }}>
          <h3 style={{ margin: "0 0 8px", fontFamily: "var(--font-serif)", fontSize: "27px", fontWeight: 600, color: "#fff", letterSpacing: "-0.01em" }}>Ready to explore {d.area}?</h3>
          <p style={{ margin: 0, fontSize: "15px", lineHeight: 1.55, color: "rgba(255,255,255,0.72)" }}>Browse live homes here, or save the area to come back to it later.</p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
          {view && <Button variant="accent" size="lg"><Icon name="arrow-right" size={17} />View homes in {d.area}</Button>}
          <Button variant="outline" size="lg" style={{ background: "transparent", color: "#fff", borderColor: "rgba(255,255,255,0.32)" }}><Icon name="heart" size={16} />Save area</Button>
        </div>
      </div>
    </div>
  );
}

function FooterNote({ d }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "20px", flexWrap: "wrap" }}>
      <p style={{ margin: 0, fontSize: "12.5px", color: "var(--text-muted)", lineHeight: 1.55, maxWidth: "720px" }}>
        Area insights are based on verified listing activity and buyer searches. We only show a figure when there's enough activity to be reliable.
      </p>
      <span style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "12.5px", color: "var(--text-muted)", whiteSpace: "nowrap" }}>
        <Icon name="calendar" size={13} />Updated {d.updated}
      </span>
    </div>
  );
}

// ---- empty / error / skeleton ----------------------------------------------
function CenteredNotice({ icon, iconBg, iconFg, title, body, children }) {
  return (
    <div style={{ background: "var(--paper)", border: "1px solid var(--border)", borderRadius: "var(--radius-2xl)", boxShadow: "var(--shadow-sm)", textAlign: "center", padding: "60px 32px" }}>
      <div style={{ width: "60px", height: "60px", margin: "0 auto 20px", borderRadius: "var(--radius-xl)", background: iconBg, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Icon name={icon} size={28} color={iconFg} />
      </div>
      <h3 style={{ margin: "0 0 10px", fontFamily: "var(--font-serif)", fontSize: "24px", fontWeight: 600, color: "var(--text-strong)" }}>{title}</h3>
      <p style={{ margin: "0 auto", maxWidth: "460px", fontSize: "14.5px", lineHeight: 1.6, color: "var(--text-muted)" }}>{body}</p>
      {children && <div style={{ marginTop: "24px", display: "flex", justifyContent: "center", gap: "12px", flexWrap: "wrap" }}>{children}</div>}
    </div>
  );
}

function Skeleton({ w, h, r }) {
  return <div className="rt-skel" style={{ width: w, height: h, borderRadius: r || "var(--radius-sm)" }} />;
}
function SkeletonCard() {
  return (
    <div style={{ background: "var(--surface-card)", border: "1px solid var(--border)", borderRadius: "var(--radius-xl)", padding: "22px", boxShadow: "var(--shadow-sm)", minHeight: "172px", display: "flex", flexDirection: "column", gap: "16px" }}>
      <Skeleton w="40px" h="40px" r="var(--radius-md)" />
      <Skeleton w="58%" h="30px" />
      <Skeleton w="45%" h="14px" />
      <Skeleton w="85%" h="12px" />
    </div>
  );
}

// ---- assembled -------------------------------------------------------------
function PageShell({ children }) {
  return (
    <div style={{ background: "var(--background)", minHeight: "100vh" }}>
      <TopNav />
      <div style={{ maxWidth: "1180px", margin: "0 auto", padding: "32px 28px 72px", display: "flex", flexDirection: "column", gap: "40px" }}>
        {children}
      </div>
    </div>
  );
}

function RTBuyerArea({ state, onRetry }) {
  const cfg = window.RT_BUYER_STATES[state];

  if (cfg === "loading") {
    return (
      <PageShell>
        <div style={{ borderRadius: "var(--radius-2xl)", border: "1px solid var(--border)", background: "var(--surface-subtle)", padding: "38px 40px", display: "flex", flexDirection: "column", gap: "16px" }}>
          <Skeleton w="120px" h="14px" />
          <Skeleton w="240px" h="46px" />
          <Skeleton w="70%" h="18px" />
          <div style={{ display: "flex", gap: "10px", marginTop: "6px" }}><Skeleton w="150px" h="44px" r="var(--radius-md)" /><Skeleton w="120px" h="44px" r="var(--radius-md)" /></div>
        </div>
        <div className="rt-metrics">{Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}</div>
        <div className="rt-two"><Skeleton w="100%" h="220px" r="var(--radius-xl)" /><Skeleton w="100%" h="220px" r="var(--radius-xl)" /></div>
      </PageShell>
    );
  }

  if (cfg === "error") {
    return (
      <PageShell>
        <Breadcrumb d={window.RT_BUYER_STATES.full} />
        <CenteredNotice
          icon="message-circle" iconBg="var(--navy-100)" iconFg="var(--navy-700)"
          title="We couldn’t load area insights"
          body="Something went wrong on our side while loading insights for this area. Your saved areas and home search still work — please try again in a moment.">
          <Button variant="primary" size="lg" onClick={onRetry}><Icon name="arrow-right" size={16} />Try again</Button>
          <Button variant="outline" size="lg"><Icon name="arrow-right" size={16} />View homes in Malpe</Button>
        </CenteredNotice>
      </PageShell>
    );
  }

  const d = cfg;
  const noSnapshot = !d.metrics;

  return (
    <PageShell>
      <div>
        <Breadcrumb d={d} />
        <Hero d={d} />
      </div>

      {noSnapshot ? (
        <CenteredNotice
          icon="map-pin" iconBg="var(--surface-subtle)" iconFg="var(--text-muted)"
          title={`We don’t have enough activity in ${d.area} yet`}
          body="As more verified listings and buyer searches come in for this area, we’ll show plain-English insights here. You can still view homes in this area or explore a nearby one.">
          <Button variant="accent" size="lg"><Icon name="arrow-right" size={16} />View homes in {d.area}</Button>
          <Button variant="outline" size="lg"><Icon name="heart" size={16} />Save area</Button>
        </CenteredNotice>
      ) : (
        <React.Fragment>
          <div>
            <SectionHead eyebrow="At a glance" title="How active is the market here?" sub="A quick read on what's live and what buyers are looking for in this area." />
            <MetricGrid d={d} />
            <div style={{ marginTop: "16px" }}><TrustStrip /></div>
          </div>
          <WhatThisMeans d={d} />
        </React.Fragment>
      )}

      <NearbyAreas d={d} />
      <CtaBand d={d} view={!noSnapshot} />
      <FooterNote d={d} />
    </PageShell>
  );
}

window.RTBuyerArea = RTBuyerArea;
})();
