// Udupi school-first discovery — main app. Exports window.UPTSchoolDiscovery
//
// Journey:  Landing → Zone (areas inside it) → Area (schools + homes) → School (radius-filtered homes)
// The intermediary "areas inside the zone" step is the heart of this redesign:
// selecting a zone NEVER jumps straight to property listings. Agricultural land is
// excluded throughout (UPT_HOME_LISTINGS). Distances are real (UPT_DIST haversine).
const { Icon: AIcon, Button: AButton, Badge: ABadge, Input: AInput } = window.ReTrendsDesignSystem_f37966;

const RADIUS_OPTS = [5, 10]; // km options; plus an "area" (area-wide) choice
const COLLAPSED_SCHOOLS = 4;  // schools shown before "Show all"

// Buy/Rent-aware noun for counts.
function homesNoun(mode, n) {
  if (mode === "Rent") return n === 1 ? "rental" : "rentals";
  return n === 1 ? "home for sale" : "homes for sale";
}
function homesTitle(mode) { return mode === "Rent" ? "Rentals" : "Homes for sale"; }

// ---- school filter taxonomy (selected-area page) ----
const BOARDS = ["CBSE", "ICSE", "State", "International"];
const LEVELS = ["Primary", "Secondary", "Higher Secondary"];

function schoolMatches(s, q, boards, levels) {
  if (q) {
    const t = q.toLowerCase();
    if (!(s.name.toLowerCase().includes(t) || (s.type || "").toLowerCase().includes(t) || (s.address || "").toLowerCase().includes(t))) return false;
  }
  if (boards.length && !boards.includes(s.board)) return false;
  if (levels.length && !((s.levels || []).some((l) => levels.includes(l)))) return false;
  return true;
}

// Single pill chip — default / hover / selected / disabled
function FilterChip({ label, count, on, disabled, onClick }) {
  const [hover, setHover] = React.useState(false);
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{
        display: "inline-flex", alignItems: "center", gap: "7px",
        padding: "8px 15px", borderRadius: "var(--radius-full)",
        border: on ? "1px solid var(--plum-500)" : "1px solid var(--border)",
        background: on ? "var(--plum-tint)" : (hover && !disabled ? "var(--surface-subtle)" : "var(--surface-card)"),
        color: disabled ? "var(--grey-400)" : (on ? "var(--plum-600)" : "var(--text-body)"),
        fontFamily: "var(--font-sans)", fontSize: "13.5px", fontWeight: 600,
        cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.5 : 1,
        boxShadow: on ? "var(--shadow-xs)" : "none", whiteSpace: "nowrap",
        transition: "box-shadow var(--dur-fast) var(--ease-standard)",
      }}
    >
      {label}
      {count != null && (
        <span style={{ fontFamily: "var(--font-mono)", fontSize: "11px", fontWeight: 600, color: on ? "var(--plum-500)" : "var(--text-muted)" }}>{count}</span>
      )}
    </button>
  );
}

function ChipGroup({ label, children }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "9px" }}>
      <span style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "var(--tracking-caps)", textTransform: "uppercase", color: "var(--text-muted)" }}>{label}</span>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "9px" }}>{children}</div>
    </div>
  );
}

// Grouped Board + Level chips for the selected-area school list
function SchoolFilters({ schools, query, boards, levels, onToggleBoard, onToggleLevel, onClear }) {
  const active = boards.length || levels.length;
  // availability/count for each chip given the OTHER active filters + search
  const boardCount = (b) => schools.filter((s) => schoolMatches(s, query, [b], levels)).length;
  const levelCount = (l) => schools.filter((s) => schoolMatches(s, query, boards, [l])).length;
  return (
    <div style={{
      background: "var(--surface-subtle)", border: "1px solid var(--border)",
      borderRadius: "var(--radius-lg)", padding: "16px 18px", marginBottom: "16px",
      display: "flex", flexDirection: "column", gap: "16px",
    }}>
      <ChipGroup label="Board">
        {BOARDS.map((b) => {
          const c = boardCount(b);
          return <FilterChip key={b} label={b} count={c} on={boards.includes(b)} disabled={c === 0 && !boards.includes(b)} onClick={() => onToggleBoard(b)} />;
        })}
      </ChipGroup>
      <ChipGroup label="Level">
        {LEVELS.map((l) => {
          const c = levelCount(l);
          return <FilterChip key={l} label={l} count={c} on={levels.includes(l)} disabled={c === 0 && !levels.includes(l)} onClick={() => onToggleLevel(l)} />;
        })}
      </ChipGroup>
      {active ? (
        <button onClick={onClear} style={{
          alignSelf: "flex-start", display: "inline-flex", alignItems: "center", gap: "6px", border: "none", background: "transparent",
          color: "var(--text-muted)", cursor: "pointer", fontFamily: "var(--font-sans)", fontSize: "12.5px", fontWeight: 600, padding: 0,
        }}>Clear filters <AIcon name="x" size={14} /></button>
      ) : null}
    </div>
  );
}

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

