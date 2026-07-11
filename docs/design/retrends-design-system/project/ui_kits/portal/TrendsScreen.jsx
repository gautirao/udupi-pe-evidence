// ReTrends portal — Trends / Area overview. Exports window.RTTrends
const { Button, Icon, Badge, Select, StatTile, Card, TrustBadge } = window.ReTrendsDesignSystem_f37966;

function PriceChart({ series }) {
  const max = Math.max(...series), min = Math.min(...series);
  const months = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];
  return (
    <Card>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "20px" }}>
        <div>
          <h3 style={{ margin: "0 0 4px", fontSize: "17px", fontWeight: 600, color: "var(--text-strong)" }}>Price index — last 12 months</h3>
          <p style={{ margin: 0, fontSize: "13px", color: "var(--text-muted)" }}>Median ₹/sq.ft, indexed to 100</p>
        </div>
        <Badge tone="positive"><Icon name="trending-up" size={13} />+12.4%</Badge>
      </div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: "8px", height: "150px" }}>
        {series.map((v, i) => {
          const h = 18 + ((v - min) / (max - min)) * 82;
          const recent = i >= series.length - 3;
          return (
            <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: "8px", height: "100%", justifyContent: "flex-end" }}>
              <div style={{ width: "100%", height: h + "%", borderRadius: "var(--radius-xs) var(--radius-xs) 0 0", background: recent ? "var(--accent)" : "var(--navy-100)", transition: "height var(--dur-slow) var(--ease-out)" }} />
              <span style={{ fontFamily: "var(--font-mono)", fontSize: "10px", color: "var(--text-muted)" }}>{months[i]}</span>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

const INSIGHTS = [
  { icon: "trending-up", tone: "positive", title: "Demand outpacing supply", body: "3 BHK searches up 28% QoQ while new listings rose only 9%. Sellers have leverage." },
  { icon: "shield-check", tone: "verified", title: "62% listings verified", body: "Verification rate here is well above the city median of 41% — buyer confidence is high." },
  { icon: "building", tone: "navy", title: "New supply incoming", body: "4 RERA-registered projects launching within 2 km over the next two quarters." },
];

function RTTrends({ navigate }) {
  const D = window.RT_DATA;
  const fmt = (p) => `₹${(p / 10000000).toFixed(2)} Cr`;
  return (
    <div>
      {/* Area header */}
      <section style={{ background: "var(--navy-800)" }}>
        <div style={{ maxWidth: "var(--container-max)", margin: "0 auto", padding: "40px 24px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", color: "rgba(255,255,255,0.6)", fontSize: "13px", marginBottom: "12px" }}>
            <span style={{ cursor: "pointer" }} onClick={() => navigate("home")}>Bengaluru</span><Icon name="chevron-down" size={13} style={{ transform: "rotate(-90deg)" }} /><span style={{ color: "#fff" }}>Whitefield</span>
          </div>
          <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", flexWrap: "wrap", gap: "16px" }}>
            <div>
              <h1 style={{ margin: "0 0 8px", fontFamily: "var(--font-serif)", fontSize: "42px", fontWeight: 600, color: "#fff", letterSpacing: "-0.02em" }}>Whitefield</h1>
              <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                <Badge tone="verified">Full data</Badge>
                <span style={{ color: "rgba(255,255,255,0.7)", fontSize: "14px" }}>88 active listings · IT corridor</span>
              </div>
            </div>
            <Button variant="accent" onClick={() => navigate("discover")}><Icon name="map-pin" size={17} />View on map</Button>
          </div>
        </div>
      </section>

      <div style={{ maxWidth: "var(--container-max)", margin: "0 auto", padding: "32px 24px" }}>
        {/* Stat tiles */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: "16px", marginBottom: "28px" }}>
          {D.areaStats.map((s) => <StatTile key={s.label} {...s} />)}
        </div>

        {/* Chart + insights */}
        <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: "20px", marginBottom: "28px" }}>
          <PriceChart series={D.priceSeries} />
          <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
            {INSIGHTS.map((it) => (
              <Card key={it.title} padding="md">
                <div style={{ display: "flex", gap: "12px" }}>
                  <div style={{ flex: "none", width: "40px", height: "40px", borderRadius: "var(--radius-md)", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--navy-100)" }}>
                    <Icon name={it.icon} size={20} color="var(--navy-800)" />
                  </div>
                  <div>
                    <h4 style={{ margin: "0 0 4px", fontSize: "15px", fontWeight: 600, color: "var(--text-strong)" }}>{it.title}</h4>
                    <p style={{ margin: 0, fontSize: "13px", lineHeight: 1.5, color: "var(--text-body)" }}>{it.body}</p>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>

        {/* Locality comparison */}
        <h3 style={{ margin: "0 0 16px", fontFamily: "var(--font-serif)", fontSize: "24px", fontWeight: 600, color: "var(--text-strong)", letterSpacing: "-0.01em" }}>Compare nearby localities</h3>
        <Card padding="none" style={{ overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "var(--font-sans)" }}>
            <thead>
              <tr style={{ background: "var(--surface-subtle)", textAlign: "left" }}>
                {["Locality", "City", "Avg. price", "Listings", "YoY", "Data"].map((h) => (
                  <th key={h} style={{ padding: "12px 18px", fontSize: "11px", fontWeight: 700, letterSpacing: "var(--tracking-caps)", textTransform: "uppercase", color: "var(--text-muted)" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {D.localities.map((l, i) => (
                <tr key={l.name} style={{ borderTop: "1px solid var(--border)" }}>
                  <td style={{ padding: "14px 18px", fontWeight: 600, color: "var(--text-strong)" }}>{l.name}</td>
                  <td style={{ padding: "14px 18px", color: "var(--text-muted)", fontSize: "14px" }}>{l.city}</td>
                  <td style={{ padding: "14px 18px", fontFamily: "var(--font-mono)", fontWeight: 600 }}>{fmt(l.avgPrice)}</td>
                  <td style={{ padding: "14px 18px", fontFamily: "var(--font-mono)" }}>{l.count}</td>
                  <td style={{ padding: "14px 18px", fontFamily: "var(--font-mono)", fontWeight: 600, color: "var(--positive)" }}>▲ {l.trend}</td>
                  <td style={{ padding: "14px 18px" }}><Badge tone={l.tier === "Full data" ? "verified" : "caution"}>{l.tier}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>
    </div>
  );
}

window.RTTrends = RTTrends;
