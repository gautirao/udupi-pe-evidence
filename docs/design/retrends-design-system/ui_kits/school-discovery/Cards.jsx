// Bangalore SCHOOL-FIRST discovery — card components.
// Exports: BLRSRegionCard, BLRSJourneyOption, BLRSZoneCard, BLRSAreaCard,
//          BLRSSchoolCard, BLRSListingCard, BLRSEmptyState
//
// Treatment: ink-navy structure + restrained copper for homes; PLUM used
// sparingly as the school-journey accent (school pins, radius, zone chips).
const { Icon: CIcon, Button: CButton, Badge: CBadge, TrustBadge: CTrust } = window.ReTrendsDesignSystem_f37966;
const inr = window.BLR_INR;
const C = window.BLR_SCHOOL_COUNTS;

const TYPE_TONE = { CBSE: "navy", ICSE: "navy", International: "accent", State: "neutral", "PU College": "neutral", "Pre-school": "accent" };
const DEFAULT_RADIUS = 5;

// ---------- Macro REGION card (city landing) ----------
function RegionCard({ region, onView }) {
  const [hover, setHover] = React.useState(false);
  return (
    <div
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      onClick={() => onView(region.id)}
      style={{
        background: "var(--surface-card)", border: "1px solid var(--border)",
        borderRadius: "var(--radius-lg)", padding: "16px 18px", cursor: "pointer",
        boxShadow: hover ? "var(--shadow-md)" : "var(--shadow-xs)",
        transform: hover ? "translateY(-2px)" : "none",
        transition: "box-shadow var(--dur-normal) var(--ease-standard), transform var(--dur-normal) var(--ease-standard)",
        display: "flex", gap: "14px", alignItems: "center",
      }}
    >
      <div style={{ flex: "none", width: "44px", height: "44px", borderRadius: "var(--radius-md)", background: "var(--navy-100)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <CIcon name="map-pin" size={21} color="var(--navy-800)" />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 700, color: "var(--text-strong)", letterSpacing: "-0.01em" }}>{region.name}</h3>
        <div style={{ fontSize: "13px", color: "var(--text-muted)", marginTop: "3px" }}>{region.cue}</div>
      </div>
      <div style={{ flex: "none", textAlign: "right" }}>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: "16px", fontWeight: 600, color: "var(--plum-600)" }}>{C.schoolsRegion(region.id)}</div>
        <div style={{ fontSize: "11.5px", color: "var(--text-muted)" }}>schools</div>
      </div>
      <CIcon name="arrow-right" size={17} color={hover ? "var(--plum-600)" : "var(--grey-400)"} style={{ flex: "none" }} />
    </div>
  );
}

