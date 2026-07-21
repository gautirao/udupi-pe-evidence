// Bangalore SCHOOL-FIRST discovery — main app. Exports window.BLRSchoolDiscovery
//
// Scoped model (GitHub #1740):
//   City → Region → (Search near school) → School Zone → Area → School → homes-in-radius
// The intent-first segmented control ("What do you know?") reuses one input to
// jump directly to a school or an area. Map and panel always mirror the level.
const { Icon: AIcon, Button: AButton, Badge: ABadge, Input: AInput } = window.ReTrendsDesignSystem_f37966;
const noun = window.BLR_NOUN;
const htitle = window.BLR_TITLE;
const C = window.BLR_SCHOOL_COUNTS;
const RADII = [3, 5, 10];
const DEF_RADIUS = 5;

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

// ---------- Navy header band ----------
function HeaderBand({ eyebrow, title, sub, crumb, stats, onBack, backLabel, actions, iconBg }) {
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
        <div style={{ flex: "none", width: "46px", height: "46px", borderRadius: "var(--radius-md)", background: iconBg || "var(--plum-500)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <AIcon name={eyebrow === "Selected school" ? "building" : "map-pin"} size={22} color="#fff" />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "var(--tracking-caps)", textTransform: "uppercase", color: "rgba(255,255,255,0.6)", marginBottom: "4px" }}>{eyebrow}</div>
          <h2 style={{ margin: 0, fontFamily: "var(--font-serif)", fontSize: "22px", fontWeight: 600, letterSpacing: "-0.01em", lineHeight: 1.2 }}>{title}</h2>
          {sub && <div style={{ marginTop: "7px", fontSize: "13px", color: "rgba(255,255,255,0.7)", textWrap: "pretty", lineHeight: 1.5 }}>{sub}</div>}
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: "16px", marginTop: "18px", paddingTop: "16px", borderTop: "1px solid rgba(255,255,255,0.14)" }}>
        <div style={{ display: "flex", gap: "26px" }}>
          {stats.map((s) => (
            <div key={s.label}>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: "22px", fontWeight: 600 }}>{s.value}</div>
              <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.6)" }}>{s.label}</div>
            </div>
          ))}
        </div>
        {actions && <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", justifyContent: "flex-end" }}>{actions}</div>}
      </div>
    </div>
  );
}

