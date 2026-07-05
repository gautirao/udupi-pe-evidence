// Unified Discover Portal — card components (one library, all journeys).
// Exports (window): DPRegionCard, DPJourneyCard, DPGroupCard, DPZoneCard,
//   DPAreaCard, DPSchoolAreaCard, DPSchoolCard, DPListingCard,
//   DPCorridorCard, DPClusterCard, DPParcelCard
const { Icon: CIcon, Button: CButton, Badge: CBadge, TrustBadge: CTrust } = window.ReTrendsDesignSystem_f37966;
const inr = window.BLR_INR;
const noun = window.BLR_NOUN;
const CO = window.BLR_COUNTS;
const AG = window.BLR_AGRI;
const TYPE_TONE = { Villa: "navy", Apartment: "neutral", "Independent House": "navy", Penthouse: "accent", CBSE: "navy", ICSE: "navy", International: "accent", State: "neutral" };
const DEF_RADIUS = 5;

function liftStyle(hover, pad) {
  return {
    background: "var(--surface-card)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)",
    padding: pad, cursor: "pointer", boxShadow: hover ? "var(--shadow-md)" : "var(--shadow-xs)",
    transform: hover ? "translateY(-2px)" : "none",
    transition: "box-shadow var(--dur-normal) var(--ease-standard), transform var(--dur-normal) var(--ease-standard)",
  };
}

// ---------- Region card (city landing) — residential property count ----------
function RegionCard({ region, onView }) {
  const [h, setH] = React.useState(false);
  const count = CO.homesRegion(region.id);
  return (
    <div onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)} onClick={() => onView(region.id)}
      style={{ ...liftStyle(h, "16px 18px"), display: "flex", gap: "14px", alignItems: "center" }}>
      <div style={{ flex: "none", width: "44px", height: "44px", borderRadius: "var(--radius-md)", background: "var(--navy-100)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <CIcon name="map-pin" size={21} color="var(--navy-800)" />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 700, color: "var(--text-strong)", letterSpacing: "-0.01em" }}>{region.name}</h3>
        <div style={{ fontSize: "13px", color: "var(--text-muted)", marginTop: "3px" }}>{region.cue}</div>
      </div>
      <div style={{ flex: "none", textAlign: "right" }}>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: "18px", fontWeight: 600, color: "var(--text-strong)" }}>{count.toLocaleString("en-IN")}</div>
        <div style={{ fontSize: "11.5px", color: "var(--text-muted)" }}>properties</div>
      </div>
      <CIcon name="arrow-right" size={17} color={h ? "var(--accent)" : "var(--grey-400)"} style={{ flex: "none" }} />
    </div>
  );
}

// ---------- Journey card. accent: "area" (copper) | "school" (plum) | "agri" | null ----------
function JourneyCard({ icon, title, body, cta, accent, separated, onClick }) {
  const [h, setH] = React.useState(false);
  const isArea = accent === "area", isSchool = accent === "school", isAgri = accent === "agri";
  const chipBg = isArea ? "var(--accent-tint)" : isSchool ? "var(--plum-tint)" : isAgri ? "var(--evergreen-50)" : "var(--surface-subtle)";
  const chipFg = isArea ? "var(--copper-600)" : isSchool ? "var(--plum-600)" : isAgri ? "var(--evergreen-600)" : "var(--navy-800)";
  const border = separated ? "1px dashed var(--border-strong)" : (isArea ? "1px solid var(--copper-400)" : isSchool ? "1px solid var(--plum-500)" : "1px solid var(--border)");
  return (
    <div onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)} onClick={onClick}
      style={{ ...liftStyle(h, "16px 18px"), border, background: separated ? "var(--surface-subtle)" : "var(--surface-card)", display: "flex", gap: "14px", alignItems: "center" }}>
      <div style={{ flex: "none", width: "40px", height: "40px", borderRadius: "var(--radius-md)", background: chipBg, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <CIcon name={icon} size={20} color={chipFg} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
          <h4 style={{ margin: 0, fontSize: "14.5px", fontWeight: 700, color: "var(--text-strong)", letterSpacing: "-0.01em" }}>{title}</h4>
          {separated && <span style={{ fontSize: "10.5px", fontWeight: 700, letterSpacing: "var(--tracking-caps)", textTransform: "uppercase", color: "var(--text-muted)" }}>Separate journey</span>}
        </div>
        <p style={{ margin: "3px 0 0", fontSize: "12.5px", lineHeight: 1.45, color: "var(--text-muted)", textWrap: "pretty" }}>{body}</p>
      </div>
      <span style={{ flex: "none", display: "inline-flex", alignItems: "center", gap: "5px", fontSize: "12.5px", fontWeight: 600, whiteSpace: "nowrap", color: h ? chipFg : "var(--primary)", transition: "color var(--dur-fast) var(--ease-standard)" }}>{cta} <CIcon name="arrow-right" size={14} /></span>
    </div>
  );
}

