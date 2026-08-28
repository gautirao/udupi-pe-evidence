// Shared small UI atoms for the Pending Approvals workspace.
const { Icon: PAIcon, Badge: PABadge } = window.ReTrendsDesignSystem_f37966;

function PA_VerificationBadge({ tier, size }) {
  const m = {
    verified: { tone: "verified", icon: "shield-check", label: "Verified broker" },
    unverified: { tone: "caution", icon: "shield", label: "Unverified broker" },
    new: { tone: "neutral", icon: "users", label: "New broker" },
  }[tier] || { tone: "neutral", icon: "shield", label: tier };
  return (
    <PABadge tone={m.tone} style={size === "sm" ? { fontSize: "11px", padding: "2px 7px" } : undefined}>
      <PAIcon name={m.icon} size={11} /> {m.label}
    </PABadge>
  );
}

function PA_FlagList({ flags, max }) {
  if (!flags || flags.length === 0) {
    return <PABadge tone="positive" style={{ whiteSpace: "normal" }}><PAIcon name="check" size={11} /> No issues detected</PABadge>;
  }
  const shown = max ? flags.slice(0, max) : flags;
  const extra = flags.length - shown.length;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "4px", alignItems: "flex-start", width: "100%" }}>
      {shown.map((f) => {
        const m = window.PA_FLAG_META[f];
        return <PABadge key={f} tone={m.tone} style={{ whiteSpace: "normal", maxWidth: "100%", boxSizing: "border-box" }}><PAIcon name={m.icon} size={11} style={{ flex: "none" }} /> {m.label}</PABadge>;
      })}
      {extra > 0 && <span style={{ fontSize: "11px", color: "var(--text-muted)", fontWeight: 600 }}>+{extra} more</span>}
    </div>
  );
}

function PA_AgeCell({ iso }) {
  const days = window.PA_ageDays(iso);
  const label = window.PA_formatAge(iso);
  const isNew = label === "Today";
  const isOld = days > 7;
  return (
    <span style={{ display: "flex", alignItems: "center", gap: "6px" }} title={window.PA_formatDateTime(iso)}>
      <span style={{ width: "6px", height: "6px", borderRadius: "50%", flex: "none", background: isOld ? "var(--caution)" : isNew ? "var(--accent)" : "var(--grey-300)" }} />
      <span style={{ fontSize: "13px", color: isOld ? "var(--caution)" : "var(--text-body)", fontWeight: isOld || isNew ? 700 : 500 }}>{label}</span>
    </span>
  );
}

function PA_SectionTitle({ icon, children, right }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 0 10px", borderBottom: "1px solid var(--border)", marginBottom: "14px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        <PAIcon name={icon} size={15} color="var(--text-muted)" />
        <span style={{ fontSize: "13px", fontWeight: 700, color: "var(--text-strong)", textTransform: "uppercase", letterSpacing: "0.04em" }}>{children}</span>
      </div>
      {right}
    </div>
  );
}

function PA_TypeLabel({ type }) {
  return <span style={{ fontSize: "13px", color: "var(--text-body)" }}>{window.PA_PROPERTY_TYPES[type] || type}</span>;
}

Object.assign(window, { PA_VerificationBadge, PA_FlagList, PA_AgeCell, PA_SectionTitle, PA_TypeLabel });