// ---------- "How school search works" guidance ----------
function HowItWorks() {
  const steps = [
    { title: "Choose an area", body: "Pick a neighbourhood inside this zone." },
    { title: "Pick a school", body: "Browse the schools in that area." },
    { title: "Set a radius", body: "See homes within 5 or 10 km of it." },
  ];
  return (
    <div style={{
      background: "var(--plum-tint)", border: "1px solid var(--plum-100)",
      borderRadius: "var(--radius-lg)", padding: "16px 18px", marginBottom: "22px",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "13px" }}>
        <AIcon name="route" size={15} color="var(--plum-600)" />
        <span style={{ fontSize: "12px", fontWeight: 700, letterSpacing: "var(--tracking-caps)", textTransform: "uppercase", color: "var(--plum-600)" }}>How school search works</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "14px" }}>
        {steps.map((s, i) => (
          <div key={s.title} style={{ display: "flex", flexDirection: "column", gap: "7px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <div style={{
                flex: "none", width: "26px", height: "26px", borderRadius: "var(--radius-full)", background: "var(--paper)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontFamily: "var(--font-mono)", fontSize: "12px", fontWeight: 700, color: "var(--plum-600)", boxShadow: "var(--shadow-xs)",
              }}>{i + 1}</div>
              <span style={{ fontSize: "13.5px", fontWeight: 700, color: "var(--text-strong)" }}>{s.title}</span>
            </div>
            <p style={{ margin: 0, fontSize: "12.5px", lineHeight: 1.45, color: "var(--text-body)", textWrap: "pretty" }}>{s.body}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------- Zone summary card (light, premium — the intermediary header) ----------
function ZoneSummaryCard({ zone, areaCount, schoolCount, listingCount, mode, onViewAll }) {
  return (
    <div style={{
      background: "var(--surface-card)", border: "1px solid var(--border)",
      borderRadius: "var(--radius-xl)", padding: "22px", marginBottom: "24px", boxShadow: "var(--shadow-sm)",
    }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: "15px" }}>
        <div style={{
          flex: "none", width: "48px", height: "48px", borderRadius: "var(--radius-md)",
          background: "var(--accent-tint)", display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <AIcon name="layers" size={23} color="var(--copper-600)" />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "9px", flexWrap: "wrap", marginBottom: "3px" }}>
            <h2 style={{ margin: 0, fontFamily: "var(--font-serif)", fontSize: "24px", fontWeight: 600, letterSpacing: "-0.01em", color: "var(--text-strong)", lineHeight: 1.15 }}>{zone.name}</h2>
            <ABadge tone="neutral" pill>{zone.subtitle}</ABadge>
          </div>
          <p style={{ margin: "8px 0 0", fontSize: "14px", lineHeight: 1.55, color: "var(--text-body)", textWrap: "pretty" }}>{zone.blurb}</p>
        </div>
      </div>
      <div style={{ display: "flex", gap: "26px", marginTop: "18px", paddingTop: "16px", borderTop: "1px solid var(--border)" }}>
        {[["areas", areaCount], ["schools", schoolCount], [homesNoun(mode, listingCount), listingCount]].map(([label, val]) => (
          <div key={label}>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: "22px", fontWeight: 600, color: "var(--text-strong)" }}>{val}</div>
            <div style={{ fontSize: "12.5px", color: "var(--text-muted)" }}>{label}</div>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", marginTop: "16px", padding: "11px 13px", background: "var(--surface-subtle)", borderRadius: "var(--radius-md)" }}>
        <span style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", color: "var(--text-body)" }}>
          <AIcon name="route" size={15} color="var(--text-muted)" />Choose an area to see nearby schools and homes.
        </span>
      </div>
      {/* Secondary escape hatch — areas stay the primary path */}
      <button onClick={onViewAll} style={{
        display: "inline-flex", alignItems: "center", gap: "6px", marginTop: "12px", border: "none", background: "transparent",
        color: "var(--primary)", cursor: "pointer", fontFamily: "var(--font-sans)", fontSize: "13px", fontWeight: 600, padding: 0,
      }}>View all {listingCount} {homesNoun(mode, listingCount)} in {zone.name} <AIcon name="arrow-right" size={14} /></button>
    </div>
  );
}

// ---------- Radius selector (segmented) ----------
function RadiusSelector({ value, onChange, counts, hasCoords }) {
  const opts = [
    { k: 5, label: "5 km", n: counts[5] },
    { k: 10, label: "10 km", n: counts[10] },
    { k: "area", label: "All in area", n: counts.area },
  ];
  return (
    <div style={{ marginBottom: "22px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "10px" }}>
        <AIcon name="route" size={15} color="var(--plum-600)" />
        <span style={{ fontSize: "12px", fontWeight: 700, letterSpacing: "var(--tracking-caps)", textTransform: "uppercase", color: "var(--text-muted)" }}>Search radius</span>
      </div>
      <div style={{ display: "flex", gap: "8px" }}>
        {opts.map((o) => {
          const on = value === o.k;
          const disabled = o.k !== "area" && !hasCoords;
          return (
            <button key={o.k} disabled={disabled} onClick={() => onChange(o.k)} style={{
              flex: 1, border: on ? "1px solid var(--plum-500)" : "1px solid var(--border)",
              background: on ? "var(--plum-tint)" : "var(--surface-card)",
              color: disabled ? "var(--grey-400)" : "var(--text-strong)",
              cursor: disabled ? "not-allowed" : "pointer", padding: "9px 10px", borderRadius: "var(--radius-md)",
              fontFamily: "var(--font-sans)", display: "flex", flexDirection: "column", alignItems: "center", gap: "2px",
              transition: "box-shadow var(--dur-fast) var(--ease-standard)", opacity: disabled ? 0.6 : 1,
            }}>
              <span style={{ fontSize: "13.5px", fontWeight: 700, color: on ? "var(--plum-600)" : "inherit" }}>{o.label}</span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: "11px", color: "var(--text-muted)" }}>{o.n} {o.n === 1 ? "home" : "homes"}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ---------- Selected summary band (navy) — for AREA and SCHOOL states ----------
function SelectedSummary({ kind, item, breadcrumb, count, mode, onBack, backLabel }) {
  const isSchool = kind === "school";
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
          background: isSchool ? "var(--plum-500)" : "rgba(255,255,255,0.12)", display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <AIcon name={isSchool ? "building" : "map-pin"} size={22} color="#fff" />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px", flexWrap: "wrap" }}>
            <span style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "var(--tracking-caps)", textTransform: "uppercase", color: "rgba(255,255,255,0.6)" }}>
              {isSchool ? "Selected school" : "Selected area"}
            </span>
            {isSchool && item.type && <ABadge tone="accent" pill>{item.type}</ABadge>}
          </div>
          <h2 style={{ margin: 0, fontFamily: "var(--font-serif)", fontSize: "22px", fontWeight: 600, letterSpacing: "-0.01em", lineHeight: 1.2 }}>{item.name}</h2>
          <div style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: "7px", fontSize: "13px", color: "rgba(255,255,255,0.7)", textWrap: "pretty" }}>
            <AIcon name="map-pin" size={13} color="rgba(255,255,255,0.6)" />
            {isSchool ? item.address : item.blurb}
          </div>
        </div>
      </div>
      <div style={{ display: "flex", gap: "26px", marginTop: "18px", paddingTop: "16px", borderTop: "1px solid rgba(255,255,255,0.14)" }}>
        <div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: "22px", fontWeight: 600 }}>{count}</div>
          <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.6)" }}>{homesNoun(mode, count)}</div>
        </div>
        {!isSchool && (
          <div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: "22px", fontWeight: 600 }}>{item.schools}</div>
            <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.6)" }}>schools</div>
          </div>
        )}
      </div>
    </div>
  );
}

