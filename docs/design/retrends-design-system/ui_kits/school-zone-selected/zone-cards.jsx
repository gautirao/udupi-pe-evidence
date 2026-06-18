// School-first selected-zone — card + panel components.
// Exports: window.UPTZCards = { ZoneSummaryCard, AreaCard, ListingCard, AreaStrip,
//          ZoneStrip, ZeroListingPanel, SchoolRow, SectionLabel, ListingGrid, inr }
const { Icon: ZIcon, Button: ZButton, Badge: ZBadge, TrustBadge: ZTrust, Select: ZSelect } = window.ReTrendsDesignSystem_f37966;

// Light "journey" lavender — used ONLY as a school-first accent (tags, school
// counts). Everything structural stays ink-navy + copper per the brand.
const JOURNEY = { fg: "#5B4FA0", bg: "#EFEDF8", line: "rgba(91,79,160,0.20)" };

function inr(p) {
  const cr = p / 10000000;
  if (cr >= 1) return `₹${cr.toFixed(2)} Cr`;
  return `₹${(p / 100000).toFixed(0)} L`;
}

// ---------- Section eyebrow ----------
function SectionLabel({ icon, children, right, color }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "14px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        {icon && <ZIcon name={icon} size={15} color={color || "var(--text-muted)"} />}
        <span style={{ fontSize: "11.5px", fontWeight: 700, letterSpacing: "var(--tracking-caps)", textTransform: "uppercase", color: "var(--text-muted)" }}>{children}</span>
      </div>
      {right}
    </div>
  );
}

// ---------- A "schools" pill in the journey lavender ----------
function SchoolsPill({ count }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: "6px", padding: "3px 9px 3px 7px",
      borderRadius: "var(--radius-full)", background: JOURNEY.bg, color: JOURNEY.fg,
      fontSize: "12.5px", fontWeight: 600,
    }}>
      <ZIcon name="users" size={13} color={JOURNEY.fg} />
      <span style={{ fontFamily: "var(--font-mono)", fontWeight: 600 }}>{count}</span> schools
    </span>
  );
}

function ListingsPill({ count }) {
  const none = count === 0;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: "6px", padding: "3px 9px 3px 7px",
      borderRadius: "var(--radius-full)",
      background: none ? "var(--grey-100)" : "var(--accent-tint)",
      color: none ? "var(--text-muted)" : "var(--copper-600)",
      fontSize: "12.5px", fontWeight: 600,
    }}>
      <ZIcon name="building" size={13} color={none ? "var(--grey-400)" : "var(--copper-600)"} />
      {none ? "No homes yet" : <><span style={{ fontFamily: "var(--font-mono)", fontWeight: 600 }}>{count}</span> homes</>}
    </span>
  );
}

