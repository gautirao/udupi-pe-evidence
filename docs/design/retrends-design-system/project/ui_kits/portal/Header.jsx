// ReTrends portal — sticky header / top nav. Exports window.RTHeader
const { Button, Icon, Badge } = window.ReTrendsDesignSystem_f37966;

function RTLogo({ onClick }) {
  return (
    <div onClick={onClick} style={{ display: "flex", flexDirection: "column", gap: "1px", cursor: "pointer" }}>
      <div style={{ fontSize: "22px", fontWeight: 700, letterSpacing: "-0.02em", lineHeight: 1 }}>
        <span style={{ color: "var(--copper-500)" }}>Re</span><span style={{ color: "var(--navy-800)" }}>Trends</span>
      </div>
      <div style={{ fontSize: "8.5px", fontWeight: 600, letterSpacing: "0.2em", textTransform: "uppercase", color: "var(--text-muted)" }}>Real Estate Intelligence</div>
    </div>
  );
}

function NavLink({ icon, label, active, onClick }) {
  const [hover, setHover] = React.useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: "inline-flex", alignItems: "center", gap: "7px",
        padding: "8px 13px", borderRadius: "var(--radius-md)", border: "none",
        fontFamily: "var(--font-sans)", fontSize: "14px", fontWeight: 600, cursor: "pointer",
        background: active ? "var(--navy-800)" : hover ? "var(--grey-100)" : "transparent",
        color: active ? "#fff" : "var(--text-body)",
        transition: "background var(--dur-fast) var(--ease-standard)",
      }}
    >
      <Icon name={icon} size={16} />{label}
    </button>
  );
}

function RTHeader({ route, navigate, signedIn, onSignIn, onSignOut }) {
  return (
    <header style={{ position: "sticky", top: 0, zIndex: 40, background: "var(--paper)", borderBottom: "1px solid var(--border)" }}>
      <div style={{ maxWidth: "var(--container-max)", margin: "0 auto", padding: "0 24px", height: "var(--header-h)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "28px" }}>
          <RTLogo onClick={() => navigate("home")} />
          <nav style={{ display: "flex", alignItems: "center", gap: "4px" }}>
            <NavLink icon="map-pin" label="Discover" active={route === "discover"} onClick={() => navigate("discover")} />
            <NavLink icon="trending-up" label="Trends" active={route === "trends"} onClick={() => navigate("trends")} />
            <NavLink icon="heart" label="Saved" active={route === "saved"} onClick={() => navigate("saved")} />
          </nav>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <Button variant="ghost" size="sm"><Icon name="building" size={16} />Add listing</Button>
          {signedIn ? (
            <Button variant="outline" size="sm" onClick={onSignOut}>Priya K.</Button>
          ) : (
            <Button variant="primary" size="sm" onClick={onSignIn}>Sign in</Button>
          )}
        </div>
      </div>
    </header>
  );
}

window.RTHeader = RTHeader;
window.RTLogo = RTLogo;
