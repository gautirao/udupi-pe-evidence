// Udupi school-discovery — card components. Exports SchoolCard, ZoneCard, ListingCard, EmptyState, MetaStat
const { Icon: CIcon, Button: CButton, Badge: CBadge, TrustBadge: CTrust } = window.ReTrendsDesignSystem_f37966;

function inr(p) {
  const cr = p / 10000000;
  if (cr >= 1) return `₹${cr.toFixed(2)} Cr`;
  return `₹${(p / 100000).toFixed(0)} L`;
}

const TYPE_TONE = {
  CBSE: "navy", ICSE: "navy", "Pre-school": "accent", College: "neutral", University: "navy",
  International: "accent", State: "neutral", "PU College": "neutral",
};

// ---------- School card ----------
function SchoolCard({ school, onView, onHover }) {
  const [hover, setHover] = React.useState(false);
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
      <div style={{
        flex: "none", width: "44px", height: "44px", borderRadius: "var(--radius-md)",
        background: "var(--navy-100)", display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <CIcon name="building" size={21} color="var(--navy-800)" />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "10px" }}>
          <h3 style={{ margin: 0, fontSize: "15px", fontWeight: 700, color: "var(--text-strong)", letterSpacing: "-0.01em", lineHeight: 1.3 }}>
            {school.name}
          </h3>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "5px", flex: "none" }}>
            {school.type && <CBadge tone={TYPE_TONE[school.type] || "neutral"} pill>{school.type}</CBadge>}
            {school.levels && school.levels.length > 0 && (
              <span style={{
                display: "inline-flex", alignItems: "center", gap: "4px", padding: "2px 9px", borderRadius: "var(--radius-full)",
                background: "var(--plum-tint)", color: "var(--plum-600)", fontSize: "11px", fontWeight: 600, whiteSpace: "nowrap",
              }}>{school.levels[school.levels.length - 1]}</span>
            )}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "5px", marginTop: "6px", fontSize: "13px", color: "var(--text-muted)" }}>
          <CIcon name="map-pin" size={13} color="var(--grey-400)" />
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{school.address}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "12px" }}>
          <span style={{ fontSize: "13px", color: "var(--text-body)", fontWeight: 500, whiteSpace: "nowrap" }}>
            {school.listings > 0
              ? <><span style={{ fontFamily: "var(--font-mono)", fontWeight: 600, color: "var(--text-strong)" }}>{school.listings}</span> homes nearby</>
              : <span style={{ color: "var(--text-muted)" }}>No homes listed yet</span>}
          </span>
          <span style={{
            display: "inline-flex", alignItems: "center", gap: "5px", fontSize: "13px", fontWeight: 600,
            color: hover ? "var(--accent)" : "var(--primary)", transition: "color var(--dur-fast) var(--ease-standard)", whiteSpace: "nowrap", flex: "none",
          }}>
            View homes <CIcon name="arrow-right" size={15} />
          </span>
        </div>
      </div>
    </div>
  );
}

// ---------- Zone card ----------
function ZoneStat({ icon, value, label }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "7px" }}>
      <CIcon name={icon} size={15} color="var(--grey-400)" />
      <span style={{ fontFamily: "var(--font-mono)", fontWeight: 600, fontSize: "14px", color: "var(--text-strong)" }}>{value}</span>
      <span style={{ fontSize: "12.5px", color: "var(--text-muted)" }}>{label}</span>
    </div>
  );
}