// ---------- Rich editorial journey CTA (city landing + region overview) ----------
// Restores the stronger "choose your journey" treatment from discover_city.html:
// icon block · title · Recommended / Separate badge · description · chips · CTA.
function RJGlyphLayers({ c }) { return (<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83z"/><path d="M2 12a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 12"/><path d="M2 17a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 17"/></svg>); }
function RJGlyphSchool({ c }) { return (<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.42 10.922a1 1 0 0 0-.019-1.838L12.83 5.18a2 2 0 0 0-1.66 0L2.6 9.08a1 1 0 0 0 0 1.832l8.57 3.908a2 2 0 0 0 1.66 0z"/><path d="M22 10v6"/><path d="M6 12.5V16a6 3 0 0 0 12 0v-3.5"/></svg>); }
function RJGlyphSprout({ c }) { return (<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M7 20h10"/><path d="M10 20c5.5-2.5.8-6.4 3-10"/><path d="M9.5 9.4c1.1.8 1.8 2.2 2.3 3.7-2 .4-3.5.4-4.8-.3-1.2-.6-2.3-1.9-3-4.2 2.8-.5 4.4 0 5.5.8z"/><path d="M14.1 6c-.9 1.2-1.4 2.5-1.5 3.9-1.4-1-2-2.7-1.7-4.5-.2-.2 2.5-.4 3.2.6z"/></svg>); }
function RJGlyphList({ c }) { return (<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 6h13"/><path d="M8 12h13"/><path d="M8 18h13"/><path d="M3 6h.01"/><path d="M3 12h.01"/><path d="M3 18h.01"/></svg>); }
const RJ_GLYPH = { area: RJGlyphLayers, school: RJGlyphSchool, agri: RJGlyphSprout, listings: RJGlyphList };
const RJ_ACCENT = {
  area:     { accent: "var(--navy-800)",      tint: "var(--navy-100)" },
  school:   { accent: "var(--plum-600)",      tint: "var(--plum-tint)" },
  agri:     { accent: "var(--evergreen-600)", tint: "var(--evergreen-50)" },
  listings: { accent: "var(--navy-700)",      tint: "var(--surface-subtle)" },
};

function RichChip({ children }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: "5px", padding: "3px 9px", borderRadius: "var(--radius-full)", background: "var(--surface-subtle)", border: "1px solid var(--border)", fontFamily: "var(--font-mono)", fontSize: "11.5px", fontWeight: 600, color: "var(--text-body)", whiteSpace: "nowrap" }}>{children}</span>
  );
}

function RichJourneyCard({ accent, title, desc, chips, cta, primary, separated, onClick }) {
  const [hover, setHover] = React.useState(false);
  const Glyph = RJ_GLYPH[accent] || RJGlyphList;
  const tone = RJ_ACCENT[accent] || RJ_ACCENT.listings;
  const active = hover;
  return (
    <button onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)} onClick={onClick}
      style={{
        textAlign: "left", width: "100%", cursor: "pointer", display: "block",
        background: separated ? "var(--surface-subtle)" : "var(--surface-card)",
        border: separated ? "1px dashed var(--border-strong)" : `1.5px solid ${active ? tone.accent : "var(--border)"}`,
        borderRadius: "var(--radius-lg)", padding: "18px 20px",
        boxShadow: hover ? "var(--shadow-lg)" : "var(--shadow-sm)",
        transform: hover ? "translateY(-2px)" : "translateY(0)",
        transition: "transform var(--dur-normal) var(--ease-standard), box-shadow var(--dur-normal) var(--ease-standard), border-color var(--dur-fast), background var(--dur-fast)",
        fontFamily: "var(--font-sans)", position: "relative",
      }}>
      <div style={{ display: "flex", gap: "14px", alignItems: "flex-start" }}>
        <div style={{ width: "46px", height: "46px", flex: "none", borderRadius: "var(--radius-md)", display: "flex", alignItems: "center", justifyContent: "center", background: active ? tone.accent : tone.tint, transition: "background var(--dur-fast)" }}>
          <Glyph c={active ? "#fff" : tone.accent} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "9px", marginBottom: "4px", flexWrap: "wrap" }}>
            <h3 style={{ margin: 0, fontSize: "16.5px", fontWeight: 700, letterSpacing: "-0.01em", color: "var(--text-strong)" }}>{title}</h3>
            {primary && (
              <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", padding: "2px 8px", borderRadius: "var(--radius-full)", background: "var(--accent-tint)", color: "var(--copper-600)", fontSize: "10.5px", fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase" }}>Recommended</span>
            )}
            {separated && (
              <span style={{ fontSize: "10.5px", fontWeight: 700, letterSpacing: "var(--tracking-caps)", textTransform: "uppercase", color: "var(--text-muted)" }}>Separate journey</span>
            )}
          </div>
          <p style={{ margin: "0 0 12px", fontSize: "13.5px", lineHeight: 1.5, color: "var(--text-body)", textWrap: "pretty" }}>{desc}</p>
          {chips && chips.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginBottom: "14px" }}>{chips.map((c) => <RichChip key={c}>{c}</RichChip>)}</div>
          )}
          {primary ? (
            <span style={{ display: "inline-flex", alignItems: "center", gap: "8px", padding: "9px 16px", borderRadius: "var(--radius-md)", background: active ? "var(--accent-hover)" : "var(--accent)", color: "#fff", fontSize: "13.5px", fontWeight: 600, transition: "background var(--dur-fast)" }}>
              {cta}
              <span style={{ display: "inline-flex", transform: active ? "translateX(3px)" : "none", transition: "transform var(--dur-fast)" }}><CIcon name="arrow-right" size={16} color="#fff" /></span>
            </span>
          ) : (
            <span style={{ display: "inline-flex", alignItems: "center", gap: "7px", fontSize: "13.5px", fontWeight: 600, color: active ? tone.accent : "var(--text-strong)", transition: "color var(--dur-fast)" }}>
              {cta}
              <span style={{ display: "inline-flex", transform: active ? "translateX(3px)" : "none", transition: "transform var(--dur-fast)" }}><CIcon name="arrow-right" size={16} color={active ? tone.accent : "var(--grey-500)"} /></span>
            </span>
          )}
        </div>
      </div>
    </button>
  );
}

