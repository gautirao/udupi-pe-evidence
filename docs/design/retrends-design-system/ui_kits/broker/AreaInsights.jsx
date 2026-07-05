// ReTrends — Area Intelligence dashboard (selected-area workspace).
// Exports window.RTAreaInsights. Reusable across city/area; opens on Udupi / Malpe.
//
// Scope: answers "what is happening in THIS area, what do buyers want here,
// and how are my listings doing here." It previews and routes out to:
//   • Demand Gaps    — cross-area opportunity workspace
//   • Listing Quality — per-listing fix workflow
// It deliberately does NOT reproduce those workspaces in full.
;(function () {
const { Button, Icon, Badge, Select, Card } = window.ReTrendsDesignSystem_f37966;

// ---- helpers ---------------------------------------------------------------
function cityName(key) { return (window.RT_CITIES.find((c) => c.key === key) || {}).name || key; }
function areaList(cityKey) { return window.RT_AREAS[cityKey] || []; }
function areaName(cityKey, areaKey) {
  const a = areaList(cityKey).find((x) => x[0] === areaKey);
  return a ? a[1] : areaKey;
}

const CONFIDENCE = {
  "Enough data":         { fg: "var(--positive)" },
  "Limited data":        { fg: "var(--caution)" },
  "Not enough data yet": { fg: "var(--text-muted)" },
};
// Quiet, secondary confidence marker — a small dot + muted text, no fill.
function ConfidencePill({ level }) {
  const c = CONFIDENCE[level] || CONFIDENCE["Limited data"];
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "11px", fontWeight: 500, color: "var(--text-muted)" }}>
      <span style={{ width: "6px", height: "6px", borderRadius: "var(--radius-full)", background: c.fg, flex: "none" }} />
      {level}
    </span>
  );
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

// ---- 1. Header -------------------------------------------------------------
function HeaderBand({ cityKey, areaKey }) {
  const cn = cityName(cityKey), an = areaName(cityKey, areaKey);
  const addLink = `/broker/listings/new?city=${cityKey}&areaKey=${areaKey}`;
  const publicLink = `/trends/${cityKey}/areas/${areaKey}`;
  const crumb = ["Broker dashboard", "Area intelligence", cn, an];
  return (
    <section style={{ background: "var(--navy-800)" }}>
      <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "16px 24px 30px" }}>
        {/* breadcrumb */}
        <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", marginBottom: "14px" }}>
          {crumb.map((c, i) => {
            const last = i === crumb.length - 1;
            const txt = (
              <span style={{ fontSize: "12px", fontWeight: last ? 600 : 500, color: last ? "#fff" : "rgba(255,255,255,0.55)" }}>{c}</span>
            );
            return (
              <React.Fragment key={i}>
                {i === 0 ? <a href="/broker/dashboard" style={{ textDecoration: "none" }}>{txt}</a> : txt}
                {!last && <Icon name="chevron-right" size={12} color="rgba(255,255,255,0.35)" />}
              </React.Fragment>
            );
          })}
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "20px", flexWrap: "wrap" }}>
          <div>
            <h1 style={{ margin: "0 0 4px", fontFamily: "var(--font-serif)", fontSize: "28px", fontWeight: 600, letterSpacing: "-0.01em", color: "#fff", lineHeight: 1.15 }}>{an} broker insights</h1>
            <p style={{ margin: 0, fontSize: "14px", color: "rgba(255,255,255,0.65)", maxWidth: "560px", lineHeight: 1.45 }}>What buyers want in {an}, and whether your listings here can capture it.</p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "16px", flexWrap: "wrap" }}>
            <a href={publicLink} style={{ display: "inline-flex", alignItems: "center", gap: "6px", textDecoration: "none", fontSize: "13px", fontWeight: 600, color: "rgba(255,255,255,0.72)" }}>
              <Icon name="eye" size={15} color="rgba(255,255,255,0.72)" />View public area page
            </a>
            <a href={addLink} style={{ textDecoration: "none" }}>
              <Button variant="accent"><Icon name="plus" size={17} />Add listing in this area</Button>
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}

