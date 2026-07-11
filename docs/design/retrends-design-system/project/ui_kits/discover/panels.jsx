// ReTrends Discover — full screens (map left / results right).
// Exports RTResidentialScreen, RTAgriScreen.
const { Icon: Ic, Input: Inp, Select: Sel } = window.ReTrendsDesignSystem_f37966;
const { Segmented, Chip, IconBtn } = window.RT_Discover_UI;

function panelShell(children) {
  return (
    <div style={{ flex: "1 1 50%", minWidth: "440px", maxWidth: "940px", height: "100%", display: "flex", flexDirection: "column", background: "var(--paper)", borderLeft: "1px solid var(--border)" }}>
      {children}
    </div>
  );
}

function ControlsCluster({ areaLabel, onReset }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", justifyContent: "flex-end" }}>
      <span style={{ display: "inline-flex", alignItems: "center", gap: "7px", padding: "6px 12px", borderRadius: "var(--radius-full)", background: "var(--surface-subtle)", border: "1px solid var(--border)", fontSize: "13px", fontWeight: 600, color: "var(--text-strong)" }}>
        <Ic name="map-pin" size={14} color="var(--accent)" />{areaLabel}
        <Ic name="x" size={13} color="var(--text-muted)" />
      </span>
      <IconBtn icon="trending-up" label="Trends" />
      <IconBtn icon="sliders-horizontal" />
      <button onClick={onReset} style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "7px 12px", borderRadius: "var(--radius-md)", cursor: "pointer", border: "1px solid var(--border)", background: "var(--paper)", color: "var(--text-body)", fontFamily: "var(--font-sans)", fontSize: "13px", fontWeight: 600 }}>
        Start over <Ic name="x" size={13} color="var(--text-muted)" />
      </button>
    </div>
  );
}

function ResultsGrid({ children }) {
  return <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: "16px", alignItems: "start" }}>{children}</div>;
}

function CountLine({ shown, total, suffix }) {
  return (
    <p style={{ margin: "0 0 14px", fontSize: "14px", fontWeight: 600, color: "var(--text-body)" }}>
      Showing <span style={{ fontFamily: "var(--font-mono)", color: "var(--text-strong)" }}>1–{shown}</span> of <span style={{ fontFamily: "var(--font-mono)", color: "var(--text-strong)" }}>{total}</span> {suffix}
    </p>
  );
}

function LoadMore({ shown, total, onMore }) {
  if (shown >= total) return null;
  return (
    <div style={{ display: "flex", justifyContent: "center", marginTop: "22px" }}>
      <button onClick={onMore} style={{ display: "inline-flex", alignItems: "center", gap: "8px", padding: "11px 24px", borderRadius: "var(--radius-full)", cursor: "pointer", border: "1px solid var(--border-strong)", background: "var(--paper)", color: "var(--navy-800)", fontFamily: "var(--font-sans)", fontSize: "14px", fontWeight: 600 }}>
        Load more properties <Ic name="chevron-down" size={16} color="var(--text-muted)" />
      </button>
    </div>
  );
}

