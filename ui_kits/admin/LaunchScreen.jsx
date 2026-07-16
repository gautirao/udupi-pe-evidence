// ReTrends Admin — STEP 4: Launch. Validation summary + the single guarded action.
// Unlocks only when all step-3 checkpoints pass, then type-to-confirm promotes the
// sandbox revision to production. Exports window.RTA_Launch.
const { Icon: S4Icon, Badge: S4Badge, Button: S4Button, Card: S4Card, Input: S4Input } = window.ReTrendsDesignSystem_f37966;

function RTA_Launch({ city, validation, onBack, onLaunch, launched }) {
  const items = window.RTA_VALIDATION;
  const passed = items.filter((it) => validation[it.key]).length;
  const allDone = passed === items.length;
  const [confirm, setConfirm] = React.useState("");
  const canLaunch = allDone && confirm.trim().toLowerCase() === city.name.toLowerCase();
  const _T = ["15:20", "15:22", "15:24", "15:25", "15:27"];

  if (launched) {
    return (
      <div style={{ maxWidth: "560px", margin: "40px auto", textAlign: "center" }}>
        <div style={{ width: "68px", height: "68px", borderRadius: "50%", background: "var(--evergreen-50)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px" }}>
          <S4Icon name="shield-check" size={34} color="var(--evergreen-600)" />
        </div>
        <h1 style={{ margin: "0 0 10px", fontFamily: "var(--font-serif)", fontSize: "30px", fontWeight: 600, letterSpacing: "-0.02em" }}>{city.name} is live</h1>
        <p style={{ margin: "0 0 22px", color: "var(--text-muted)", fontSize: "15px" }}>Revision {city.rev} was promoted to production. {city.name} now appears in Discover for everyone.</p>
        <S4Button variant="primary" size="md" onClick={onBack}>Back to cities</S4Button>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: "720px", margin: "0 auto" }}>
      <button onClick={onBack} style={{ display: "inline-flex", alignItems: "center", gap: "6px", border: "none", background: "none", cursor: "pointer", color: "var(--text-muted)", fontFamily: "var(--font-sans)", fontSize: "13px", fontWeight: 600, padding: 0, marginBottom: "14px" }}>
        <span style={{ transform: "rotate(180deg)", display: "inline-flex" }}><S4Icon name="arrow-right" size={15} /></span> Back to preview
      </button>

      <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap", marginBottom: "5px" }}>
        <h1 style={{ margin: 0, fontFamily: "var(--font-serif)", fontSize: "30px", fontWeight: 600, letterSpacing: "-0.02em", color: "var(--text-strong)" }}>Launch {city.name}</h1>
        <div style={{ marginLeft: "auto" }}>
          <S4Badge tone={allDone ? "verified" : "caution"} pill>{allDone ? "✓ All " + items.length + " checkpoints validated" : passed + " of " + items.length + " validated"}</S4Badge>
        </div>
      </div>
      <p style={{ margin: "0 0 18px", fontSize: "14px", color: "var(--text-muted)" }}>Validation summary carried from preview · <span style={{ fontFamily: "var(--font-mono)" }}>sandbox rev {city.rev}</span></p>

      <S4Card padding="none">
        {items.map((it, i) => {
          const ok = validation[it.key];
          return (
            <div key={it.key} style={{ display: "flex", alignItems: "center", gap: "13px", padding: "13px 16px", borderTop: i === 0 ? "none" : "1px solid var(--border)" }}>
              <span style={{ width: "24px", height: "24px", flex: "none", borderRadius: "7px", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: "12px", background: ok ? "var(--evergreen-600)" : "var(--surface-subtle)", color: ok ? "#fff" : "var(--grey-400)", border: ok ? "none" : "1px dashed var(--stone-400)" }}>{ok ? "✓" : ""}</span>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: "14.5px", fontWeight: 700, color: "var(--text-strong)" }}>{it.label} — {it.note}</div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: "11px", color: "var(--text-muted)", marginTop: "1px" }}>{ok ? "validated " + _T[i] + " · admin@retrends" : "not yet validated"}</div>
              </div>
              <span style={{ marginLeft: "auto", fontFamily: "var(--font-mono)", fontSize: "11.5px", color: ok ? "var(--evergreen-600)" : "var(--ochre-600)" }}>{ok ? "✓ pass" : "pending"}</span>
            </div>
          );
        })}
      </S4Card>

      {/* the gate */}
      <div style={{ marginTop: "18px", background: "var(--paper)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", padding: "18px 20px", boxShadow: "var(--shadow-sm)" }}>
        {allDone ? (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "var(--evergreen-600)", fontWeight: 700, fontSize: "15px", marginBottom: "4px" }}>
              <S4Icon name="shield-check" size={18} color="var(--evergreen-600)" /> Ready to launch
            </div>
            <p style={{ margin: "0 0 14px", fontSize: "13.5px", color: "var(--text-muted)" }}>This promotes sandbox rev {city.rev} to production and makes {city.name} visible to everyone. Type <strong style={{ color: "var(--text-strong)" }}>{city.name}</strong> to confirm.</p>
            <div style={{ display: "flex", gap: "10px", alignItems: "flex-end", flexWrap: "wrap" }}>
              <div style={{ flex: "1 1 220px" }}>
                <S4Input placeholder={"Type “" + city.name + "” to confirm"} value={confirm} onChange={(e) => setConfirm(e.target.value)} />
              </div>
              <S4Button variant="primary" size="md" disabled={!canLaunch} onClick={() => canLaunch && onLaunch()}>
                <S4Icon name="shield-check" size={16} /> Launch city
              </S4Button>
            </div>
          </>
        ) : (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "var(--ochre-600)", fontWeight: 700, fontSize: "15px", marginBottom: "4px" }}>
              <S4Icon name="shield" size={18} color="var(--ochre-600)" /> Launch locked
            </div>
            <p style={{ margin: "0 0 14px", fontSize: "13.5px", color: "var(--text-muted)" }}>{items.length - passed} validation checkpoint(s) still pending. Finish validating in preview before this city can be launched.</p>
            <S4Button variant="outline" size="md" onClick={onBack}><S4Icon name="arrow-right" size={16} /> Back to validation</S4Button>
          </>
        )}
      </div>

      <div style={{ display: "flex", alignItems: "flex-start", gap: "8px", marginTop: "16px", fontSize: "12.5px", color: "var(--text-muted)", lineHeight: 1.45 }}>
        <S4Icon name="shield" size={15} color="var(--text-muted)" />
        <span>This is the only screen in the wizard that writes to production. It is doubly guarded: disabled until every checkpoint passes, and again by type-to-confirm — a city cannot be launched by a stray click.</span>
      </div>
    </div>
  );
}

window.RTA_Launch = RTA_Launch;
