// Udupi agri-discovery — CORRIDOR-SELECTION right panel. Exports window.CorridorPanel
// The guided "choose your agricultural corridor" landing step, not a raw list.
// Hierarchy: journey identity → instruction → four directional corridor cards.
const { Icon: CPIcon } = window.ReTrendsDesignSystem_f37966;

const AGRI_MID = "#1F7A5C", AGRI_DEEP = "#1C5B43", AGRI_BRIGHT = "#2E9B74", AGRI_TINT = "#EAF3EF", AGRI_LINE = "#CFE5D8";

const SPROUT = (c, s) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flex: "none" }}>
    <path d="M7 20h10" /><path d="M10 20c5.5-2.5.8-6.4 3-10" />
    <path d="M9.5 9.4c1.1.8 1.8 2.2 2.3 3.7-2 .4-3.5.4-4.8-.3-1.2-.6-2.3-1.9-3-4.2 2.8-.5 4.4 0 5.5.8z" />
    <path d="M14.1 6a7 7 0 0 0-1.1 4c1.9-.1 3.3-.6 4.3-1.4 1-1 1.6-2.3 1.7-4.6-2.7.1-4 1-4.9 2z" />
  </svg>
);

// Faint field-furrow texture — a subtle agricultural land cue, barely-there.
const FURROW = "repeating-linear-gradient(0deg, transparent 0, transparent 10px, rgba(28,91,67,0.035) 10px, rgba(28,91,67,0.035) 11px)";

function BuyRentToggle({ mode, setMode }) {
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: "10px" }}>
      <span style={{ fontSize: "12.5px", fontWeight: 600, color: "var(--text-muted)" }}>Looking to</span>
      <div style={{ display: "inline-flex", padding: "3px", background: "var(--input-bg)", borderRadius: "var(--radius-full)", border: "1px solid var(--border)" }}>
        {["Buy", "Rent"].map((m) => {
          const on = mode === m;
          return (
            <button key={m} onClick={() => setMode(m)} style={{
              padding: "6px 18px", border: "none", cursor: "pointer", borderRadius: "var(--radius-full)",
              fontFamily: "var(--font-sans)", fontSize: "13px", fontWeight: 600,
              background: on ? "var(--navy-800)" : "transparent", color: on ? "#fff" : "var(--text-muted)",
              boxShadow: on ? "var(--shadow-sm)" : "none", transition: "all .12s var(--ease-standard)",
            }}>{m}</button>
          );
        })}
      </div>
    </div>
  );
}

