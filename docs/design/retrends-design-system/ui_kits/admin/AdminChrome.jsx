// ReTrends Admin — chrome shared by every wizard step: admin header + the
// persistent four-step wizard stepper. Exports window.RTA_Header, window.RTA_Stepper.
const { Icon: ChromeIcon, Badge: ChromeBadge } = window.ReTrendsDesignSystem_f37966;

const RTA_STEPS = [
  { key: "select", n: 1, tag: "Select", title: "Select city" },
  { key: "prepare", n: 2, tag: "Prepare", title: "Prepare city" },
  { key: "preview", n: 3, tag: "Validate", title: "Preview & validate" },
  { key: "launch", n: 4, tag: "Launch", title: "Launch" },
];

function RTA_Header() {
  const nav = [["Dashboard", false], ["Listings", false], ["City launch", true], ["Users", false]];
  return (
    <header style={{
      display: "flex", alignItems: "center", gap: "22px", height: "56px", flex: "none",
      padding: "0 22px", background: "var(--paper)", borderBottom: "1px solid var(--border)",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
        <div style={{ width: "28px", height: "28px", borderRadius: "var(--radius-md)", background: "var(--navy-800)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <ChromeIcon name="building" size={16} color="#fff" />
        </div>
        <span style={{ fontSize: "16px", fontWeight: 700, letterSpacing: "-0.01em" }}>
          <span style={{ color: "var(--copper-500)" }}>Re</span><span style={{ color: "var(--navy-800)" }}>Trends</span>
          <span style={{ color: "var(--text-muted)", fontWeight: 600 }}> · Admin</span>
        </span>
      </div>
      <nav style={{ display: "flex", gap: "2px" }}>
        {nav.map(([label, on]) => (
          <span key={label} style={{
            padding: "7px 12px", borderRadius: "var(--radius-md)", fontSize: "13.5px", fontWeight: 600, cursor: "pointer",
            color: on ? "var(--text-strong)" : "var(--text-muted)", background: on ? "var(--surface-subtle)" : "transparent",
          }}>{label}</span>
        ))}
      </nav>
      <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "12px" }}>
        <ChromeBadge tone="negative" pill><ChromeIcon name="shield" size={12} /> Admin only</ChromeBadge>
        <div style={{ width: "30px", height: "30px", borderRadius: "50%", background: "var(--navy-100)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "12px", fontWeight: 700, color: "var(--navy-800)", fontFamily: "var(--font-mono)" }}>AD</div>
      </div>
    </header>
  );
}

function RTA_Stepper({ step, maxReached, onJump }) {
  const activeIdx = RTA_STEPS.findIndex((s) => s.key === step);
  return (
    <div style={{
      display: "flex", alignItems: "stretch", gap: "8px", flex: "none",
      padding: "12px 22px", background: "var(--surface-subtle)", borderBottom: "1px solid var(--border)", overflowX: "auto",
    }}>
      {RTA_STEPS.map((s, i) => {
        const active = i === activeIdx;
        const done = i < activeIdx;
        const reachable = onJump && i <= (maxReached ?? activeIdx);
        return (
          <React.Fragment key={s.key}>
            <button
              onClick={() => reachable && onJump(s.key)}
              style={{
                display: "flex", alignItems: "center", gap: "11px", flex: "1 1 0", minWidth: "180px",
                padding: "10px 14px", borderRadius: "var(--radius-lg)", textAlign: "left",
                border: "1px solid " + (active ? "var(--copper-400)" : "var(--border)"),
                background: active ? "var(--accent-tint)" : "var(--paper)",
                cursor: reachable ? "pointer" : "default", fontFamily: "var(--font-sans)",
                boxShadow: active ? "var(--shadow-sm)" : "none", transition: "background .15s, border-color .15s",
              }}>
              <span style={{
                width: "30px", height: "30px", flex: "none", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
                fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: "14px",
                background: active ? "var(--accent)" : done ? "var(--evergreen-600)" : "var(--navy-800)",
                color: "#fff",
              }}>{done ? "\u2713" : s.n}</span>
              <span style={{ lineHeight: 1.15 }}>
                <span style={{ display: "block", fontSize: "10px", fontFamily: "var(--font-mono)", letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--text-muted)" }}>{s.tag}</span>
                <span style={{ display: "block", fontSize: "14px", fontWeight: 700, color: "var(--text-strong)" }}>{s.title}</span>
              </span>
            </button>
            {i < RTA_STEPS.length - 1 && (
              <span style={{ display: "flex", alignItems: "center", color: "var(--grey-400)", fontFamily: "var(--font-mono)" }}>›</span>
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

// Small reusable page container for the non-map steps.
function RTA_Page({ children }) {
  return (
    <div className="upt-scroll" style={{ flex: 1, minHeight: 0, overflowY: "auto", background: "var(--background)" }}>
      <div style={{ maxWidth: "1080px", margin: "0 auto", padding: "28px 24px 48px" }}>{children}</div>
    </div>
  );
}

Object.assign(window, { RTA_Header, RTA_Stepper, RTA_Page, RTA_STEPS });
