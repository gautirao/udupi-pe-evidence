// ReTrends portal — Home screen. Exports window.RTHome
const { Button, Icon, Badge, Input, Select, Card, TrustBadge } = window.ReTrendsDesignSystem_f37966;

function Hero({ navigate }) {
  const D = window.RT_DATA;
  return (
    <section style={{ background: "linear-gradient(180deg,#FBFBF9 0%, var(--canvas-100) 100%)", borderBottom: "1px solid var(--border)" }}>
      <div style={{ maxWidth: "var(--container-max)", margin: "0 auto", padding: "64px 24px", display: "grid", gridTemplateColumns: "1.05fr 0.95fr", gap: "48px", alignItems: "center" }}>
        <div>
          <Badge tone="accent" pill style={{ marginBottom: "20px" }}><Icon name="trending-up" size={13} />Verified insights for every locality</Badge>
          <h1 style={{ margin: "0 0 18px", fontFamily: "var(--font-serif)", fontSize: "52px", fontWeight: 600, lineHeight: 1.05, letterSpacing: "-0.02em", color: "var(--text-strong)" }}>
            Find your home with<br /><span style={{ color: "var(--accent)" }}>trust &amp; clarity.</span>
          </h1>
          <p style={{ margin: "0 0 28px", fontSize: "17px", lineHeight: 1.6, color: "var(--text-body)", maxWidth: "440px" }}>
            Explore properties on an interactive map, read real market trends by locality, and buy with confidence from verified listings.
          </p>

          <Card padding="md" style={{ maxWidth: "480px", boxShadow: "var(--shadow-lg)" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "12px" }}>
              <Select label="City" options={D.cities} />
              <Input label="Locality" placeholder="Search localities…" leadingIcon={<Icon name="map-pin" size={16} />} />
            </div>
            <Button variant="accent" size="lg" fullWidth onClick={() => navigate("discover")}>
              <Icon name="search" size={18} />Explore on map
            </Button>
          </Card>

          <div style={{ display: "flex", gap: "20px", marginTop: "20px", fontSize: "13px", color: "var(--text-muted)", fontWeight: 500 }}>
            <span style={{ display: "flex", alignItems: "center", gap: "6px" }}><Icon name="check" size={15} color="var(--positive)" />500+ verified listings</span>
            <span style={{ display: "flex", alignItems: "center", gap: "6px" }}><Icon name="check" size={15} color="var(--positive)" />RERA-checked</span>
          </div>
        </div>

        <div style={{ position: "relative", borderRadius: "var(--radius-2xl)", overflow: "hidden", boxShadow: "var(--shadow-xl)", height: "420px" }}>
          <img src="https://images.unsplash.com/photo-1564013799919-ab600027ffc6?w=800&h=900&fit=crop" alt="Modern home" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(17,24,39,0.45), transparent 55%)" }} />
          <div style={{ position: "absolute", left: "20px", right: "20px", bottom: "20px", background: "rgba(255,255,255,0.12)", backdropFilter: "blur(12px)", border: "1px solid rgba(255,255,255,0.25)", borderRadius: "var(--radius-lg)", padding: "16px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "#fff", fontWeight: 600, fontSize: "15px", marginBottom: "4px" }}>
              <Icon name="shield-check" size={18} color="#fff" />Verified property
            </div>
            <p style={{ margin: 0, fontSize: "13px", color: "rgba(255,255,255,0.9)", lineHeight: 1.5 }}>Documents checked, RERA registered, ready to view.</p>
          </div>
        </div>
      </div>
    </section>
  );
}

const VALUES = [
  { icon: "map-pin", title: "Map-first discovery", body: "Explore by locality on an interactive map. Compare up to 3 areas at once." },
  { icon: "shield-check", title: "Trust signals", body: "Every listing shows verification status — documents, RERA, broker credentials." },
  { icon: "trending-up", title: "Market insights", body: "Understand price trends and demand before you decide. Data you can trust." },
];

function ValueProps() {
  return (
    <section style={{ maxWidth: "var(--container-max)", margin: "0 auto", padding: "64px 24px" }}>
      <div style={{ textAlign: "center", marginBottom: "44px" }}>
        <h2 style={{ margin: "0 0 10px", fontFamily: "var(--font-serif)", fontSize: "34px", fontWeight: 600, color: "var(--text-strong)", letterSpacing: "-0.02em" }}>Why ReTrends?</h2>
        <p style={{ margin: 0, fontSize: "16px", color: "var(--text-muted)" }}>Not another listings portal — a decision tool built on verified data.</p>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "24px" }}>
        {VALUES.map((v) => (
          <Card key={v.title}>
            <div style={{ width: "52px", height: "52px", borderRadius: "var(--radius-lg)", background: "var(--navy-100)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: "16px" }}>
              <Icon name={v.icon} size={26} color="var(--navy-800)" />
            </div>
            <h3 style={{ margin: "0 0 8px", fontSize: "18px", fontWeight: 600, color: "var(--text-strong)" }}>{v.title}</h3>
            <p style={{ margin: 0, fontSize: "14px", lineHeight: 1.6, color: "var(--text-body)" }}>{v.body}</p>
          </Card>
        ))}
      </div>
    </section>
  );
}

function TrendingLocalities({ navigate }) {
  const D = window.RT_DATA;
  const fmt = (p) => `₹${(p / 10000000).toFixed(2)} Cr`;
  return (
    <section style={{ background: "var(--surface-subtle)", borderTop: "1px solid var(--border)" }}>
      <div style={{ maxWidth: "var(--container-max)", margin: "0 auto", padding: "64px 24px" }}>
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: "28px" }}>
          <div>
            <h2 style={{ margin: "0 0 6px", fontFamily: "var(--font-serif)", fontSize: "30px", fontWeight: 600, color: "var(--text-strong)", letterSpacing: "-0.02em" }}>Trending localities</h2>
            <p style={{ margin: 0, fontSize: "15px", color: "var(--text-muted)" }}>High-demand areas with verified listings</p>
          </div>
          <Button variant="outline" onClick={() => navigate("trends")}>View all trends<Icon name="arrow-right" size={16} /></Button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: "18px" }}>
          {D.localities.map((l) => (
            <Card key={l.name} interactive onClick={() => navigate("trends")}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "14px" }}>
                <div>
                  <h3 style={{ margin: "0 0 2px", fontSize: "17px", fontWeight: 600, color: "var(--text-strong)" }}>{l.name}</h3>
                  <span style={{ fontSize: "13px", color: "var(--text-muted)" }}>{l.city}</span>
                </div>
                <Badge tone={l.tier === "Full data" ? "verified" : "caution"}>{l.tier}</Badge>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13px", marginBottom: "6px" }}>
                <span style={{ color: "var(--text-muted)" }}>Avg. price</span>
                <span style={{ fontFamily: "var(--font-mono)", fontWeight: 600, color: "var(--text-strong)" }}>{fmt(l.avgPrice)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13px", paddingBottom: "12px", borderBottom: "1px solid var(--border)" }}>
                <span style={{ color: "var(--text-muted)" }}>YoY trend</span>
                <span style={{ fontFamily: "var(--font-mono)", fontWeight: 600, color: "var(--positive)" }}>▲ {l.trend}</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: "12px", fontSize: "13px", fontWeight: 600, color: "var(--accent)" }}>
                Explore area<Icon name="arrow-right" size={15} />
              </div>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}

