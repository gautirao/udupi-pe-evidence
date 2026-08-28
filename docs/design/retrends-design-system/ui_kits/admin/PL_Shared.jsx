// Shared atoms for the Listings inventory page.
const { Icon: PLIcon, Badge: PLBadge, Button: PLButton } = window.ReTrendsDesignSystem_f37966;

function PL_LifecycleBadge({ status }) {
  const m = window.PL_LIFECYCLE_META[status];
  return <PLBadge tone={m.tone} solid={!!m.solid} style={{ whiteSpace: "normal", maxWidth: "100%", boxSizing: "border-box" }}>{m.label}</PLBadge>;
}

function PL_VisibilityBadge({ visible, inconsistent }) {
  const wrapStyle = { whiteSpace: "normal", maxWidth: "100%", boxSizing: "border-box" };
  if (inconsistent) return <PLBadge tone="negative" style={wrapStyle}><PLIcon name="alert-triangle" size={11} style={{ flex: "none" }} /> Inconsistent state</PLBadge>;
  return visible ? <PLBadge tone="positive" style={wrapStyle}><PLIcon name="check" size={11} style={{ flex: "none" }} /> Visible on PropertySignal</PLBadge> : <PLBadge tone="neutral" style={wrapStyle}>Not visible</PLBadge>;
}

function PL_CompletenessCell({ pct, missing }) {
  const color = pct >= 90 ? "var(--positive)" : pct >= 60 ? "var(--caution)" : "var(--negative)";
  const title = missing && missing.length ? "Missing: " + missing.join(", ") : undefined;
  return (
    <span style={{ display: "flex", alignItems: "center", gap: "6px" }} title={title}>
      <span style={{ width: "6px", height: "6px", borderRadius: "50%", flex: "none", background: color }} />
      <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-body)" }}>{pct}% complete</span>
    </span>
  );
}

function PL_WarningInline({ warnings }) {
  if (!warnings || warnings.length === 0) return <span style={{ fontSize: "12px", color: "var(--positive)", fontWeight: 600, display: "flex", alignItems: "center", gap: "4px" }}><PLIcon name="check" size={11} /> No issues</span>;
  const worst = warnings.includes("inconsistent_state") ? "negative" : "caution";
  const color = worst === "negative" ? "var(--negative)" : "var(--caution)";
  const label = warnings.map((w) => window.PL_WARNING_META[w].label).join(" \u00b7 ");
  return (
    <span style={{ display: "flex", alignItems: "flex-start", gap: "5px", fontSize: "12px", fontWeight: 600, color }} title={label}>
      <PLIcon name="alert-triangle" size={12} style={{ flex: "none", marginTop: "1px" }} />
      <span style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{warnings.length} issue{warnings.length === 1 ? "" : "s"}: {label}</span>
    </span>
  );
}

function PL_Thumb({ photos }) {
  return photos && photos.length ? (
    <img src={photos[0]} alt="" style={{ width: "44px", height: "44px", objectFit: "cover", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)", flex: "none" }} />
  ) : (
    <div style={{ width: "44px", height: "44px", borderRadius: "var(--radius-sm)", border: "1px dashed var(--border-strong)", background: "var(--surface-subtle)", display: "flex", alignItems: "center", justifyContent: "center", flex: "none" }}>
      <PLIcon name="camera" size={16} color="var(--text-muted)" />
    </div>
  );
}

const PL_ACTION_META = {
  publish: { label: "Publish", verb: "publish", body: (n) => "This will make " + n + " listing" + (n === 1 ? "" : "s") + " visible to users and on the public map.", color: "var(--positive)" },
  unpublish: { label: "Unpublish", verb: "unpublish", body: (n) => "This removes " + n + " listing" + (n === 1 ? "" : "s") + " from public surfaces without deleting " + (n === 1 ? "it" : "them") + ". It can be republished later.", color: "var(--caution)" },
  archive: { label: "Archive", verb: "archive", body: (n) => "This removes " + n + " listing" + (n === 1 ? "" : "s") + " from active inventory and preserves the record. It can be restored later.", color: "var(--navy-800)" },
  restore: { label: "Restore", verb: "restore", body: (n) => "This returns " + n + " archived listing" + (n === 1 ? "" : "s") + " to an unpublished state for review before republishing.", color: "var(--navy-800)" },
};

function PL_ConfirmDialog({ action, count, onConfirm, onCancel }) {
  const m = PL_ACTION_META[action];
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 90, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div onClick={onCancel} style={{ position: "absolute", inset: 0, background: "rgba(14,22,38,0.42)" }} />
      <div style={{ position: "relative", width: "420px", background: "var(--paper)", borderRadius: "var(--radius-lg)", boxShadow: "var(--shadow-xl)", padding: "22px 24px" }}>
        <h3 style={{ fontSize: "17px", fontWeight: 700, margin: "0 0 8px" }}>{m.label} {count} listing{count === 1 ? "" : "s"}?</h3>
        <p style={{ fontSize: "13.5px", color: "var(--text-muted)", lineHeight: 1.6, margin: "0 0 20px" }}>{m.body(count)}</p>
        <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
          <PLButton variant="outline" onClick={onCancel}>Cancel</PLButton>
          <PLButton style={{ background: m.color }} onClick={onConfirm}>{m.label}</PLButton>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { PL_LifecycleBadge, PL_VisibilityBadge, PL_CompletenessCell, PL_WarningInline, PL_Thumb, PL_ConfirmDialog, PL_ACTION_META });