function ZoneCard({ zone, onView }) {
  const [hover, setHover] = React.useState(false);
  return (
    <div
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      onClick={() => onView(zone.id)}
      style={{
        background: "var(--surface-card)", border: "1px solid var(--border)",
        borderRadius: "var(--radius-lg)", padding: "18px", cursor: "pointer",
        boxShadow: hover ? "var(--shadow-md)" : "var(--shadow-xs)",
        transform: hover ? "translateY(-2px)" : "none",
        transition: "box-shadow var(--dur-normal) var(--ease-standard), transform var(--dur-normal) var(--ease-standard)",
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "12px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "11px" }}>
          <div style={{
            flex: "none", width: "38px", height: "38px", borderRadius: "var(--radius-md)",
            background: "var(--accent-tint)", display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <CIcon name="layers" size={19} color="var(--copper-600)" />
          </div>
          <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 700, color: "var(--text-strong)", letterSpacing: "-0.01em" }}>{zone.name}</h3>
        </div>
        <CBadge tone="neutral" pill style={{ flex: "none" }}>{zone.areas} {zone.areas === 1 ? "area" : "areas"}</CBadge>
      </div>
      <p style={{ margin: "11px 0 14px", fontSize: "13.5px", lineHeight: 1.5, color: "var(--text-body)", textWrap: "pretty" }}>{zone.blurb}</p>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "12px", paddingTop: "13px", borderTop: "1px solid var(--border)" }}>
        <div style={{ display: "flex", gap: "18px", flexWrap: "wrap" }}>
          <ZoneStat icon="building" value={zone.schools} label="schools" />
          <ZoneStat icon="map-pin" value={zone.listings} label="homes" />
        </div>
        <span style={{
          display: "inline-flex", alignItems: "center", gap: "5px", fontSize: "13px", fontWeight: 600,
          color: hover ? "var(--accent)" : "var(--primary)", transition: "color var(--dur-fast) var(--ease-standard)",
        }}>
          View zone <CIcon name="arrow-right" size={15} />
        </span>
      </div>
    </div>
  );
}

// ---------- Listing card (two-column premium) ----------
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
      {/* Image */}
      <div style={{ position: "relative", height: "168px", background: "var(--surface-muted)", overflow: "hidden" }}>
        <img src={listing.image} alt={listing.title} style={{
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
          <CIcon name="heart" size={16} color={saved ? "var(--accent)" : "var(--grey-500)"}
            style={{ fill: saved ? "var(--accent)" : "none" }} />
        </button>
        {hasDist ? (
          <div style={{
            position: "absolute", bottom: "10px", left: "11px", padding: "4px 9px",
            background: "rgba(94,82,134,0.92)", backdropFilter: "blur(4px)", color: "#fff",
            borderRadius: "var(--radius-sm)", fontSize: "11.5px", fontWeight: 600,
            display: "flex", alignItems: "center", gap: "5px", fontFamily: "var(--font-mono)",
          }}>
            <CIcon name="route" size={12} color="#fff" />{distanceKm.toFixed(1)} km from school
          </div>
        ) : listing.walk && (
          <div style={{
            position: "absolute", bottom: "10px", left: "11px", padding: "4px 9px",
            background: "rgba(14,22,38,0.72)", backdropFilter: "blur(4px)", color: "#fff",
            borderRadius: "var(--radius-sm)", fontSize: "11.5px", fontWeight: 500,
            display: "flex", alignItems: "center", gap: "5px",
          }}>
            <CIcon name="route" size={12} color="#fff" />{listing.walk}
          </div>
        )}
      </div>
      {/* Body */}
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

// ---------- Area card (the intermediary step: areas inside a zone) ----------
// Polished card, not a plain row. Shows name, blurb, school + listing counts,
// and a CTA that adapts when an area has schools but zero homes listed.
function AreaCard({ area, onView }) {
  const [hover, setHover] = React.useState(false);
  const noHomes = area.listings === 0;
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
        display: "flex", flexDirection: "column",
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: "13px" }}>
        <div style={{
          flex: "none", width: "40px", height: "40px", borderRadius: "var(--radius-md)",
          background: "var(--plum-tint)", display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <CIcon name="map-pin" size={20} color="var(--plum-600)" />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "9px", flexWrap: "wrap" }}>
            <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 700, color: "var(--text-strong)", letterSpacing: "-0.01em" }}>{area.name}</h3>
            {noHomes && <CBadge tone="neutral" pill style={{ flex: "none" }}>Schools only</CBadge>}
          </div>
          <p style={{ margin: "6px 0 0", fontSize: "13.5px", lineHeight: 1.5, color: "var(--text-body)", textWrap: "pretty" }}>{area.blurb}</p>
        </div>
      </div>

      {/* Metrics */}
      <div style={{ display: "flex", gap: "10px", marginTop: "15px" }}>
        <div style={{
          flex: 1, display: "flex", alignItems: "center", gap: "9px", padding: "10px 12px",
          background: "var(--plum-tint)", borderRadius: "var(--radius-md)",
        }}>
          <CIcon name="building" size={17} color="var(--plum-600)" />
          <span><span style={{ fontFamily: "var(--font-mono)", fontWeight: 600, fontSize: "15px", color: "var(--text-strong)" }}>{area.schools}</span>
            <span style={{ fontSize: "12.5px", color: "var(--text-muted)", marginLeft: "5px" }}>schools</span></span>
        </div>
        <div style={{
          flex: 1, display: "flex", alignItems: "center", gap: "9px", padding: "10px 12px",
          background: noHomes ? "var(--surface-muted)" : "var(--accent-tint)", borderRadius: "var(--radius-md)",
        }}>
          <CIcon name="map-pin" size={17} color={noHomes ? "var(--grey-400)" : "var(--copper-600)"} />
          <span><span style={{ fontFamily: "var(--font-mono)", fontWeight: 600, fontSize: "15px", color: noHomes ? "var(--text-muted)" : "var(--text-strong)" }}>{area.listings}</span>
            <span style={{ fontSize: "12.5px", color: "var(--text-muted)", marginLeft: "5px" }}>{area.listings === 1 ? "listing" : "listings"}</span></span>
        </div>
      </div>

      {/* Zero-listing helper — never reads as broken */}
      {noHomes && (
        <p style={{ margin: "12px 0 0", fontSize: "12.5px", lineHeight: 1.5, color: "var(--text-muted)", textWrap: "pretty" }}>
          No homes listed yet — view schools in this area, or try nearby <strong style={{ color: "var(--text-body)", fontWeight: 600 }}>Manipal</strong>.
        </p>
      )}

      {/* CTA */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", marginTop: "14px", paddingTop: "14px", borderTop: "1px solid var(--border)" }}>
        <span style={{
          display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "13.5px", fontWeight: 600,
          color: hover ? "var(--accent)" : "var(--primary)", transition: "color var(--dur-fast) var(--ease-standard)",
        }}>
          {noHomes ? `View schools in ${area.name}` : `Explore ${area.name}`} <CIcon name="arrow-right" size={15} />
        </span>
      </div>
    </div>
  );
}