function IconButton({ name, title }) {
  return (
    <button title={title} style={{
      width: "32px", height: "32px", display: "inline-flex", alignItems: "center", justifyContent: "center",
      border: "1px solid var(--border)", background: "var(--paper)", borderRadius: "var(--radius-md)",
      cursor: "pointer", color: "var(--text-muted)", transition: "all .12s var(--ease-standard)",
    }}
      onMouseEnter={(e) => { e.currentTarget.style.background = "var(--surface-subtle)"; e.currentTarget.style.color = "var(--text-strong)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = "var(--paper)"; e.currentTarget.style.color = "var(--text-muted)"; }}
    >
      <CPIcon name={name} size={16} />
    </button>
  );
}

// Directional compass badge — cardinal letter + a small pointer at the matching edge.
function DirBadge({ dir, active }) {
  const tri = { N: { top: "5px", left: "50%", transform: "translateX(-50%)", border: "0 5px 6px 5px" },
                S: { bottom: "5px", left: "50%", transform: "translateX(-50%)", border: "6px 5px 0 5px" },
                E: { right: "5px", top: "50%", transform: "translateY(-50%)", border: "5px 0 5px 6px" },
                W: { left: "5px", top: "50%", transform: "translateY(-50%)", border: "5px 6px 5px 0" } }[dir];
  const triColor = active ? "rgba(255,255,255,0.85)" : AGRI_MID;
  const triStyle = {
    position: "absolute", width: 0, height: 0, borderStyle: "solid", borderWidth: tri.border,
    borderColor: dir === "N" ? `transparent transparent ${triColor} transparent`
      : dir === "S" ? `${triColor} transparent transparent transparent`
      : dir === "E" ? `transparent transparent transparent ${triColor}`
      : `transparent ${triColor} transparent transparent`,
    top: tri.top, bottom: tri.bottom, left: tri.left, right: tri.right, transform: tri.transform,
  };
  return (
    <div style={{
      position: "relative", width: "58px", height: "58px", flex: "none", borderRadius: "var(--radius-lg)",
      display: "flex", alignItems: "center", justifyContent: "center",
      background: active ? `linear-gradient(155deg,${AGRI_BRIGHT},${AGRI_DEEP})` : AGRI_TINT,
      border: `1px solid ${active ? "transparent" : AGRI_LINE}`,
      boxShadow: active ? "0 8px 18px rgba(16,46,34,0.28)" : "none",
      transition: "all .2s var(--ease-standard)",
    }}>
      <span style={triStyle} />
      <span style={{
        fontFamily: "var(--font-mono)", fontSize: "24px", fontWeight: 800, letterSpacing: "-0.02em",
        color: active ? "#fff" : AGRI_DEEP,
      }}>{dir}</span>
    </div>
  );
}

function CorridorCard({ c, selected, hovered, onSelect, onHover }) {
  const active = selected || hovered;
  return (
    <div
      onClick={() => onSelect(c.id)}
      onMouseEnter={() => onHover(c.id)}
      onMouseLeave={() => onHover(null)}
      style={{
        position: "relative", width: "100%", textAlign: "left", cursor: "pointer",
        background: selected ? AGRI_TINT : "var(--paper)",
        backgroundImage: selected ? FURROW : (hovered ? FURROW : "none"),
        border: `1px solid ${selected ? AGRI_LINE : "var(--border)"}`,
        borderRadius: "var(--radius-xl)", overflow: "hidden",
        boxShadow: active ? "var(--shadow-md)" : "var(--shadow-sm)",
        transform: active ? "translateY(-2px)" : "translateY(0)",
        transition: "all .2s var(--ease-standard)", fontFamily: "var(--font-sans)",
      }}>
      {/* selection accent rail */}
      <span style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: "4px", background: selected ? AGRI_MID : "transparent", transition: "background .2s var(--ease-standard)" }} />

      <div style={{ display: "flex", alignItems: "center", gap: "18px", padding: "20px 22px" }}>
        <DirBadge dir={c.dir} active={active} />

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "9px", marginBottom: "9px" }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: "10.5px", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: active ? AGRI_DEEP : "var(--text-muted)" }}>{c.bearing}</span>
          </div>
          <div style={{ fontSize: "18px", fontWeight: 700, letterSpacing: "-0.01em", color: "var(--text-strong)", marginBottom: "9px" }}>{c.name}</div>
          <span style={{ display: "inline-flex", alignItems: "center", gap: "7px", padding: "4px 11px", borderRadius: "var(--radius-full)", background: active ? "#fff" : "var(--surface-subtle)", border: `1px solid ${active ? AGRI_LINE : "transparent"}`, whiteSpace: "nowrap" }}>
            <CPIcon name="route" size={13} color={AGRI_MID} />
            <span style={{ fontFamily: "var(--font-mono)", fontSize: "12.5px", fontWeight: 700, color: "var(--text-strong)" }}>Up to {c.maxKm} km</span>
            <span style={{ fontSize: "11.5px", color: "var(--text-muted)" }}>radius</span>
          </span>
        </div>

        <span style={{
          width: "34px", height: "34px", flex: "none", borderRadius: "var(--radius-full)",
          display: "flex", alignItems: "center", justifyContent: "center",
          background: active ? AGRI_MID : "var(--surface-subtle)",
          boxShadow: active ? "0 4px 12px rgba(16,46,34,0.22)" : "none",
          transition: "all .2s var(--ease-standard)",
        }}>
          <CPIcon name="chevron-right" size={18} color={active ? "#fff" : "var(--grey-500)"} />
        </span>
      </div>

      {/* Selection-ready CTA — appears when a corridor is picked; the next action is to explore it */}
      {selected && (
        <div style={{ padding: "0 22px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "14px" }}>
          <span style={{ fontSize: "12.5px", color: "var(--text-body)" }}>Ready to explore agricultural land along this corridor.</span>
          <button style={{
            display: "inline-flex", alignItems: "center", gap: "8px", padding: "10px 18px", border: "none", cursor: "pointer",
            borderRadius: "var(--radius-md)", background: `linear-gradient(155deg,${AGRI_BRIGHT},${AGRI_DEEP})`, color: "#fff",
            fontFamily: "var(--font-sans)", fontSize: "13.5px", fontWeight: 700, boxShadow: "0 6px 16px rgba(16,46,34,0.28)",
            whiteSpace: "nowrap",
          }}>
            Explore this corridor
            <CPIcon name="arrow-right" size={16} color="#fff" />
          </button>
        </div>
      )}
    </div>
  );
}

