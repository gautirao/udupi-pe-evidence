// Bangalore AREA-FIRST discovery — card components.
// Exports: BLRRegionCard, BLRJourneyOption, BLRGroupCard, BLRAreaCard,
//          BLRListingCard, BLREmptyState, BLRAgriCard
//
// Treatment: ink-navy structure + restrained copper accent. Residential only.
const { Icon: CIcon, Button: CButton, Badge: CBadge, TrustBadge: CTrust } = window.ReTrendsDesignSystem_f37966;
const inr = window.BLR_INR;
const noun = window.BLR_NOUN;
const COUNTS = window.BLR_AREA_COUNTS;

const TYPE_TONE = { Villa: "navy", Apartment: "neutral", "Independent House": "navy", Penthouse: "accent", Plot: "neutral" };

// ---------- Macro REGION card (city landing) ----------
// Maps 1:1 to a region bubble on the map. Shows the region's total property count.
function RegionCard({ region, onView }) {
  const [hover, setHover] = React.useState(false);
  const count = COUNTS.region(region.id);
  return (
    <div
      onMouseEnter={() => { setHover(true); onView.hover && onView.hover(region.id); }}
      onMouseLeave={() => { setHover(false); onView.hover && onView.hover(null); }}
      onClick={() => onView.open(region.id)}
      style={{
        background: "var(--surface-card)", border: "1px solid var(--border)",
        borderRadius: "var(--radius-lg)", padding: "16px 18px", cursor: "pointer",
        boxShadow: hover ? "var(--shadow-md)" : "var(--shadow-xs)",
        transform: hover ? "translateY(-2px)" : "none",
        transition: "box-shadow var(--dur-normal) var(--ease-standard), transform var(--dur-normal) var(--ease-standard)",
        display: "flex", gap: "14px", alignItems: "center",
      }}
    >
      <div style={{
        flex: "none", width: "44px", height: "44px", borderRadius: "var(--radius-md)",
        background: "var(--navy-100)", display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <CIcon name="map-pin" size={21} color="var(--navy-800)" />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: "9px", flexWrap: "wrap" }}>
          <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 700, color: "var(--text-strong)", letterSpacing: "-0.01em" }}>{region.name}</h3>
        </div>
        <div style={{ fontSize: "13px", color: "var(--text-muted)", marginTop: "3px" }}>{region.cue}</div>
      </div>
      <div style={{ flex: "none", textAlign: "right" }}>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: "18px", fontWeight: 600, color: "var(--text-strong)" }}>{count.toLocaleString("en-IN")}</div>
        <div style={{ fontSize: "11.5px", color: "var(--text-muted)" }}>properties</div>
      </div>
      <CIcon name="arrow-right" size={17} color={hover ? "var(--accent)" : "var(--grey-400)"} style={{ flex: "none" }} />
    </div>
  );
}