// ============================================================
// ZONE SUMMARY CARD — the hero of the selected-zone landing.
// Ink-navy band (brand "area header" treatment), warm + premium.
// ============================================================
function ZoneSummaryCard({ zone, mode, onViewAll }) {
  return (
    <div style={{
      background: "var(--surface-navy)", color: "var(--text-on-navy)",
      borderRadius: "var(--radius-xl)", padding: "24px", boxShadow: "var(--shadow-lg)",
      position: "relative", overflow: "hidden",
    }}>
      {/* faint journey accent hairline at top */}
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: "3px", background: `linear-gradient(90deg, ${JOURNEY.fg}, var(--accent))` }} />
      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
        <span style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "var(--tracking-caps)", textTransform: "uppercase", color: "rgba(255,255,255,0.55)" }}>School zone</span>
        <span style={{
          display: "inline-flex", alignItems: "center", gap: "5px", padding: "2px 9px", borderRadius: "var(--radius-full)",
          background: "rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.92)", fontSize: "11px", fontWeight: 600,
        }}>
          <span style={{ width: "6px", height: "6px", borderRadius: "999px", background: JOURNEY.fg, boxShadow: "0 0 0 3px rgba(91,79,160,0.35)" }} />
          School-first
        </span>
      </div>

      <h2 style={{ margin: 0, fontFamily: "var(--font-serif)", fontSize: "30px", fontWeight: 600, letterSpacing: "-0.02em", lineHeight: 1.1 }}>{zone.name}</h2>
      <div style={{ marginTop: "5px", fontSize: "14px", fontWeight: 500, color: "rgba(255,255,255,0.72)" }}>{zone.subtitle}</div>
      <p style={{ margin: "14px 0 0", fontSize: "13.5px", lineHeight: 1.6, color: "rgba(255,255,255,0.78)", textWrap: "pretty" }}>{zone.blurb}</p>

      {/* metrics */}
      <div style={{ display: "flex", gap: "8px", marginTop: "20px" }}>
        {[
          { v: zone.schools, l: "schools" },
          { v: zone.listings, l: mode === "Rent" ? "to rent" : "for sale" },
          { v: zone.areasCount, l: "areas" },
        ].map((m, i) => (
          <div key={i} style={{
            flex: 1, background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.10)",
            borderRadius: "var(--radius-md)", padding: "12px 14px",
          }}>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: "22px", fontWeight: 600, lineHeight: 1 }}>{m.v}</div>
            <div style={{ fontSize: "11.5px", color: "rgba(255,255,255,0.6)", marginTop: "5px" }}>{m.l}</div>
          </div>
        ))}
      </div>

      {/* best-for chips */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: "7px", marginTop: "18px" }}>
        {zone.bestFor.map((b) => (
          <span key={b} style={{
            display: "inline-flex", alignItems: "center", gap: "6px", padding: "5px 11px", borderRadius: "var(--radius-full)",
            background: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.82)", fontSize: "12px", fontWeight: 500,
          }}>
            <ZIcon name="check" size={12} color="rgba(255,255,255,0.6)" />{b}
          </span>
        ))}
      </div>

      <div style={{ marginTop: "20px" }}>
        <ZButton variant="accent" size="lg" fullWidth onClick={onViewAll}>
          View all {zone.listings} homes in this zone <ZIcon name="arrow-right" size={17} />
        </ZButton>
      </div>
    </div>
  );
}

// ============================================================
// AREA CARD — refined white card; handles both has-homes and no-homes.
// ============================================================
function AreaCard({ area, mode, onView, onExplore, onHover }) {
  const [hover, setHover] = React.useState(false);
  const empty = area.listings === 0;
  return (
    <div
      onMouseEnter={() => { setHover(true); onHover && onHover(area.id); }}
      onMouseLeave={() => { setHover(false); onHover && onHover(null); }}
      onClick={() => empty ? onExplore(area.id) : onView(area.id)}
      style={{
        background: "var(--surface-card)", border: "1px solid var(--border)",
        borderRadius: "var(--radius-lg)", padding: "18px", cursor: "pointer",
        boxShadow: hover ? "var(--shadow-md)" : "var(--shadow-xs)",
        transform: hover ? "translateY(-2px)" : "none",
        transition: "box-shadow var(--dur-normal) var(--ease-standard), transform var(--dur-normal) var(--ease-standard)",
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: "13px" }}>
        <div style={{
          flex: "none", width: "42px", height: "42px", borderRadius: "var(--radius-md)",
          background: empty ? "var(--canvas-200)" : "var(--navy-100)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <ZIcon name="map-pin" size={20} color={empty ? "var(--grey-500)" : "var(--navy-800)"} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px" }}>
            <h3 style={{ margin: 0, fontSize: "17px", fontWeight: 700, color: "var(--text-strong)", letterSpacing: "-0.01em" }}>{area.name}</h3>
            <ZIcon name="chevron-right" size={18} color={hover ? "var(--accent)" : "var(--grey-400)"} style={{ transition: "color var(--dur-fast) var(--ease-standard)", flex: "none" }} />
          </div>
          <p style={{ margin: "6px 0 0", fontSize: "13px", lineHeight: 1.5, color: "var(--text-body)", textWrap: "pretty" }}>{area.blurb}</p>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px", flexWrap: "wrap", marginTop: "14px", paddingTop: "14px", borderTop: "1px solid var(--border)" }}>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          <SchoolsPill count={area.schools} />
          <ListingsPill count={area.listings} />
        </div>
        <span style={{
          display: "inline-flex", alignItems: "center", gap: "5px", fontSize: "13px", fontWeight: 700,
          color: empty ? "var(--text-muted)" : (hover ? "var(--accent)" : "var(--primary)"),
          transition: "color var(--dur-fast) var(--ease-standard)", whiteSpace: "nowrap",
        }}>
          {empty ? "Explore schools" : "View homes"} <ZIcon name="arrow-right" size={15} />
        </span>
      </div>
    </div>
  );
}

