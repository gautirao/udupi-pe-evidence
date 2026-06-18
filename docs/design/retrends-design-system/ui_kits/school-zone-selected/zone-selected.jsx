// Udupi Property Tracker — School-first SELECTED ZONE state. Exports window.UPTZoneSelected
// States: 1) zone landing  2) area selected (homes)  3) area with no homes  4) zone-wide homes
const { Icon: AIcon, Badge: ABadge } = window.ReTrendsDesignSystem_f37966;
const C = window.UPTZCards;

function BuyRentToggle({ value, onChange }) {
  return (
    <div style={{ display: "inline-flex", background: "var(--input-bg)", borderRadius: "var(--radius-full)", padding: "3px", border: "1px solid var(--border)" }}>
      {["Buy", "Rent"].map((opt) => {
        const on = value === opt;
        return (
          <button key={opt} onClick={() => onChange(opt)} style={{
            border: "none", cursor: "pointer", padding: "6px 18px", borderRadius: "var(--radius-full)",
            fontFamily: "var(--font-sans)", fontSize: "13px", fontWeight: 600,
            background: on ? "var(--paper)" : "transparent", color: on ? "var(--text-strong)" : "var(--text-muted)",
            boxShadow: on ? "var(--shadow-sm)" : "none", transition: "all var(--dur-fast) var(--ease-standard)",
          }}>{opt}</button>
        );
      })}
    </div>
  );
}

function sortListings(list, sort) {
  const a = [...list];
  if (sort === "price-asc") a.sort((x, y) => x.price - y.price);
  else if (sort === "price-desc") a.sort((x, y) => y.price - x.price);
  else if (sort === "newest") a.sort((x, y) => x.postedDays - y.postedDays);
  return a;
}