// ---------- Intent-first segmented control + one reused input ----------
function IntentSearch({ onPickSchool, onPickArea }) {
  const [mode, setMode] = React.useState("school"); // "school" | "area"
  const [q, setQ] = React.useState("");
  const D = window.BLR_SCHOOL_DATA;
  const regionName = (id) => D.regions.find((r) => r.id === id)?.name || "";
  const areaName = (id) => D.areas.find((a) => a.id === id)?.name || "";

  const results = q.trim() ? (mode === "school"
    ? D.schools.filter((s) => s.name.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 5)
    : D.areas.filter((a) => a.name.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 5)) : [];

  return (
    <div style={{ marginBottom: "24px" }}>
      {/* segmented intent */}
      <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "12px", flexWrap: "wrap" }}>
        <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-body)" }}>What do you know?</span>
        <div style={{ display: "inline-flex", background: "var(--input-bg)", borderRadius: "var(--radius-full)", padding: "3px", border: "1px solid var(--border)" }}>
          {[["school", "I know the school"], ["area", "I know the area"]].map(([k, label]) => {
            const on = mode === k;
            return (
              <button key={k} onClick={() => { setMode(k); setQ(""); }} style={{
                border: "none", cursor: "pointer", padding: "6px 15px", borderRadius: "var(--radius-full)",
                fontFamily: "var(--font-sans)", fontSize: "12.5px", fontWeight: 600,
                background: on ? "var(--plum-600)" : "transparent", color: on ? "#fff" : "var(--text-muted)",
                boxShadow: on ? "var(--shadow-sm)" : "none", transition: "background var(--dur-fast) var(--ease-standard)",
              }}>{label}</button>
            );
          })}
        </div>
      </div>

      <AInput
        placeholder={mode === "school" ? "Search school, e.g. Vidyashilp Academy" : "Search area, e.g. Hebbal"}
        value={q} onChange={(e) => setQ(e.target.value)}
        leadingIcon={<AIcon name="search" size={16} />}
      />

      {q.trim() && (
        <div style={{ marginTop: "8px", background: "var(--surface-card)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", boxShadow: "var(--shadow-md)", overflow: "hidden" }}>
          {results.length === 0 ? (
            <div style={{ padding: "14px 16px", fontSize: "13px", color: "var(--text-muted)" }}>No {mode} matches “{q}”.</div>
          ) : results.map((item, i) => (
            <button key={item.id} onClick={() => mode === "school" ? onPickSchool(item) : onPickArea(item)} style={{
              display: "flex", alignItems: "center", gap: "12px", width: "100%", textAlign: "left",
              padding: "12px 16px", border: "none", borderTop: i ? "1px solid var(--border)" : "none",
              background: "transparent", cursor: "pointer", fontFamily: "var(--font-sans)",
            }}
              onMouseEnter={(e) => e.currentTarget.style.background = "var(--surface-subtle)"}
              onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}>
              <div style={{ flex: "none", width: "34px", height: "34px", borderRadius: "var(--radius-md)", background: "var(--plum-tint)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <AIcon name={mode === "school" ? "building" : "map-pin"} size={17} color="var(--plum-600)" />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: "14px", fontWeight: 700, color: "var(--text-strong)" }}>{mode === "school" ? item.name : item.name}</div>
                {mode === "school" ? (
                  <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>School · {item.area} · {window.BLR_HOMES_NEAR(item, DEF_RADIUS).length} homes within {DEF_RADIUS} km</div>
                ) : (
                  <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>Area · {regionName(item.region)} · {C.schoolsArea(item.id)} schools · {C.homesArea(item.id)} nearby homes</div>
                )}
              </div>
              <span style={{ flex: "none", display: "inline-flex", alignItems: "center", gap: "5px", fontSize: "12.5px", fontWeight: 600, color: "var(--primary)", whiteSpace: "nowrap" }}>
                {mode === "school" ? "Homes near it" : "Schools here"} <AIcon name="arrow-right" size={14} />
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------- Radius selector (3 / 5 / 10 km) ----------
function RadiusSelector({ value, onChange, school }) {
  return (
    <div style={{ marginBottom: "20px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "10px" }}>
        <AIcon name="route" size={15} color="var(--plum-600)" />
        <span style={{ fontSize: "12px", fontWeight: 700, letterSpacing: "var(--tracking-caps)", textTransform: "uppercase", color: "var(--text-muted)" }}>Search radius</span>
      </div>
      <div style={{ display: "flex", gap: "8px" }}>
        {RADII.map((km) => {
          const on = value === km;
          const n = window.BLR_HOMES_NEAR(school, km).length;
          return (
            <button key={km} onClick={() => onChange(km)} style={{
              flex: 1, border: on ? "1px solid var(--plum-500)" : "1px solid var(--border)",
              background: on ? "var(--plum-tint)" : "var(--surface-card)", color: "var(--text-strong)",
              cursor: "pointer", padding: "9px 10px", borderRadius: "var(--radius-md)",
              fontFamily: "var(--font-sans)", display: "flex", flexDirection: "column", alignItems: "center", gap: "2px",
            }}>
              <span style={{ fontSize: "13.5px", fontWeight: 700, color: on ? "var(--plum-600)" : "inherit" }}>{km} km</span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: "11px", color: "var(--text-muted)" }}>{n} {n === 1 ? "home" : "homes"}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ListingGrid({ listings, onHover, onOpen, saved, onToggleSave, distFrom }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
      {listings.map((l) => (
        <window.BLRSListingCard key={l.id} listing={l} onHover={onHover} onOpen={onOpen}
          saved={saved.includes(l.id)} onToggleSave={onToggleSave}
          distanceKm={distFrom ? window.BLR_DIST(distFrom, l) : null} />
      ))}
    </div>
  );
}

function BLRSchoolDiscovery() {
  const D = window.BLR_SCHOOL_DATA;

  const init = React.useMemo(() => {
    const p = new URLSearchParams(typeof location !== "undefined" ? location.search : "");
    const rawR = parseInt(p.get("radiusKm"), 10);
    return {
      mode: p.get("mode") === "rent" ? "Rent" : "Buy",
      region: p.get("regionId") || null,
      zone: p.get("zoneId") || null,
      area: p.get("areaId") || null,
      school: p.get("schoolId") || null,
      journey: p.get("journey2") || null,
      radius: RADII.includes(rawR) ? rawR : DEF_RADIUS,
    };
  }, []);

  const [mode, setMode] = React.useState(init.mode);
  const [selRegion, setSelRegion] = React.useState(init.region);
  const [selZone, setSelZone] = React.useState(init.zone);
  const [selArea, setSelArea] = React.useState(init.area);
  const [selSchool, setSelSchool] = React.useState(init.school);
  const [journey, setJourney] = React.useState(init.journey); // "school" | null
  const [radiusKm, setRadiusKm] = React.useState(init.radius);
  const [active, setActive] = React.useState(null);
  const [saved, setSaved] = React.useState(["h1"]);

  const toggleSave = (id) => setSaved((s) => s.includes(id) ? s.filter((x) => x !== id) : [...s, id]);
  const reset = () => { setSelRegion(null); setSelZone(null); setSelArea(null); setSelSchool(null); setJourney(null); setActive(null); };

  const pickRegion = (id) => { setSelRegion(id); setSelZone(null); setSelArea(null); setSelSchool(null); setJourney(null); setActive(null); };
  const startSchoolJourney = () => { setJourney("school"); setSelZone(null); setSelArea(null); setSelSchool(null); };
  const pickZone = (id) => { setJourney("school"); setSelZone(id); setSelArea(null); setSelSchool(null); setActive(null); };
  const pickArea = (id) => { setSelArea(id); setSelSchool(null); setRadiusKm(DEF_RADIUS); setActive(null); };
  const pickSchool = (id) => { setSelSchool(id); setRadiusKm(DEF_RADIUS); setActive(null); };
  // direct (intent search) — auto-resolve region/zone/area
  const resolveArea = (a) => { setSelRegion(a.region); setJourney("school"); setSelZone(a.zone); setSelArea(a.id); setSelSchool(null); setRadiusKm(DEF_RADIUS); };
  const resolveSchool = (s) => { setSelRegion(s.region); setJourney("school"); setSelZone(s.zone); setSelArea(s.areaId); setSelSchool(s.id); setRadiusKm(DEF_RADIUS); };
  const goAreaJourney = () => {
    const p = new URLSearchParams(); if (selRegion) p.set("regionId", selRegion); if (mode === "Rent") p.set("mode", "rent");
    location.href = "../area-discovery/index.html" + (p.toString() ? "?" + p.toString() : "");
  };

  let step = "city";
  if (selSchool) step = "school";
  else if (selArea) step = "area";
  else if (selZone) step = "zone";
  else if (selRegion && journey === "school") step = "zones";
  else if (selRegion) step = "region";

  React.useEffect(() => {
    const p = new URLSearchParams();
    p.set("journey", "school-first");
    if (mode === "Rent") p.set("mode", "rent");
    if (selRegion) p.set("regionId", selRegion);
    if (journey) p.set("journey2", journey);
    if (selZone) p.set("zoneId", selZone);
    if (selArea) p.set("areaId", selArea);
    if (selSchool) { p.set("schoolId", selSchool); p.set("radiusKm", String(radiusKm)); }
    try { history.replaceState(null, "", location.pathname + "?" + p.toString()); } catch (e) {}
  }, [mode, selRegion, selZone, selArea, selSchool, journey, radiusKm]);

  const regionObj = selRegion && D.regions.find((r) => r.id === selRegion);
  const zoneObj = selZone && D.zones.find((z) => z.id === selZone);
  const areaObj = selArea && D.areas.find((a) => a.id === selArea);
  const schoolObj = selSchool && D.schools.find((s) => s.id === selSchool);

  const regionZones = selRegion ? D.zones.filter((z) => z.region === selRegion) : [];
  const zoneAreas = selZone ? D.areas.filter((a) => a.zone === selZone) : [];
  const areaSchools = selArea ? D.schools.filter((s) => s.areaId === selArea) : [];
  const schoolHomes = selSchool ? window.BLR_HOMES_NEAR(schoolObj, radiusKm).slice().sort((a, b) => window.BLR_DIST(schoolObj, a) - window.BLR_DIST(schoolObj, b)) : [];

  // map inputs + count
  let mapListings = [];
  if (step === "school") mapListings = schoolHomes;

  let mapCount = C.totalSchools;
  if (step === "school") mapCount = schoolHomes.length;
  else if (step === "area") mapCount = C.schoolsArea(selArea);
  else if (step === "zone") mapCount = C.schoolsZone(selZone);
  else if (step === "zones" || step === "region") mapCount = C.schoolsRegion(selRegion);

  return (
    <div style={{ display: "flex", height: "calc(100vh - 60px)" }}>
      {/* ---- Map (left) ---- */}
      <div style={{ flex: "0 0 50%", position: "relative", borderRight: "1px solid var(--border)" }}>
        <window.BLRSchoolMap
          step={step} regions={D.regions} zones={D.zones} areas={D.areas} schools={D.schools} listings={mapListings}
          selectedRegion={selRegion} selectedZone={selZone} selectedArea={selArea} selectedSchool={selSchool}
          radiusKm={radiusKm} activeListing={active} totalCount={mapCount}
          onPickRegion={pickRegion} onPickZone={pickZone} onPickArea={pickArea}
          onPickSchool={(id) => { const s = D.schools.find((x) => x.id === id); if (s) resolveSchool(s); }}
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
              Homes near a school
            </h1>
            <span style={{
              display: "inline-flex", alignItems: "center", gap: "5px", padding: "3px 10px", borderRadius: "var(--radius-full)",
              background: "var(--plum-tint)", color: "var(--plum-600)", fontSize: "12px", fontWeight: 700,
            }}>
              <AIcon name="building" size={12} color="var(--plum-600)" />School-first
            </span>
          </div>
        </div>

        {/* Scroll area */}
        <div className="upt-scroll" style={{ flex: 1, overflowY: "auto", padding: "22px 28px 36px" }}>

          {/* ====== SCHOOL selected: homes within radius ====== */}
          {step === "school" ? (
            <>
              <BackLink onClick={() => setSelSchool(null)}>Back to schools in {areaObj ? areaObj.name : "area"}</BackLink>
              <HeaderBand
                eyebrow="Selected school" title={schoolObj.name}
                sub={schoolObj.address}
                crumb={["Bangalore", regionObj?.short, areaObj?.name, schoolObj.name.split(",")[0]].filter(Boolean)}
                stats={[{ value: schoolHomes.length, label: noun(mode, schoolHomes.length) }, { value: `${radiusKm} km`, label: "radius" }]}
                onBack={() => setSelSchool(null)} backLabel={`Back to schools in ${areaObj ? areaObj.name : "area"}`}
                actions={<NavyGhostBtn onClick={() => setSelSchool(null)}>Change school</NavyGhostBtn>}
              />
              <RadiusSelector value={radiusKm} onChange={setRadiusKm} school={schoolObj} />
              {schoolHomes.length === 0 ? (
                <window.BLRSEmptyState
                  icon="route" title={`No homes within ${radiusKm} km`}
                  body={`No ${mode === "Rent" ? "rentals" : "homes"} within ${radiusKm} km of ${schoolObj.name.split(",")[0]}. Try a wider radius or change the school.`}
                  actions={<>
                    {radiusKm < 10 && <AButton variant="primary" size="md" onClick={() => setRadiusKm(radiusKm === 3 ? 5 : 10)}>Try {radiusKm === 3 ? 5 : 10} km</AButton>}
                    <AButton variant="outline" size="md" onClick={() => setSelSchool(null)}>Change school</AButton>
                  </>}
                />
              ) : (
                <>
                  <SectionLabel icon="map-pin" right={
                    <span style={{ fontSize: "13px", color: "var(--text-muted)" }}>
                      <span style={{ fontFamily: "var(--font-mono)", fontWeight: 600, color: "var(--text-strong)" }}>{schoolHomes.length}</span> within {radiusKm} km
                    </span>
                  }>Homes near {schoolObj.name.split(",")[0]}</SectionLabel>
                  <ListingGrid listings={schoolHomes} onHover={setActive} onOpen={() => {}} saved={saved} onToggleSave={toggleSave} distFrom={schoolObj} />
                </>
              )}
            </>

          /* ====== AREA selected: schools in the area ====== */
          ) : step === "area" ? (
            <>
              <BackLink onClick={() => setSelArea(null)}>Back to areas in {zoneObj ? zoneObj.name : "zone"}</BackLink>
              <HeaderBand
                eyebrow="Schools in area" title={`Schools in ${areaObj.name}`}
                sub="Choose a school to see homes within 3, 5 or 10 km."
                crumb={["Bangalore", regionObj?.short, areaObj.name].filter(Boolean)}
                stats={[{ value: areaSchools.length, label: areaSchools.length === 1 ? "school" : "schools" }, { value: C.homesArea(selArea), label: "nearby homes" }]}
                onBack={() => setSelArea(null)} backLabel={`Back to ${zoneObj ? zoneObj.name : "zone"}`}
                iconBg="var(--plum-500)"
              />
              <SectionLabel icon="building" right={
                <span style={{ fontSize: "13px", color: "var(--text-muted)" }}>{areaSchools.length} {areaSchools.length === 1 ? "school" : "schools"}</span>
              }>Schools in {areaObj.name}</SectionLabel>
              {areaSchools.length === 0 ? (
                <window.BLRSEmptyState icon="building" title="No schools mapped here yet"
                  body="We haven't mapped schools for this area yet. Try a nearby area in this zone."
                  actions={<AButton variant="primary" size="md" onClick={() => setSelArea(null)}>Back to areas</AButton>} />
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                  {areaSchools.map((s) => (
                    <window.BLRSSchoolCard key={s.id} school={s} radiusKm={DEF_RADIUS} onView={pickSchool} onHover={() => {}} />
                  ))}
                </div>
              )}
            </>

          /* ====== ZONE selected: areas inside the zone ====== */
          ) : step === "zone" ? (
            <>
              <BackLink onClick={() => setSelZone(null)}>Back to school zones in {regionObj.short}</BackLink>
              <HeaderBand
                eyebrow="School zone" title={zoneObj.name} sub={zoneObj.blurb}
                crumb={["Bangalore", regionObj.short, "Search near school"]}
                stats={[{ value: C.schoolsZone(selZone), label: "schools" }, { value: C.homesZone(selZone), label: "nearby homes" }]}
                onBack={() => setSelZone(null)} backLabel={`Back to ${regionObj.short}`}
              />
              <SectionLabel icon="map-pin" right={
                <span style={{ fontSize: "13px", color: "var(--text-muted)" }}>{zoneAreas.length} {zoneAreas.length === 1 ? "area" : "areas"}</span>
              }>Areas in {zoneObj.name}</SectionLabel>
              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                {zoneAreas.map((a) => (
                  <window.BLRSAreaCard key={a.id} area={a} onView={pickArea} />
                ))}
              </div>
            </>

          /* ====== SEARCH NEAR SCHOOL (zones): intent control + zone cards ====== */
          ) : step === "zones" ? (
            <>
              <BackLink onClick={() => setJourney(null)}>Back to {regionObj.short} overview</BackLink>
              <HeaderBand
                eyebrow="Search near school" title={`School zones in ${regionObj.short}`}
                sub="Search a school or an area directly, or pick a zone below."
                crumb={["Bangalore", regionObj.short, "Search near school"]}
                stats={[{ value: C.schoolsRegion(selRegion), label: "schools" }, { value: C.homesRegion(selRegion), label: "nearby homes" }]}
                onBack={() => setJourney(null)} backLabel={`Back to ${regionObj.short}`}
              />
              <IntentSearch onPickSchool={resolveSchool} onPickArea={resolveArea} />
              <SectionLabel icon="layers" right={
                <span style={{ fontSize: "13px", color: "var(--text-muted)" }}>{regionZones.length} zones</span>
              }>School zones</SectionLabel>
              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                {regionZones.map((z) => (
                  <window.BLRSZoneCard key={z.id} zone={z} onView={pickZone} />
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
                stats={[{ value: C.schoolsRegion(selRegion), label: "schools" }, { value: C.homesRegion(selRegion), label: "nearby homes" }]}
                actions={<NavyGhostBtn onClick={reset}>Change region</NavyGhostBtn>}
              />
              <SectionLabel icon="route">Continue in {regionObj.short} Bangalore</SectionLabel>
              <div style={{ display: "flex", flexDirection: "column", gap: "11px" }}>
                <window.BLRSJourneyOption icon="building" accent title="Search near a school"
                  body={`Browse ${regionZones.length} school zones, or search a school or area directly.`} cta="Start"
                  onClick={startSchoolJourney} />
                <window.BLRSJourneyOption icon="map-pin" title="Search by area"
                  body="Prefer to start from a neighbourhood? Open the area journey." cta="Open"
                  onClick={goAreaJourney} />
              </div>
            </>

          /* ====== CITY landing: regions + journeys ====== */
          ) : (
            <>
              <div style={{ background: "var(--surface-card)", border: "1px solid var(--border)", borderRadius: "var(--radius-xl)", padding: "20px 22px", marginBottom: "24px", boxShadow: "var(--shadow-sm)" }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: "14px" }}>
                  <div style={{ flex: "none", width: "44px", height: "44px", borderRadius: "var(--radius-md)", background: "var(--plum-tint)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <AIcon name="building" size={21} color="var(--plum-600)" />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <h2 style={{ margin: 0, fontFamily: "var(--font-serif)", fontSize: "20px", fontWeight: 600, letterSpacing: "-0.01em", color: "var(--text-strong)", lineHeight: 1.2 }}>Start with a school in Bangalore</h2>
                    <p style={{ margin: "7px 0 0", fontSize: "13.5px", lineHeight: 1.5, color: "var(--text-body)", textWrap: "pretty" }}>
                      Pick a region, then a school zone, an area and a school — homes filter to a radius around it.
                    </p>
                  </div>
                </div>
                <div style={{ display: "flex", gap: "26px", marginTop: "16px", paddingTop: "15px", borderTop: "1px solid var(--border)" }}>
                  {[[D.regions.length, "regions"], [C.totalSchools, "schools"], [C.totalHomes, "homes"]].map(([v, l]) => (
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
                  <window.BLRSRegionCard key={r.id} region={r} onView={pickRegion} />
                ))}
              </div>

              <div style={{ height: "1px", background: "var(--border)", margin: "28px 0" }} />
              <SectionLabel icon="route">Or start with a journey</SectionLabel>
              <div style={{ display: "flex", flexDirection: "column", gap: "11px" }}>
                <window.BLRSJourneyOption icon="building" accent title="Search near a school"
                  body="Region → zone → area → school → homes in radius." cta="Start"
                  onClick={() => pickRegion("north")} />
                <window.BLRSJourneyOption icon="map-pin" title="Search by area"
                  body="Prefer a neighbourhood-first search? Open the area journey." cta="Open"
                  onClick={goAreaJourney} />
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

window.BLRSchoolDiscovery = BLRSchoolDiscovery;