function StatChip({ icon, value, label, tint, ic }) {
  return (
    <div style={{ flex: 1, display: "flex", alignItems: "center", gap: "9px", padding: "10px 12px", background: tint || "var(--surface-subtle)", borderRadius: "var(--radius-md)" }}>
      <CIcon name={icon} size={16} color={ic || "var(--grey-500)"} />
      <span><span style={{ fontFamily: "var(--font-mono)", fontWeight: 600, fontSize: "15px", color: "var(--text-strong)" }}>{value}</span><span style={{ fontSize: "12px", color: "var(--text-muted)", marginLeft: "5px" }}>{label}</span></span>
    </div>
  );
}

function ExampleAreas({ areas }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "7px", flexWrap: "wrap" }}>
      <span style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "var(--tracking-caps)", textTransform: "uppercase", color: "var(--text-muted)", marginRight: "2px" }}>Areas</span>
      {areas.map((a) => (
        <span key={a} style={{ display: "inline-flex", alignItems: "center", padding: "3px 10px", borderRadius: "var(--radius-full)", border: "1px solid var(--border)", background: "var(--surface-subtle)", fontSize: "11.5px", fontWeight: 600, color: "var(--text-body)" }}>{a}</span>
      ))}
    </div>
  );
}

function CardCTA({ hover, tint, children }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", marginTop: "16px", paddingTop: "14px", borderTop: "1px solid var(--border)" }}>
      <span style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "13.5px", fontWeight: 600, color: hover ? tint : "var(--primary)", transition: "color var(--dur-fast) var(--ease-standard)" }}>{children} <CIcon name="arrow-right" size={15} /></span>
    </div>
  );
}