// ---- 2. Area selector (compact toolbar) ------------------------------------
function MarketSelector({ cityKey, areaKey, onCity, onArea }) {
  const cn = cityName(cityKey), an = areaName(cityKey, areaKey);
  return (
    <Card padding="sm" style={{ marginTop: "-16px", position: "relative", zIndex: 2, boxShadow: "var(--shadow-md)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "16px", flexWrap: "wrap" }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: "7px", flex: "none", paddingRight: "16px", borderRight: "1px solid var(--border)" }}>
          <Icon name="map-pin" size={16} color="var(--accent)" />
          <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-strong)" }}>Selected area</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", flex: "1 1 auto", minWidth: "260px" }}>
          <Select size="sm" value={cityKey} onChange={(e) => onCity(e.target.value)}
            options={window.RT_CITIES.map((c) => ({ value: c.key, label: c.name }))} style={{ minWidth: "150px" }} />
          <Select size="sm" value={areaKey} onChange={(e) => onArea(e.target.value)}
            options={areaList(cityKey).map(([k, n]) => ({ value: k, label: n }))} style={{ minWidth: "150px" }} />
          <span style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "12px", color: "var(--text-muted)", whiteSpace: "nowrap" }}>
            <Icon name="check" size={14} color="var(--positive)" />Showing insights for <strong style={{ fontWeight: 600, color: "var(--text-body)" }}>{an}, {cn}</strong>
          </span>
        </div>
        <a href="/broker/demand-gaps" style={{ display: "inline-flex", alignItems: "center", gap: "5px", textDecoration: "none", flex: "none", fontSize: "12px", fontWeight: 600, color: "var(--text-muted)" }}>
          Compare areas<Icon name="arrow-right" size={13} color="var(--text-muted)" />
        </a>
      </div>
    </Card>
  );
}

// ---- 3. KPI row ------------------------------------------------------------
function KpiCard({ kpi }) {
  const hl = kpi.highlight;
  const isText = kpi.value.length > 6;
  return (
    <div style={{
      background: hl ? "var(--navy-100)" : "var(--surface-card)",
      border: "1px solid var(--border)",
      borderRadius: "var(--radius-lg)",
      padding: "16px", boxShadow: "var(--shadow-sm)", display: "flex", flexDirection: "column",
    }}>
      <div style={{ fontSize: "11px", fontWeight: 600, letterSpacing: "var(--tracking-caps)", textTransform: "uppercase", color: hl ? "var(--navy-700)" : "var(--text-muted)", marginBottom: "10px", minHeight: "26px" }}>{kpi.label}</div>
      <div style={{ fontFamily: isText ? "var(--font-sans)" : "var(--font-mono)", fontSize: isText ? "17px" : "26px", fontWeight: 600, lineHeight: 1.15, color: hl ? "var(--navy-800)" : "var(--text-strong)", marginBottom: "8px" }}>{kpi.value}</div>
      <div style={{ fontSize: "12px", color: "var(--text-muted)", lineHeight: 1.4, marginBottom: "12px", flex: 1 }}>{kpi.helper}</div>
      <ConfidencePill level={kpi.confidence} />
    </div>
  );
}

function KpiRow({ data }) {
  return (
    <div className="rt-kpi">
      {data.kpis.map((k, i) => <KpiCard key={i} kpi={k} />)}
    </div>
  );
}

