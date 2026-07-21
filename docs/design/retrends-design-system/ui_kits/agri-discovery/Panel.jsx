// Udupi agri-discovery — right result panel. Exports window.AgriPanel
// Guided "grouped agricultural region result" state, not a raw table.
const { Icon: PIcon, Button: PButton } = window.ReTrendsDesignSystem_f37966;

const SPROUT_SVG = (c, s) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flex: "none" }}>
    <path d="M7 20h10" /><path d="M10 20c5.5-2.5.8-6.4 3-10" />
    <path d="M9.5 9.4c1.1.8 1.8 2.2 2.3 3.7-2 .4-3.5.4-4.8-.3-1.2-.6-2.3-1.9-3-4.2 2.8-.5 4.4 0 5.5.8z" />
    <path d="M14.1 6a7 7 0 0 0-1.1 4c1.9-.1 3.3-.6 4.3-1.4 1-1 1.6-2.3 1.7-4.6-2.7.1-4 1-4.9 2z" />
  </svg>
);

const AGRI_MID = "#1F7A5C", AGRI_DEEP = "#1C5B43", AGRI_TINT = "#EAF3EF", AGRI_LINE = "#CFE5D8";

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

function IconButton({ name, onClick, title }) {
  return (
    <button onClick={onClick} title={title} style={{
      width: "32px", height: "32px", display: "inline-flex", alignItems: "center", justifyContent: "center",
      border: "1px solid var(--border)", background: "var(--paper)", borderRadius: "var(--radius-md)",
      cursor: "pointer", color: "var(--text-muted)", transition: "all .12s var(--ease-standard)",
    }}
      onMouseEnter={(e) => { e.currentTarget.style.background = "var(--surface-subtle)"; e.currentTarget.style.color = "var(--text-strong)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = "var(--paper)"; e.currentTarget.style.color = "var(--text-muted)"; }}
    >
      <PIcon name={name} size={16} />
    </button>
  );
}

function GroupCard({ group, selected, onSelect }) {
  const [hover, setHover] = React.useState(false);
  const lift = hover || selected;
  return (
    <button
      onClick={() => onSelect(group.id)}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        position: "relative", width: "100%", textAlign: "left", cursor: "pointer",
        display: "flex", alignItems: "center", gap: "18px", padding: "20px 22px",
        background: selected ? AGRI_TINT : "var(--paper)",
        border: `1px solid ${selected ? AGRI_LINE : "var(--border)"}`,
        borderRadius: "var(--radius-lg)", overflow: "hidden",
        boxShadow: lift ? "var(--shadow-md)" : "var(--shadow-sm)",
        transform: lift ? "translateY(-2px)" : "translateY(0)",
        transition: "all .2s var(--ease-standard)", fontFamily: "var(--font-sans)",
      }}>
      {/* selection accent rail */}
      <span style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: "4px", background: selected ? AGRI_MID : "transparent" }} />

      <div style={{
        width: "46px", height: "46px", flex: "none", borderRadius: "var(--radius-md)",
        background: selected ? "#fff" : AGRI_TINT, border: `1px solid ${AGRI_LINE}`,
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>{SPROUT_SVG(AGRI_DEEP, 22)}</div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: "17px", fontWeight: 700, letterSpacing: "-0.01em", color: "var(--text-strong)", marginBottom: "8px" }}>{group.name}</div>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
          <span style={{ display: "inline-flex", alignItems: "baseline", gap: "5px", padding: "3px 10px", background: "var(--surface-subtle)", borderRadius: "var(--radius-full)" }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: "13px", fontWeight: 700, color: "var(--text-strong)" }}>{group.acres.toFixed(2)}</span>
            <span style={{ fontSize: "11.5px", color: "var(--text-muted)" }}>acres total</span>
          </span>
          <span style={{ display: "inline-flex", alignItems: "baseline", gap: "5px", padding: "3px 10px", background: "#fff", border: `1px solid ${AGRI_LINE}`, borderRadius: "var(--radius-full)" }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: "13px", fontWeight: 700, color: AGRI_DEEP }}>{group.properties}</span>
            <span style={{ fontSize: "11.5px", color: AGRI_MID }}>agri properties</span>
          </span>
        </div>
      </div>

      <span style={{
        width: "30px", height: "30px", flex: "none", borderRadius: "var(--radius-full)",
        display: "flex", alignItems: "center", justifyContent: "center",
        background: selected ? AGRI_MID : "var(--surface-subtle)",
        transition: "all .2s var(--ease-standard)",
      }}>
        <PIcon name="chevron-right" size={17} color={selected ? "#fff" : "var(--grey-500)"} />
      </span>
    </button>
  );
}