// ---------- Area GROUP card (residential area journey) ----------
function GroupCard({ group, mode, onView }) {
  const [h, setH] = React.useState(false);
  const count = CO.homesGroup(group.id);
  const areaCount = window.BLR_DATA.areas.filter((a) => a.group === group.id).length;
  return (
    <div onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)} onClick={() => onView(group.id)}
      style={{ ...liftStyle(h, "20px"), display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "12px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px", minWidth: 0 }}>
          <div style={{ flex: "none", width: "42px", height: "42px", borderRadius: "var(--radius-md)", background: "var(--navy-100)", display: "flex", alignItems: "center", justifyContent: "center" }}><CIcon name="layers" size={20} color="var(--navy-800)" /></div>
          <div style={{ minWidth: 0 }}>
            <h3 style={{ margin: 0, fontSize: "16.5px", fontWeight: 700, color: "var(--text-strong)", letterSpacing: "-0.01em", lineHeight: 1.25 }}>{group.name}</h3>
            <div style={{ fontSize: "13px", color: "var(--text-muted)", marginTop: "2px" }}>{areaCount} {areaCount === 1 ? "area" : "areas"}</div>
          </div>
        </div>
        <CBadge tone="neutral" pill style={{ flex: "none" }}>{count} {count === 1 ? "home" : "homes"}</CBadge>
      </div>
      <p style={{ margin: "13px 0 0", fontSize: "13.5px", lineHeight: 1.55, color: "var(--text-body)", textWrap: "pretty" }}>{group.blurb}</p>
      <div style={{ margin: "14px 0 0" }}><ExampleAreas areas={group.exampleAreas} /></div>
      <div style={{ display: "flex", gap: "10px", marginTop: "14px" }}>
        <StatChip icon="map-pin" value={areaCount} label={areaCount === 1 ? "area" : "areas"} />
        <StatChip icon="building" value={count} label={mode === "Rent" ? "to rent" : "for sale"} tint="var(--accent-tint)" ic="var(--copper-600)" />
      </div>
      <CardCTA hover={h} tint="var(--accent)">Explore group</CardCTA>
    </div>
  );
}

// ---------- School ZONE card (school journey) ----------
function ZoneCard({ zone, onView }) {
  const [h, setH] = React.useState(false);
  const schools = CO.schoolsZone(zone.id), homes = CO.homesZone(zone.id);
  return (
    <div onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)} onClick={() => onView(zone.id)}
      style={{ ...liftStyle(h, "20px"), display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: "12px" }}>
        <div style={{ flex: "none", width: "42px", height: "42px", borderRadius: "var(--radius-md)", background: "var(--plum-tint)", display: "flex", alignItems: "center", justifyContent: "center" }}><CIcon name="layers" size={20} color="var(--plum-600)" /></div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <h3 style={{ margin: 0, fontSize: "16.5px", fontWeight: 700, color: "var(--text-strong)", letterSpacing: "-0.01em", lineHeight: 1.25 }}>{zone.name}</h3>
          <p style={{ margin: "6px 0 0", fontSize: "13.5px", lineHeight: 1.5, color: "var(--text-body)", textWrap: "pretty" }}>{zone.blurb}</p>
        </div>
      </div>
      <div style={{ margin: "14px 0 0" }}><ExampleAreas areas={zone.exampleAreas} /></div>
      <div style={{ display: "flex", gap: "10px", marginTop: "14px" }}>
        <StatChip icon="building" value={schools} label="schools" tint="var(--plum-tint)" ic="var(--plum-600)" />
        <StatChip icon="map-pin" value={homes} label="nearby homes" tint="var(--accent-tint)" ic="var(--copper-600)" />
      </div>
      <CardCTA hover={h} tint="var(--plum-600)">Explore zone</CardCTA>
    </div>
  );
}

// ---------- Area card — residential (area journey) ----------
function AreaCard({ area, mode, onView }) {
  const [h, setH] = React.useState(false);
  const count = CO.homesArea(area.id), noHomes = count === 0;
  return (
    <div onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)} onClick={() => onView(area.id)}
      style={{ ...liftStyle(h, "18px"), display: "flex", gap: "14px", alignItems: "flex-start" }}>
      <div style={{ flex: "none", width: "42px", height: "42px", borderRadius: "var(--radius-md)", background: "var(--accent-tint)", display: "flex", alignItems: "center", justifyContent: "center" }}><CIcon name="map-pin" size={20} color="var(--copper-600)" /></div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: "9px", flexWrap: "wrap" }}>
          <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 700, color: "var(--text-strong)", letterSpacing: "-0.01em" }}>{area.name}</h3>
          {noHomes && <CBadge tone="neutral" pill style={{ flex: "none" }}>No homes yet</CBadge>}
        </div>
        <p style={{ margin: "6px 0 0", fontSize: "13.5px", lineHeight: 1.5, color: "var(--text-body)", textWrap: "pretty" }}>{area.blurb}</p>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", marginTop: "13px" }}>
          <span style={{ fontSize: "13px", color: "var(--text-body)", fontWeight: 500 }}>
            {noHomes ? <span style={{ color: "var(--text-muted)" }}>No {mode === "Rent" ? "rentals" : "homes"} yet</span> : <><span style={{ fontFamily: "var(--font-mono)", fontWeight: 600, color: "var(--text-strong)" }}>{count}</span> {noun(mode, count)}</>}
          </span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "13px", fontWeight: 600, color: h ? "var(--accent)" : "var(--primary)", transition: "color var(--dur-fast) var(--ease-standard)", whiteSpace: "nowrap", flex: "none" }}>{noHomes ? "View area" : "View listings"} <CIcon name="arrow-right" size={15} /></span>
        </div>
      </div>
    </div>
  );
}

