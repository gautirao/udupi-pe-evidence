// ReTrends Admin — STEP 1: Select city. The launch queue table. The only place a
// city's preparation can be started. Exports window.RTA_SelectCity.
const { Icon: S1Icon, Badge: S1Badge, Button: S1Button, Card: S1Card, Input: S1Input, Select: S1Select } = window.ReTrendsDesignSystem_f37966;

function GeoMeter({ pct, rev, failed }) {
  const color = failed ? "var(--brick-600)" : pct >= 100 ? "var(--evergreen-600)" : pct > 0 ? "var(--ochre-600)" : "var(--stone-400)";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "9px" }}>
      <div style={{ width: "76px", height: "7px", borderRadius: "999px", background: "var(--stone-300)", overflow: "hidden" }}>
        <div style={{ width: pct + "%", height: "100%", background: color, borderRadius: "999px" }} />
      </div>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: "11.5px", color: "var(--text-muted)" }}>
        {rev ? "rev " + rev : "none"}
      </span>
    </div>
  );
}

function RTA_SelectCity({ cities, onSelect }) {
  const [q, setQ] = React.useState("");
  const [filter, setFilter] = React.useState("All");
  const ST = window.RTA_STATUS;

  const actionFor = (c) => {
    switch (c.status) {
      case "not-started": return { label: "Prepare city", variant: "primary", route: "prepare", icon: "arrow-right" };
      case "preparing": return { label: "View progress", variant: "outline", route: "prepare" };
      case "ready-preview": return { label: "Continue", variant: "accent", route: "preview", icon: "arrow-right" };
      case "ready-launch": return { label: "Review & launch", variant: "outline", route: "launch" };
      case "failed": return { label: "See failure", variant: "ghost", route: "prepare" };
      default: return { label: "Open", variant: "outline", route: "prepare" };
    }
  };

  const rows = cities.filter((c) =>
    (filter === "All" || ST[c.status].label === filter) &&
    c.name.toLowerCase().includes(q.toLowerCase())
  );

  const th = { textAlign: "left", fontFamily: "var(--font-mono)", fontSize: "11px", fontWeight: 500, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.04em", padding: "0 16px 12px" };
  const td = { padding: "15px 16px", borderTop: "1px solid var(--border)", verticalAlign: "middle" };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: "16px", flexWrap: "wrap", marginBottom: "8px" }}>
        <div style={{ flex: "1 1 320px" }}>
          <h1 style={{ margin: "0 0 5px", fontFamily: "var(--font-serif)", fontSize: "30px", fontWeight: 600, letterSpacing: "-0.02em", color: "var(--text-strong)" }}>Choose a city to launch</h1>
          <p style={{ margin: 0, fontSize: "14.5px", color: "var(--text-muted)" }}>Live cities are managed from Dashboard. Pick one below to begin the launch wizard.</p>
        </div>
        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
          <div style={{ width: "180px" }}>
            <S1Input size="sm" placeholder="Filter cities" value={q} onChange={(e) => setQ(e.target.value)} leadingIcon={<S1Icon name="search" size={15} />} />
          </div>
          <div style={{ width: "190px" }}>
            <S1Select size="sm" value={filter} onChange={(e) => setFilter(e.target.value)}
              options={["All", "Not started", "Preparing city", "Ready for preview", "Validated · ready to launch", "Preparation failed"]} />
          </div>
        </div>
      </div>

      {/* Security boundary note */}
      <div style={{ display: "flex", alignItems: "center", gap: "9px", margin: "14px 0 18px", padding: "10px 14px", background: "var(--brick-50)", border: "1px solid rgba(178,58,46,0.22)", borderRadius: "var(--radius-md)", fontSize: "13px", color: "var(--brick-600)" }}>
        <S1Icon name="shield" size={16} color="var(--brick-600)" />
        <span style={{ color: "var(--text-body)" }}><strong style={{ color: "var(--brick-600)" }}>Admin-only.</strong> "Prepare city" is the only action that starts work — and it writes to an isolated sandbox revision, never to live Discover.</span>
      </div>

      <S1Card padding="none">
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "14px" }}>
            <thead><tr>
              <th style={{ ...th, paddingTop: "16px" }}>City</th><th style={{ ...th, paddingTop: "16px" }}>Status</th>
              <th style={{ ...th, paddingTop: "16px" }}>Geography</th><th style={{ ...th, paddingTop: "16px" }}>Preview</th>
              <th style={{ ...th, paddingTop: "16px", textAlign: "right" }}>Action</th>
            </tr></thead>
            <tbody>
              {rows.map((c) => {
                const st = ST[c.status]; const act = actionFor(c);
                return (
                  <tr key={c.id}>
                    <td style={td}>
                      <div style={{ fontWeight: 700, fontSize: "15px", color: "var(--text-strong)" }}>{c.name}</div>
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: "11.5px", color: "var(--text-muted)" }}>{c.region}</div>
                    </td>
                    <td style={td}><S1Badge tone={st.tone} pill>{st.label}</S1Badge></td>
                    <td style={td}><GeoMeter pct={c.geoPct} rev={c.rev} failed={c.status === "failed"} /></td>
                    <td style={td}>
                      {c.preview === "ready" && <S1Badge tone="verified" pill>Ready</S1Badge>}
                      {c.preview === "validated" && <S1Badge tone="verified" pill>Validated</S1Badge>}
                      {!c.preview && <span style={{ fontFamily: "var(--font-mono)", fontSize: "13px", color: "var(--grey-400)" }}>—</span>}
                    </td>
                    <td style={{ ...td, textAlign: "right", whiteSpace: "nowrap" }}>
                      <S1Button variant={act.variant} size="sm" onClick={() => onSelect(c, act.route)}>
                        {act.label}{act.icon && <S1Icon name={act.icon} size={15} />}
                      </S1Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </S1Card>

      <div style={{ display: "flex", alignItems: "center", gap: "10px", marginTop: "16px", flexWrap: "wrap", fontFamily: "var(--font-mono)", fontSize: "12px", color: "var(--text-muted)" }}>
        <span>States advance one direction:</span>
        <S1Badge tone="neutral" pill>Not started</S1Badge><span>→</span>
        <S1Badge tone="caution" pill>Preparing city</S1Badge><span>→</span>
        <S1Badge tone="trusted" pill>Ready for preview</S1Badge><span>→</span>
        <S1Badge tone="verified" pill>Ready to launch</S1Badge>
      </div>
    </div>
  );
}

window.RTA_SelectCity = RTA_SelectCity;