function CorridorPanel({ mode, setMode, selected, setSelected, hovered, setHovered }) {
  const D = window.CORRIDOR_DATA;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "var(--background)" }}>
      {/* ---- Sticky header — journey identity ---- */}
      <div style={{ flex: "none", background: "var(--paper)", borderBottom: "1px solid var(--border)", padding: "16px 36px 20px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "18px" }}>
          <BuyRentToggle mode={mode} setMode={setMode} />
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <button style={{
              display: "inline-flex", alignItems: "center", gap: "6px", padding: "7px 13px", border: "1px solid var(--border)",
              background: "var(--paper)", borderRadius: "var(--radius-md)", cursor: "pointer",
              fontFamily: "var(--font-sans)", fontSize: "13px", fontWeight: 600, color: "var(--text-muted)",
            }}>
              <CPIcon name="route" size={15} color="var(--grey-500)" />Start over
            </button>
            <IconButton name="x" title="Close" />
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "13px" }}>
          <div style={{
            width: "44px", height: "44px", flex: "none", borderRadius: "var(--radius-md)",
            background: AGRI_TINT, border: `1px solid ${AGRI_LINE}`, display: "flex", alignItems: "center", justifyContent: "center",
          }}>{SPROUT(AGRI_DEEP, 23)}</div>
          <div>
            <div style={{ fontSize: "10.5px", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-muted)", marginBottom: "3px" }}>You're browsing</div>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <h1 style={{ margin: 0, fontFamily: "var(--font-serif)", fontSize: "25px", fontWeight: 600, letterSpacing: "-0.02em", color: "var(--text-strong)" }}>Agricultural land</h1>
              <span style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "4px 11px", borderRadius: "var(--radius-full)", background: AGRI_TINT, color: AGRI_DEEP, border: `1px solid ${AGRI_LINE}`, fontSize: "11.5px", fontWeight: 700 }}>
                {SPROUT(AGRI_DEEP, 13)}Agricultural land
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ---- Scrolling body — instruction + corridor choices ---- */}
      <div className="agri-scroll" style={{ flex: 1, overflowY: "auto", padding: "28px 36px 40px" }}>
        <div style={{ maxWidth: "720px", display: "flex", flexDirection: "column", gap: "20px" }}>

          {/* Instruction — promoted from a faint line to a clear guided step */}
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "10px" }}>
              <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: "22px", height: "22px", borderRadius: "var(--radius-full)", background: AGRI_MID, color: "#fff", fontFamily: "var(--font-mono)", fontSize: "12px", fontWeight: 800 }}>1</span>
              <span style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: AGRI_DEEP }}>Choose a direction</span>
            </div>
            <h2 style={{ margin: "0 0 6px", fontSize: "21px", fontWeight: 700, letterSpacing: "-0.01em", color: "var(--text-strong)" }}>Select a corridor to explore</h2>
            <p style={{ margin: 0, fontSize: "13.5px", lineHeight: 1.55, color: "var(--text-body)", maxWidth: "560px" }}>
              Each corridor searches agricultural land up to <strong style={{ color: "var(--text-strong)" }}>100 km</strong> from Udupi in one direction. Pick the one you want to explore — hover any option to see it on the map.
            </p>
          </div>

          {/* Four directional corridor cards */}
          <div style={{ display: "flex", flexDirection: "column", gap: "13px" }}>
            {D.corridors.map((c) => (
              <CorridorCard
                key={c.id}
                c={c}
                selected={selected === c.id}
                hovered={hovered === c.id}
                onSelect={(id) => setSelected(selected === id ? null : id)}
                onHover={setHovered}
              />
            ))}
          </div>

          {/* Calm guidance footer — orients without inventing data */}
          <div style={{ display: "flex", alignItems: "center", gap: "11px", padding: "14px 18px", background: "var(--surface-subtle)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)" }}>
            <CPIcon name="map-pin" size={17} color={AGRI_MID} />
            <p style={{ margin: 0, fontSize: "13px", color: "var(--text-body)", lineHeight: 1.5 }}>
              Udupi is the centre of your search. Choosing a corridor groups agricultural land along that direction on the map — you can switch corridors anytime.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

window.CorridorPanel = CorridorPanel;