// ---------- Area card — school journey (schools + homes; "View schools") ----------
function SchoolAreaCard({ area, onView }) {
  const [h, setH] = React.useState(false);
  const schools = CO.schoolsArea(area.id), homes = CO.homesArea(area.id);
  return (
    <div onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)} onClick={() => onView(area.id)}
      style={{ ...liftStyle(h, "18px"), display: "flex", gap: "14px", alignItems: "flex-start" }}>
      <div style={{ flex: "none", width: "42px", height: "42px", borderRadius: "var(--radius-md)", background: "var(--plum-tint)", display: "flex", alignItems: "center", justifyContent: "center" }}><CIcon name="map-pin" size={20} color="var(--plum-600)" /></div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 700, color: "var(--text-strong)", letterSpacing: "-0.01em" }}>{area.name}</h3>
        <p style={{ margin: "6px 0 0", fontSize: "13.5px", lineHeight: 1.5, color: "var(--text-body)", textWrap: "pretty" }}>{area.blurb}</p>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", marginTop: "13px" }}>
          <span style={{ fontSize: "13px", color: "var(--text-body)", fontWeight: 500 }}>
            <span style={{ fontFamily: "var(--font-mono)", fontWeight: 600, color: "var(--text-strong)" }}>{schools}</span> schools
            <span style={{ color: "var(--grey-400)", margin: "0 6px" }}>·</span>
            <span style={{ fontFamily: "var(--font-mono)", fontWeight: 600, color: "var(--text-strong)" }}>{homes}</span> homes
          </span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "13px", fontWeight: 600, color: h ? "var(--plum-600)" : "var(--primary)", transition: "color var(--dur-fast) var(--ease-standard)", whiteSpace: "nowrap", flex: "none" }}>View schools <CIcon name="arrow-right" size={15} /></span>
        </div>
      </div>
    </div>
  );
}

// ---------- School card ----------
function SchoolCard({ school, radiusKm, onView, onHover }) {
  const [h, setH] = React.useState(false);
  const km = radiusKm || DEF_RADIUS, near = window.BLR_HOMES_NEAR(school, km).length;
  return (
    <div onMouseEnter={() => { setH(true); onHover && onHover(school.id); }} onMouseLeave={() => { setH(false); onHover && onHover(null); }} onClick={() => onView(school.id)}
      style={{ ...liftStyle(h, "16px"), display: "flex", gap: "14px", alignItems: "flex-start" }}>
      <div style={{ flex: "none", width: "44px", height: "44px", borderRadius: "var(--radius-md)", background: "var(--plum-tint)", display: "flex", alignItems: "center", justifyContent: "center" }}><CIcon name="building" size={21} color="var(--plum-600)" /></div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "10px" }}>
          <h3 style={{ margin: 0, fontSize: "15px", fontWeight: 700, color: "var(--text-strong)", letterSpacing: "-0.01em", lineHeight: 1.3 }}>{school.name}</h3>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "5px", flex: "none" }}>
            {school.type && <CBadge tone={TYPE_TONE[school.type] || "neutral"} pill>{school.type}</CBadge>}
            {school.levels && school.levels.length > 0 && <span style={{ display: "inline-flex", alignItems: "center", padding: "2px 9px", borderRadius: "var(--radius-full)", background: "var(--plum-tint)", color: "var(--plum-600)", fontSize: "11px", fontWeight: 600, whiteSpace: "nowrap" }}>{school.levels[school.levels.length - 1]}</span>}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "5px", marginTop: "6px", fontSize: "13px", color: "var(--text-muted)" }}><CIcon name="map-pin" size={13} color="var(--grey-400)" /><span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{school.address}</span></div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "12px" }}>
          <span style={{ fontSize: "13px", color: "var(--text-body)", fontWeight: 500, whiteSpace: "nowrap" }}>{near > 0 ? <><span style={{ fontFamily: "var(--font-mono)", fontWeight: 600, color: "var(--text-strong)" }}>{near}</span> homes within {km} km</> : <span style={{ color: "var(--text-muted)" }}>No homes within {km} km</span>}</span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: "5px", fontSize: "13px", fontWeight: 600, color: h ? "var(--plum-600)" : "var(--primary)", transition: "color var(--dur-fast) var(--ease-standard)", whiteSpace: "nowrap", flex: "none" }}>View homes <CIcon name="arrow-right" size={15} /></span>
        </div>
      </div>
    </div>
  );
}