// ============================================================
// SCHOOL ROW — compact, for "Popular schools" + zero-state list.
// ============================================================
function SchoolRow({ school }) {
  const [hover, setHover] = React.useState(false);
  return (
    <div
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{
        display: "flex", alignItems: "center", gap: "12px", padding: "12px 14px",
        background: "var(--surface-card)", border: "1px solid var(--border)", borderRadius: "var(--radius-md)",
        boxShadow: hover ? "var(--shadow-sm)" : "none", transition: "box-shadow var(--dur-fast) var(--ease-standard)",
      }}
    >
      <div style={{
        flex: "none", width: "34px", height: "34px", borderRadius: "var(--radius-sm)",
        background: JOURNEY.bg, display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <ZIcon name="building" size={17} color={JOURNEY.fg} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: "13.5px", fontWeight: 600, color: "var(--text-strong)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{school.name}</div>
        <div style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "2px" }}>{school.type} · {school.students} students</div>
      </div>
    </div>
  );
}

// ============================================================
// AREA STRIP — compact context header shown above results (State 2 / 4).
// ============================================================
function ContextStrip({ crumb, title, subtitle, stats, onBack, backLabel, sort, onSort }) {
  return (
    <div style={{
      background: "var(--surface-card)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)",
      padding: "16px 18px", boxShadow: "var(--shadow-sm)", marginBottom: "20px",
    }}>
      <button onClick={onBack} style={{
        display: "inline-flex", alignItems: "center", gap: "6px", border: "none", background: "transparent",
        color: "var(--text-muted)", cursor: "pointer", fontFamily: "var(--font-sans)", fontSize: "12.5px",
        fontWeight: 600, padding: 0, marginBottom: "10px", whiteSpace: "nowrap",
      }}>
        <ZIcon name="arrow-right" size={14} style={{ transform: "rotate(180deg)" }} />{backLabel}
      </button>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "14px", flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: "220px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "7px", fontSize: "11.5px", color: "var(--text-muted)", marginBottom: "5px" }}>
            <ZIcon name="layers" size={13} color="var(--grey-400)" />{crumb}
          </div>
          <h2 style={{ margin: 0, fontFamily: "var(--font-serif)", fontSize: "23px", fontWeight: 600, letterSpacing: "-0.01em", color: "var(--text-strong)", lineHeight: 1.15 }}>{title}</h2>
          {subtitle && <div style={{ fontSize: "13px", color: "var(--text-muted)", marginTop: "4px" }}>{subtitle}</div>}
        </div>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", flex: "none", paddingTop: "4px" }}>{stats}</div>
      </div>
      {onSort && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", marginTop: "14px", paddingTop: "14px", borderTop: "1px solid var(--border)" }}>
          <span style={{ fontSize: "12.5px", color: "var(--text-muted)" }}>Showing matched homes</span>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <ZIcon name="sliders-horizontal" size={15} color="var(--grey-400)" />
            <div style={{ minWidth: "172px" }}>
              <ZSelect value={sort} onChange={onSort} size="sm" options={[
                { value: "recommended", label: "Sort: Recommended" },
                { value: "price-asc", label: "Price: Low to high" },
                { value: "price-desc", label: "Price: High to low" },
                { value: "newest", label: "Newest first" },
              ]} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// ZERO-LISTING PANEL — for an area with no homes (Katapadi).
// Never a dead end: schools shown + clear recovery actions.
// ============================================================
function ZeroListingPanel({ area, schools, onViewZone, onTryArea, tryAreaName, onStartOver, onSave, saved }) {
  return (
    <div>
      <div style={{
        background: "var(--surface-card)", border: "1px solid var(--border)", borderRadius: "var(--radius-xl)",
        padding: "26px", boxShadow: "var(--shadow-sm)", textAlign: "center",
      }}>
        <div style={{
          width: "54px", height: "54px", borderRadius: "var(--radius-full)", background: "var(--canvas-200)",
          display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px",
        }}>
          <ZIcon name="map-pin" size={24} color="var(--grey-500)" />
        </div>
        <h3 style={{ margin: "0 0 8px", fontFamily: "var(--font-serif)", fontSize: "21px", fontWeight: 600, color: "var(--text-strong)", letterSpacing: "-0.01em" }}>
          No homes listed in {area.name} yet
        </h3>
        <p style={{ margin: "0 auto 18px", maxWidth: "380px", fontSize: "13.5px", lineHeight: 1.55, color: "var(--text-muted)", textWrap: "pretty" }}>
          {area.name} has <strong style={{ color: "var(--text-body)" }}>{area.schools} schools</strong> but no homes on the market right now. It's an emerging pocket of University Belt — set an alert, or browse where homes are available today.
        </p>
        <div style={{ display: "flex", gap: "9px", justifyContent: "center", flexWrap: "wrap" }}>
          <ZButton variant="primary" size="md" onClick={onViewZone}>View all University Belt homes</ZButton>
          <ZButton variant="outline" size="md" onClick={onTryArea}>Try {tryAreaName}</ZButton>
        </div>
        <div style={{ display: "flex", gap: "16px", justifyContent: "center", marginTop: "14px" }}>
          <button onClick={onSave} style={{
            display: "inline-flex", alignItems: "center", gap: "6px", border: "none", background: "transparent",
            cursor: "pointer", fontFamily: "var(--font-sans)", fontSize: "13px", fontWeight: 600,
            color: saved ? "var(--accent)" : "var(--text-body)", whiteSpace: "nowrap",
          }}>
            <ZIcon name="heart" size={15} color={saved ? "var(--accent)" : "var(--grey-500)"} style={{ fill: saved ? "var(--accent)" : "none" }} />
            {saved ? "We'll alert you" : "Save this area"}
          </button>
          <button onClick={onStartOver} style={{
            display: "inline-flex", alignItems: "center", gap: "6px", border: "none", background: "transparent",
            cursor: "pointer", fontFamily: "var(--font-sans)", fontSize: "13px", fontWeight: 600, color: "var(--text-muted)", whiteSpace: "nowrap",
          }}>Start over <ZIcon name="x" size={14} /></button>
        </div>
      </div>

      {/* still useful: the schools here */}
      <div style={{ marginTop: "26px" }}>
        <SectionLabel icon="users" color={JOURNEY.fg} right={<span style={{ fontSize: "12.5px", color: "var(--text-muted)" }}>{schools.length} schools</span>}>
          Schools in {area.name}
        </SectionLabel>
        <div style={{ display: "flex", flexDirection: "column", gap: "9px" }}>
          {schools.map((s) => <SchoolRow key={s.id} school={s} />)}
        </div>
      </div>
    </div>
  );
}

// ---------- Listing card (two-column premium) ----------
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
      <div style={{ position: "relative", height: "162px", background: "var(--surface-muted)", overflow: "hidden" }}>
        <img src={listing.image} alt={listing.title} style={{
          width: "100%", height: "100%", objectFit: "cover",
          transform: hover ? "scale(1.05)" : "scale(1)", transition: "transform var(--dur-slow) var(--ease-standard)",
        }} />
        <div style={{ position: "absolute", top: "11px", left: "11px" }}><ZTrust tier={listing.trustTier} size="sm" /></div>
        <button onClick={(e) => { e.stopPropagation(); onToggleSave && onToggleSave(listing.id); }} aria-label="Save" style={{
          position: "absolute", top: "10px", right: "10px", width: "32px", height: "32px",
          borderRadius: "var(--radius-full)", border: "none", cursor: "pointer",
          background: "rgba(255,255,255,0.92)", backdropFilter: "blur(4px)", boxShadow: "var(--shadow-sm)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <ZIcon name="heart" size={16} color={saved ? "var(--accent)" : "var(--grey-500)"} style={{ fill: saved ? "var(--accent)" : "none" }} />
        </button>
        {listing.walk && (
          <div style={{
            position: "absolute", bottom: "10px", left: "11px", padding: "4px 9px",
            background: "rgba(14,22,38,0.72)", backdropFilter: "blur(4px)", color: "#fff",
            borderRadius: "var(--radius-sm)", fontSize: "11.5px", fontWeight: 500,
            display: "flex", alignItems: "center", gap: "5px",
          }}>
            <ZIcon name="route" size={12} color="#fff" />{listing.walk}
          </div>
        )}
      </div>
      <div style={{ padding: "15px", display: "flex", flexDirection: "column", flex: 1 }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "8px" }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: "19px", fontWeight: 600, color: "var(--text-strong)" }}>{inr(listing.price)}</span>
          <ZBadge tone="neutral" pill>{listing.propType}</ZBadge>
        </div>
        <h3 style={{ margin: "8px 0 4px", fontSize: "14.5px", fontWeight: 600, color: "var(--text-strong)", lineHeight: 1.3 }}>{listing.title}</h3>
        <div style={{ display: "flex", alignItems: "center", gap: "5px", fontSize: "12.5px", color: "var(--text-muted)" }}>
          <ZIcon name="map-pin" size={13} color="var(--grey-400)" />{listing.locality}, {listing.area}
        </div>
        <div style={{ display: "flex", gap: "14px", fontSize: "12.5px", color: "var(--text-body)", margin: "12px 0 14px" }}>
          <span style={{ display: "flex", alignItems: "center", gap: "5px" }}><ZIcon name="bed" size={15} color="var(--grey-400)" />{listing.beds} BHK</span>
          <span style={{ display: "flex", alignItems: "center", gap: "5px" }}><ZIcon name="bath" size={15} color="var(--grey-400)" />{listing.baths}</span>
          <span style={{ display: "flex", alignItems: "center", gap: "5px" }}><ZIcon name="maximize" size={15} color="var(--grey-400)" />{listing.sqft} sq.ft</span>
        </div>
        <div style={{ marginTop: "auto" }}>
          <ZButton variant="outline" size="sm" fullWidth onClick={() => onOpen && onOpen(listing.id)}>View details</ZButton>
        </div>
      </div>
    </div>
  );
}

function ListingGrid({ listings, onHover, onOpen, saved, onToggleSave }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
      {listings.map((l) => (
        <ListingCard key={l.id} listing={l} onHover={onHover} onOpen={onOpen}
          saved={saved.includes(l.id)} onToggleSave={onToggleSave} />
      ))}
    </div>
  );
}

window.UPTZCards = {
  ZoneSummaryCard, AreaCard, SchoolRow, ContextStrip, ZeroListingPanel,
  ListingCard, ListingGrid, SectionLabel, SchoolsPill, ListingsPill, inr, JOURNEY,
};