// ---------- Journey option card (Search by area / near school / view all) ----------
function JourneyOption({ icon, title, body, cta, accent, onClick }) {
  const [hover, setHover] = React.useState(false);
  return (
    <div
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      onClick={onClick}
      style={{
        background: "var(--surface-card)", border: accent ? "1px solid var(--copper-400)" : "1px solid var(--border)",
        borderRadius: "var(--radius-lg)", padding: "16px 18px", cursor: "pointer",
        boxShadow: hover ? "var(--shadow-md)" : "var(--shadow-xs)",
        transform: hover ? "translateY(-2px)" : "none",
        transition: "box-shadow var(--dur-normal) var(--ease-standard), transform var(--dur-normal) var(--ease-standard)",
        display: "flex", gap: "14px", alignItems: "center",
      }}
    >
      <div style={{
        flex: "none", width: "40px", height: "40px", borderRadius: "var(--radius-md)",
        background: accent ? "var(--accent-tint)" : "var(--surface-subtle)", display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <CIcon name={icon} size={20} color={accent ? "var(--copper-600)" : "var(--navy-800)"} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <h4 style={{ margin: 0, fontSize: "14.5px", fontWeight: 700, color: "var(--text-strong)", letterSpacing: "-0.01em" }}>{title}</h4>
        <p style={{ margin: "3px 0 0", fontSize: "12.5px", lineHeight: 1.45, color: "var(--text-muted)", textWrap: "pretty" }}>{body}</p>
      </div>
      <span style={{
        flex: "none", display: "inline-flex", alignItems: "center", gap: "5px", fontSize: "12.5px", fontWeight: 600, whiteSpace: "nowrap",
        color: hover ? "var(--accent)" : "var(--primary)", transition: "color var(--dur-fast) var(--ease-standard)",
      }}>{cta} <CIcon name="arrow-right" size={14} /></span>
    </div>
  );
}

// ---------- Agricultural-land card (kept visually SEPARATE from residential) ----------
function AgriCard({ onClick }) {
  const [hover, setHover] = React.useState(false);
  return (
    <div
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      onClick={onClick}
      style={{
        background: "var(--surface-subtle)", border: "1px dashed var(--border-strong)",
        borderRadius: "var(--radius-lg)", padding: "15px 18px", cursor: "pointer",
        display: "flex", gap: "13px", alignItems: "center",
        boxShadow: hover ? "var(--shadow-sm)" : "none",
        transition: "box-shadow var(--dur-normal) var(--ease-standard)",
      }}
    >
      <div style={{
        flex: "none", width: "38px", height: "38px", borderRadius: "var(--radius-md)",
        background: "var(--paper)", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "var(--shadow-xs)",
      }}>
        <CIcon name="layers" size={19} color="var(--grey-500)" />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
          <h4 style={{ margin: 0, fontSize: "14px", fontWeight: 700, color: "var(--text-body)", letterSpacing: "-0.01em" }}>Agricultural land</h4>
          <span style={{ fontSize: "10.5px", fontWeight: 700, letterSpacing: "var(--tracking-caps)", textTransform: "uppercase", color: "var(--text-muted)" }}>Separate journey</span>
        </div>
        <p style={{ margin: "3px 0 0", fontSize: "12.5px", lineHeight: 1.4, color: "var(--text-muted)" }}>Farmland and plots are searched differently — open the land journey.</p>
      </div>
      <CIcon name="arrow-right" size={15} color="var(--grey-400)" style={{ flex: "none" }} />
    </div>
  );
}

// Small mono stat used inside group / area cards.
function StatChip({ icon, value, label, accent }) {
  return (
    <div style={{
      flex: 1, display: "flex", alignItems: "center", gap: "9px", padding: "10px 12px",
      background: accent ? "var(--accent-tint)" : "var(--surface-subtle)", borderRadius: "var(--radius-md)",
    }}>
      <CIcon name={icon} size={16} color={accent ? "var(--copper-600)" : "var(--grey-500)"} />
      <span style={{ minWidth: 0 }}>
        <span style={{ fontFamily: "var(--font-mono)", fontWeight: 600, fontSize: "15px", color: "var(--text-strong)" }}>{value}</span>
        <span style={{ fontSize: "12px", color: "var(--text-muted)", marginLeft: "5px" }}>{label}</span>
      </span>
    </div>
  );
}

// ---------- Area GROUP / ZONE card (search-by-area level) ----------
// Shows group name, property count, example areas, "Explore group" CTA.
function GroupCard({ group, mode, onView }) {
  const [hover, setHover] = React.useState(false);
  const count = COUNTS.group(group.id);
  const areaCount = window.BLR_AREA_DATA.areas.filter((a) => a.group === group.id).length;
  return (
    <div
      onMouseEnter={() => { setHover(true); onView.hover && onView.hover(group.id); }}
      onMouseLeave={() => { setHover(false); onView.hover && onView.hover(null); }}
      onClick={() => onView.open(group.id)}
      style={{
        background: "var(--surface-card)", border: "1px solid var(--border)",
        borderRadius: "var(--radius-lg)", padding: "20px", cursor: "pointer",
        boxShadow: hover ? "var(--shadow-md)" : "var(--shadow-xs)",
        transform: hover ? "translateY(-2px)" : "none",
        transition: "box-shadow var(--dur-normal) var(--ease-standard), transform var(--dur-normal) var(--ease-standard)",
        display: "flex", flexDirection: "column",
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "12px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px", minWidth: 0 }}>
          <div style={{
            flex: "none", width: "42px", height: "42px", borderRadius: "var(--radius-md)",
            background: "var(--navy-100)", display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <CIcon name="layers" size={20} color="var(--navy-800)" />
          </div>
          <div style={{ minWidth: 0 }}>
            <h3 style={{ margin: 0, fontSize: "16.5px", fontWeight: 700, color: "var(--text-strong)", letterSpacing: "-0.01em", lineHeight: 1.25 }}>{group.name}</h3>
            <div style={{ fontSize: "13px", color: "var(--text-muted)", marginTop: "2px" }}>{areaCount} {areaCount === 1 ? "area" : "areas"}</div>
          </div>
        </div>
        <CBadge tone="neutral" pill style={{ flex: "none" }}>{count} {count === 1 ? "home" : "homes"}</CBadge>
      </div>

      <p style={{ margin: "13px 0 0", fontSize: "13.5px", lineHeight: 1.55, color: "var(--text-body)", textWrap: "pretty" }}>{group.blurb}</p>

      {/* Example areas */}
      <div style={{ display: "flex", alignItems: "center", gap: "7px", flexWrap: "wrap", margin: "14px 0 0" }}>
        <span style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "var(--tracking-caps)", textTransform: "uppercase", color: "var(--text-muted)", marginRight: "2px" }}>Areas</span>
        {group.exampleAreas.map((a) => (
          <span key={a} style={{
            display: "inline-flex", alignItems: "center", padding: "3px 10px", borderRadius: "var(--radius-full)",
            border: "1px solid var(--border)", background: "var(--surface-subtle)", fontSize: "11.5px", fontWeight: 600, color: "var(--text-body)",
          }}>{a}</span>
        ))}
      </div>

      <div style={{ display: "flex", gap: "10px", marginTop: "14px" }}>
        <StatChip icon="map-pin" value={areaCount} label={areaCount === 1 ? "area" : "areas"} />
        <StatChip icon="building" value={count} label={mode === "Rent" ? "to rent" : "for sale"} accent={count > 0} />
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", marginTop: "16px", paddingTop: "14px", borderTop: "1px solid var(--border)" }}>
        <span style={{
          display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "13.5px", fontWeight: 600,
          color: hover ? "var(--accent)" : "var(--primary)", transition: "color var(--dur-fast) var(--ease-standard)",
        }}>
          Explore group <CIcon name="arrow-right" size={15} />
        </span>
      </div>
    </div>
  );
}

// ---------- AREA card (inside a selected group) ----------
function AreaCard({ area, mode, onView }) {
  const [hover, setHover] = React.useState(false);
  const count = COUNTS.area(area.id);
  const noHomes = count === 0;
  return (
    <div
      onMouseEnter={() => { setHover(true); onView.hover && onView.hover(area.id); }}
      onMouseLeave={() => { setHover(false); onView.hover && onView.hover(null); }}
      onClick={() => onView.open(area.id)}
      style={{
        background: "var(--surface-card)", border: "1px solid var(--border)",
        borderRadius: "var(--radius-lg)", padding: "18px", cursor: "pointer",
        boxShadow: hover ? "var(--shadow-md)" : "var(--shadow-xs)",
        transform: hover ? "translateY(-2px)" : "none",
        transition: "box-shadow var(--dur-normal) var(--ease-standard), transform var(--dur-normal) var(--ease-standard)",
        display: "flex", gap: "14px", alignItems: "flex-start",
      }}
    >
      <div style={{
        flex: "none", width: "42px", height: "42px", borderRadius: "var(--radius-md)",
        background: "var(--accent-tint)", display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <CIcon name="map-pin" size={20} color="var(--copper-600)" />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: "9px", flexWrap: "wrap" }}>
          <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 700, color: "var(--text-strong)", letterSpacing: "-0.01em" }}>{area.name}</h3>
          {noHomes && <CBadge tone="neutral" pill style={{ flex: "none" }}>No homes yet</CBadge>}
        </div>
        <p style={{ margin: "6px 0 0", fontSize: "13.5px", lineHeight: 1.5, color: "var(--text-body)", textWrap: "pretty" }}>{area.blurb}</p>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", marginTop: "13px" }}>
          <span style={{ fontSize: "13px", color: "var(--text-body)", fontWeight: 500 }}>
            {noHomes
              ? <span style={{ color: "var(--text-muted)" }}>No {mode === "Rent" ? "rentals" : "homes"} listed yet</span>
              : <><span style={{ fontFamily: "var(--font-mono)", fontWeight: 600, color: "var(--text-strong)" }}>{count}</span> {noun(mode, count)}</>}
          </span>
          <span style={{
            display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "13px", fontWeight: 600,
            color: hover ? "var(--accent)" : "var(--primary)", transition: "color var(--dur-fast) var(--ease-standard)", whiteSpace: "nowrap", flex: "none",
          }}>
            {noHomes ? "View area" : "View listings"} <CIcon name="arrow-right" size={15} />
          </span>
        </div>
      </div>
    </div>
  );
}

