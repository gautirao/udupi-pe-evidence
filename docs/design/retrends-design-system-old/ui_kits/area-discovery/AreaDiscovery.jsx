// Udupi AREA-FIRST discovery — main app. Exports window.UPTAreaDiscovery
//
// Journey:  Landing (groups) → Group (areas inside) → Area (homes)
// Selecting a group NEVER jumps straight to listings — areas are the intermediary.
// Residential homes only: no agri land, no school radius, no plum accent.
const { Icon: AIcon, Button: AButton, Badge: ABadge } = window.ReTrendsDesignSystem_f37966;
const noun = window.UPT_AREA_NOUN;
const htitle = window.UPT_AREA_TITLE;

function SectionLabel({ icon, children, right }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "14px", gap: "12px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        {icon && <AIcon name={icon} size={16} color="var(--text-muted)" />}
        <span style={{ fontSize: "12px", fontWeight: 700, letterSpacing: "var(--tracking-caps)", textTransform: "uppercase", color: "var(--text-muted)" }}>{children}</span>
      </div>
      {right}
    </div>
  );
}

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
            boxShadow: on ? "var(--shadow-sm)" : "none", transition: "box-shadow var(--dur-fast) var(--ease-standard)",
          }}>{opt}</button>
        );
      })}
    </div>
  );
}

function BackLink({ children, onClick }) {
  const [h, setH] = React.useState(false);
  return (
    <button onClick={onClick} onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)} style={{
      display: "inline-flex", alignItems: "center", gap: "6px", border: "none", background: "transparent",
      color: h ? "var(--text-strong)" : "var(--text-muted)", cursor: "pointer",
      fontFamily: "var(--font-sans)", fontSize: "13px", fontWeight: 600, padding: 0, marginBottom: "16px",
      transition: "color var(--dur-fast) var(--ease-standard)",
    }}>
      <AIcon name="arrow-right" size={14} style={{ transform: "rotate(180deg)" }} />{children}
    </button>
  );
}