/* ============ Residential (area + school) ============ */
function RTResidentialScreen({ journey }) {
  const D = window.RT_DISCOVER.residential;
  const isSchool = journey === "school";
  const PAGE = D.pageSize || 6;
  const all = D.listings;
  const [visibleCount, setVisibleCount] = React.useState(PAGE);
  const [selectedId, setSelectedId] = React.useState(all[0].id);
  const [look, setLook] = React.useState("Buy");
  const [types, setTypes] = React.useState([]);
  const [beds, setBeds] = React.useState([]);
  const scrollRef = React.useRef(null);
  const cardRefs = React.useRef({});
  const visible = all.slice(0, visibleCount);

  const toggle = (arr, set, v) => set(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
  const select = (id) => {
    setSelectedId(id);
    const el = cardRefs.current[id];
    if (el && scrollRef.current) scrollRef.current.scrollTo({ top: el.offsetTop - 12, behavior: "smooth" });
  };
  const ctx = isSchool ? `near ${D.school.name}` : `near ${D.area}`;

  return (
    <div style={{ display: "flex", height: "100%" }}>
      <div style={{ flex: "1 1 50%", minWidth: 0, position: "relative" }}>
        <window.RTMapPanel listings={visible} selectedId={selectedId} onSelect={select} showSearchArea
          center={D.center} zoom={D.zoom} locality={D.locality} school={D.school} mode={journey} />
      </div>
      {panelShell(<>
        {/* fixed control header */}
        <div style={{ padding: "18px 22px 16px", borderBottom: "1px solid var(--border)", flex: "0 0 auto" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", marginBottom: "16px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-muted)" }}>Looking to</span>
              <Segmented value={look} onChange={setLook} options={["Buy", "Rent"]} />
            </div>
            <div style={{ minWidth: "150px" }}><Sel size="sm" options={window.RT_DISCOVER.cities} /></div>
          </div>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "14px", flexWrap: "wrap" }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                {isSchool && <Ic name="route" size={20} color="var(--navy-800)" />}
                <h2 style={{ margin: 0, fontFamily: "var(--font-serif)", fontSize: "24px", fontWeight: 600, letterSpacing: "-0.02em", color: "var(--text-strong)" }}>
                  {isSchool ? D.school.name : D.area}
                </h2>
                <span style={{ padding: "3px 10px", borderRadius: "var(--radius-full)", background: "var(--accent-tint)", color: "var(--copper-600)", fontSize: "12px", fontWeight: 700 }}>
                  {isSchool ? "By school" : "By area"}
                </span>
              </div>
              {isSchool && <p style={{ margin: "5px 0 0", fontSize: "13px", color: "var(--text-muted)" }}>{D.school.catchment} · {window.RT_DISCOVER.city}</p>}
            </div>
            <ControlsCluster areaLabel={D.area} onReset={() => { setTypes([]); setBeds([]); setVisibleCount(PAGE); setSelectedId(all[0].id); }} />
          </div>
        </div>

        {/* scrollable results */}
        <div ref={scrollRef} style={{ position: "relative", flex: "1 1 0", overflowY: "auto", padding: "18px 22px 28px" }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "9px", marginBottom: "10px" }}>
            {D.typeChips.map((t) => <Chip key={t} label={t} active={types.includes(t)} onClick={() => toggle(types, setTypes, t)} />)}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "9px", marginBottom: "16px" }}>
            {D.bedChips.map((b) => <Chip key={b} label={b} active={beds.includes(b)} onClick={() => toggle(beds, setBeds, b)} />)}
          </div>

          {isSchool ? (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px", padding: "12px 14px", marginBottom: "16px", borderRadius: "var(--radius-md)", background: "var(--navy-100)", border: "1px solid var(--border)" }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: "9px", fontSize: "13px", fontWeight: 600, color: "var(--navy-800)" }}>
                <Ic name="route" size={16} color="var(--navy-800)" />{D.school.name}
              </span>
              <Ic name="x" size={15} color="var(--text-muted)" />
            </div>
          ) : (
            <button style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", padding: "12px", marginBottom: "16px", borderRadius: "var(--radius-md)", cursor: "pointer", border: "1px dashed var(--border-strong)", background: "var(--surface-subtle)", color: "var(--text-body)", fontFamily: "var(--font-sans)", fontSize: "13px", fontWeight: 600 }}>
              <Ic name="plus" size={15} color="var(--text-muted)" />Add a school in this area
            </button>
          )}

          <div style={{ marginBottom: "16px" }}><Inp placeholder="Search listings by keyword" leadingIcon={<Ic name="search" size={16} />} /></div>

          <CountLine shown={visible.length} total={all.length} suffix={`properties for sale ${ctx}`} />

          <ResultsGrid>
            {visible.map((p) => (
              <window.RTStackCard key={p.id} ref={(el) => (cardRefs.current[p.id] = el)} p={p} selected={p.id === selectedId} onSelect={select} />
            ))}
          </ResultsGrid>
          <LoadMore shown={visible.length} total={all.length} onMore={() => setVisibleCount((c) => Math.min(c + PAGE, all.length))} />
        </div>
      </>)}
    </div>
  );
}

