// Bangalore AREA-FIRST discovery — main app. Exports window.BLRAreaDiscovery
//
// Scoped model (GitHub #1740):
//   City → Region → (Search by area) → Group/Zone → Area → Listings
// The left map and the right panel ALWAYS mirror the same navigation level.
// Residential homes only; agricultural land is a separate, detached journey.
const { Icon: AIcon, Button: AButton, Badge: ABadge, Input: AInput } = window.ReTrendsDesignSystem_f37966;
const noun = window.BLR_NOUN;
const htitle = window.BLR_TITLE;
const COUNTS = window.BLR_AREA_COUNTS;

// ---------- small shared bits ----------
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

function Crumb({ items }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", color: "rgba(255,255,255,0.55)", marginBottom: "10px", flexWrap: "wrap" }}>
      {items.map((b, i) => (
        <React.Fragment key={i}>
          {i > 0 && <AIcon name="chevron-right" size={12} color="rgba(255,255,255,0.4)" />}
          <span style={{ fontWeight: 600, color: i === items.length - 1 ? "rgba(255,255,255,0.92)" : "rgba(255,255,255,0.55)" }}>{b}</span>
        </React.Fragment>
      ))}
    </div>
  );
}

// ---------- Direct "search area" box ----------
function DirectAreaSearch({ onPick }) {
  const [q, setQ] = React.useState("");
  const D = window.BLR_AREA_DATA;
  const results = q.trim()
    ? D.areas.filter((a) => a.name.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 5)
    : [];
  const regionName = (id) => D.regions.find((r) => r.id === id)?.name || "";
  return (
    <div style={{ marginBottom: "22px" }}>
      <AInput
        placeholder="Try Hebbal, Whitefield, Sarjapur Road"
        value={q} onChange={(e) => setQ(e.target.value)}
        leadingIcon={<AIcon name="search" size={16} />}
      />
      {q.trim() && (
        <div style={{ marginTop: "8px", background: "var(--surface-card)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", boxShadow: "var(--shadow-md)", overflow: "hidden" }}>
          {results.length === 0 ? (
            <div style={{ padding: "14px 16px", fontSize: "13px", color: "var(--text-muted)" }}>No area matches “{q}”. Try another name.</div>
          ) : results.map((a, i) => {
            return (
              <button key={a.id} onClick={() => onPick(a)} style={{
                display: "flex", alignItems: "center", gap: "12px", width: "100%", textAlign: "left",
                padding: "12px 16px", border: "none", borderTop: i ? "1px solid var(--border)" : "none",
                background: "transparent", cursor: "pointer", fontFamily: "var(--font-sans)",
              }}
                onMouseEnter={(e) => e.currentTarget.style.background = "var(--surface-subtle)"}
                onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}>
                <div style={{ flex: "none", width: "34px", height: "34px", borderRadius: "var(--radius-md)", background: "var(--accent-tint)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <AIcon name="map-pin" size={17} color="var(--copper-600)" />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: "14px", fontWeight: 700, color: "var(--text-strong)" }}>{a.name}</div>
                  <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>Area · {regionName(a.region)}</div>
                </div>
                <span style={{ flex: "none", display: "inline-flex", alignItems: "center", gap: "5px", fontSize: "12.5px", fontWeight: 600, color: "var(--primary)", whiteSpace: "nowrap" }}>
                  View listings <AIcon name="arrow-right" size={14} />
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ---------- Navy header band (region / group / area selected) ----------
function HeaderBand({ eyebrow, title, sub, crumb, count, mode, countLabel, onBack, backLabel, actions }) {
  return (
    <div style={{ background: "var(--surface-navy)", color: "var(--text-on-navy)", borderRadius: "var(--radius-xl)", padding: "20px 22px", marginBottom: "20px", boxShadow: "var(--shadow-md)" }}>
      {onBack && (
        <button onClick={onBack} style={{
          display: "inline-flex", alignItems: "center", gap: "6px", border: "none", background: "transparent",
          color: "rgba(255,255,255,0.75)", cursor: "pointer", fontFamily: "var(--font-sans)", fontSize: "13px", fontWeight: 600, padding: 0, marginBottom: "14px",
        }}>
          <AIcon name="arrow-right" size={14} style={{ transform: "rotate(180deg)" }} />{backLabel}
        </button>
      )}
      {crumb && <Crumb items={crumb} />}
      <div style={{ display: "flex", alignItems: "flex-start", gap: "14px" }}>
        <div style={{ flex: "none", width: "46px", height: "46px", borderRadius: "var(--radius-md)", background: "var(--accent)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <AIcon name="map-pin" size={22} color="#fff" />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "var(--tracking-caps)", textTransform: "uppercase", color: "rgba(255,255,255,0.6)", marginBottom: "4px" }}>{eyebrow}</div>
          <h2 style={{ margin: 0, fontFamily: "var(--font-serif)", fontSize: "23px", fontWeight: 600, letterSpacing: "-0.01em", lineHeight: 1.2 }}>{title}</h2>
          {sub && <div style={{ marginTop: "7px", fontSize: "13px", color: "rgba(255,255,255,0.7)", textWrap: "pretty", lineHeight: 1.5 }}>{sub}</div>}
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: "16px", marginTop: "18px", paddingTop: "16px", borderTop: "1px solid rgba(255,255,255,0.14)" }}>
        <div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: "22px", fontWeight: 600 }}>{count.toLocaleString("en-IN")}</div>
          <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.6)" }}>{countLabel}</div>
        </div>
        {actions && <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", justifyContent: "flex-end" }}>{actions}</div>}
      </div>
    </div>
  );
}

function NavyGhostBtn({ children, onClick }) {
  const [h, setH] = React.useState(false);
  return (
    <button onClick={onClick} onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)} style={{
      display: "inline-flex", alignItems: "center", gap: "6px", padding: "7px 13px", borderRadius: "var(--radius-md)",
      border: "1px solid rgba(255,255,255,0.28)", background: h ? "rgba(255,255,255,0.12)" : "transparent",
      color: "#fff", cursor: "pointer", fontFamily: "var(--font-sans)", fontSize: "12.5px", fontWeight: 600,
      transition: "background var(--dur-fast) var(--ease-standard)", whiteSpace: "nowrap",
    }}>{children}</button>
  );
}

// ---------- Filter bar (area / all-listings level) ----------
const BUDGETS = [
  { k: "any", label: "Any budget", test: () => true },
  { k: "u1", label: "< ₹1 Cr", test: (p) => p < 10000000 },
  { k: "1-2", label: "₹1–2 Cr", test: (p) => p >= 10000000 && p < 20000000 },
  { k: "2-4", label: "₹2–4 Cr", test: (p) => p >= 20000000 && p < 40000000 },
  { k: "4p", label: "₹4 Cr+", test: (p) => p >= 40000000 },
];
const PTYPES = ["Any type", "Apartment", "Villa", "Independent House", "Penthouse"];
const BEDS = [{ k: 0, label: "Any BHK" }, { k: 1, label: "1+" }, { k: 2, label: "2+" }, { k: 3, label: "3+" }, { k: 4, label: "4+" }];

function Segmented({ options, value, onChange }) {
  return (
    <div style={{ display: "inline-flex", flexWrap: "wrap", gap: "6px" }}>
      {options.map((o) => {
        const on = value === o.k;
        return (
          <button key={o.k} onClick={() => onChange(o.k)} style={{
            border: on ? "1px solid var(--navy-800)" : "1px solid var(--border)",
            background: on ? "var(--navy-800)" : "var(--surface-card)",
            color: on ? "#fff" : "var(--text-body)", cursor: "pointer",
            padding: "6px 13px", borderRadius: "var(--radius-full)",
            fontFamily: "var(--font-sans)", fontSize: "12.5px", fontWeight: 600, whiteSpace: "nowrap",
          }}>{o.label}</button>
        );
      })}
    </div>
  );
}

function FilterBar({ f, setF, onClear }) {
  const active = f.budget !== "any" || f.ptype !== "Any type" || f.beds !== 0 || f.verified;
  return (
    <div style={{ background: "var(--surface-subtle)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", padding: "16px 18px", marginBottom: "18px", display: "flex", flexDirection: "column", gap: "14px" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        <span style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "var(--tracking-caps)", textTransform: "uppercase", color: "var(--text-muted)" }}>Budget</span>
        <Segmented options={BUDGETS} value={f.budget} onChange={(k) => setF({ ...f, budget: k })} />
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        <span style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "var(--tracking-caps)", textTransform: "uppercase", color: "var(--text-muted)" }}>Property type</span>
        <Segmented options={PTYPES.map((p) => ({ k: p, label: p }))} value={f.ptype} onChange={(k) => setF({ ...f, ptype: k })} />
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "20px", alignItems: "flex-end" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          <span style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "var(--tracking-caps)", textTransform: "uppercase", color: "var(--text-muted)" }}>Bedrooms</span>
          <Segmented options={BEDS} value={f.beds} onChange={(k) => setF({ ...f, beds: k })} />
        </div>
        <button onClick={() => setF({ ...f, verified: !f.verified })} style={{
          display: "inline-flex", alignItems: "center", gap: "8px", padding: "7px 13px", borderRadius: "var(--radius-full)",
          border: f.verified ? "1px solid var(--evergreen-600)" : "1px solid var(--border)",
          background: f.verified ? "var(--trust-verified-bg)" : "var(--surface-card)",
          color: f.verified ? "var(--trust-verified-fg)" : "var(--text-body)", cursor: "pointer",
          fontFamily: "var(--font-sans)", fontSize: "12.5px", fontWeight: 600,
        }}>
          <AIcon name="shield-check" size={15} color={f.verified ? "var(--trust-verified-fg)" : "var(--grey-400)"} />Verified only
        </button>
      </div>
      {active && (
        <button onClick={onClear} style={{
          alignSelf: "flex-start", display: "inline-flex", alignItems: "center", gap: "6px", border: "none", background: "transparent",
          color: "var(--text-muted)", cursor: "pointer", fontFamily: "var(--font-sans)", fontSize: "12.5px", fontWeight: 600, padding: 0,
        }}>Clear filters <AIcon name="x" size={14} /></button>
      )}
    </div>
  );
}

function ListingGrid({ listings, onHover, onOpen, saved, onToggleSave }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
      {listings.map((l) => (
        <window.BLRListingCard key={l.id} listing={l} onHover={onHover} onOpen={onOpen}
          saved={saved.includes(l.id)} onToggleSave={onToggleSave} />
      ))}
    </div>
  );
}