// ---------- Journey option ----------
function JourneyOption({ icon, title, body, cta, accent, onClick }) {
  const [hover, setHover] = React.useState(false);
  return (
    <div
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      onClick={onClick}
      style={{
        background: "var(--surface-card)", border: accent ? "1px solid var(--plum-500)" : "1px solid var(--border)",
        borderRadius: "var(--radius-lg)", padding: "16px 18px", cursor: "pointer",
        boxShadow: hover ? "var(--shadow-md)" : "var(--shadow-xs)",
        transform: hover ? "translateY(-2px)" : "none",
        transition: "box-shadow var(--dur-normal) var(--ease-standard), transform var(--dur-normal) var(--ease-standard)",
        display: "flex", gap: "14px", alignItems: "center",
      }}
    >
      <div style={{ flex: "none", width: "40px", height: "40px", borderRadius: "var(--radius-md)", background: accent ? "var(--plum-tint)" : "var(--surface-subtle)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <CIcon name={icon} size={20} color={accent ? "var(--plum-600)" : "var(--navy-800)"} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <h4 style={{ margin: 0, fontSize: "14.5px", fontWeight: 700, color: "var(--text-strong)", letterSpacing: "-0.01em" }}>{title}</h4>
        <p style={{ margin: "3px 0 0", fontSize: "12.5px", lineHeight: 1.45, color: "var(--text-muted)", textWrap: "pretty" }}>{body}</p>
      </div>
      <span style={{ flex: "none", display: "inline-flex", alignItems: "center", gap: "5px", fontSize: "12.5px", fontWeight: 600, whiteSpace: "nowrap", color: hover ? "var(--plum-600)" : "var(--primary)", transition: "color var(--dur-fast) var(--ease-standard)" }}>{cta} <CIcon name="arrow-right" size={14} /></span>
    </div>
  );
}

// ---------- School ZONE card (search-near-school level) ----------
function ZoneCard({ zone, onView }) {
  const [hover, setHover] = React.useState(false);
  const schools = C.schoolsZone(zone.id);
  const homes = C.homesZone(zone.id);
  return (
    <div
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      onClick={() => onView(zone.id)}
      style={{
        background: "var(--surface-card)", border: "1px solid var(--border)",
        borderRadius: "var(--radius-lg)", padding: "20px", cursor: "pointer",
        boxShadow: hover ? "var(--shadow-md)" : "var(--shadow-xs)",
        transform: hover ? "translateY(-2px)" : "none",
        transition: "box-shadow var(--dur-normal) var(--ease-standard), transform var(--dur-normal) var(--ease-standard)",
        display: "flex", flexDirection: "column",
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: "12px" }}>
        <div style={{ flex: "none", width: "42px", height: "42px", borderRadius: "var(--radius-md)", background: "var(--plum-tint)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <CIcon name="layers" size={20} color="var(--plum-600)" />
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <h3 style={{ margin: 0, fontSize: "16.5px", fontWeight: 700, color: "var(--text-strong)", letterSpacing: "-0.01em", lineHeight: 1.25 }}>{zone.name}</h3>
          <p style={{ margin: "6px 0 0", fontSize: "13.5px", lineHeight: 1.5, color: "var(--text-body)", textWrap: "pretty" }}>{zone.blurb}</p>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: "7px", flexWrap: "wrap", margin: "14px 0 0" }}>
        <span style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "var(--tracking-caps)", textTransform: "uppercase", color: "var(--text-muted)", marginRight: "2px" }}>Areas</span>
        {zone.exampleAreas.map((a) => (
          <span key={a} style={{ display: "inline-flex", alignItems: "center", padding: "3px 10px", borderRadius: "var(--radius-full)", border: "1px solid var(--border)", background: "var(--surface-subtle)", fontSize: "11.5px", fontWeight: 600, color: "var(--text-body)" }}>{a}</span>
        ))}
      </div>

      <div style={{ display: "flex", gap: "10px", marginTop: "14px" }}>
        <div style={{ flex: 1, display: "flex", alignItems: "center", gap: "9px", padding: "10px 12px", background: "var(--plum-tint)", borderRadius: "var(--radius-md)" }}>
          <CIcon name="building" size={16} color="var(--plum-600)" />
          <span><span style={{ fontFamily: "var(--font-mono)", fontWeight: 600, fontSize: "15px", color: "var(--text-strong)" }}>{schools}</span><span style={{ fontSize: "12px", color: "var(--text-muted)", marginLeft: "5px" }}>schools</span></span>
        </div>
        <div style={{ flex: 1, display: "flex", alignItems: "center", gap: "9px", padding: "10px 12px", background: "var(--accent-tint)", borderRadius: "var(--radius-md)" }}>
          <CIcon name="map-pin" size={16} color="var(--copper-600)" />
          <span><span style={{ fontFamily: "var(--font-mono)", fontWeight: 600, fontSize: "15px", color: "var(--text-strong)" }}>{homes}</span><span style={{ fontSize: "12px", color: "var(--text-muted)", marginLeft: "5px" }}>nearby homes</span></span>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", marginTop: "16px", paddingTop: "14px", borderTop: "1px solid var(--border)" }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "13.5px", fontWeight: 600, color: hover ? "var(--plum-600)" : "var(--primary)", transition: "color var(--dur-fast) var(--ease-standard)" }}>
          Explore zone <CIcon name="arrow-right" size={15} />
        </span>
      </div>
    </div>
  );
}

// ---------- AREA card (areas inside a school zone) ----------
function AreaCard({ area, onView }) {
  const [hover, setHover] = React.useState(false);
  const schools = C.schoolsArea(area.id);
  const homes = C.homesArea(area.id);
  return (
    <div
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      onClick={() => onView(area.id)}
      style={{
        background: "var(--surface-card)", border: "1px solid var(--border)",
        borderRadius: "var(--radius-lg)", padding: "18px", cursor: "pointer",
        boxShadow: hover ? "var(--shadow-md)" : "var(--shadow-xs)",
        transform: hover ? "translateY(-2px)" : "none",
        transition: "box-shadow var(--dur-normal) var(--ease-standard), transform var(--dur-normal) var(--ease-standard)",
        display: "flex", gap: "14px", alignItems: "flex-start",
      }}
    >
      <div style={{ flex: "none", width: "42px", height: "42px", borderRadius: "var(--radius-md)", background: "var(--plum-tint)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <CIcon name="map-pin" size={20} color="var(--plum-600)" />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 700, color: "var(--text-strong)", letterSpacing: "-0.01em" }}>{area.name}</h3>
        <p style={{ margin: "6px 0 0", fontSize: "13.5px", lineHeight: 1.5, color: "var(--text-body)", textWrap: "pretty" }}>{area.blurb}</p>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", marginTop: "13px" }}>
          <span style={{ fontSize: "13px", color: "var(--text-body)", fontWeight: 500 }}>
            <span style={{ fontFamily: "var(--font-mono)", fontWeight: 600, color: "var(--text-strong)" }}>{schools}</span> schools
            <span style={{ color: "var(--grey-400)", margin: "0 6px" }}>·</span>
            <span style={{ fontFamily: "var(--font-mono)", fontWeight: 600, color: "var(--text-strong)" }}>{homes}</span> homes
          </span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "13px", fontWeight: 600, color: hover ? "var(--plum-600)" : "var(--primary)", transition: "color var(--dur-fast) var(--ease-standard)", whiteSpace: "nowrap", flex: "none" }}>
            View schools <CIcon name="arrow-right" size={15} />
          </span>
        </div>
      </div>
    </div>
  );
}