// ---------- Residential listing card (optional distance chip in school journey) ----------
function ListingCard({ listing, onHover, onOpen, saved, onToggleSave, distanceKm }) {
  const [h, setH] = React.useState(false);
  return (
    <div onMouseEnter={() => { setH(true); onHover && onHover(listing.id); }} onMouseLeave={() => { setH(false); onHover && onHover(null); }}
      style={{ background: "var(--surface-card)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", overflow: "hidden", boxShadow: h ? "var(--shadow-lg)" : "var(--shadow-sm)", transform: h ? "translateY(-2px)" : "none", transition: "box-shadow var(--dur-normal) var(--ease-standard), transform var(--dur-normal) var(--ease-standard)", display: "flex", flexDirection: "column" }}>
      <div style={{ position: "relative", height: "168px", background: "var(--surface-muted)", overflow: "hidden" }}>
        <img src={listing.image} alt={listing.title} loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover", transform: h ? "scale(1.05)" : "scale(1)", transition: "transform var(--dur-slow) var(--ease-standard)" }} />
        <div style={{ position: "absolute", top: "11px", left: "11px" }}><CTrust tier={listing.trustTier} size="sm" /></div>
        <button onClick={(e) => { e.stopPropagation(); onToggleSave && onToggleSave(listing.id); }} aria-label="Save" style={{ position: "absolute", top: "10px", right: "10px", width: "32px", height: "32px", borderRadius: "var(--radius-full)", border: "none", cursor: "pointer", background: "rgba(255,255,255,0.92)", backdropFilter: "blur(4px)", boxShadow: "var(--shadow-sm)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <CIcon name="heart" size={16} color={saved ? "var(--accent)" : "var(--grey-500)"} style={{ fill: saved ? "var(--accent)" : "none" }} />
        </button>
        {distanceKm != null ? (
          <div style={{ position: "absolute", bottom: "10px", left: "11px", padding: "4px 9px", background: "rgba(94,82,134,0.92)", backdropFilter: "blur(4px)", color: "#fff", borderRadius: "var(--radius-sm)", fontSize: "11.5px", fontWeight: 600, display: "flex", alignItems: "center", gap: "5px", fontFamily: "var(--font-mono)" }}><CIcon name="route" size={12} color="#fff" />{distanceKm.toFixed(1)} km from school</div>
        ) : listing.tag && (
          <div style={{ position: "absolute", bottom: "10px", left: "11px", padding: "4px 9px", background: "var(--navy-900)", color: "#fff", borderRadius: "var(--radius-sm)", fontSize: "11px", fontWeight: 700, letterSpacing: "0.02em" }}>{listing.tag}</div>
        )}
      </div>
      <div style={{ padding: "15px", display: "flex", flexDirection: "column", flex: 1 }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "8px" }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: "19px", fontWeight: 600, color: "var(--text-strong)" }}>{inr(listing.price)}</span>
          <CBadge tone={TYPE_TONE[listing.propType] || "neutral"} pill>{listing.propType}</CBadge>
        </div>
        <h3 style={{ margin: "8px 0 4px", fontSize: "14.5px", fontWeight: 600, color: "var(--text-strong)", lineHeight: 1.3 }}>{listing.title}</h3>
        <div style={{ display: "flex", alignItems: "center", gap: "5px", fontSize: "12.5px", color: "var(--text-muted)" }}><CIcon name="map-pin" size={13} color="var(--grey-400)" />{listing.locality}, {listing.area}</div>
        <div style={{ display: "flex", gap: "14px", fontSize: "12.5px", color: "var(--text-body)", margin: "12px 0 14px" }}>
          <span style={{ display: "flex", alignItems: "center", gap: "5px" }}><CIcon name="bed" size={15} color="var(--grey-400)" />{listing.beds} BHK</span>
          <span style={{ display: "flex", alignItems: "center", gap: "5px" }}><CIcon name="bath" size={15} color="var(--grey-400)" />{listing.baths}</span>
          <span style={{ display: "flex", alignItems: "center", gap: "5px" }}><CIcon name="maximize" size={15} color="var(--grey-400)" />{listing.sqft} sq.ft</span>
        </div>
        <div style={{ marginTop: "auto" }}><CButton variant="outline" size="sm" fullWidth onClick={() => onOpen && onOpen(listing.id)}>View details</CButton></div>
      </div>
    </div>
  );
}