function AgriPanel({ mode, setMode, selectedGroup, setSelectedGroup }) {
  const D = window.AGRI_DATA, T = window.AGRI_TOTALS;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "var(--background)" }}>
      {/* ---- Sticky header ---- */}
      <div style={{ flex: "none", background: "var(--paper)", borderBottom: "1px solid var(--border)", padding: "16px 32px 18px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
          <BuyRentToggle mode={mode} setMode={setMode} />
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <button style={{
              display: "inline-flex", alignItems: "center", gap: "6px", padding: "7px 13px", border: "1px solid var(--border)",
              background: "var(--paper)", borderRadius: "var(--radius-md)", cursor: "pointer",
              fontFamily: "var(--font-sans)", fontSize: "13px", fontWeight: 600, color: "var(--text-muted)",
            }}>
              <PIcon name="route" size={15} color="var(--grey-500)" />Start over
            </button>
            <IconButton name="x" title="Close" />
          </div>
        </div>

        {/* Journey identity */}
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <div style={{
            width: "40px", height: "40px", flex: "none", borderRadius: "var(--radius-md)",
            background: AGRI_TINT, border: `1px solid ${AGRI_LINE}`, display: "flex", alignItems: "center", justifyContent: "center",
          }}>{SPROUT_SVG(AGRI_DEEP, 21)}</div>
          <div>
            <div style={{ fontSize: "10.5px", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-muted)", marginBottom: "2px" }}>You're browsing</div>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <h1 style={{ margin: 0, fontFamily: "var(--font-serif)", fontSize: "23px", fontWeight: 600, letterSpacing: "-0.02em", color: "var(--text-strong)" }}>Agricultural land</h1>
              <span style={{ padding: "3px 10px", borderRadius: "var(--radius-full)", background: AGRI_TINT, color: AGRI_DEEP, border: `1px solid ${AGRI_LINE}`, fontSize: "11.5px", fontWeight: 700 }}>Land journey</span>
            </div>
          </div>
        </div>
      </div>

      {/* ---- Scrolling body ---- */}
      <div className="agri-scroll" style={{ flex: 1, overflowY: "auto", padding: "26px 32px 40px" }}>
        <div style={{ maxWidth: "760px", display: "flex", flexDirection: "column", gap: "22px" }}>

          {/* Selected group summary + distance chips */}
          <section style={{ background: "var(--paper)", border: "1px solid var(--border)", borderRadius: "var(--radius-xl)", boxShadow: "var(--shadow-sm)", overflow: "hidden" }}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "16px", padding: "20px 22px 18px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "13px" }}>
                <div style={{ width: "42px", height: "42px", flex: "none", borderRadius: "var(--radius-full)", background: "linear-gradient(155deg,#2E9B74,#1C5B43)", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 6px 14px rgba(16,46,34,0.28)" }}>
                  {SPROUT_SVG("#fff", 21)}
                </div>
                <div>
                  <div style={{ fontSize: "18px", fontWeight: 700, letterSpacing: "-0.01em", color: "var(--text-strong)" }}>E towards Manipal</div>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "3px", fontSize: "13px", color: "var(--text-muted)" }}>
                    <span style={{ fontFamily: "var(--font-mono)", fontWeight: 600, color: "var(--text-body)" }}>Up to 100 km</span>
                    <span style={{ width: "3px", height: "3px", borderRadius: "999px", background: "var(--grey-400)" }} />
                    <span>Direction E</span>
                  </div>
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <button style={{
                  display: "inline-flex", alignItems: "center", gap: "7px", padding: "8px 14px", border: "1px solid var(--border)",
                  background: "var(--paper)", borderRadius: "var(--radius-md)", cursor: "pointer",
                  fontFamily: "var(--font-sans)", fontSize: "13px", fontWeight: 600, color: "var(--text-strong)",
                }}>
                  <PIcon name="sliders-horizontal" size={15} color="var(--navy-800)" />Filters
                </button>
                <IconButton name="x" title="Clear selection" />
              </div>
            </div>

            {/* Distance chips */}
            <div style={{ padding: "0 22px 18px" }}>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "9px" }}>
                {D.distances.map((d) => {
                  const on = d.id === D.activeDistance;
                  return (
                    <span key={d.id} style={{
                      display: "inline-flex", alignItems: "center", gap: "7px", padding: "9px 16px", borderRadius: "var(--radius-full)",
                      cursor: "pointer", fontFamily: "var(--font-sans)", fontSize: "13px", fontWeight: 600,
                      background: on ? AGRI_MID : "var(--paper)",
                      color: on ? "#fff" : "var(--text-body)",
                      border: on ? "1px solid transparent" : "1px solid var(--border-strong)",
                      boxShadow: on ? "0 4px 12px rgba(16,46,34,0.22)" : "none",
                    }}>
                      {on && <PIcon name="check" size={14} color="#fff" />}
                      {d.label}
                    </span>
                  );
                })}
              </div>
              <p style={{ margin: "12px 2px 0", fontSize: "12.5px", color: "var(--text-muted)" }}>Includes properties at closer distances too.</p>
            </div>
          </section>

          {/* Results summary — prominent but calm */}
          <section style={{
            display: "flex", alignItems: "center", justifyContent: "space-between", gap: "20px",
            background: AGRI_TINT, border: `1px solid ${AGRI_LINE}`, borderRadius: "var(--radius-xl)", padding: "20px 24px",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: "18px" }}>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: "46px", fontWeight: 800, lineHeight: 1, letterSpacing: "-0.03em", color: AGRI_DEEP }}>{T.properties}</div>
              <div>
                <div style={{ fontSize: "16px", fontWeight: 700, color: "var(--text-strong)", letterSpacing: "-0.01em" }}>Agri properties for sale</div>
                <div style={{ fontSize: "13px", color: "var(--text-body)", marginTop: "2px" }}>in this region · grouped into {T.groups} areas</div>
              </div>
            </div>
            <div style={{ display: "flex", gap: "10px" }}>
              <div style={{ textAlign: "right", paddingLeft: "16px", borderLeft: `1px solid ${AGRI_LINE}` }}>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: "18px", fontWeight: 700, color: "var(--text-strong)" }}>{T.acres.toFixed(2)}</div>
                <div style={{ fontSize: "11.5px", color: "var(--text-muted)" }}>acres total</div>
              </div>
            </div>
          </section>

          {/* Groups */}
          <section style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 2px" }}>
              <span style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-muted)" }}>Grouped by area</span>
              <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>Select a group to locate it on the map</span>
            </div>
            {D.groups.map((g) => (
              <GroupCard key={g.id} group={g} selected={selectedGroup === g.id} onSelect={(id) => setSelectedGroup(selectedGroup === id ? null : id)} />
            ))}
          </section>

          {/* Calm guidance footer — fills whitespace without inventing data */}
          <div style={{ display: "flex", alignItems: "center", gap: "11px", padding: "14px 18px", background: "var(--surface-subtle)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)" }}>
            <PIcon name="map-pin" size={17} color={AGRI_MID} />
            <p style={{ margin: 0, fontSize: "13px", color: "var(--text-body)", lineHeight: 1.5 }}>
              These {T.properties} agricultural properties are clustered around <strong style={{ color: "var(--text-strong)" }}>Agumbe</strong> and <strong style={{ color: "var(--text-strong)" }}>Manipal</strong>. Adjust the distance or open <strong style={{ color: "var(--text-strong)" }}>Filters</strong> to refine the region.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

window.AgriPanel = AgriPanel;
