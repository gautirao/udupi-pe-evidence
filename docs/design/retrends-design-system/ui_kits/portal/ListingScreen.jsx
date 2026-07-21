// ReTrends portal — Listing detail. Exports window.RTListing
const { Button, Icon, Badge, Card, TrustBadge } = window.ReTrendsDesignSystem_f37966;

const TRUST_ITEMS = {
  verified: ["Ownership documents verified", "RERA registration confirmed", "Broker credentials checked", "Photos verified on-site"],
  trusted: ["Listed by verified broker", "Broker track record confirmed", "Details cross-checked"],
  listed: ["Basic verification pending", "Listing under review"],
};

function Spec({ icon, label, value }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "6px", padding: "16px", background: "var(--surface-subtle)", borderRadius: "var(--radius-md)", flex: 1 }}>
      <Icon name={icon} size={20} color="var(--navy-800)" />
      <span style={{ fontFamily: "var(--font-mono)", fontSize: "18px", fontWeight: 600, color: "var(--text-strong)" }}>{value}</span>
      <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>{label}</span>
    </div>
  );
}

function RTListing({ navigate, propertyId }) {
  const D = window.RT_DATA;
  const p = D.properties.find((x) => x.id === propertyId) || D.properties[0];
  const [saved, setSaved] = React.useState(false);
  const fmt = (v) => v >= 10000000 ? `₹${(v / 10000000).toFixed(2)} Cr` : `₹${(v / 100000).toFixed(0)} L`;
  const perSqft = p.area ? Math.round(p.price / p.area).toLocaleString("en-IN") : "—";

  return (
    <div style={{ maxWidth: "var(--container-max)", margin: "0 auto", padding: "24px" }}>
      <button onClick={() => navigate("discover")} style={{ display: "inline-flex", alignItems: "center", gap: "6px", border: "none", background: "transparent", cursor: "pointer", color: "var(--text-muted)", fontFamily: "var(--font-sans)", fontSize: "14px", fontWeight: 600, marginBottom: "16px" }}>
        <Icon name="arrow-right" size={16} style={{ transform: "rotate(180deg)" }} />Back to results
      </button>

      {/* Gallery */}
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "12px", marginBottom: "24px", height: "380px" }}>
        <div style={{ position: "relative", borderRadius: "var(--radius-xl)", overflow: "hidden" }}>
          <img src={p.image} alt={p.title} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          <div style={{ position: "absolute", top: "16px", left: "16px" }}><TrustBadge tier={p.trustTier} /></div>
        </div>
        <div style={{ display: "grid", gridTemplateRows: "1fr 1fr", gap: "12px" }}>
          <img src="https://images.unsplash.com/photo-1505691938895-1758d7feb511?w=500&h=300&fit=crop" alt="" style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "var(--radius-lg)" }} />
          <div style={{ position: "relative", borderRadius: "var(--radius-lg)", overflow: "hidden" }}>
            <img src="https://images.unsplash.com/photo-1556909212-d5b604d0c90d?w=500&h=300&fit=crop" alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            <div style={{ position: "absolute", inset: 0, background: "rgba(17,24,39,0.55)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 600, fontSize: "15px" }}>+8 photos</div>
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr", gap: "28px", alignItems: "start" }}>
        {/* Left: details */}
        <div>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "16px", marginBottom: "8px" }}>
            <h1 style={{ margin: 0, fontFamily: "var(--font-serif)", fontSize: "34px", fontWeight: 600, color: "var(--text-strong)", letterSpacing: "-0.02em" }}>{p.title}</h1>
            <Button variant={saved ? "secondary" : "outline"} size="sm" onClick={() => setSaved(!saved)}>
              <Icon name="heart" size={16} color={saved ? "var(--accent)" : "currentColor"} />{saved ? "Saved" : "Save"}
            </Button>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "6px", color: "var(--text-muted)", fontSize: "15px", marginBottom: "24px" }}>
            <Icon name="map-pin" size={16} color="var(--grey-400)" />{p.locality}, {p.city}
          </div>

          <div style={{ display: "flex", gap: "12px", marginBottom: "28px" }}>
            {p.bedrooms > 0 && <Spec icon="bed" label="Bedrooms" value={`${p.bedrooms} BHK`} />}
            {p.bathrooms > 0 && <Spec icon="bath" label="Bathrooms" value={p.bathrooms} />}
            <Spec icon="maximize" label="Area" value={`${p.area.toLocaleString("en-IN")} sq.ft`} />
            <Spec icon="calendar" label="Posted" value={`${p.postedDays}d ago`} />
          </div>

          {/* Trust detail */}
          <Card style={{ background: p.trustTier === "verified" ? "var(--trust-verified-bg)" : p.trustTier === "trusted" ? "var(--trust-trusted-bg)" : "var(--surface-subtle)", border: "1px solid var(--border)", marginBottom: "24px" }}>
            <div style={{ display: "flex", gap: "12px", marginBottom: "14px" }}>
              <div style={{ width: "44px", height: "44px", borderRadius: "var(--radius-md)", background: "var(--paper)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Icon name={p.trustTier === "listed" ? "file-check" : p.trustTier === "trusted" ? "shield" : "shield-check"} size={24} color={`var(--trust-${p.trustTier === "listed" ? "listed" : p.trustTier}-fg)`} />
              </div>
              <div>
                <h3 style={{ margin: "0 0 2px", fontSize: "17px", fontWeight: 600, color: "var(--text-strong)", textTransform: "capitalize" }}>{p.trustTier} listing</h3>
                <p style={{ margin: 0, fontSize: "13px", color: "var(--text-muted)" }}>What we checked for you</p>
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
              {TRUST_ITEMS[p.trustTier].map((it) => (
                <div key={it} style={{ display: "flex", alignItems: "flex-start", gap: "8px", fontSize: "14px", color: "var(--text-body)" }}>
                  <Icon name="check" size={16} color="var(--positive)" style={{ marginTop: "2px", flex: "none" }} />{it}
                </div>
              ))}
            </div>
          </Card>

          <h3 style={{ margin: "0 0 12px", fontSize: "18px", fontWeight: 600, color: "var(--text-strong)" }}>Highlights</h3>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
            {p.highlights.map((h) => <Badge key={h} tone="navy" pill>{h}</Badge>)}
          </div>
        </div>

        {/* Right: price + broker (sticky) */}
        <div style={{ position: "sticky", top: "88px", display: "flex", flexDirection: "column", gap: "16px" }}>
          <Card>
            <div style={{ fontSize: "13px", color: "var(--text-muted)", marginBottom: "4px" }}>Asking price</div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: "32px", fontWeight: 600, color: "var(--text-strong)", lineHeight: 1.1 }}>{fmt(p.price)}</div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: "13px", color: "var(--text-muted)", marginTop: "4px", marginBottom: "18px" }}>₹{perSqft} / sq.ft</div>
            <Button variant="accent" size="lg" fullWidth style={{ marginBottom: "10px" }}>Contact broker</Button>
            <Button variant="outline" size="lg" fullWidth>Schedule a visit</Button>
          </Card>
          <Card>
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <div style={{ width: "46px", height: "46px", borderRadius: "var(--radius-full)", background: "var(--navy-800)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 600, fontSize: "16px" }}>RK</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: "15px", fontWeight: 600, color: "var(--text-strong)" }}>Ravi Kumar</div>
                <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>Verified broker · 6 yrs</div>
              </div>
              <Badge tone="verified"><Icon name="shield-check" size={13} />RERA</Badge>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: "12px", fontSize: "13px", color: "var(--text-body)" }}>
              <Icon name="star" size={14} color="var(--caution)" /><span style={{ fontWeight: 600 }}>4.8</span><span style={{ color: "var(--text-muted)" }}>· 132 deals closed</span>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

window.RTListing = RTListing;