// ---------- School card ----------
function SchoolCard({ school, radiusKm, onView, onHover }) {
  const [hover, setHover] = React.useState(false);
  const km = radiusKm || DEFAULT_RADIUS;
  const near = window.BLR_HOMES_NEAR(school, km).length;
  return (
    <div
      onMouseEnter={() => { setHover(true); onHover && onHover(school.id); }}
      onMouseLeave={() => { setHover(false); onHover && onHover(null); }}
      onClick={() => onView(school.id)}
      style={{
        background: "var(--surface-card)", border: "1px solid var(--border)",
        borderRadius: "var(--radius-lg)", padding: "16px", cursor: "pointer",
        boxShadow: hover ? "var(--shadow-md)" : "var(--shadow-xs)",
        transform: hover ? "translateY(-2px)" : "none",
        transition: "box-shadow var(--dur-normal) var(--ease-standard), transform var(--dur-normal) var(--ease-standard)",
        display: "flex", gap: "14px", alignItems: "flex-start",
      }}
    >
      <div style={{ flex: "none", width: "44px", height: "44px", borderRadius: "var(--radius-md)", background: "var(--plum-tint)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <CIcon name="building" size={21} color="var(--plum-600)" />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "10px" }}>
          <h3 style={{ margin: 0, fontSize: "15px", fontWeight: 700, color: "var(--text-strong)", letterSpacing: "-0.01em", lineHeight: 1.3 }}>{school.name}</h3>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "5px", flex: "none" }}>
            {school.type && <CBadge tone={TYPE_TONE[school.type] || "neutral"} pill>{school.type}</CBadge>}
            {school.levels && school.levels.length > 0 && (
              <span style={{ display: "inline-flex", alignItems: "center", padding: "2px 9px", borderRadius: "var(--radius-full)", background: "var(--plum-tint)", color: "var(--plum-600)", fontSize: "11px", fontWeight: 600, whiteSpace: "nowrap" }}>{school.levels[school.levels.length - 1]}</span>
            )}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "5px", marginTop: "6px", fontSize: "13px", color: "var(--text-muted)" }}>
          <CIcon name="map-pin" size={13} color="var(--grey-400)" />
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{school.address}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "12px" }}>
          <span style={{ fontSize: "13px", color: "var(--text-body)", fontWeight: 500, whiteSpace: "nowrap" }}>
            {near > 0
              ? <><span style={{ fontFamily: "var(--font-mono)", fontWeight: 600, color: "var(--text-strong)" }}>{near}</span> homes within {km} km</>
              : <span style={{ color: "var(--text-muted)" }}>No homes within {km} km</span>}
          </span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: "5px", fontSize: "13px", fontWeight: 600, color: hover ? "var(--plum-600)" : "var(--primary)", transition: "color var(--dur-fast) var(--ease-standard)", whiteSpace: "nowrap", flex: "none" }}>
            View homes <CIcon name="arrow-right" size={15} />
          </span>
        </div>
      </div>
    </div>
  );
}