// ================= AGRICULTURAL cards (evergreen accent, separate model) =================
function CorridorCard({ corridor, onView }) {
  const [h, setH] = React.useState(false);
  const count = AG.dirProps(corridor.id);
  const acres = AG.dirAcres(corridor.id);
  const towns = AG.dirGroups(corridor.id);
  const maxKm = AG.maxTownDist(corridor.id);
  return (
    <div onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)} onClick={() => onView(corridor.id)}
      style={{ ...liftStyle(h, "18px"), display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "12px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px", minWidth: 0 }}>
          <div style={{ flex: "none", width: "44px", height: "44px", borderRadius: "var(--radius-full)", background: "var(--evergreen-600)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-mono)", fontSize: "17px", fontWeight: 700, color: "#fff" }}>{corridor.dir}</div>
          <div style={{ minWidth: 0 }}>
            <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 700, color: "var(--text-strong)", letterSpacing: "-0.01em" }}>{corridor.label}</h3>
            <div style={{ fontSize: "12.5px", color: "var(--text-muted)", marginTop: "2px" }}>Up to {maxKm} km from the city</div>
          </div>
        </div>
        <CBadge tone="neutral" pill style={{ flex: "none" }}>{count} {count === 1 ? "parcel" : "parcels"}</CBadge>
      </div>
      <p style={{ margin: "12px 0 0", fontSize: "13.5px", lineHeight: 1.5, color: "var(--text-body)", textWrap: "pretty" }}>{corridor.blurb}</p>
      <div style={{ display: "flex", gap: "10px", marginTop: "14px" }}>
        <StatChip icon="map-pin" value={towns} label={towns === 1 ? "town" : "towns"} tint="var(--evergreen-50)" ic="var(--evergreen-600)" />
        <StatChip icon="maximize" value={acres.toFixed(1)} label="acres" tint="var(--evergreen-50)" ic="var(--evergreen-600)" />
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: "7px", flexWrap: "wrap", margin: "13px 0 0" }}>
        <span style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "var(--tracking-caps)", textTransform: "uppercase", color: "var(--text-muted)", marginRight: "2px" }}>Towns</span>
        {corridor.keyTowns.map((t) => (
          <span key={t} style={{ display: "inline-flex", alignItems: "center", padding: "3px 10px", borderRadius: "var(--radius-full)", border: "1px solid var(--border)", background: "var(--surface-subtle)", fontSize: "11.5px", fontWeight: 600, color: "var(--text-body)" }}>{t}</span>
        ))}
      </div>
      <CardCTA hover={h} tint="var(--evergreen-600)">Explore direction</CardCTA>
    </div>
  );
}

function ClusterCard({ cluster, onView }) {
  const [h, setH] = React.useState(false);
  const count = AG.townProps(cluster.id);
  const acres = AG.townAcres(cluster.id);
  return (
    <div onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)} onClick={() => onView(cluster.id)}
      style={{ ...liftStyle(h, "18px"), display: "flex", gap: "14px", alignItems: "flex-start" }}>
      <div style={{ flex: "none", width: "42px", height: "42px", borderRadius: "var(--radius-md)", background: "var(--evergreen-50)", display: "flex", alignItems: "center", justifyContent: "center" }}><CIcon name="map-pin" size={20} color="var(--evergreen-600)" /></div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: "9px", flexWrap: "wrap" }}>
          <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 700, color: "var(--text-strong)", letterSpacing: "-0.01em" }}>{cluster.name}</h3>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: "11.5px", color: "var(--text-muted)" }}>~{cluster.distKm} km</span>
        </div>
        <p style={{ margin: "6px 0 0", fontSize: "13.5px", lineHeight: 1.5, color: "var(--text-body)", textWrap: "pretty" }}>{cluster.blurb}</p>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", marginTop: "13px" }}>
          <span style={{ fontSize: "13px", color: "var(--text-body)", fontWeight: 500 }}><span style={{ fontFamily: "var(--font-mono)", fontWeight: 600, color: "var(--text-strong)" }}>{count}</span> {count === 1 ? "parcel" : "parcels"}<span style={{ color: "var(--grey-400)", margin: "0 6px" }}>·</span><span style={{ fontFamily: "var(--font-mono)", fontWeight: 600, color: "var(--text-strong)" }}>{acres.toFixed(1)}</span> acres</span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "13px", fontWeight: 600, color: h ? "var(--evergreen-600)" : "var(--primary)", transition: "color var(--dur-fast) var(--ease-standard)", whiteSpace: "nowrap", flex: "none" }}>View parcels <CIcon name="arrow-right" size={15} /></span>
        </div>
      </div>
    </div>
  );
}