function ListingGrid({ listings, onHover, onOpen, saved, onToggleSave, distFrom }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
      {listings.map((l) => (
        <window.UPTListingCard key={l.id} listing={l} onHover={onHover} onOpen={onOpen}
          saved={saved.includes(l.id)} onToggleSave={onToggleSave}
          distanceKm={distFrom ? window.UPT_DIST(distFrom, l) : null} />
      ))}
    </div>
  );
}

function ZeroHomesNotice({ areaName, onBrowse }) {
  return (
    <div style={{
      display: "flex", alignItems: "flex-start", gap: "12px", padding: "16px 18px",
      background: "var(--surface-subtle)", border: "1px dashed var(--border-strong)", borderRadius: "var(--radius-lg)",
    }}>
      <div style={{ flex: "none", width: "34px", height: "34px", borderRadius: "var(--radius-full)", background: "var(--paper)", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "var(--shadow-xs)" }}>
        <AIcon name="map-pin" size={17} color="var(--grey-500)" />
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: "14px", fontWeight: 700, color: "var(--text-strong)", marginBottom: "3px" }}>No homes listed in {areaName} yet</div>
        <p style={{ margin: "0 0 10px", fontSize: "13px", lineHeight: 1.5, color: "var(--text-muted)", textWrap: "pretty" }}>
          This is still a valid school area — pick a school above to set an alert, or browse homes in nearby Manipal.
        </p>
        <AButton variant="outline" size="sm" onClick={onBrowse}>Explore Manipal instead</AButton>
      </div>
    </div>
  );
}