// ---------- Landing intro / guidance card (compact) ----------
function IntroCard({ groupCount, areaCount, homeCount, mode }) {
  return (
    <div style={{
      background: "var(--surface-card)", border: "1px solid var(--border)",
      borderRadius: "var(--radius-xl)", padding: "20px 22px", marginBottom: "24px", boxShadow: "var(--shadow-sm)",
    }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: "14px" }}>
        <div style={{
          flex: "none", width: "44px", height: "44px", borderRadius: "var(--radius-md)",
          background: "var(--accent-tint)", display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <AIcon name="map-pin" size={21} color="var(--copper-600)" />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h2 style={{ margin: 0, fontFamily: "var(--font-serif)", fontSize: "20px", fontWeight: 600, letterSpacing: "-0.01em", color: "var(--text-strong)", lineHeight: 1.2 }}>Explore Udupi by neighbourhood</h2>
          <p style={{ margin: "7px 0 0", fontSize: "13.5px", lineHeight: 1.5, color: "var(--text-body)", textWrap: "pretty" }}>
            Start with a neighbourhood group, then narrow down to a local area to see the homes inside it.
          </p>
        </div>
      </div>
      <div style={{ display: "flex", gap: "26px", marginTop: "16px", paddingTop: "15px", borderTop: "1px solid var(--border)" }}>
        {[[groupCount, "groups"], [areaCount, "areas"], [homeCount, mode === "Rent" ? "to rent" : "for sale"]].map(([v, l]) => (
          <div key={l}>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: "21px", fontWeight: 600, color: "var(--text-strong)" }}>{v}</div>
            <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>{l}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------- Group summary card (selected-group header) ----------
function GroupSummaryCard({ group, areaCount, homeCount, mode, onViewAll }) {
  const noHomes = homeCount === 0;
  return (
    <div style={{
      background: "var(--surface-card)", border: "1px solid var(--border)",
      borderRadius: "var(--radius-xl)", padding: "22px", marginBottom: "24px", boxShadow: "var(--shadow-sm)",
    }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: "15px" }}>
        <div style={{
          flex: "none", width: "48px", height: "48px", borderRadius: "var(--radius-md)",
          background: "var(--navy-100)", display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <AIcon name="layers" size={23} color="var(--navy-800)" />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "9px", flexWrap: "wrap", marginBottom: "3px" }}>
            <h2 style={{ margin: 0, fontFamily: "var(--font-serif)", fontSize: "24px", fontWeight: 600, letterSpacing: "-0.01em", color: "var(--text-strong)", lineHeight: 1.15 }}>{group.name}</h2>
            <ABadge tone="neutral" pill>{group.cue}</ABadge>
          </div>
          <p style={{ margin: "8px 0 0", fontSize: "14px", lineHeight: 1.55, color: "var(--text-body)", textWrap: "pretty" }}>{group.blurb}</p>
        </div>
      </div>
      <div style={{ display: "flex", gap: "26px", marginTop: "18px", paddingTop: "16px", borderTop: "1px solid var(--border)" }}>
        {[[areaCount, areaCount === 1 ? "area" : "areas"], [homeCount, noun(mode, homeCount)]].map(([v, l]) => (
          <div key={l}>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: "22px", fontWeight: 600, color: "var(--text-strong)" }}>{v}</div>
            <div style={{ fontSize: "12.5px", color: "var(--text-muted)" }}>{l}</div>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "16px", padding: "11px 13px", background: "var(--surface-subtle)", borderRadius: "var(--radius-md)", fontSize: "13px", color: "var(--text-body)" }}>
        <AIcon name="map-pin" size={15} color="var(--text-muted)" />Choose an area below to see the homes inside it.
      </div>
      {!noHomes && (
        <button onClick={onViewAll} style={{
          display: "inline-flex", alignItems: "center", gap: "6px", marginTop: "12px", border: "none", background: "transparent",
          color: "var(--primary)", cursor: "pointer", fontFamily: "var(--font-sans)", fontSize: "13px", fontWeight: 600, padding: 0,
        }}>View all {homeCount} {noun(mode, homeCount)} across {group.name} <AIcon name="arrow-right" size={14} /></button>
      )}
    </div>
  );
}

// ---------- Selected-area summary band (navy) ----------
function AreaSummaryBand({ area, breadcrumb, count, mode, onBack, backLabel }) {
  return (
    <div style={{
      background: "var(--surface-navy)", color: "var(--text-on-navy)",
      borderRadius: "var(--radius-xl)", padding: "20px 22px", marginBottom: "20px", boxShadow: "var(--shadow-md)",
    }}>
      <button onClick={onBack} style={{
        display: "inline-flex", alignItems: "center", gap: "6px", border: "none", background: "transparent",
        color: "rgba(255,255,255,0.75)", cursor: "pointer", fontFamily: "var(--font-sans)", fontSize: "13px",
        fontWeight: 600, padding: 0, marginBottom: "14px",
      }}>
        <AIcon name="arrow-right" size={14} style={{ transform: "rotate(180deg)" }} />{backLabel}
      </button>
      <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", color: "rgba(255,255,255,0.55)", marginBottom: "10px", flexWrap: "wrap" }}>
        {breadcrumb.map((b, i) => (
          <React.Fragment key={i}>
            {i > 0 && <AIcon name="chevron-right" size={12} color="rgba(255,255,255,0.4)" />}
            <span style={{ fontWeight: 600, color: i === breadcrumb.length - 1 ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.55)" }}>{b}</span>
          </React.Fragment>
        ))}
      </div>
      <div style={{ display: "flex", alignItems: "flex-start", gap: "14px" }}>
        <div style={{
          flex: "none", width: "46px", height: "46px", borderRadius: "var(--radius-md)",
          background: "var(--accent)", display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <AIcon name="map-pin" size={22} color="#fff" />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "var(--tracking-caps)", textTransform: "uppercase", color: "rgba(255,255,255,0.6)", marginBottom: "4px" }}>Selected area</div>
          <h2 style={{ margin: 0, fontFamily: "var(--font-serif)", fontSize: "22px", fontWeight: 600, letterSpacing: "-0.01em", lineHeight: 1.2 }}>{area.name}</h2>
          <div style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: "7px", fontSize: "13px", color: "rgba(255,255,255,0.7)", textWrap: "pretty" }}>
            <AIcon name="map-pin" size={13} color="rgba(255,255,255,0.6)" />{area.blurb}
          </div>
        </div>
      </div>
      <div style={{ display: "flex", gap: "26px", marginTop: "18px", paddingTop: "16px", borderTop: "1px solid rgba(255,255,255,0.14)" }}>
        <div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: "22px", fontWeight: 600 }}>{count}</div>
          <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.6)" }}>{noun(mode, count)}</div>
        </div>
      </div>
    </div>
  );
}

function ListingGrid({ listings, onHover, onOpen, saved, onToggleSave }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
      {listings.map((l) => (
        <window.UPTAreaListingCard key={l.id} listing={l} onHover={onHover} onOpen={onOpen}
          saved={saved.includes(l.id)} onToggleSave={onToggleSave} />
      ))}
    </div>
  );
}

