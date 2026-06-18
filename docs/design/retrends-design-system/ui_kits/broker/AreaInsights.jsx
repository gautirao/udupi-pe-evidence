// ReTrends — Broker Area Insights dashboard. Exports window.RTAreaInsights.
// Reusable across city/area; opens on Udupi / Malpe.
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
  const crumb = ["Broker dashboard", "Area insights", cn, an];
  return (
    <section style={{ background: "var(--navy-800)" }}>
      <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "16px 24px 30px" }}>
        {/* breadcrumb */}
        <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", marginBottom: "14px" }}>
          {crumb.map((c, i) => (
            <React.Fragment key={i}>
              <span style={{ fontSize: "12px", fontWeight: i === crumb.length - 1 ? 600 : 500, color: i === crumb.length - 1 ? "#fff" : "rgba(255,255,255,0.55)", cursor: i < crumb.length - 1 ? "pointer" : "default" }}>{c}</span>
              {i < crumb.length - 1 && <Icon name="chevron-right" size={12} color="rgba(255,255,255,0.35)" />}
            </React.Fragment>
          ))}
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "20px", flexWrap: "wrap" }}>
          <div>
            <h1 style={{ margin: "0 0 4px", fontFamily: "var(--font-serif)", fontSize: "28px", fontWeight: 600, letterSpacing: "-0.01em", color: "#fff", lineHeight: 1.15 }}>{an} broker insights</h1>
            <p style={{ margin: 0, fontSize: "14px", color: "rgba(255,255,255,0.65)", maxWidth: "560px", lineHeight: 1.45 }}>See what buyers want in this area and which listings you can add or improve.</p>
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