function ParcelCard({ parcel, onOpen, saved, onToggleSave }) {
  const [h, setH] = React.useState(false);
  return (
    <div onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}
      style={{ background: "var(--surface-card)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", overflow: "hidden", boxShadow: h ? "var(--shadow-lg)" : "var(--shadow-sm)", transform: h ? "translateY(-2px)" : "none", transition: "box-shadow var(--dur-normal) var(--ease-standard), transform var(--dur-normal) var(--ease-standard)", display: "flex", flexDirection: "column" }}>
      <div style={{ position: "relative", height: "150px", background: "var(--surface-muted)", overflow: "hidden" }}>
        <img src={parcel.image} alt={parcel.title} loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover", transform: h ? "scale(1.05)" : "scale(1)", transition: "transform var(--dur-slow) var(--ease-standard)" }} />
        <div style={{ position: "absolute", top: "11px", left: "11px" }}><CTrust tier={parcel.trustTier} size="sm" /></div>
        <div style={{ position: "absolute", bottom: "10px", left: "11px", padding: "4px 9px", background: "rgba(31,105,74,0.92)", backdropFilter: "blur(4px)", color: "#fff", borderRadius: "var(--radius-sm)", fontSize: "11.5px", fontWeight: 600, fontFamily: "var(--font-mono)" }}>{parcel.acres} acres</div>
      </div>
      <div style={{ padding: "15px", display: "flex", flexDirection: "column", flex: 1 }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "8px" }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: "18px", fontWeight: 600, color: "var(--text-strong)" }}>{inr(parcel.price)}</span>
          <CBadge tone="neutral" pill>{parcel.crop}</CBadge>
        </div>
        <h3 style={{ margin: "8px 0 6px", fontSize: "14.5px", fontWeight: 600, color: "var(--text-strong)", lineHeight: 1.3 }}>{parcel.title}</h3>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 14px", fontSize: "12px", color: "var(--text-body)", margin: "4px 0 14px" }}>
          <span style={{ display: "flex", alignItems: "center", gap: "5px" }}><CIcon name="route" size={13} color="var(--grey-400)" />{parcel.distKm} km out</span>
          <span style={{ display: "flex", alignItems: "center", gap: "5px" }}><CIcon name="check" size={13} color="var(--grey-400)" />{parcel.water}</span>
          <span style={{ display: "flex", alignItems: "center", gap: "5px" }}><CIcon name="map-pin" size={13} color="var(--grey-400)" />{parcel.road}</span>
          <span style={{ display: "flex", alignItems: "center", gap: "5px" }}><CIcon name="layers" size={13} color="var(--grey-400)" />{parcel.soil}</span>
          {parcel.survey && <span style={{ display: "flex", alignItems: "center", gap: "5px", gridColumn: "1 / -1" }}><CIcon name="file-check" size={13} color="var(--grey-400)" />{parcel.survey}</span>}
        </div>
        <div style={{ marginTop: "auto" }}><CButton variant="outline" size="sm" fullWidth onClick={() => onOpen && onOpen(parcel.id)}>View parcel</CButton></div>
      </div>
    </div>
  );
}

Object.assign(window, {
  DPRegionCard: RegionCard, DPJourneyCard: JourneyCard, DPRichJourneyCard: RichJourneyCard, DPGroupCard: GroupCard,
  DPZoneCard: ZoneCard, DPAreaCard: AreaCard, DPSchoolAreaCard: SchoolAreaCard,
  DPSchoolCard: SchoolCard, DPListingCard: ListingCard,
  DPCorridorCard: CorridorCard, DPClusterCard: ClusterCard, DPParcelCard: ParcelCard,
});