// ---------- Listing card (two-column premium property card) ----------
function ListingCard({ listing, onHover, onOpen, saved, onToggleSave }) {
  const [hover, setHover] = React.useState(false);
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
        <img src={listing.image} alt={listing.title} loading="lazy" style={{
          width: "100%", height: "100%", objectFit: "cover",
          transform: hover ? "scale(1.05)" : "scale(1)", transition: "transform var(--dur-slow) var(--ease-standard)",
        }} />
        <div style={{ position: "absolute", top: "11px", left: "11px" }}><CTrust tier={listing.trustTier} size="sm" /></div>
        <button
          onClick={(e) => { e.stopPropagation(); onToggleSave && onToggleSave(listing.id); }}
          aria-label="Save"
          style={{
            position: "absolute", top: "10px", right: "10px", width: "32px", height: "32px",
            borderRadius: "var(--radius-full)", border: "none", cursor: "pointer",
            background: "rgba(255,255,255,0.92)", backdropFilter: "blur(4px)", boxShadow: "var(--shadow-sm)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
          <CIcon name="heart" size={16} color={saved ? "var(--accent)" : "var(--grey-500)"} style={{ fill: saved ? "var(--accent)" : "none" }} />
        </button>
        {listing.tag && (
          <div style={{
            position: "absolute", bottom: "10px", left: "11px", padding: "4px 9px",
            background: "var(--navy-900)", color: "#fff", borderRadius: "var(--radius-sm)",
            fontSize: "11px", fontWeight: 700, letterSpacing: "0.02em",
          }}>{listing.tag}</div>
        )}
      </div>
      <div style={{ padding: "15px", display: "flex", flexDirection: "column", flex: 1 }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "8px" }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: "19px", fontWeight: 600, color: "var(--text-strong)" }}>{inr(listing.price)}</span>
          <CBadge tone={TYPE_TONE[listing.propType] || "neutral"} pill>{listing.propType}</CBadge>
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

// ---------- Empty / low-data state ----------
function EmptyState({ icon = "map-pin", title, body, actions }) {
  return (
    <div style={{
      textAlign: "center", padding: "34px 26px", background: "var(--surface-card)",
      border: "1px dashed var(--border-strong)", borderRadius: "var(--radius-xl)",
    }}>
      <div style={{
        width: "54px", height: "54px", borderRadius: "var(--radius-full)", background: "var(--canvas-200)",
        display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px",
      }}>
        <CIcon name={icon} size={24} color="var(--grey-500)" />
      </div>
      <h3 style={{ margin: "0 0 8px", fontFamily: "var(--font-serif)", fontSize: "21px", fontWeight: 600, color: "var(--text-strong)", letterSpacing: "-0.01em" }}>{title}</h3>
      <p style={{ margin: "0 auto 20px", maxWidth: "360px", fontSize: "13.5px", lineHeight: 1.55, color: "var(--text-muted)", textWrap: "pretty" }}>{body}</p>
      <div style={{ display: "flex", gap: "10px", justifyContent: "center", flexWrap: "wrap" }}>{actions}</div>
    </div>
  );
}

Object.assign(window, {
  BLRRegionCard: RegionCard,
  BLRJourneyOption: JourneyOption,
  BLRAgriCard: AgriCard,
  BLRGroupCard: GroupCard,
  BLRAreaCard: AreaCard,
  BLRListingCard: ListingCard,
  BLREmptyState: EmptyState,
});