// ---- 2. Choose market (compact toolbar) ------------------------------------
function MarketSelector({ cityKey, areaKey, onCity, onArea }) {
  const cn = cityName(cityKey), an = areaName(cityKey, areaKey);
  return (
    <Card padding="sm" style={{ marginTop: "-16px", position: "relative", zIndex: 2, boxShadow: "var(--shadow-md)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "16px", flexWrap: "wrap" }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: "7px", flex: "none", paddingRight: "16px", borderRight: "1px solid var(--border)" }}>
          <Icon name="map-pin" size={16} color="var(--accent)" />
          <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-strong)" }}>Choose market</span>
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
          Compare all areas<Icon name="arrow-right" size={13} color="var(--text-muted)" />
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

// ---- 4. Main insight (feature card) ----------------------------------------
function InsightCard({ data, an }) {
  return (
    <Card padding="lg" style={{ boxShadow: "var(--shadow-md)" }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "12px", marginBottom: "16px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
          <div style={{ width: "44px", height: "44px", flex: "none", borderRadius: "var(--radius-md)", background: "var(--navy-800)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Icon name="trending-up" size={22} color="#fff" />
          </div>
          <div>
            <div style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "var(--tracking-caps)", textTransform: "uppercase", color: "var(--accent-hover)", marginBottom: "3px" }}>Key opportunity</div>
            <h2 style={{ margin: 0, fontFamily: "var(--font-serif)", fontSize: "24px", fontWeight: 600, lineHeight: 1.15, letterSpacing: "-0.01em", color: "var(--text-strong)" }}>What buyers want in {an}</h2>
          </div>
        </div>
        <ConfidencePill level={data.insight.confidence} />
      </div>
      <p style={{ margin: "0 0 18px", fontSize: "17px", lineHeight: 1.6, color: "var(--text-body)", maxWidth: "760px" }}>{data.insight.text}</p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
        {data.insight.chips.map((c, i) => (
          <Badge key={i} tone={i === 0 ? "accent" : "neutral"} pill>{c}</Badge>
        ))}
      </div>
    </Card>
  );
}

// ---- 5. Demand vs supply ---------------------------------------------------
const AVAIL_TONE = { "Limited options": "caution", "Some options": "verified", "Limited data": "neutral", "Limited supply": "caution" };
function DemandSupply({ data, an }) {
  return (
    <div>
      <SectionHead title={`Demand vs supply in ${an}`} sub="A practical worklist showing where buyer demand is ahead of available supply." />
      <Card padding="none" style={{ overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "var(--font-sans)", minWidth: "720px" }}>
            <thead>
              <tr style={{ background: "var(--navy-100)", textAlign: "left" }}>
                {["Buyer need", "Searches", "Matching listings", "Availability", "Broker action"].map((h) => (
                  <th key={h} style={{ padding: "13px 18px", fontSize: "11px", fontWeight: 700, letterSpacing: "var(--tracking-caps)", textTransform: "uppercase", color: "var(--navy-700)", whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.demandSupply.map((r, i) => (
                <tr key={i} style={{ borderTop: "1px solid var(--border)" }}>
                  <td style={{ padding: "15px 18px", fontWeight: 600, color: "var(--text-strong)" }}>{r.need}</td>
                  <td style={{ padding: "15px 18px", fontFamily: "var(--font-mono)", fontWeight: 600, color: "var(--text-strong)" }}>{r.searches}</td>
                  <td style={{ padding: "15px 18px", fontFamily: "var(--font-mono)", color: "var(--text-body)" }}>{r.matching}</td>
                  <td style={{ padding: "15px 18px" }}><Badge tone={AVAIL_TONE[r.availability] || "neutral"}>{r.availability}</Badge></td>
                  <td style={{ padding: "15px 18px", fontSize: "14px", color: "var(--text-body)" }}>{r.action}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <p style={{ margin: "10px 2px 0", fontSize: "12px", color: "var(--text-muted)" }}>Matching listings are counted only where enough location and property details are available.</p>
    </div>
  );
}

// ---- 6. Listings to improve ------------------------------------------------
const SEV = {
  high:  { tone: "negative", label: "Fix",      bg: "var(--brick-50)",  icon: "var(--negative)" },
  med:   { tone: "caution",  label: "Fix",      bg: "var(--ochre-50)",  icon: "var(--caution)" },
  muted: { tone: "neutral",  label: "Add info", bg: "var(--surface-subtle)", icon: "var(--text-muted)" },
};
function ListingsToImprove({ data, an, cityKey, areaKey }) {
  return (
    <div>
      <SectionHead
        title={`Your listings to improve in ${an}`}
        sub="Fix these first to turn views into enquiries."
        right={<a href={`/broker/listing-quality?city=${cityKey}&areaKey=${areaKey}`} style={{ textDecoration: "none" }}><Button variant="ghost" size="sm">View all quality issues<Icon name="arrow-right" size={15} /></Button></a>}
      />
      <div className="rt-cards3">
        {data.listings.map((l, i) => {
          const sev = SEV[l.severity] || SEV.muted;
          return (
            <Card key={i} style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "10px" }}>
                <h3 style={{ margin: 0, fontSize: "15px", fontWeight: 600, color: "var(--text-strong)", lineHeight: 1.3 }}>{l.title}</h3>
                <Badge tone={sev.tone}>{sev.label}</Badge>
              </div>
              {/* plain-English signal — the headline of the card */}
              <div style={{ display: "flex", alignItems: "center", gap: "7px", fontSize: "13px", fontWeight: 600, color: "var(--text-body)" }}>
                <Icon name="trending-up" size={15} color="var(--text-muted)" />{l.signal}
              </div>
              {/* quiet supporting metrics */}
              <div style={{ display: "flex", gap: "8px", fontSize: "12px", color: "var(--text-muted)" }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: "5px" }}><Icon name="eye" size={13} />{l.views} views</span>
                <span style={{ color: "var(--border-strong)" }}>·</span>
                <span style={{ display: "inline-flex", alignItems: "center", gap: "5px" }}><Icon name="message-circle" size={13} />{l.enquiries} enquiries</span>
              </div>
              <div style={{ background: sev.bg, borderRadius: "var(--radius-md)", padding: "11px 12px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "5px" }}>
                  <Icon name="alert-triangle" size={14} color={sev.icon} />
                  <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-strong)" }}>{l.issue}</span>
                </div>
                <p style={{ margin: 0, fontSize: "13px", color: "var(--text-body)", lineHeight: 1.45 }}>{l.action}</p>
              </div>
              <a href="/broker/listings/:listingId/edit" style={{ textDecoration: "none", marginTop: "auto" }}>
                <Button variant="outline" size="sm" fullWidth><Icon name={l.icon} size={15} />{l.cta}</Button>
              </a>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

// ---- 7. Recommended actions (prioritised checklist) ------------------------
function RecommendedActions({ data, an }) {
  return (
    <div>
      <SectionHead title={`Do these first in ${an}`} sub="Prioritised actions based on buyer demand and your listing quality." />
      <Card padding="none" style={{ overflow: "hidden" }}>
        {data.actions.map((a, i) => (
          <div key={i} className="rt-checkrow" style={{ display: "flex", alignItems: "center", gap: "16px", padding: "16px 18px", borderTop: i ? "1px solid var(--border)" : "none" }}>
            <div style={{ width: "28px", height: "28px", flex: "none", borderRadius: "var(--radius-full)", background: i === 0 ? "var(--navy-800)" : "var(--navy-100)", color: i === 0 ? "#fff" : "var(--navy-800)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-mono)", fontSize: "13px", fontWeight: 600 }}>{i + 1}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "2px" }}>
                <h3 style={{ margin: 0, fontSize: "15px", fontWeight: 600, color: "var(--text-strong)" }}>{a.title}</h3>
                <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", fontSize: "11px", fontWeight: 600, color: "var(--text-muted)", background: "var(--surface-subtle)", borderRadius: "var(--radius-full)", padding: "2px 8px" }}>
                  <Icon name={a.link === "demand" ? "trending-up" : "building"} size={11} />{a.link === "demand" ? "Buyer demand" : "Your listings"}
                </span>
              </div>
              <p style={{ margin: 0, fontSize: "13px", color: "var(--text-muted)", lineHeight: 1.45 }}>{a.detail}</p>
            </div>
            <div className="rt-checkcta" style={{ flex: "none" }}>
              <Button variant={i === 0 ? "accent" : "outline"} size="sm"><Icon name={a.icon} size={15} />{a.cta}</Button>
            </div>
          </div>
        ))}
      </Card>
    </div>
  );
}

// ---- 8. Demand report CTA (single, calm utility) ---------------------------
function DemandReportCTA({ cityKey }) {
  const cn = cityName(cityKey);
  return (
    <Card style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "20px", flexWrap: "wrap" }}>
      <div style={{ display: "flex", gap: "14px", alignItems: "center" }}>
        <div style={{ width: "44px", height: "44px", flex: "none", borderRadius: "var(--radius-md)", background: "var(--navy-100)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Icon name="layers" size={22} color="var(--navy-800)" />
        </div>
        <div>
          <h3 style={{ margin: "0 0 3px", fontSize: "17px", fontWeight: 600, color: "var(--text-strong)" }}>Want to compare areas?</h3>
          <p style={{ margin: 0, fontSize: "14px", color: "var(--text-muted)", maxWidth: "560px" }}>View demand gaps across {cn} and see which areas need more supply.</p>
        </div>
      </div>
      <a href={`/broker/demand-gaps?city=${cityKey}`} style={{ textDecoration: "none" }}>
        <Button variant="outline">View full demand report<Icon name="arrow-right" size={16} /></Button>
      </a>
    </Card>
  );
}

// ---- 10. Confidence note ---------------------------------------------------
function ConfidenceNote() {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "20px", flexWrap: "wrap", paddingTop: "8px", borderTop: "1px solid var(--border)" }}>
      <p style={{ margin: 0, fontSize: "12px", color: "var(--text-muted)", lineHeight: 1.55, maxWidth: "720px" }}>
        Broker insights are based on buyer searches, filters, listing views, saves, calls, WhatsApp clicks and enquiry forms. We only show strong signals when enough activity exists.
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
        <InsightCard data={data} an={an} />
        <DemandSupply data={data} an={an} />
        <ListingsToImprove data={data} an={an} cityKey={cityKey} areaKey={areaKey} />
        <RecommendedActions data={data} an={an} />
        <DemandReportCTA cityKey={cityKey} />
        <ConfidenceNote />
      </div>
    </div>
  );
}

window.RTAreaInsights = RTAreaInsights;