function CTA({ navigate }) {
  return (
    <section style={{ background: "var(--navy-800)" }}>
      <div style={{ maxWidth: "880px", margin: "0 auto", padding: "72px 24px", textAlign: "center" }}>
        <h2 style={{ margin: "0 0 14px", fontFamily: "var(--font-serif)", fontSize: "38px", fontWeight: 600, color: "#fff", letterSpacing: "-0.02em" }}>Ready to find your perfect home?</h2>
        <p style={{ margin: "0 0 28px", fontSize: "17px", color: "rgba(255,255,255,0.75)" }}>Start exploring verified properties in your preferred localities.</p>
        <div style={{ display: "flex", gap: "12px", justifyContent: "center" }}>
          <Button variant="accent" size="lg" onClick={() => navigate("discover")}><Icon name="map-pin" size={18} />Start map search</Button>
          <Button variant="outline" size="lg" onClick={() => navigate("trends")} style={{ background: "transparent", color: "#fff", borderColor: "rgba(255,255,255,0.3)" }}>Explore trends</Button>
        </div>
      </div>
    </section>
  );
}

function RTHome({ navigate }) {
  return (
    <div>
      <Hero navigate={navigate} />
      <ValueProps />
      <TrendingLocalities navigate={navigate} />
      <CTA navigate={navigate} />
    </div>
  );
}

window.RTHome = RTHome;
