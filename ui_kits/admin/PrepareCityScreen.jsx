// ReTrends Admin — STEP 2: Prepare city (formerly "pipeline"). Ordered preparation
// steps with timestamps + current step; loud, recoverable failure. Runs entirely
// in a sandbox revision. Exports window.RTA_PrepareCity.
const { Icon: S2Icon, Badge: S2Badge, Button: S2Button, Card: S2Card } = window.ReTrendsDesignSystem_f37966;

const _TIMES = ["14:02", "14:03", "14:04", "14:05", "14:06", "14:07"];

function StepMarker({ kind, n }) {
  const base = { width: "28px", height: "28px", flex: "none", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: "13px" };
  if (kind === "done") return <span style={{ ...base, background: "var(--evergreen-50)", color: "var(--evergreen-600)", border: "1px solid rgba(31,122,92,0.35)" }}>✓</span>;
  if (kind === "run") return <span className="upt-spin" style={{ ...base, background: "var(--ochre-50)", color: "var(--ochre-600)", border: "2px solid var(--ochre-50)", borderTopColor: "var(--ochre-600)" }} />;
  if (kind === "fail") return <span style={{ ...base, background: "var(--brick-50)", color: "var(--brick-600)", border: "1px solid rgba(178,58,46,0.35)" }}>✕</span>;
  return <span style={{ ...base, background: "var(--surface-subtle)", color: "var(--grey-400)", border: "1px dashed var(--stone-400)" }}>{n}</span>;
}

function RTA_PrepareCity({ city, onContinue, onBack }) {
  const steps = window.RTA_PREP_STEPS;
  const prep = city.prep;
  const running = prep.state === "running";
  const failed = prep.state === "failed";
  const done = prep.state === "done";
  const cur = prep.current; // 1-indexed

  const kindFor = (i) => {
    const idx = i + 1;
    if (done) return "done";
    if (failed) { if (idx < cur) return "done"; if (idx === cur) return "fail"; return "wait"; }
    if (running) { if (idx < cur) return "done"; if (idx === cur) return "run"; return "wait"; }
    return "wait";
  };

  return (
    <div>
      <button onClick={onBack} style={{ display: "inline-flex", alignItems: "center", gap: "6px", border: "none", background: "none", cursor: "pointer", color: "var(--text-muted)", fontFamily: "var(--font-sans)", fontSize: "13px", fontWeight: 600, padding: 0, marginBottom: "14px" }}>
        <span style={{ transform: "rotate(180deg)", display: "inline-flex" }}><S2Icon name="arrow-right" size={15} /></span> Back to cities
      </button>

      <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap", marginBottom: "5px" }}>
        <h1 style={{ margin: 0, fontFamily: "var(--font-serif)", fontSize: "30px", fontWeight: 600, letterSpacing: "-0.02em", color: "var(--text-strong)" }}>
          {failed ? "Preparation failed" : done ? "City prepared" : "Preparing " + city.name}
        </h1>
        <div style={{ marginLeft: "auto" }}>
          {running && <S2Badge tone="caution" pill>◐ Step {cur} of {steps.length}</S2Badge>}
          {failed && <S2Badge tone="negative" pill>✕ Failed at step {cur}</S2Badge>}
          {done && <S2Badge tone="verified" pill>✓ Ready for preview</S2Badge>}
        </div>
      </div>
      <p style={{ margin: "0 0 18px", fontSize: "14px", color: "var(--text-muted)" }}>
        {city.name} · <span style={{ fontFamily: "var(--font-mono)" }}>sandbox rev {city.rev || "—"} (draft)</span> · production Discover is never touched
      </p>

      {running && (
        <div style={{ marginBottom: "18px" }}>
          <div style={{ height: "9px", borderRadius: "999px", background: "var(--stone-300)", overflow: "hidden" }}>
            <div style={{ width: city.geoPct + "%", height: "100%", background: "var(--ochre-600)", borderRadius: "999px" }} />
          </div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: "11.5px", color: "var(--text-muted)", marginTop: "6px" }}>~{city.geoPct}% · est. 2 min remaining</div>
        </div>
      )}

      <S2Card padding="none">
        {steps.map((s, i) => {
          const kind = kindFor(i);
          const isCur = (running && i + 1 === cur) || (failed && i + 1 === cur);
          return (
            <div key={s.key} style={{
              display: "flex", alignItems: "center", gap: "14px", padding: "15px 18px",
              borderTop: i === 0 ? "none" : "1px solid var(--border)",
              background: isCur ? (failed ? "var(--brick-50)" : "var(--ochre-50)") : "transparent",
              boxShadow: isCur ? `inset 3px 0 0 ${failed ? "var(--brick-600)" : "var(--ochre-600)"}` : "none",
            }}>
              <StepMarker kind={kind} n={i + 1} />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: "14.5px", color: kind === "wait" ? "var(--text-muted)" : "var(--text-strong)" }}>{s.name}</div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: "11.5px", color: kind === "fail" ? "var(--brick-600)" : "var(--text-muted)", marginTop: "1px" }}>
                  {kind === "fail" ? "ERR: " + prep.error : kind === "wait" ? (running || failed ? "waiting / blocked" : "—") : s.meta}
                </div>
              </div>
              <div style={{ marginLeft: "auto", fontFamily: "var(--font-mono)", fontSize: "11.5px", color: "var(--text-muted)", textAlign: "right", whiteSpace: "nowrap" }}>
                {kind === "done" && <>{_TIMES[i]} → {_TIMES[Math.min(i + 1, 5)]}</>}
                {kind === "run" && "running…"}
                {kind === "fail" && <span style={{ color: "var(--brick-600)" }}>{_TIMES[i]} · failed</span>}
                {kind === "wait" && "—"}
              </div>
            </div>
          );
        })}
      </S2Card>

      {failed && (
        <div style={{ marginTop: "14px", background: "var(--brick-50)", border: "1px solid rgba(178,58,46,0.25)", borderRadius: "var(--radius-md)", padding: "13px 16px" }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: "11px", fontWeight: 700, color: "var(--brick-600)", marginBottom: "5px" }}>STEP {cur} LOG</div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: "12px", color: "var(--text-body)", lineHeight: 1.5 }}>
            unassigned_areas=[kalasa, mudigere_out, N_ridge]<br />hint: widen region seeds or mark as rural
          </div>
        </div>
      )}

      <div style={{ display: "flex", gap: "10px", marginTop: "18px", flexWrap: "wrap" }}>
        {failed && <S2Button variant="accent" size="md"><S2Icon name="arrow-right" size={16} /> Retry from step {cur}</S2Button>}
        {(running || failed) && <S2Button variant="outline" size="md">View full log</S2Button>}
        {done && <S2Button variant="accent" size="md" onClick={onContinue}>Continue to preview <S2Icon name="arrow-right" size={16} /></S2Button>}
        {running && <span style={{ marginLeft: "auto", alignSelf: "center", fontFamily: "var(--font-mono)", fontSize: "12px", color: "var(--text-muted)" }}>auto-advances to preview when ready</span>}
      </div>
    </div>
  );
}

window.RTA_PrepareCity = RTA_PrepareCity;