function UPTZoneSelected() {
  const D = window.UPTZ_DATA;
  const [mode, setMode] = React.useState("Buy");
  const [view, setView] = React.useState("zone");        // zone | area | zone-all
  const [selectedArea, setSelectedArea] = React.useState(null);
  const [active, setActive] = React.useState(null);
  const [saved, setSaved] = React.useState(["l1"]);
  const [savedAreas, setSavedAreas] = React.useState([]);
  const [sort, setSort] = React.useState("recommended");

  const toggleSave = (id) => setSaved((s) => s.includes(id) ? s.filter((x) => x !== id) : [...s, id]);

  const goZone = () => { setView("zone"); setSelectedArea(null); setActive(null); };
  const openArea = (id) => { setSelectedArea(id); setView("area"); setActive(null); setSort("recommended"); };
  const goZoneAll = () => { setView("zone-all"); setSelectedArea(null); setActive(null); setSort("recommended"); };

  const areaObj = selectedArea && D.areas.find((a) => a.id === selectedArea);
  const otherArea = D.areas.find((a) => a.id !== selectedArea);
  const popularSchools = D.schools.filter((s) => s.area === "Manipal").slice(0, 4);

  // listings for the current view
  let listings = [];
  if (view === "area" && areaObj) listings = D.listings.filter((l) => l.area.toLowerCase() === areaObj.name.toLowerCase());
  else if (view === "zone-all") listings = D.listings;
  listings = sortListings(listings, sort);

  return (
    <div style={{ display: "flex", height: "calc(100vh - 60px)" }}>
      {/* ---- Map (left) ---- */}
      <div style={{ flex: "0 0 46%", position: "relative", borderRight: "1px solid var(--border)" }}>
        <window.UPTZMap
          view={view} selectedArea={selectedArea} activeListing={active}
          onPickArea={(id) => { const a = D.areas.find((x) => x.id === id); openArea(id); }}
        />
      </div>

      {/* ---- Panel (right) ---- */}
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", background: "var(--background)" }}>
        {/* Sticky journey header */}
        <div style={{ padding: "18px 28px 16px", borderBottom: "1px solid var(--border)", background: "var(--background)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", marginBottom: "13px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-muted)" }}>Looking to</span>
              <BuyRentToggle value={mode} onChange={setMode} />
            </div>
            <button onClick={goZone} style={{
              display: "inline-flex", alignItems: "center", gap: "6px", border: "none", background: "transparent",
              color: "var(--text-muted)", cursor: "pointer", fontFamily: "var(--font-sans)", fontSize: "13px", fontWeight: 600, padding: 0, whiteSpace: "nowrap",
            }}>Start over <AIcon name="x" size={15} /></button>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "nowrap" }}>
            <h1 style={{ margin: 0, fontFamily: "var(--font-serif)", fontSize: "23px", fontWeight: 600, letterSpacing: "-0.02em", color: "var(--text-strong)", whiteSpace: "nowrap" }}>
              Find homes near a school
            </h1>
            <span style={{
              display: "inline-flex", alignItems: "center", gap: "5px", padding: "3px 10px", borderRadius: "var(--radius-full)",
              background: C.JOURNEY.bg, color: C.JOURNEY.fg, fontSize: "11.5px", fontWeight: 700, whiteSpace: "nowrap", flex: "none",
            }}>School-first</span>
          </div>
        </div>

        {/* Scroll body */}
        <div className="upt-scroll" style={{ flex: 1, overflowY: "auto", padding: "22px 28px 40px" }}>
          {/* back link to all zones — always visible */}
          <button onClick={() => alert("Returns to the all-zones browse (out of scope for this state).")} style={{
            display: "inline-flex", alignItems: "center", gap: "6px", border: "none", background: "transparent",
            color: "var(--text-muted)", cursor: "pointer", fontFamily: "var(--font-sans)", fontSize: "13px",
            fontWeight: 600, padding: 0, marginBottom: "16px", whiteSpace: "nowrap",
          }}>
            <AIcon name="arrow-right" size={14} style={{ transform: "rotate(180deg)" }} />All school zones
          </button>

          {/* ================= STATE 1 — ZONE LANDING ================= */}
          {view === "zone" && (
            <>
              <C.ZoneSummaryCard zone={D.zone} mode={mode} onViewAll={goZoneAll} />

              <div style={{ marginTop: "28px" }}>
                <C.SectionLabel icon="map-pin" right={<span style={{ fontSize: "12.5px", color: "var(--text-muted)" }}>{D.areasCount || D.areas.length} areas</span>}>
                  Areas in this zone
                </C.SectionLabel>
                <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                  {D.areas.map((a) => (
                    <C.AreaCard key={a.id} area={a} mode={mode} onView={openArea} onExplore={openArea} onHover={() => {}} />
                  ))}
                </div>
              </div>

              <div style={{ marginTop: "30px" }}>
                <C.SectionLabel icon="users" color={C.JOURNEY.fg} right={<span style={{ fontSize: "12.5px", color: "var(--text-muted)" }}>Top {popularSchools.length}</span>}>
                  Popular schools in this zone
                </C.SectionLabel>
                <div style={{ display: "flex", flexDirection: "column", gap: "9px" }}>
                  {popularSchools.map((s) => <C.SchoolRow key={s.id} school={s} />)}
                </div>
              </div>

              {/* what to know */}
              <div style={{
                marginTop: "26px", background: "var(--surface-subtle)", border: "1px solid var(--border)",
                borderRadius: "var(--radius-lg)", padding: "16px 18px", display: "flex", gap: "13px",
              }}>
                <div style={{ flex: "none", width: "34px", height: "34px", borderRadius: "var(--radius-md)", background: "var(--paper)", border: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <AIcon name="trending-up" size={17} color="var(--copper-500)" />
                </div>
                <div>
                  <div style={{ fontSize: "13.5px", fontWeight: 700, color: "var(--text-strong)", marginBottom: "3px" }}>What to know</div>
                  <p style={{ margin: 0, fontSize: "13px", lineHeight: 1.55, color: "var(--text-body)", textWrap: "pretty" }}>
                    Student demand keeps Manipal rentals tight through the academic year. Buy near campus for yield; look to Katapadi for quieter, value-led family living as it develops.
                  </p>
                </div>
              </div>
            </>
          )}

          {/* ================= STATE 2 / 3 — AREA SELECTED ================= */}
          {view === "area" && areaObj && (
            listings.length > 0 ? (
              <>
                <C.ContextStrip
                  crumb="University Belt"
                  title={areaObj.name}
                  subtitle={areaObj.blurb}
                  backLabel="Back to University Belt"
                  onBack={goZone}
                  sort={sort}
                  onSort={(e) => setSort(e.target.value)}
                  stats={<>
                    <C.SchoolsPill count={areaObj.schools} />
                    <C.ListingsPill count={listings.length} />
                  </>}
                />
                <C.ListingGrid listings={listings} onHover={setActive} onOpen={() => {}} saved={saved} onToggleSave={toggleSave} />
              </>
            ) : (
              <>
                <C.ContextStrip
                  crumb="University Belt"
                  title={areaObj.name}
                  subtitle={areaObj.blurb}
                  backLabel="Back to University Belt"
                  onBack={goZone}
                  stats={<>
                    <C.SchoolsPill count={areaObj.schools} />
                    <C.ListingsPill count={0} />
                  </>}
                />
                <C.ZeroListingPanel
                  area={areaObj}
                  schools={D.schools.filter((s) => s.area === areaObj.name)}
                  onViewZone={goZoneAll}
                  onTryArea={() => openArea(otherArea.id)}
                  tryAreaName={otherArea.name}
                  onStartOver={goZone}
                  onSave={() => setSavedAreas((s) => s.includes(areaObj.id) ? s.filter((x) => x !== areaObj.id) : [...s, areaObj.id])}
                  saved={savedAreas.includes(areaObj.id)}
                />
              </>
            )
          )}

          {/* ================= STATE 4 — ZONE-WIDE LISTINGS ================= */}
          {view === "zone-all" && (
            <>
              <C.ContextStrip
                crumb="School zone"
                title={`All ${D.zone.name} homes`}
                subtitle={`${D.zone.areasCount} areas · ${D.zone.schools} schools nearby`}
                backLabel="Back to zone overview"
                onBack={goZone}
                sort={sort}
                onSort={(e) => setSort(e.target.value)}
                stats={<>
                  <C.SchoolsPill count={D.zone.schools} />
                  <C.ListingsPill count={listings.length} />
                </>}
              />
              <C.ListingGrid listings={listings} onHover={setActive} onOpen={() => {}} saved={saved} onToggleSave={toggleSave} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

window.UPTZoneSelected = UPTZoneSelected;