/* ============ Agricultural ============ */
function RTAgriScreen() {
  const D = window.RT_DISCOVER.agri;
  const PAGE = D.pageSize || 6;
  const all = D.listings;
  const [visibleCount, setVisibleCount] = React.useState(PAGE);
  const [selectedId, setSelectedId] = React.useState(all[0].id);
  const [look, setLook] = React.useState("Buy");
  const [types, setTypes] = React.useState([]);
  const scrollRef = React.useRef(null);
  const cardRefs = React.useRef({});
  const visible = all.slice(0, visibleCount);

  const toggle = (v) => setTypes(types.includes(v) ? types.filter((x) => x !== v) : [...types, v]);
  const select = (id) => {
    setSelectedId(id);
    const el = cardRefs.current[id];
    if (el && scrollRef.current) scrollRef.current.scrollTo({ top: el.offsetTop - 12, behavior: "smooth" });
  };

  return (
    <div style={{ display: "flex", height: "100%" }}>
      <div style={{ flex: "1 1 50%", minWidth: 0, position: "relative" }}>
        <window.RTMapPanel listings={visible} selectedId={selectedId} onSelect={select} showSearchArea
          center={D.center} zoom={D.zoom} locality={D.locality} mode="area" />
      </div>
      {panelShell(<>
        <div style={{ padding: "18px 22px 16px", borderBottom: "1px solid var(--border)", flex: "0 0 auto" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", marginBottom: "16px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-muted)" }}>Looking to</span>
              <Segmented value={look} onChange={setLook} options={["Buy", "Rent"]} />
            </div>
            <div style={{ minWidth: "150px" }}><Sel size="sm" options={window.RT_DISCOVER.cities} /></div>
          </div>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "14px", flexWrap: "wrap" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <h2 style={{ margin: 0, fontFamily: "var(--font-serif)", fontSize: "24px", fontWeight: 600, letterSpacing: "-0.02em", color: "var(--text-strong)" }}>{D.area}</h2>
              <span style={{ padding: "3px 10px", borderRadius: "var(--radius-full)", background: "var(--accent-tint)", color: "var(--copper-600)", fontSize: "12px", fontWeight: 700 }}>Agricultural</span>
            </div>
            <ControlsCluster areaLabel={D.area} onReset={() => { setTypes([]); setVisibleCount(PAGE); setSelectedId(all[0].id); }} />
          </div>
        </div>

        <div ref={scrollRef} style={{ position: "relative", flex: "1 1 0", overflowY: "auto", padding: "18px 22px 28px" }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "9px", marginBottom: "16px" }}>
            {D.typeChips.map((t) => <Chip key={t} label={t} active={types.includes(t)} onClick={() => toggle(t)} />)}
          </div>
          <div style={{ marginBottom: "16px" }}><Inp placeholder="Search listings by keyword" leadingIcon={<Ic name="search" size={16} />} /></div>

          <CountLine shown={visible.length} total={all.length} suffix={`agricultural properties for sale near ${D.area}`} />

          <ResultsGrid>
            {visible.map((p) => (
              <window.RTAgriCard key={p.id} ref={(el) => (cardRefs.current[p.id] = el)} p={p} selected={p.id === selectedId} onSelect={select} />
            ))}
          </ResultsGrid>
          <LoadMore shown={visible.length} total={all.length} onMore={() => setVisibleCount((c) => Math.min(c + PAGE, all.length))} />
        </div>
      </>)}
    </div>
  );
}

window.RTResidentialScreen = RTResidentialScreen;
window.RTAgriScreen = RTAgriScreen;