// Inline empty/fallback block (radius has no homes, or no coordinates)
function RadiusFallback({ icon, title, body, actions }) {
  return (
    <div style={{
      textAlign: "center", padding: "30px 24px", background: "var(--surface-card)",
      border: "1px dashed var(--border-strong)", borderRadius: "var(--radius-xl)",
    }}>
      <div style={{ width: "50px", height: "50px", borderRadius: "var(--radius-full)", background: "var(--plum-tint)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px" }}>
        <AIcon name={icon} size={23} color="var(--plum-600)" />
      </div>
      <h3 style={{ margin: "0 0 7px", fontFamily: "var(--font-serif)", fontSize: "19px", fontWeight: 600, color: "var(--text-strong)" }}>{title}</h3>
      <p style={{ margin: "0 auto 18px", maxWidth: "340px", fontSize: "13.5px", lineHeight: 1.5, color: "var(--text-muted)", textWrap: "pretty" }}>{body}</p>
      <div style={{ display: "flex", gap: "10px", justifyContent: "center", flexWrap: "wrap" }}>{actions}</div>
    </div>
  );
}

function UPTSchoolDiscovery() {
  const D = window.UPT_DATA;
  const HOMES = window.UPT_HOME_LISTINGS(D.listings); // agri excluded everywhere

  // ---- initial state from URL (shared links restore the view) ----
  const init = React.useMemo(() => {
    const p = new URLSearchParams(typeof location !== "undefined" ? location.search : "");
    const rawR = p.get("radiusKm");
    const radius = rawR === "area" ? "area" : (rawR === "10" ? 10 : 5);
    return {
      mode: p.get("mode") === "rent" ? "Rent" : "Buy",
      zone: p.get("groupId") || "university-belt",
      area: p.get("areaId") || null,
      school: p.get("schoolId") || null,
      radius, view: p.get("view") || null,
    };
  }, []);

  const [mode, setMode] = React.useState(init.mode);
  const [query, setQuery] = React.useState("");
  const [selZone, setSelZone] = React.useState(init.zone);
  const [selArea, setSelArea] = React.useState(init.area);
  const [selSchool, setSelSchool] = React.useState(init.school);
  const [radiusKm, setRadiusKm] = React.useState(init.radius);
  const [zoneHomes, setZoneHomes] = React.useState(init.view === "homes");
  const [active, setActive] = React.useState(null);
  const [saved, setSaved] = React.useState(["l1"]);
  // area-page school search / filters / collapse
  const [schoolQuery, setSchoolQuery] = React.useState("");
  const [showAllSchools, setShowAllSchools] = React.useState(false);
  const [boardFilter, setBoardFilter] = React.useState([]);
  const [levelFilter, setLevelFilter] = React.useState([]);

  const toggleSave = (id) => setSaved((s) => s.includes(id) ? s.filter((x) => x !== id) : [...s, id]);
  const reset = () => { setSelZone(null); setSelArea(null); setSelSchool(null); setZoneHomes(false); setActive(null); setQuery(""); };
  const pickSchool = (id) => { setSelSchool(id); setRadiusKm(5); setActive(null); };
  const pickArea = (id) => { setSelSchool(null); setSelArea(id); setZoneHomes(false); setActive(null); setSchoolQuery(""); setShowAllSchools(false); setBoardFilter([]); setLevelFilter([]); };
  const toggleBoard = (b) => setBoardFilter((f) => f.includes(b) ? f.filter((x) => x !== b) : [...f, b]);
  const toggleLevel = (l) => setLevelFilter((f) => f.includes(l) ? f.filter((x) => x !== l) : [...f, l]);
  const clearSchoolFilters = () => { setBoardFilter([]); setLevelFilter([]); };

  // reflect state in the URL
  React.useEffect(() => {
    const p = new URLSearchParams();
    p.set("journey", "school-first");
    if (mode === "Rent") p.set("mode", "rent");
    if (selZone) p.set("groupId", selZone);
    if (selArea) p.set("areaId", selArea);
    if (selSchool) { p.set("schoolId", selSchool); p.set("radiusKm", String(radiusKm)); }
    if (zoneHomes && !selArea && !selSchool) p.set("view", "homes");
    try { history.replaceState(null, "", location.pathname + "?" + p.toString()); } catch (e) {}
  }, [mode, selZone, selArea, selSchool, radiusKm, zoneHomes]);

  const zoneObj = selZone && D.zones.find((z) => z.id === selZone);
  const areaObj = selArea && D.areas.find((a) => a.id === selArea);
  const schoolObj = selSchool && D.schools.find((s) => s.id === selSchool);

  const zoneAreas = selZone ? D.areas.filter((a) => a.zone === selZone) : [];
  const zoneHomeList = selZone ? HOMES.filter((l) => l.zone === selZone) : [];
  const areaSchools = selArea ? D.schools.filter((s) => s.areaId === selArea) : [];
  const areaListings = selArea ? HOMES.filter((l) => l.areaId === selArea) : [];

  // ----- school radius math (all real, from coordinates) -----
  const schoolHasCoords = schoolObj && schoolObj.lat != null && schoolObj.lon != null;
  const schoolDistRows = schoolHasCoords
    ? HOMES.map((l) => ({ l, d: window.UPT_DIST(schoolObj, l) })).filter((x) => x.d != null)
    : [];
  const areaHomesForSchool = schoolObj ? HOMES.filter((l) => l.areaId === schoolObj.areaId) : [];
  const radiusCounts = {
    5: schoolDistRows.filter((x) => x.d <= 5).length,
    10: schoolDistRows.filter((x) => x.d <= 10).length,
    area: areaHomesForSchool.length,
  };
  let schoolListings = [];
  if (selSchool) {
    if (radiusKm === "area") schoolListings = areaHomesForSchool.slice();
    else schoolListings = schoolDistRows.filter((x) => x.d <= radiusKm).sort((a, b) => a.d - b.d).map((x) => x.l);
  }

  // what the map renders
  let mapListings = [];
  if (selSchool) mapListings = schoolListings;
  else if (selArea) mapListings = areaListings;
  else if (selZone && zoneHomes) mapListings = zoneHomeList;

  const filteredSchools = D.schools.filter((s) =>
    !query || s.name.toLowerCase().includes(query.toLowerCase()) || s.area.toLowerCase().includes(query.toLowerCase()));

  // area-page school list (search + board/level chips + collapse)
  const matchedAreaSchools = areaSchools.filter((s) => schoolMatches(s, schoolQuery, boardFilter, levelFilter));
  const schoolFiltersActive = !!schoolQuery || boardFilter.length > 0 || levelFilter.length > 0;
  const shownAreaSchools = (showAllSchools || schoolFiltersActive) ? matchedAreaSchools : matchedAreaSchools.slice(0, COLLAPSED_SCHOOLS);

  return (
    <div style={{ display: "flex", height: "calc(100vh - 60px)" }}>
      {/* ---- Map (left) — balanced 50/50 with the panel ---- */}
      <div style={{ flex: "0 0 50%", position: "relative", borderRight: "1px solid var(--border)" }}>
        <window.UPTMap
          schools={D.schools} zones={D.zones} areas={D.areas} listings={mapListings}
          selectedSchool={selSchool} selectedZone={selZone} selectedArea={selArea}
          activeListing={active} radiusKm={radiusKm} showZoneHomes={zoneHomes && !selArea && !selSchool}
          onPickSchool={(id) => pickSchool(id)}
          onPickArea={(id) => pickArea(id)}
          onPickZone={(id) => { setSelSchool(null); setSelArea(null); setZoneHomes(false); setSelZone(id); }}
        />
      </div>

      {/* ---- Panel (right) ---- */}
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", background: "var(--background)" }}>
        {/* Journey header (sticky) */}
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
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <h1 style={{ margin: 0, fontFamily: "var(--font-serif)", fontSize: "24px", fontWeight: 600, letterSpacing: "-0.02em", color: "var(--text-strong)" }}>
              Find homes near a school
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

          {/* ============ STATE D: SCHOOL SELECTED (radius-filtered homes) ============ */}
          {selSchool ? (
            <>
              <BackLink onClick={() => setSelSchool(null)}>Back to {areaObj ? areaObj.name : "area"}</BackLink>
              <SelectedSummary
                kind="school" item={schoolObj}
                breadcrumb={[zoneObj?.name, areaObj?.name, schoolObj.name].filter(Boolean)}
                count={schoolListings.length} mode={mode}
                onBack={() => setSelSchool(null)} backLabel="Change school"
              />

              {!schoolHasCoords ? (
                /* Empty state: missing coordinates → cannot compute radius */
                <RadiusFallback
                  icon="map-pin" title="Distance filtering unavailable"
                  body={`We don't have exact map coordinates for ${schoolObj.name} yet, so we can't filter homes by distance. You can still browse all homes in ${areaObj ? areaObj.name : "this area"}.`}
                  actions={<>
                    <AButton variant="primary" size="md" onClick={() => { setSelSchool(null); }}>View homes in {areaObj ? areaObj.name : "area"}</AButton>
                    <AButton variant="ghost" size="md" onClick={reset}>Start over</AButton>
                  </>}
                />
              ) : (
                <>
                  <RadiusSelector value={radiusKm} onChange={setRadiusKm} counts={radiusCounts} hasCoords={schoolHasCoords} />

                  {schoolListings.length === 0 ? (
                    /* Empty state: no homes within the chosen radius */
                    <RadiusFallback
                      icon="route"
                      title={radiusKm === "area" ? "No homes in this area yet" : `No homes within ${radiusKm} km`}
                      body={radiusKm === 5
                        ? `No homes within 5 km of ${schoolObj.name}. Try 10 km${radiusCounts[10] ? ` (${radiusCounts[10]} ${homesNoun(mode, radiusCounts[10])})` : ""}, or view all homes in ${areaObj ? areaObj.name : "the area"}.`
                        : `No ${mode === "Rent" ? "rentals" : "homes for sale"} within ${radiusKm === "area" ? areaObj?.name : radiusKm + " km"} right now. Try a wider radius or a different school.`}
                      actions={<>
                        {radiusKm === 5 && radiusCounts[10] > 0 && <AButton variant="primary" size="md" onClick={() => setRadiusKm(10)}>Try 10 km</AButton>}
                        {radiusCounts.area > 0 && <AButton variant="outline" size="md" onClick={() => setRadiusKm("area")}>View all in {areaObj?.name}</AButton>}
                        <AButton variant="ghost" size="md" onClick={() => setSelSchool(null)}>Change school</AButton>
                      </>}
                    />
                  ) : (
                    <>
                      <SectionLabel icon="map-pin" right={
                        <span style={{ fontSize: "13px", color: "var(--text-muted)" }}>
                          <span style={{ fontFamily: "var(--font-mono)", fontWeight: 600, color: "var(--text-strong)" }}>{schoolListings.length}</span>
                          {radiusKm === "area" ? ` in ${areaObj?.name}` : ` within ${radiusKm} km`}
                        </span>
                      }>{homesTitle(mode)} near this school</SectionLabel>
                      <ListingGrid listings={schoolListings} onHover={setActive} onOpen={() => {}} saved={saved} onToggleSave={toggleSave} distFrom={schoolObj} />
                    </>
                  )}

                  {/* quick change-school */}
                  {areaSchools.length > 1 && (
                    <div style={{ marginTop: "30px" }}>
                      <SectionLabel icon="building">Change school in {areaObj?.name}</SectionLabel>
                      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                        {areaSchools.filter((s) => s.id !== selSchool).map((s) => (
                          <window.UPTSchoolCard key={s.id} school={s} onView={(id) => pickSchool(id)} />
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </>

          /* ============ STATE C: AREA SELECTED (schools + homes) ============ */
          ) : selArea ? (
            <>
              <BackLink onClick={() => setSelArea(null)}>Back to {zoneObj ? zoneObj.name : "zone"}</BackLink>
              <SelectedSummary
                kind="area" item={areaObj}
                breadcrumb={[zoneObj?.name, areaObj.name].filter(Boolean)}
                count={areaListings.length} mode={mode}
                onBack={() => setSelArea(null)} backLabel={`Back to ${zoneObj ? zoneObj.name : "zone"}`}
              />
              {/* School selection: search + grouped filter chips + list */}
              <SectionLabel icon="building" right={
                <span style={{ fontSize: "13px", color: "var(--text-muted)" }}>
                  showing <span style={{ fontFamily: "var(--font-mono)", fontWeight: 600, color: "var(--text-strong)" }}>{matchedAreaSchools.length}</span> of {areaSchools.length} schools
                </span>
              }>Find a school in {areaObj.name}</SectionLabel>
              <p style={{ margin: "-6px 0 14px", fontSize: "13px", color: "var(--text-muted)", lineHeight: 1.5 }}>
                Narrow by board or level, then pick a school to filter homes within 5–10 km of it.
              </p>
              <div style={{ marginBottom: "14px" }}>
                <AInput placeholder={`Search school name…`} value={schoolQuery}
                  onChange={(e) => setSchoolQuery(e.target.value)} leadingIcon={<AIcon name="search" size={16} />} />
              </div>
              <SchoolFilters
                schools={areaSchools} query={schoolQuery} boards={boardFilter} levels={levelFilter}
                onToggleBoard={toggleBoard} onToggleLevel={toggleLevel} onClear={clearSchoolFilters}
              />
              {matchedAreaSchools.length === 0 ? (
                <RadiusFallback
                  icon="building" title="No schools match these filters"
                  body="Try a different board or level, or clear the filters to see every school in this area."
                  actions={<>
                    <AButton variant="primary" size="md" onClick={() => { clearSchoolFilters(); setSchoolQuery(""); }}>Clear filters</AButton>
                  </>}
                />
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                  {shownAreaSchools.map((s) => (
                    <window.UPTSchoolCard key={s.id} school={s} onView={(id) => pickSchool(id)} onHover={() => {}} />
                  ))}
                </div>
              )}
              {!schoolFiltersActive && matchedAreaSchools.length > COLLAPSED_SCHOOLS && (
                <button onClick={() => setShowAllSchools((v) => !v)} style={{
                  display: "inline-flex", alignItems: "center", gap: "6px", marginTop: "12px", border: "none", background: "transparent",
                  color: "var(--primary)", cursor: "pointer", fontFamily: "var(--font-sans)", fontSize: "13px", fontWeight: 600, padding: 0,
                }}>
                  {showAllSchools ? "Show fewer schools" : `Show all ${matchedAreaSchools.length} schools`}
                  <AIcon name="chevron-down" size={15} style={{ transform: showAllSchools ? "rotate(180deg)" : "none" }} />
                </button>
              )}

              {/* Homes in area, or zero-listing notice */}
              <div style={{ marginTop: "30px" }}>
                <SectionLabel icon="map-pin" right={
                  <span style={{ fontSize: "13px", color: "var(--text-muted)" }}>
                    <span style={{ fontFamily: "var(--font-mono)", fontWeight: 600, color: "var(--text-strong)" }}>{areaListings.length}</span> available
                  </span>
                }>{homesTitle(mode)} in {areaObj.name}</SectionLabel>
                {areaListings.length === 0 ? (
                  <ZeroHomesNotice areaName={areaObj.name} onBrowse={() => pickArea("manipal")} />
                ) : (
                  <ListingGrid listings={areaListings} onHover={setActive} onOpen={() => {}} saved={saved} onToggleSave={toggleSave} />
                )}
              </div>
            </>

          /* ============ STATE B2: VIEW ALL HOMES IN ZONE (secondary path) ============ */
          ) : (selZone && zoneHomes) ? (
            <>
              <BackLink onClick={() => setZoneHomes(false)}>Back to areas in {zoneObj.name}</BackLink>
              <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "8px" }}>
                <h2 style={{ margin: 0, fontFamily: "var(--font-serif)", fontSize: "22px", fontWeight: 600, letterSpacing: "-0.01em", color: "var(--text-strong)" }}>All homes in {zoneObj.name}</h2>
                <ABadge tone="neutral" pill>Whole zone</ABadge>
              </div>
              <p style={{ margin: "0 0 18px", fontSize: "13.5px", color: "var(--text-muted)", lineHeight: 1.5, textWrap: "pretty" }}>
                For school-first search, pick an area and a school instead — homes then filter to a radius around it.
              </p>
              <SectionLabel icon="map-pin" right={
                <span style={{ fontSize: "13px", color: "var(--text-muted)" }}>
                  <span style={{ fontFamily: "var(--font-mono)", fontWeight: 600, color: "var(--text-strong)" }}>{zoneHomeList.length}</span> {homesNoun(mode, zoneHomeList.length)}
                </span>
              }>{homesTitle(mode)} across {zoneObj.name}</SectionLabel>
              <ListingGrid listings={zoneHomeList} onHover={setActive} onOpen={() => {}} saved={saved} onToggleSave={toggleSave} />
            </>

          /* ============ STATE B: ZONE SELECTED — AREAS INSIDE (the deliverable) ============ */
          ) : selZone ? (
            <>
              <BackLink onClick={reset}>Back to all school zones</BackLink>
              <HowItWorks />
              <ZoneSummaryCard
                zone={zoneObj} mode={mode} areaCount={zoneAreas.length}
                schoolCount={zoneAreas.reduce((n, a) => n + a.schools, 0)}
                listingCount={zoneHomeList.length}
                onViewAll={() => setZoneHomes(true)}
              />
              <SectionLabel icon="map-pin" right={
                <span style={{ fontSize: "13px", color: "var(--text-muted)" }}>{zoneAreas.length} areas</span>
              }>Areas inside {zoneObj.name}</SectionLabel>
              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                {zoneAreas.map((a) => (
                  <window.UPTAreaCard key={a.id} area={a} onView={(id) => pickArea(id)} />
                ))}
              </div>
            </>

          /* ============ STATE A: LANDING ============ */
          ) : (
            <>
              <div style={{ marginBottom: "26px" }}>
                <AInput
                  placeholder="Search school name…" value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  leadingIcon={<AIcon name="search" size={17} />} size="lg"
                />
              </div>
              <SectionLabel icon="star" right={
                <span style={{ fontSize: "13px", color: "var(--text-muted)" }}>{filteredSchools.length} of {D.schools.length}</span>
              }>Popular schools</SectionLabel>
              {filteredSchools.length === 0 ? (
                <window.UPTEmptyState
                  title="No schools match that search"
                  body={`We couldn't find a school for "${query}". Check the spelling, or browse by zone below.`}
                  onTryAnother={() => setQuery("")} onClear={() => setQuery("")} onStartOver={reset}
                />
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                  {filteredSchools.map((s) => (
                    <window.UPTSchoolCard key={s.id} school={s} onView={(id) => {
                      const sc = D.schools.find((x) => x.id === id);
                      setSelZone(sc.zone); setSelArea(sc.areaId); pickSchool(id);
                    }} onHover={() => {}} />
                  ))}
                </div>
              )}
              <div style={{ height: "1px", background: "var(--border)", margin: "30px 0" }} />
              <SectionLabel icon="layers">Browse schools by zone</SectionLabel>
              <p style={{ margin: "-6px 0 16px", fontSize: "13.5px", color: "var(--text-muted)", lineHeight: 1.5 }}>
                Not sure which school? Start with a zone and we'll show its areas, then schools and homes.
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                {D.zones.map((z) => (
                  <window.UPTZoneCard key={z.id} zone={z} onView={(id) => { setSelSchool(null); setSelArea(null); setZoneHomes(false); setSelZone(id); }} />
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

window.UPTSchoolDiscovery = UPTSchoolDiscovery;