// ---- 4. Main insight (feature card, single primary CTA) --------------------
function InsightCard({ data, an, cityKey, areaKey }) {
  const primaryIsDemand = data.insight.primary !== "quality";
  const cta = primaryIsDemand
    ? { label: "View demand gaps", icon: "trending-up", href: `/broker/demand-gaps?city=${cityKey}&areaKey=${areaKey}` }
    : { label: `Open listing quality for ${an}`, icon: "file-check", href: `/broker/listing-quality?area=${areaKey}` };
  return (
    <Card padding="lg" style={{ boxShadow: "var(--shadow-md)" }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "12px", marginBottom: "16px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
          <div style={{ width: "44px", height: "44px", flex: "none", borderRadius: "var(--radius-md)", background: "var(--navy-800)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Icon name="trending-up" size={22} color="#fff" />
          </div>
          <div>
            <div style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "var(--tracking-caps)", textTransform: "uppercase", color: "var(--accent-hover)", marginBottom: "3px" }}>Top buyer need</div>
            <h2 style={{ margin: 0, fontFamily: "var(--font-serif)", fontSize: "24px", fontWeight: 600, lineHeight: 1.15, letterSpacing: "-0.01em", color: "var(--text-strong)" }}>What buyers want in {an}</h2>
          </div>
        </div>
        <ConfidencePill level={data.insight.confidence} />
      </div>
      <p style={{ margin: "0 0 18px", fontSize: "17px", lineHeight: 1.6, color: "var(--text-body)", maxWidth: "760px" }}>{data.insight.text}</p>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "12px", justifyContent: "space-between" }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
          {data.insight.chips.map((c, i) => (
            <Badge key={i} tone={i === 0 ? "accent" : "neutral"} pill>{c}</Badge>
          ))}
          <Badge tone={data.insight.confidence === "Enough data" ? "positive" : "caution"} pill>{data.insight.confidence}</Badge>
        </div>
        <a href={cta.href} style={{ textDecoration: "none", flex: "none" }}>
          <Button variant="accent"><Icon name={cta.icon} size={16} />{cta.label}</Button>
        </a>
      </div>
    </Card>
  );
}