const DEFAULT_FILTERS = { budget: "any", ptype: "Any type", beds: 0, verified: false };

function applyFilters(list, f, mode) {
  return list.filter((l) => {
    if (!BUDGETS.find((b) => b.k === f.budget).test(l.price)) return false;
    if (f.ptype !== "Any type" && l.propType !== f.ptype) return false;
    if (f.beds && l.beds < f.beds) return false;
    if (f.verified && l.trustTier !== "verified") return false;
    return true;
  });
}

function UPTAreaDiscovery() {
  const D = window.BLR_AREA_DATA;

  const init = React.useMemo(() => {
    const p = new URLSearchParams(typeof location !== "undefined" ? location.search : "");
    return {
      mode: p.get("mode") === "rent" ? "Rent" : "Buy",
      region: p.get("regionId") || null,
      group: p.get("groupId") || null,
      area: p.get("areaId") || null,
      journey: p.get("journey2") || null,
    };
  }, []);

  const [mode, setMode] = React.useState(init.mode);
  const [selRegion, setSelRegion] = React.useState(init.region);
  const [selGroup, setSelGroup] = React.useState(init.group);
  const [selArea, setSelArea] = React.useState(init.area);
  const [journey, setJourney] = React.useState(init.journey); // "area" | "all" | null
  const [filters, setFilters] = React.useState(DEFAULT_FILTERS);
  const [active, setActive] = React.useState(null);
  const [saved, setSaved] = React.useState(["h1"]);

  const toggleSave = (id) => setSaved((s) => s.includes(id) ? s.filter((x) => x !== id) : [...s, id]);
  const reset = () => { setSelRegion(null); setSelGroup(null); setSelArea(null); setJourney(null); setFilters(DEFAULT_FILTERS); setActive(null); };

  const pickRegion = (id) => { setSelRegion(id); setSelGroup(null); setSelArea(null); setJourney(null); setActive(null); };
  const startAreaJourney = () => { setJourney("area"); setSelGroup(null); setSelArea(null); };
  const startAllListings = () => { setJourney("all"); setSelGroup(null); setSelArea(null); setFilters(DEFAULT_FILTERS); };
  const pickGroup = (id) => { setJourney("area"); setSelGroup(id); setSelArea(null); setActive(null); };
  const pickArea = (id) => { setSelArea(id); setFilters(DEFAULT_FILTERS); setActive(null); };
  const directPick = (a) => { setSelRegion(a.region); setJourney("area"); setSelGroup(a.group); setSelArea(a.id); setFilters(DEFAULT_FILTERS); setActive(null); };
  const goSchoolJourney = () => {
    const p = new URLSearchParams(); if (selRegion) p.set("regionId", selRegion); if (mode === "Rent") p.set("mode", "rent");
    location.href = "../school-discovery/index.html" + (p.toString() ? "?" + p.toString() : "");
  };

  // step derivation
  let step = "city";
  if (selArea) step = "area";
  else if (selGroup) step = "group";
  else if (selRegion && journey === "area") step = "groups";
  else if (selRegion && journey === "all") step = "all";
  else if (selRegion) step = "region";

  React.useEffect(() => {
    const p = new URLSearchParams();
    p.set("journey", "area-first");
    if (mode === "Rent") p.set("mode", "rent");
    if (selRegion) p.set("regionId", selRegion);
    if (journey) p.set("journey2", journey);
    if (selGroup) p.set("groupId", selGroup);
    if (selArea) p.set("areaId", selArea);
    try { history.replaceState(null, "", location.pathname + "?" + p.toString()); } catch (e) {}
  }, [mode, selRegion, selGroup, selArea, journey]);

  const regionObj = selRegion && D.regions.find((r) => r.id === selRegion);
  const groupObj = selGroup && D.groups.find((g) => g.id === selGroup);
  const areaObj = selArea && D.areas.find((a) => a.id === selArea);

  const regionGroups = selRegion ? D.groups.filter((g) => g.region === selRegion) : [];
  const groupAreas = selGroup ? D.areas.filter((a) => a.group === selGroup) : [];
  const areaListingsAll = selArea ? D.listings.filter((l) => l.areaId === selArea) : [];
  const regionListingsAll = selRegion ? D.listings.filter((l) => l.region === selRegion) : [];

  const areaListings = applyFilters(areaListingsAll, filters, mode);
  const regionListings = applyFilters(regionListingsAll, filters, mode);

  // hotspots for region-level (top areas)
  const regionAreas = selRegion ? D.areas.filter((a) => a.region === selRegion) : [];
  const hotspots = regionAreas.map((a) => ({ a, c: COUNTS.area(a.id) })).sort((x, y) => y.c - x.c);
  const HOTSPOT_MAX = 4;
  const moreAreas = Math.max(0, regionAreas.length - HOTSPOT_MAX);

  // map listings + count
  let mapListings = [];
  if (step === "area") mapListings = areaListings;
  else if (step === "all") mapListings = regionListings;

  let mapCount = COUNTS.total;
  if (step === "area") mapCount = areaListings.length;
  else if (step === "all") mapCount = regionListings.length;
  else if (step === "group") mapCount = COUNTS.group(selGroup);
  else if (step === "groups" || step === "region") mapCount = COUNTS.region(selRegion);

  return (
    <div style={{ display: "flex", height: "calc(100vh - 60px)" }}>
      {/* ---- Map (left) ---- */}
      <div style={{ flex: "0 0 50%", position: "relative", borderRight: "1px solid var(--border)" }}>
        <window.BLRAreaMap
          step={step === "all" ? "area" : step}
          regions={D.regions} groups={D.groups} areas={D.areas} listings={mapListings}
          selectedRegion={selRegion} selectedGroup={selGroup} selectedArea={selArea} activeListing={active}
          totalCount={mapCount} moreAreas={moreAreas}
          onPickRegion={pickRegion} onPickGroup={pickGroup} onPickArea={pickArea}
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
            <h1 style={{ margin: 0, fontFamily: "var(--font-serif)", fontSize: "24px", fontWeight: 600, letterSpacing: "-0.02em", color: "var(--text-strong)" }}>
              Discover Bangalore
            </h1>
            <span style={{
              display: "inline-flex", alignItems: "center", gap: "5px", padding: "3px 10px", borderRadius: "var(--radius-full)",
              background: "var(--accent-tint)", color: "var(--copper-600)", fontSize: "12px", fontWeight: 700,
            }}>
              <AIcon name="map-pin" size={12} color="var(--copper-600)" />By area
            </span>
          </div>
        </div>

        {/* Scroll area */}
        <div className="upt-scroll" style={{ flex: 1, overflowY: "auto", padding: "22px 28px 36px" }}>

          {/* ====== AREA / ALL: listings with filters ====== */}
          {(step === "area" || step === "all") ? (
            <>
              <BackLink onClick={() => step === "all" ? setJourney(null) : setSelArea(null)}>
                {step === "all" ? `Back to ${regionObj.short}` : `Back to areas in ${groupObj ? groupObj.name : "group"}`}
              </BackLink>
              <HeaderBand
                eyebrow={step === "all" ? "All listings" : "Selected area"}
                title={step === "all" ? `All homes in ${regionObj.name}` : areaObj.name}
                sub={step === "all" ? "Every residential listing in this region — narrow with the filters below." : areaObj.blurb}
                crumb={step === "all"
                  ? ["Bangalore", regionObj.short, "All listings"]
                  : ["Bangalore", regionObj.short, groupObj?.name, areaObj.name].filter(Boolean)}
                count={step === "all" ? regionListings.length : areaListings.length} mode={mode}
                countLabel={noun(mode, step === "all" ? regionListings.length : areaListings.length)}
                onBack={() => step === "all" ? setJourney(null) : setSelArea(null)}
                backLabel={step === "all" ? `Back to ${regionObj.short}` : `Back to ${groupObj ? groupObj.name : "group"}`}
              />
              <FilterBar f={filters} setF={setFilters} onClear={() => setFilters(DEFAULT_FILTERS)} />
              {(step === "all" ? regionListings : areaListings).length === 0 ? (
                <window.BLREmptyState
                  icon="sliders-horizontal" title="No homes match these filters"
                  body="Try widening the budget or bedrooms, turning off Verified only, or switching Buy/Rent."
                  actions={<>
                    <AButton variant="primary" size="md" onClick={() => setFilters(DEFAULT_FILTERS)}>Clear filters</AButton>
                    <AButton variant="outline" size="md" onClick={() => setMode(mode === "Rent" ? "Buy" : "Rent")}>Switch to {mode === "Rent" ? "Buy" : "Rent"}</AButton>
                  </>}
                />
              ) : (
                <>
                  <SectionLabel icon="building" right={
                    <span style={{ fontSize: "13px", color: "var(--text-muted)" }}>
                      <span style={{ fontFamily: "var(--font-mono)", fontWeight: 600, color: "var(--text-strong)" }}>{(step === "all" ? regionListings : areaListings).length}</span> shown
                    </span>
                  }>{htitle(mode)} {step === "all" ? `in ${regionObj.short} Bangalore` : `in ${areaObj.name}`}</SectionLabel>
                  <ListingGrid listings={step === "all" ? regionListings : areaListings} onHover={setActive} onOpen={() => {}} saved={saved} onToggleSave={toggleSave} />
                </>
              )}
            </>

          /* ====== GROUP selected: areas inside ====== */
          ) : step === "group" ? (
            <>
              <BackLink onClick={() => setSelGroup(null)}>Back to area groups in {regionObj.short}</BackLink>
              <HeaderBand
                eyebrow="Area group" title={groupObj.name} sub={groupObj.blurb}
                crumb={["Bangalore", regionObj.short, groupObj.name]}
                count={COUNTS.group(selGroup)} mode={mode} countLabel={noun(mode, COUNTS.group(selGroup))}
                onBack={() => setSelGroup(null)} backLabel={`Back to ${regionObj.short}`}
              />
              <SectionLabel icon="map-pin" right={
                <span style={{ fontSize: "13px", color: "var(--text-muted)" }}>{groupAreas.length} {groupAreas.length === 1 ? "area" : "areas"}</span>
              }>Areas inside {groupObj.name}</SectionLabel>
              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                {groupAreas.map((a) => (
                  <window.BLRAreaCard key={a.id} area={a} mode={mode} onView={{ open: pickArea, hover: () => {} }} />
                ))}
              </div>
            </>

          /* ====== SEARCH BY AREA (groups): area groups/zones ====== */
          ) : step === "groups" ? (
            <>
              <BackLink onClick={() => setJourney(null)}>Back to {regionObj.short} overview</BackLink>
              <HeaderBand
                eyebrow="Search by area" title={`Area groups in ${regionObj.short}`}
                sub="Pick a group to narrow to its areas, or jump straight to an area with search."
                crumb={["Bangalore", regionObj.short, "Search by area"]}
                count={COUNTS.region(selRegion)} mode={mode} countLabel={noun(mode, COUNTS.region(selRegion))}
                onBack={() => setJourney(null)} backLabel={`Back to ${regionObj.short}`}
              />
              <SectionLabel icon="search">Search area directly</SectionLabel>
              <DirectAreaSearch onPick={directPick} />
              <SectionLabel icon="layers" right={
                <span style={{ fontSize: "13px", color: "var(--text-muted)" }}>{regionGroups.length} groups</span>
              }>Area groups</SectionLabel>
              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                {regionGroups.map((g) => (
                  <window.BLRGroupCard key={g.id} group={g} mode={mode} onView={{ open: pickGroup, hover: () => {} }} />
                ))}
              </div>
            </>

          /* ====== REGION selected: journeys inside the region ====== */
          ) : step === "region" ? (
            <>
              <BackLink onClick={reset}>Back to all regions</BackLink>
              <HeaderBand
                eyebrow="Region" title={regionObj.name} sub={regionObj.blurb}
                crumb={["Bangalore", regionObj.short]}
                count={COUNTS.region(selRegion)} mode={mode} countLabel={noun(mode, COUNTS.region(selRegion))}
                actions={<>
                  <NavyGhostBtn onClick={reset}>Change region</NavyGhostBtn>
                </>}
              />
              <SectionLabel icon="route">Continue in {regionObj.short} Bangalore</SectionLabel>
              <div style={{ display: "flex", flexDirection: "column", gap: "11px", marginBottom: "8px" }}>
                <window.BLRJourneyOption icon="map-pin" accent title="Search by area"
                  body={`Browse ${regionGroups.length} area groups, then a single area's homes.`} cta="Start"
                  onClick={startAreaJourney} />
                <window.BLRJourneyOption icon="building" title="Search near a school"
                  body="Start from a school zone and see homes within a radius." cta="Open"
                  onClick={goSchoolJourney} />
                <window.BLRJourneyOption icon="layers" title="View all listings"
                  body={`See every home in ${regionObj.short} Bangalore on one filterable list.`} cta="View"
                  onClick={startAllListings} />
              </div>
              <div style={{ marginTop: "22px" }}>
                <SectionLabel icon="map-pin" right={moreAreas > 0 ? <span style={{ fontSize: "12.5px", color: "var(--text-muted)" }}>+{moreAreas} more via search by area</span> : null}>Top areas</SectionLabel>
                <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                  {hotspots.slice(0, HOTSPOT_MAX).map(({ a }) => (
                    <window.BLRAreaCard key={a.id} area={a} mode={mode} onView={{ open: directPick_fromArea, hover: () => {} }} />
                  ))}
                </div>
              </div>
            </>

          /* ====== CITY landing: regions + journeys ====== */
          ) : (
            <>
              <div style={{
                background: "var(--surface-card)", border: "1px solid var(--border)", borderRadius: "var(--radius-xl)",
                padding: "20px 22px", marginBottom: "24px", boxShadow: "var(--shadow-sm)",
              }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: "14px" }}>
                  <div style={{ flex: "none", width: "44px", height: "44px", borderRadius: "var(--radius-md)", background: "var(--accent-tint)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <AIcon name="map-pin" size={21} color="var(--copper-600)" />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <h2 style={{ margin: 0, fontFamily: "var(--font-serif)", fontSize: "20px", fontWeight: 600, letterSpacing: "-0.01em", color: "var(--text-strong)", lineHeight: 1.2 }}>Where in Bangalore?</h2>
                    <p style={{ margin: "7px 0 0", fontSize: "13.5px", lineHeight: 1.5, color: "var(--text-body)", textWrap: "pretty" }}>
                      Start with a region, then narrow to a group, an area and its homes — the map always follows.
                    </p>
                  </div>
                </div>
                <div style={{ display: "flex", gap: "26px", marginTop: "16px", paddingTop: "15px", borderTop: "1px solid var(--border)" }}>
                  {[[D.regions.length, "regions"], [D.areas.length, "areas"], [COUNTS.total, mode === "Rent" ? "to rent" : "for sale"]].map(([v, l]) => (
                    <div key={l}>
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: "21px", fontWeight: 600, color: "var(--text-strong)" }}>{v}</div>
                      <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>{l}</div>
                    </div>
                  ))}
                </div>
              </div>

              <SectionLabel icon="map-pin" right={<span style={{ fontSize: "13px", color: "var(--text-muted)" }}>{D.regions.length} regions</span>}>Regions</SectionLabel>
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                {D.regions.map((r) => (
                  <window.BLRRegionCard key={r.id} region={r} onView={{ open: pickRegion, hover: () => {} }} />
                ))}
              </div>

              <div style={{ height: "1px", background: "var(--border)", margin: "28px 0" }} />
              <SectionLabel icon="route">Or start with a journey</SectionLabel>
              <div style={{ display: "flex", flexDirection: "column", gap: "11px" }}>
                <window.BLRJourneyOption icon="map-pin" accent title="Search by area"
                  body="Region → group → area → homes. The guided default." cta="Start"
                  onClick={() => pickRegion("north")} />
                <window.BLRJourneyOption icon="building" title="Search near a school"
                  body="Find homes within a radius of a chosen school." cta="Open"
                  onClick={goSchoolJourney} />
                <window.BLRJourneyOption icon="layers" title="View all listings"
                  body="Skip the funnel — browse every home on one filterable list." cta="View"
                  onClick={() => { setSelRegion("north"); setJourney("all"); }} />
              </div>

              <div style={{ marginTop: "18px" }}>
                <window.BLRAgriCard onClick={() => { location.href = "../agri-discovery/index.html"; }} />
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );

  // helper: from region hotspot list, open the area directly (resolve group)
  function directPick_fromArea(areaId) {
    const a = D.areas.find((x) => x.id === areaId);
    if (a) directPick(a);
  }
}

window.BLRAreaDiscovery = UPTAreaDiscovery;