// ---------- Listing card (two-column premium, optional distance chip) ----------
function ListingCard({ listing, onHover, onOpen, saved, onToggleSave, distanceKm }) {
  const [hover, setHover] = React.useState(false);
  const hasDist = distanceKm != null;
  return (
    <div
      onMouseEnter={() => { setHover(true); onHover && onHover(listing.id); }}
      onMouseLeave={() => { setHover(false); onHover && onHover(null); }}
      style={{
        background: "var(--surface-card)", border: "1px solid var(--border)",
        borderRadius: "var(--radius-lg)", overflow: "hidden",
        boxShadow: hover ? "var(--shadow-lg)" : "var(--shadow-sm)",
        transform: hover ? "translateY(-2px)" : "none",
        transition: "box-shadow var(--dur-normal) var(--ease-standard), transform var(--dur-normal) var(--ease-standard)",
        display: "flex", flexDirection: "column",
      }}
    >
      <div style={{ position: "relative", height: "168px", background: "var(--surface-muted)", overflow: "hidden" }}>
        <img src={listing.image} alt={listing.title} loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover", transform: hover ? "scale(1.05)" : "scale(1)", transition: "transform var(--dur-slow) var(--ease-standard)" }} />
        <div style={{ position: "absolute", top: "11px", left: "11px" }}><CTrust tier={listing.trustTier} size="sm" /></div>
        <button onClick={(e) => { e.stopPropagation(); onToggleSave && onToggleSave(listing.id); }} aria-label="Save"
          style={{ position: "absolute", top: "10px", right: "10px", width: "32px", height: "32px", borderRadius: "var(--radius-full)", border: "none", cursor: "pointer", background: "rgba(255,255,255,0.92)", backdropFilter: "blur(4px)", boxShadow: "var(--shadow-sm)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <CIcon name="heart" size={16} color={saved ? "var(--accent)" : "var(--grey-500)"} style={{ fill: saved ? "var(--accent)" : "none" }} />
        </button>
        {hasDist && (
          <div style={{ position: "absolute", bottom: "10px", left: "11px", padding: "4px 9px", background: "rgba(94,82,134,0.92)", backdropFilter: "blur(4px)", color: "#fff", borderRadius: "var(--radius-sm)", fontSize: "11.5px", fontWeight: 600, display: "flex", alignItems: "center", gap: "5px", fontFamily: "var(--font-mono)" }}>
            <CIcon name="route" size={12} color="#fff" />{distanceKm.toFixed(1)} km from school
          </div>
        )}
      </div>
      <div style={{ padding: "15px", display: "flex", flexDirection: "column", flex: 1 }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "8px" }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: "19px", fontWeight: 600, color: "var(--text-strong)" }}>{inr(listing.price)}</span>
          <CBadge tone="neutral" pill>{listing.propType}</CBadge>
        </div>
        <h3 style={{ margin: "8px 0 4px", fontSize: "14.5px", fontWeight: 600, color: "var(--text-strong)", lineHeight: 1.3 }}>{listing.title}</h3>
        <div style={{ display: "flex", alignItems: "center", gap: "5px", fontSize: "12.5px", color: "var(--text-muted)" }}>
          <CIcon name="map-pin" size={13} color="var(--grey-400)" />{listing.locality}, {listing.area}
        </div>
        <div style={{ display: "flex", gap: "14px", fontSize: "12.5px", color: "var(--text-body)", margin: "12px 0 14px" }}>
          <span style={{ display: "flex", alignItems: "center", gap: "5px" }}><CIcon name="bed" size={15} color="var(--grey-400)" />{listing.beds} BHK</span>
          <span style={{ display: "flex", alignItems: "center", gap: "5px" }}><CIcon name="bath" size={15} color="var(--grey-400)" />{listing.baths}</span>
          <span style={{ display: "flex", alignItems: "center", gap: "5px" }}><CIcon name="maximize" size={15} color="var(--grey-400)" />{listing.sqft} sq.ft</span>
        </div>
        <div style={{ marginTop: "auto" }}>
          <CButton variant="outline" size="sm" fullWidth onClick={() => onOpen && onOpen(listing.id)}>View details</CButton>
        </div>
      </div>
    </div>
  );
}

// ---------- Empty / fallback state ----------
function EmptyState({ icon = "map-pin", title, body, actions }) {
  return (
    <div style={{ textAlign: "center", padding: "32px 26px", background: "var(--surface-card)", border: "1px dashed var(--border-strong)", borderRadius: "var(--radius-xl)" }}>
      <div style={{ width: "54px", height: "54px", borderRadius: "var(--radius-full)", background: "var(--plum-tint)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
        <CIcon name={icon} size={24} color="var(--plum-600)" />
      </div>
      <h3 style={{ margin: "0 0 8px", fontFamily: "var(--font-serif)", fontSize: "21px", fontWeight: 600, color: "var(--text-strong)", letterSpacing: "-0.01em" }}>{title}</h3>
      <p style={{ margin: "0 auto 20px", maxWidth: "360px", fontSize: "13.5px", lineHeight: 1.55, color: "var(--text-muted)", textWrap: "pretty" }}>{body}</p>
      <div style={{ display: "flex", gap: "10px", justifyContent: "center", flexWrap: "wrap" }}>{actions}</div>
    </div>
  );
}

Object.assign(window, {
  BLRSRegionCard: RegionCard,
  BLRSJourneyOption: JourneyOption,
  BLRSZoneCard: ZoneCard,
  BLRSAreaCard: AreaCard,
  BLRSSchoolCard: SchoolCard,
  BLRSListingCard: ListingCard,
  BLRSEmptyState: EmptyState,
});