function UPTAreaDiscovery() {
  const D = window.UPT_AREA_DATA;

  const init = React.useMemo(() => {
    const p = new URLSearchParams(typeof location !== "undefined" ? location.search : "");
    return {
      mode: p.get("mode") === "rent" ? "Rent" : "Buy",
      group: p.get("groupId") || null,
      area: p.get("areaId") || null,
      view: p.get("view") || null,
    };
  }, []);

  const [mode, setMode] = React.useState(init.mode);
  const [selGroup, setSelGroup] = React.useState(init.group);
  const [selArea, setSelArea] = React.useState(init.area);
  const [groupHomes, setGroupHomes] = React.useState(init.view === "homes");
  const [active, setActive] = React.useState(null);
  const [saved, setSaved] = React.useState(["a-mp1"]);

  const toggleSave = (id) => setSaved((s) => s.includes(id) ? s.filter((x) => x !== id) : [...s, id]);
  const reset = () => { setSelGroup(null); setSelArea(null); setGroupHomes(false); setActive(null); };
  const pickGroup = (id) => { setSelArea(null); setGroupHomes(false); setSelGroup(id); setActive(null); };
  const pickArea = (id) => { setGroupHomes(false); setSelArea(id); setActive(null); };

  React.useEffect(() => {
    const p = new URLSearchParams();
    p.set("journey", "area-first");
    if (mode === "Rent") p.set("mode", "rent");
    if (selGroup) p.set("groupId", selGroup);
    if (selArea) p.set("areaId", selArea);
    if (groupHomes && !selArea) p.set("view", "homes");
    try { history.replaceState(null, "", location.pathname + "?" + p.toString()); } catch (e) {}
  }, [mode, selGroup, selArea, groupHomes]);

  const groupObj = selGroup && D.groups.find((g) => g.id === selGroup);
  const areaObj = selArea && D.areas.find((a) => a.id === selArea);

  const groupAreas = selGroup ? D.areas.filter((a) => a.group === selGroup) : [];
  const groupListings = selGroup ? D.listings.filter((l) => l.group === selGroup) : [];
  const areaListings = selArea ? D.listings.filter((l) => l.areaId === selArea) : [];

  // map inputs
  let mapListings = [];
  if (selArea) mapListings = areaListings;
  else if (selGroup && groupHomes) mapListings = groupListings;

  const totalHomes = D.listings.length;
  const totalAreas = D.areas.length;

  return (
    <div style={{ display: "flex", height: "calc(100vh - 60px)" }}>
      {/* ---- Map (left) ---- */}
      <div style={{ flex: "0 0 50%", position: "relative", borderRight: "1px solid var(--border)" }}>
        <window.UPTAreaMap
          groups={D.groups} areas={D.areas} listings={mapListings}
          selectedGroup={selGroup} selectedArea={selArea} activeListing={active}
          totalCount={selArea ? areaListings.length : selGroup && groupHomes ? groupListings.length : totalHomes}
          onPickGroup={pickGroup} onPickArea={pickArea}
        />
      </div>

      {/* ---- Panel (right) ---- */}
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", background: "var(--background)" }}>
        {/* Journey header */}
        <div style={{ padding: "20px 28px 16px", borderBottom: "1px solid var(--border)", background: "var(--background)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", marginBottom: "14px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-muted)" }}>Looking to</span>
              <BuyRentToggle value={mode} onChange={setMode} />
            </div>
            <button onClick={reset} style={{
              display: "inline-flex", alignItems: "center", gap: "6px", border: "none", background: "transparent",
              color: "var(--text-muted)", cursor: "pointer", fontFamily: "var(--font-sans)", fontSize: "13px", fontWeight: 600, padding: 0,
            }}>Start over <AIcon name="x" size={15} /></button>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
            <h1 style={{ margin: 0, fontFamily: "var(--font-serif)", fontSize: "24px", fontWeight: 600, letterSpacing: "-0.02em", color: "var(--text-strong)", whiteSpace: "nowrap" }}>
              Choose an area in Udupi
            </h1>
            <span style={{
              display: "inline-flex", alignItems: "center", gap: "5px", padding: "3px 10px", borderRadius: "var(--radius-full)",
              background: "var(--accent-tint)", color: "var(--copper-600)", fontSize: "12px", fontWeight: 700,
            }}>
              <AIcon name="map-pin" size={12} color="var(--copper-600)" />By area
            </span>
          </div>
          {!selGroup && !selArea && (
            <p style={{ margin: "8px 0 0", fontSize: "13px", color: "var(--text-muted)", lineHeight: 1.5 }}>
              Browse neighbourhood groups, then choose an area to see homes.
            </p>
          )}
        </div>

        {/* Scroll area */}
        <div className="upt-scroll" style={{ flex: 1, overflowY: "auto", padding: "22px 28px 36px" }}>

          {/* ====== STATE C: AREA SELECTED — homes ====== */}
          {selArea ? (
            <>
              <BackLink onClick={() => setSelArea(null)}>Back to areas in {groupObj ? groupObj.name : "group"}</BackLink>
              <AreaSummaryBand
                area={areaObj} breadcrumb={[groupObj?.name, areaObj.name].filter(Boolean)}
                count={areaListings.length} mode={mode}
                onBack={() => setSelArea(null)} backLabel={`Back to ${groupObj ? groupObj.name : "group"}`}
              />
              {areaListings.length === 0 ? (
                <window.UPTAreaEmptyState
                  icon="map-pin"
                  title={`No ${mode === "Rent" ? "rentals" : "homes"} listed in ${areaObj.name} yet`}
                  body="This is still a valid area — switch your Buy/Rent mode, explore another area in this group, or start over."
                  actions={<>
                    <AButton variant="primary" size="md" onClick={() => setSelArea(null)}>Explore nearby areas</AButton>
                    <AButton variant="outline" size="md" onClick={() => setMode(mode === "Rent" ? "Buy" : "Rent")}>Switch to {mode === "Rent" ? "Buy" : "Rent"}</AButton>
                  </>}
                />
              ) : (
                <>
                  <SectionLabel icon="building" right={
                    <span style={{ fontSize: "13px", color: "var(--text-muted)" }}>
                      <span style={{ fontFamily: "var(--font-mono)", fontWeight: 600, color: "var(--text-strong)" }}>{areaListings.length}</span> available
                    </span>
                  }>{htitle(mode)} in {areaObj.name}</SectionLabel>
                  <ListingGrid listings={areaListings} onHover={setActive} onOpen={() => {}} saved={saved} onToggleSave={toggleSave} />
                </>
              )}
            </>

          /* ====== STATE B2: VIEW ALL HOMES IN GROUP (secondary) ====== */
          ) : (selGroup && groupHomes) ? (
            <>
              <BackLink onClick={() => setGroupHomes(false)}>Back to areas in {groupObj.name}</BackLink>
              <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "8px", flexWrap: "wrap" }}>
                <h2 style={{ margin: 0, fontFamily: "var(--font-serif)", fontSize: "22px", fontWeight: 600, letterSpacing: "-0.01em", color: "var(--text-strong)" }}>All homes in {groupObj.name}</h2>
                <ABadge tone="neutral" pill>Whole group</ABadge>
              </div>
              <p style={{ margin: "0 0 18px", fontSize: "13.5px", color: "var(--text-muted)", lineHeight: 1.5, textWrap: "pretty" }}>
                Or pick a single area to focus the list to one neighbourhood.
              </p>
              <SectionLabel icon="map-pin" right={
                <span style={{ fontSize: "13px", color: "var(--text-muted)" }}>
                  <span style={{ fontFamily: "var(--font-mono)", fontWeight: 600, color: "var(--text-strong)" }}>{groupListings.length}</span> {noun(mode, groupListings.length)}
                </span>
              }>{htitle(mode)} across {groupObj.name}</SectionLabel>
              <ListingGrid listings={groupListings} onHover={setActive} onOpen={() => {}} saved={saved} onToggleSave={toggleSave} />
            </>

          /* ====== STATE B: GROUP SELECTED — areas inside ====== */
          ) : selGroup ? (
            <>
              <BackLink onClick={reset}>Back to all neighbourhood groups</BackLink>
              <GroupSummaryCard
                group={groupObj} mode={mode}
                areaCount={groupAreas.length} homeCount={groupListings.length}
                onViewAll={() => setGroupHomes(true)}
              />
              <SectionLabel icon="map-pin" right={
                <span style={{ fontSize: "13px", color: "var(--text-muted)" }}>{groupAreas.length} {groupAreas.length === 1 ? "area" : "areas"}</span>
              }>Areas inside {groupObj.name}</SectionLabel>
              {groupAreas.length === 0 ? (
                <window.UPTAreaEmptyState
                  icon="map-pin" title="No areas mapped here yet"
                  body="We haven't mapped local areas for this group yet. Explore a nearby group instead."
                  actions={<AButton variant="primary" size="md" onClick={reset}>Browse other groups</AButton>}
                />
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                  {groupAreas.map((a) => (
                    <window.UPTAreaAreaCard key={a.id} area={a} mode={mode} onView={{ open: pickArea, hover: () => {} }} />
                  ))}
                </div>
              )}
            </>

          /* ====== STATE A: LANDING — neighbourhood groups ====== */
          ) : (
            <>
              <IntroCard groupCount={D.groups.length} areaCount={totalAreas} homeCount={totalHomes} mode={mode} />
              <SectionLabel icon="layers" right={
                <span style={{ fontSize: "13px", color: "var(--text-muted)" }}>{D.groups.length} groups</span>
              }>Neighbourhood groups</SectionLabel>
              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                {D.groups.map((g) => (
                  <window.UPTAreaGroupCard key={g.id} group={g} mode={mode} onView={{ open: pickGroup, hover: () => {} }} />
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

window.UPTAreaDiscovery = UPTAreaDiscovery;