// ---- 5. Buyer demand in <area> (area-specific preview only) -----------------
const SIGNAL_TONE = {
  "Searches ahead of supply": "caution",
  "Supply appears balanced":  "verified",
  "Some matching supply":     "neutral",
  "Limited data":             "neutral",
};
function BuyerDemand({ data, an, cityKey, areaKey }) {
  return (
    <div>
      <SectionHead
        title={`Buyer demand signals in ${an}`}
        sub="A short preview of what buyers search for here. Full opportunity mechanics live in Demand Gaps."
        right={<a href={`/broker/demand-gaps?city=${cityKey}&areaKey=${areaKey}`} style={{ textDecoration: "none" }}><Button variant="ghost" size="sm">View full demand gaps<Icon name="arrow-right" size={15} /></Button></a>}
      />
      <Card padding="none" style={{ overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "var(--font-sans)", minWidth: "720px" }}>
            <thead>
              <tr style={{ background: "var(--navy-100)", textAlign: "left" }}>
                {["Buyer need", "Searches", "Matching listings", "Signal", "Next step"].map((h) => (
                  <th key={h} style={{ padding: "13px 18px", fontSize: "11px", fontWeight: 700, letterSpacing: "var(--tracking-caps)", textTransform: "uppercase", color: "var(--navy-700)", whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.demand.map((r, i) => (
                <tr key={i} style={{ borderTop: "1px solid var(--border)" }}>
                  <td style={{ padding: "15px 18px", fontWeight: 600, color: "var(--text-strong)" }}>{r.need}</td>
                  <td style={{ padding: "15px 18px", fontFamily: "var(--font-mono)", fontWeight: 600, color: "var(--text-strong)" }}>{r.searches}</td>
                  <td style={{ padding: "15px 18px", fontFamily: "var(--font-mono)", color: "var(--text-body)" }}>{r.matching}</td>
                  <td style={{ padding: "15px 18px" }}><Badge tone={SIGNAL_TONE[r.signal] || "neutral"}>{r.signal}</Badge></td>
                  <td style={{ padding: "15px 18px", fontSize: "14px", color: "var(--text-body)" }}>{r.next}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <p style={{ margin: "10px 2px 0", fontSize: "12px", color: "var(--text-muted)" }}>Signals compare ReTrends searches with visible matching listings. They suggest possible opportunities, not guaranteed demand.</p>
    </div>
  );
}

// ---- 6. Listing health in <area> (compact summary only) --------------------
function HealthStat({ icon, tone, value, label }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "12px", padding: "14px 16px", flex: "1 1 200px", minWidth: 0 }}>
      <div style={{ width: "38px", height: "38px", flex: "none", borderRadius: "var(--radius-md)", background: tone.bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Icon name={icon} size={18} color={tone.fg} />
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: "16px", fontWeight: 700, color: "var(--text-strong)", lineHeight: 1.2 }}>{value}</div>
        <div style={{ fontSize: "12px", color: "var(--text-muted)", lineHeight: 1.35 }}>{label}</div>
      </div>
    </div>
  );
}
function ListingHealth({ data, an, areaKey }) {
  const h = data.health;
  const qualityLink = `/broker/listing-quality?area=${areaKey}`;
  return (
    <div>
      <SectionHead
        title={`Listing health in ${an}`}
        sub="A quick read on your listings here. Fix the details in Listing Quality."
      />
      <Card padding="none" style={{ overflow: "hidden" }}>
        <div style={{ display: "flex", flexWrap: "wrap", borderBottom: "1px solid var(--border)" }}>
          <HealthStat icon="alert-triangle" tone={{ bg: "var(--ochre-50)", fg: "var(--caution)" }} value={`${h.needFixes} listings`} label="need fixes" />
          <div style={{ width: "1px", background: "var(--border)" }} />
          <HealthStat icon="map-pin" tone={{ bg: "var(--surface-subtle)", fg: "var(--text-muted)" }} value="Most common" label={h.commonIssue} />
          <div style={{ width: "1px", background: "var(--border)" }} />
          <HealthStat icon="eye" tone={{ bg: "var(--navy-100)", fg: "var(--navy-700)" }} value={`${h.lowEnquiries} listings`} label="have buyer views but low enquiries" />
        </div>
        {/* at most 2 compact preview rows — clearly previews, not the full workflow */}
        <div>
          {h.previews.map((p, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: "12px", padding: "11px 18px", borderTop: i ? "1px solid var(--border)" : "none" }}>
              <Icon name="building" size={15} color="var(--text-muted)" />
              <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-body)", flex: "none" }}>{p.title}</span>
              <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>{p.note}</span>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", flexWrap: "wrap", padding: "14px 18px", background: "var(--surface-subtle)", borderTop: "1px solid var(--border)" }}>
          <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>Previews only — open Listing Quality to see and fix each listing.</span>
          <a href={qualityLink} style={{ textDecoration: "none" }}>
            <Button variant="outline" size="sm"><Icon name="file-check" size={15} />Open listing quality for {an}</Button>
          </a>
        </div>
      </Card>
    </div>
  );
}

// ---- 7. Recommended next steps (grouped by destination) --------------------
function NextStepCard({ step }) {
  return (
    <Card style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
        <div style={{ width: "34px", height: "34px", flex: "none", borderRadius: "var(--radius-md)", background: step.iconBg, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Icon name={step.icon} size={17} color={step.iconFg} />
        </div>
        <span style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "var(--tracking-caps)", textTransform: "uppercase", color: "var(--text-muted)" }}>{step.group}</span>
      </div>
      <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 600, color: "var(--text-strong)", lineHeight: 1.3 }}>{step.title}</h3>
      <p style={{ margin: 0, fontSize: "13px", color: "var(--text-muted)", lineHeight: 1.5, flex: 1 }}>{step.detail}</p>
      <a href={step.href} style={{ textDecoration: "none", marginTop: "auto" }}>
        <Button variant={step.primary ? "accent" : "outline"} size="sm" fullWidth><Icon name={step.cta.icon} size={15} />{step.cta.label}</Button>
      </a>
    </Card>
  );
}
function RecommendedNextSteps({ data, an, cityKey, areaKey }) {
  const topNeed = data.topNeed;
  const topNeedLc = topNeed.charAt(0).toLowerCase() + topNeed.slice(1);
  const fixes = data.health.needFixes;
  const steps = [
    {
      group: "Capture demand",
      icon: "trending-up", iconBg: "var(--navy-800)", iconFg: "#fff",
      title: `Add verified ${topNeedLc} if available`,
      detail: `${topNeed} is the strongest buyer demand signal in ${an}. Adding verified supply here may help you capture it.`,
      cta: { label: "Add listing", icon: "plus" }, primary: true,
      href: `/broker/listings/new?city=${cityKey}&areaKey=${areaKey}`,
    },
    {
      group: "Improve current listings",
      icon: "file-check", iconBg: "var(--ochre-50)", iconFg: "var(--caution)",
      title: `Fix ${fixes} ${an} listings`,
      detail: "Location or photo issues may reduce buyer trust and keep views from turning into enquiries.",
      cta: { label: "Open listing quality", icon: "arrow-right" }, primary: false,
      href: `/broker/listing-quality?area=${areaKey}`,
    },
    {
      group: "Compare nearby areas",
      icon: "layers", iconBg: "var(--navy-100)", iconFg: "var(--navy-700)",
      title: `Compare ${an} with nearby areas`,
      detail: "See whether buyer demand is stronger in nearby areas before sourcing more supply here.",
      cta: { label: "Compare areas", icon: "arrow-right" }, primary: false,
      href: `/broker/demand-gaps?city=${cityKey}`,
    },
  ];
  return (
    <div>
      <SectionHead title="Recommended next steps" sub={`Action-led shortcuts into the right workspace for ${an}.`} />
      <div className="rt-cards3">
        {steps.map((s, i) => <NextStepCard key={i} step={s} />)}
      </div>
    </div>
  );
}

// ---- 8. Confidence note (footer) -------------------------------------------
function ConfidenceNote() {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "20px", flexWrap: "wrap", paddingTop: "8px", borderTop: "1px solid var(--border)" }}>
      <p style={{ margin: 0, fontSize: "12px", color: "var(--text-muted)", lineHeight: 1.55, maxWidth: "720px" }}>
        Signals are based on ReTrends searches, filters, listing views, saves, calls, WhatsApp clicks and enquiry forms. We only show strong signals when enough activity exists.
      </p>
      <span style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "12px", color: "var(--text-muted)", whiteSpace: "nowrap" }}>
        <Icon name="calendar" size={13} />Data refreshed: {window.RT_DATA_REFRESHED}
      </span>
    </div>
  );
}

// ---- assembled page --------------------------------------------------------
function RTAreaInsights({ cityKey, areaKey, onCity, onArea }) {
  const an = areaName(cityKey, areaKey);
  const data = window.RT_getInsights(cityKey, areaKey, an);
  return (
    <div style={{ background: "var(--background)", minHeight: "100vh", paddingBottom: "48px" }}>
      <HeaderBand cityKey={cityKey} areaKey={areaKey} />
      <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "0 24px", display: "flex", flexDirection: "column", gap: "32px" }}>
        <MarketSelector cityKey={cityKey} areaKey={areaKey} onCity={onCity} onArea={onArea} />
        <KpiRow data={data} />
        <InsightCard data={data} an={an} cityKey={cityKey} areaKey={areaKey} />
        <BuyerDemand data={data} an={an} cityKey={cityKey} areaKey={areaKey} />
        <ListingHealth data={data} an={an} areaKey={areaKey} />
        <RecommendedNextSteps data={data} an={an} cityKey={cityKey} areaKey={areaKey} />
        <ConfidenceNote />
      </div>
    </div>
  );
}

window.RTAreaInsights = RTAreaInsights;
})();