// ---------- Empty state ----------
function EmptyState({ title, body, onTryAnother, onClear, onStartOver }) {
  return (
    <div style={{
      textAlign: "center", padding: "40px 28px", background: "var(--surface-card)",
      border: "1px dashed var(--border-strong)", borderRadius: "var(--radius-xl)",
    }}>
      <div style={{
        width: "58px", height: "58px", borderRadius: "var(--radius-full)", background: "var(--canvas-200)",
        display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 18px",
      }}>
        <CIcon name="map-pin" size={26} color="var(--grey-500)" />
      </div>
      <h3 style={{ margin: "0 0 8px", fontFamily: "var(--font-serif)", fontSize: "22px", fontWeight: 600, color: "var(--text-strong)", letterSpacing: "-0.01em" }}>{title}</h3>
      <p style={{ margin: "0 auto 22px", maxWidth: "360px", fontSize: "14px", lineHeight: 1.55, color: "var(--text-muted)", textWrap: "pretty" }}>{body}</p>
      <div style={{ display: "flex", gap: "10px", justifyContent: "center", flexWrap: "wrap" }}>
        <CButton variant="primary" size="md" onClick={onTryAnother}>Try another area</CButton>
        <CButton variant="outline" size="md" onClick={onClear}>Clear filters</CButton>
        <CButton variant="ghost" size="md" onClick={onStartOver}>Start over</CButton>
      </div>
    </div>
  );
}

Object.assign(window, { UPTSchoolCard: SchoolCard, UPTZoneCard: ZoneCard, UPTAreaCard: AreaCard, UPTListingCard: ListingCard, UPTEmptyState: EmptyState, uptINR: inr });
