// Udupi Property Tracker — Listing detail page (buyer-facing). Exports window.UPTListing.
(function () {
const { Button, Icon, Badge } = window.ReTrendsDesignSystem_f37966;
const { UPT_Gallery: Gallery, UPT_ActionPanel: ActionPanel, UPT_MobileBar: MobileBar, UPT_PanelCard: PanelCard } = window;
const fmtPrice = window.UPT_fmtPrice, perSqft = window.UPT_perSqft, buildSpecs = window.UPT_buildSpecs;

// ---- header ----------------------------------------------------------------
function Header({ signedIn }) {
  const items = [{ label: "Discover", icon: "map-pin", active: true }, { label: "Trends", icon: "trending-up" }, { label: "Saved", icon: "heart" }];
  return (
    <header style={{ position: "sticky", top: 0, zIndex: 40, background: "rgba(255,255,255,0.88)", backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)", borderBottom: "1px solid var(--border)" }}>
      <div style={{ maxWidth: "1180px", margin: "0 auto", padding: "0 28px", height: "64px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "24px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "11px", flex: "none" }}>
          <div style={{ width: "38px", height: "38px", borderRadius: "10px", background: "var(--navy-800)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Icon name="map-pin" size={20} color="#fff" strokeWidth={2.2} />
          </div>
          <div style={{ lineHeight: 1.05 }}>
            <div style={{ fontSize: "17px", fontWeight: 700, letterSpacing: "-0.02em", color: "var(--navy-800)" }}>Udupi Property Tracker</div>
            <div style={{ fontSize: "10.5px", fontWeight: 500, color: "var(--text-muted)" }}>Real Estate Trends</div>
          </div>
        </div>
        <nav className="upt-nav" style={{ display: "flex", alignItems: "center", gap: "6px", flex: "1 1 auto", justifyContent: "center" }}>
          {items.map((it) => (
            <a key={it.label} href="#" style={{ display: "inline-flex", alignItems: "center", gap: "7px", textDecoration: "none", padding: "8px 15px", borderRadius: "var(--radius-full)", fontSize: "14px", fontWeight: 600, color: it.active ? "#fff" : "var(--text-body)", background: it.active ? "var(--navy-800)" : "transparent" }}>
              <Icon name={it.icon} size={16} color={it.active ? "#fff" : "var(--text-muted)"} />{it.label}
            </a>
          ))}
        </nav>
        <div style={{ flex: "none" }}>
          {signedIn ? (
            <span style={{ width: "36px", height: "36px", borderRadius: "var(--radius-full)", background: "var(--navy-100)", color: "var(--navy-800)", fontSize: "13px", fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>PK</span>
          ) : <Button variant="outline" size="sm">Sign in</Button>}
        </div>
      </div>
    </header>
  );
}

function Breadcrumb({ p }) {
  const crumbs = ["Home", "Discover", p.city, p.area];
  return (
    <nav style={{ display: "flex", alignItems: "center", gap: "7px", flexWrap: "wrap", marginBottom: "18px" }}>
      {crumbs.map((c, i) => (
        <React.Fragment key={i}>
          <a href="#" style={{ fontSize: "13px", fontWeight: 500, color: "var(--text-muted)", textDecoration: "none" }}>{c}</a>
          <Icon name="chevron-right" size={13} color="var(--grey-400)" />
        </React.Fragment>
      ))}
      <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-strong)" }}>{p.title}</span>
    </nav>
  );
}

// ---- section scaffold ------------------------------------------------------
function Section({ title, icon, sub, action, children }) {
  return (
    <section style={{ background: "var(--paper)", border: "1px solid var(--border)", borderRadius: "var(--radius-xl)", padding: "26px", boxShadow: "var(--shadow-sm)" }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "16px", marginBottom: sub ? "4px" : "18px" }}>
        <h2 style={{ margin: 0, display: "flex", alignItems: "center", gap: "9px", fontSize: "18px", fontWeight: 700, color: "var(--text-strong)" }}>
          {icon && <Icon name={icon} size={18} color="var(--navy-700)" />}{title}
        </h2>
        {action}
      </div>
      {sub && <p style={{ margin: "0 0 18px", fontSize: "13px", color: "var(--text-muted)" }}>{sub}</p>}
      {children}
    </section>
  );
}

// ---- summary ---------------------------------------------------------------
function Summary({ p, priceGated }) {
  const price = fmtPrice(p.price), ps = perSqft(p);
  const facts = window.UPT_topFacts(p);
  return (
    <section style={{ background: "var(--paper)", border: "1px solid var(--border)", borderRadius: "var(--radius-xl)", padding: "26px", boxShadow: "var(--shadow-sm)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: "24px", flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 320px", minWidth: 0 }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "7px", marginBottom: "12px" }}>
            <Badge tone="navy" pill><Icon name="building" size={12} />{p.kindLabel}</Badge>
            <Badge tone="accent" pill>{p.listingType === "rent" ? "For rent" : "For sale"}</Badge>
            <Badge tone="neutral" pill>{p.listedBy === "owner" ? "Listed by owner" : "Listed by broker"}</Badge>
          </div>
          <h1 style={{ margin: "0 0 6px", fontFamily: "var(--font-serif)", fontSize: "32px", fontWeight: 600, letterSpacing: "-0.02em", lineHeight: 1.1, color: "var(--text-strong)" }}>{p.title}</h1>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: "12.5px", color: "var(--text-muted)", marginBottom: "10px" }}>{p.ref}</div>
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "8px", marginBottom: "14px" }}>
            {facts.map((f, i) => (
              <React.Fragment key={i}>
                {i > 0 && <span style={{ width: "3px", height: "3px", borderRadius: "50%", background: "var(--grey-300)", flex: "none" }} />}
                <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-body)", whiteSpace: "nowrap" }}>{f}</span>
              </React.Fragment>
            ))}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "7px", color: "var(--text-body)", fontSize: "14.5px", marginBottom: "4px" }}>
            <Icon name="map-pin" size={16} color="var(--grey-400)" />{p.area}, {p.city}
          </div>
          <a href={p.mapsUrl} style={{ display: "inline-flex", alignItems: "center", gap: "5px", fontSize: "13px", fontWeight: 600, color: "var(--navy-700)", textDecoration: "none" }}>View on Google Maps<Icon name="arrow-up-right" size={13} /></a>
        </div>
        <div style={{ flex: "none", textAlign: "right" }}>
          {priceGated || price == null ? (
            <div>
              <div style={{ fontFamily: "var(--font-serif)", fontSize: "24px", fontWeight: 600, color: "var(--text-strong)", lineHeight: 1.1 }}>Price on request</div>
              <div style={{ fontSize: "12.5px", color: "var(--text-muted)", margin: "6px 0 10px", maxWidth: "200px" }}>The lister hasn't published a price. Ask and we'll pass it on.</div>
              <Button variant="outline" size="sm"><Icon name="message-circle" size={14} />Request price</Button>
            </div>
          ) : (
            <React.Fragment>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: "30px", fontWeight: 600, color: "var(--text-strong)", lineHeight: 1.1, whiteSpace: "nowrap" }}>{price}</div>
              {ps && <div style={{ fontFamily: "var(--font-mono)", fontSize: "13px", color: "var(--text-muted)", marginTop: "5px" }}>{ps}</div>}
              {p.listingType === "rent" && <div style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "2px" }}>per month</div>}
            </React.Fragment>
          )}
        </div>
      </div>
    </section>
  );
}

// ---- type-adaptive details -------------------------------------------------
function Tile({ icon, label, value, big }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: big ? "8px" : "5px", padding: big ? "16px" : "13px 15px", background: "var(--surface-subtle)", border: "1px solid var(--border)", borderRadius: "var(--radius-md)" }}>
      <Icon name={icon} size={big ? 19 : 16} color="var(--navy-700)" />
      <span style={{ fontFamily: "var(--font-mono)", fontSize: big ? "16px" : "14px", fontWeight: 600, color: "var(--text-strong)", lineHeight: 1.25 }}>{value}</span>
      <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>{label}</span>
    </div>
  );
}
function Details({ p }) {
  const { tiles, rows } = buildSpecs(p);
  return (
    <Section title="Property details" sub={`Shown for ${p.kindLabel.toLowerCase()} listings — fields that don't apply to this property type are hidden.`}>
      <div className="upt-tiles" style={{ display: "grid", gridTemplateColumns: `repeat(${tiles.length}, 1fr)`, gap: "12px", marginBottom: rows.length ? "20px" : 0 }}>
        {tiles.map((t) => <Tile key={t.label} {...t} big />)}
      </div>
      {rows.length > 0 && (
        <div className="upt-rows" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
          {rows.map((r) => (
            <div key={r.label} style={{ display: "flex", alignItems: "center", gap: "11px", padding: "11px 14px", borderRadius: "var(--radius-md)", border: "1px solid var(--border)" }}>
              <Icon name={r.icon} size={16} color="var(--grey-400)" style={{ flex: "none" }} />
              <span style={{ fontSize: "13px", color: "var(--text-muted)", flex: "none" }}>{r.label}</span>
              <span style={{ flex: 1, height: "1px", background: "var(--border)" }} />
              <span style={{ fontSize: "13.5px", fontWeight: 600, color: "var(--text-strong)", textAlign: "right" }}>{r.value}</span>
            </div>
          ))}
        </div>
      )}
    </Section>
  );
}

function Description({ p }) {
  const short = (p.description || "").length < 80;
  return (
    <Section title="About this property" icon="file-check">
      {p.description ? (
        <p style={{ margin: 0, fontSize: "15px", lineHeight: 1.7, color: "var(--text-body)", maxWidth: "70ch", textWrap: "pretty" }}>{p.description}</p>
      ) : (
        <p style={{ margin: 0, fontSize: "14px", color: "var(--text-muted)", fontStyle: "italic" }}>The lister hasn't added a description yet. Use the details above, or send a message to ask for more.</p>
      )}
      {short && p.description && <p style={{ margin: "10px 0 0", fontSize: "13px", color: "var(--text-muted)" }}>Want more detail? Send a message to the lister.</p>}
    </Section>
  );
}

// ---- area market -----------------------------------------------------------
function AreaMarket({ p }) {
  const m = p.areaMarket, href = `/trends/${p.citySlug}/areas/${p.areaSlug}`;
  return (
    <Section title="Area market" icon="trending-up" sub={`How the market looks in ${p.area}, ${p.city}.`}
      action={<a href={href} style={{ display: "inline-flex", alignItems: "center", gap: "5px", fontSize: "13px", fontWeight: 600, color: "var(--navy-700)", textDecoration: "none", whiteSpace: "nowrap" }}>View trends<Icon name="arrow-right" size={14} /></a>}>
      {m ? (
        <div>
          <div className="upt-market" style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: "12px", marginBottom: "14px" }}>
            <MarketStat label="Median price" value={m.median} />
            <MarketStat label="12-mo trend" value={m.trend} dir={m.trendDir} />
            <MarketStat label="Live listings" value={m.listings} />
            <MarketStat label="Buyer demand" value={m.demand} />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "10px 13px", background: "var(--caution-bg)", borderRadius: "var(--radius-md)" }}>
            <span style={{ width: "7px", height: "7px", borderRadius: "50%", background: "var(--caution)", flex: "none" }} />
            <span style={{ fontSize: "12.5px", color: "var(--text-body)" }}><strong>{m.confidence}</strong> — a few figures are still settling, so treat these as a guide.</span>
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", gap: "14px", padding: "18px", background: "var(--surface-subtle)", borderRadius: "var(--radius-md)" }}>
          <span style={{ width: "40px", height: "40px", flex: "none", borderRadius: "var(--radius-md)", background: "var(--paper)", display: "flex", alignItems: "center", justifyContent: "center" }}><Icon name="trending-up" size={19} color="var(--grey-400)" /></span>
          <div>
            <div style={{ fontSize: "14.5px", fontWeight: 700, color: "var(--text-strong)", marginBottom: "3px" }}>Not enough data for this area yet</div>
            <p style={{ margin: "0 0 12px", fontSize: "13px", color: "var(--text-muted)", lineHeight: 1.55, maxWidth: "60ch" }}>As more verified listings and buyer searches come in for {p.area}, we'll show price context and demand here — we won't show figures until they're reliable.</p>
            <a href={href} style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "13px", fontWeight: 600, color: "var(--navy-700)", textDecoration: "none" }}>See area insights for {p.area}<Icon name="arrow-right" size={14} /></a>
          </div>
        </div>
      )}
    </Section>
  );
}
function MarketStat({ label, value, dir }) {
  const col = dir === "up" ? "var(--positive)" : dir === "down" ? "var(--negative)" : "var(--text-strong)";
  return (
    <div style={{ padding: "13px 15px", background: "var(--surface-subtle)", borderRadius: "var(--radius-md)", border: "1px solid var(--border)" }}>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: "17px", fontWeight: 600, color: col }}>{dir ? (dir === "up" ? "▲ " : "▼ ") : ""}{value}</div>
      <div style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "3px" }}>{label}</div>
    </div>
  );
}

// ---- location & essentials -------------------------------------------------
function Location({ p }) {
  const [allSchools, setAllSchools] = React.useState(false);
  const [allEss, setAllEss] = React.useState(false);
  const shown = allSchools ? p.schools : p.schools.slice(0, 4);
  const essShown = allEss ? p.essentials : p.essentials.slice(0, 2);
  return (
    <Section title="Location & essentials" icon="map-pin" sub={`${p.fullAddress}`}
      action={<Button variant="outline" size="sm"><Icon name="map-pin" size={14} />Open in Maps</Button>}>
      {/* map placeholder */}
      <div style={{ position: "relative", height: "260px", borderRadius: "var(--radius-md)", overflow: "hidden", border: "1px solid var(--border)", background: "var(--canvas-200)", backgroundImage: "repeating-linear-gradient(135deg, transparent 0 22px, rgba(27,42,69,0.03) 22px 44px)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: "22px" }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "8px" }}>
          <span style={{ width: "44px", height: "44px", borderRadius: "var(--radius-full)", background: "var(--accent)", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "var(--shadow-md)" }}><Icon name="map-pin" size={22} color="#fff" /></span>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: "11px", letterSpacing: "0.05em", textTransform: "uppercase", color: "var(--grey-500)" }}>Interactive map</span>
        </div>
        <span style={{ position: "absolute", bottom: "8px", right: "10px", fontSize: "10px", color: "var(--grey-400)" }}>© OpenStreetMap contributors</span>
      </div>

      {/* schools */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
        <h3 style={{ margin: 0, display: "flex", alignItems: "center", gap: "8px", fontSize: "14.5px", fontWeight: 700, color: "var(--text-strong)" }}><Icon name="building" size={16} color="var(--navy-700)" />Nearby schools <span style={{ fontWeight: 500, color: "var(--text-muted)" }}>({p.schools.length} within 2 km)</span></h3>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "2px 28px", marginBottom: "14px" }} className="upt-schools">
        {shown.map((s) => (
          <div key={s.name} style={{ display: "flex", alignItems: "center", gap: "8px", padding: "9px 0", borderBottom: "1px solid var(--border)" }}>
            <Icon name="map-pin" size={14} color="var(--grey-400)" style={{ flex: "none" }} />
            <span style={{ fontSize: "13.5px", color: "var(--text-body)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.name}</span>
            <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>{s.board}</span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: "12.5px", fontWeight: 500, color: "var(--text-strong)", width: "52px", textAlign: "right", flex: "none" }}>{s.dist}</span>
          </div>
        ))}
      </div>
      {p.schools.length > 4 && (
        <button onClick={() => setAllSchools(!allSchools)} style={{ display: "inline-flex", alignItems: "center", gap: "6px", border: "none", background: "none", cursor: "pointer", fontFamily: "var(--font-sans)", fontSize: "13px", fontWeight: 600, color: "var(--navy-700)", padding: 0, marginBottom: "22px" }}>
          {allSchools ? "Show fewer" : `Show all ${p.schools.length} schools`}<Icon name="chevron-down" size={14} style={{ transform: allSchools ? "rotate(180deg)" : "none" }} />
        </button>
      )}

      {/* essentials */}
      <h3 style={{ margin: "8px 0 12px", display: "flex", alignItems: "center", gap: "8px", fontSize: "14.5px", fontWeight: 700, color: "var(--text-strong)" }}><Icon name="route" size={16} color="var(--navy-700)" />Nearby essentials</h3>
      <div className="upt-ess" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
        {essShown.map((e) => (
          <div key={e.label} style={{ padding: "14px 16px", border: "1px solid var(--border)", borderRadius: "var(--radius-md)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "10px" }}>
              <Icon name={e.icon} size={15} color="var(--navy-700)" /><span style={{ fontSize: "12.5px", fontWeight: 700, color: "var(--text-strong)" }}>{e.label}</span>
            </div>
            {e.items.map((it) => (
              <div key={it.name} style={{ display: "flex", justifyContent: "space-between", gap: "10px", padding: "4px 0", fontSize: "13px" }}>
                <span style={{ color: "var(--text-body)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.name}</span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: "12px", color: "var(--text-muted)", flex: "none" }}>{it.dist}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
      {p.essentials.length > 2 && (
        <button onClick={() => setAllEss(!allEss)} style={{ display: "inline-flex", alignItems: "center", gap: "6px", border: "none", background: "none", cursor: "pointer", fontFamily: "var(--font-sans)", fontSize: "13px", fontWeight: 600, color: "var(--navy-700)", padding: 0, marginTop: "14px" }}>
          {allEss ? "Show fewer" : "Show all nearby essentials"}<Icon name="chevron-down" size={14} style={{ transform: allEss ? "rotate(180deg)" : "none" }} />
        </button>
      )}
    </Section>
  );
}

// ---- transparency ----------------------------------------------------------
const TRUST_CHECKS = {
  verified: ["Ownership documents checked", "RERA / approval reference on file", "Listed by a verified broker", "Photos confirmed for this property"],
  trusted: ["Listed by a verified broker", "Key details cross-checked", "Photos confirmed for this property"],
  listed: ["Basic details recorded", "Verification still in progress"],
};
function Transparency({ p }) {
  const checks = TRUST_CHECKS[p.trustTier] || TRUST_CHECKS.listed;
  return (
    <Section title="Why trust this listing?" icon="shield-check" sub="What we've checked, and what's still in progress — so you know what you're looking at.">
      <div className="upt-trust" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px 28px", marginBottom: "18px" }}>
        {checks.map((c, i) => {
          const pending = c.toLowerCase().includes("progress") || c.toLowerCase().includes("recorded");
          return (
            <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: "9px", fontSize: "13.5px", color: "var(--text-body)" }}>
              <Icon name={pending ? "alert-triangle" : "check"} size={16} color={pending ? "var(--caution)" : "var(--positive)"} style={{ flex: "none", marginTop: "2px" }} />{c}
            </div>
          );
        })}
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "14px", flexWrap: "wrap", paddingTop: "16px", borderTop: "1px solid var(--border)" }}>
        <div style={{ display: "flex", gap: "18px", flexWrap: "wrap", fontSize: "12.5px", color: "var(--text-muted)" }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}><Icon name="calendar" size={13} />Last updated {p.updated}</span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}><Icon name="users" size={13} />Listed by {p.listedBy === "owner" ? "owner" : "verified broker"}</span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}><Icon name="calendar" size={13} />Posted {p.postedDate}</span>
        </div>
        <a href="#" style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "12.5px", fontWeight: 600, color: "var(--text-muted)", textDecoration: "none" }}><Icon name="alert-triangle" size={13} />Report this listing</a>
      </div>
    </Section>
  );
}

// ---- similar ---------------------------------------------------------------
function Similar({ p }) {
  const items = [
    { t: "2 BHK near Diana Circle", price: "₹38.50 L", meta: "950 sq ft · Apartment" },
    { t: "3 BHK in Kunjibettu", price: "₹56.00 L", meta: "1,310 sq ft · Apartment" },
    { t: "Plot near Brahmagiri", price: "₹72.00 L", meta: "1,800 sq ft · Residential plot" },
  ];
  return (
    <Section title={`More homes in ${p.area}`} icon="building"
      action={<a href="#" style={{ display: "inline-flex", alignItems: "center", gap: "5px", fontSize: "13px", fontWeight: 600, color: "var(--navy-700)", textDecoration: "none", whiteSpace: "nowrap" }}>Back to search<Icon name="arrow-right" size={14} /></a>}>
      <div className="upt-similar" style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "14px" }}>
        {items.map((it) => (
          <a key={it.t} href="#" style={{ textDecoration: "none", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", overflow: "hidden", display: "block", background: "var(--paper)", boxShadow: "var(--shadow-xs)" }}>
            <div style={{ height: "120px", background: "var(--canvas-200)", backgroundImage: "repeating-linear-gradient(135deg, transparent 0 14px, rgba(27,42,69,0.035) 14px 28px)", display: "flex", alignItems: "center", justifyContent: "center" }}><Icon name="camera" size={20} color="var(--grey-400)" /></div>
            <div style={{ padding: "13px 15px" }}>
              <div style={{ fontSize: "14px", fontWeight: 700, color: "var(--text-strong)", marginBottom: "3px" }}>{it.t}</div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: "15px", fontWeight: 600, color: "var(--text-strong)", marginBottom: "4px" }}>{it.price}</div>
              <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>{it.meta}</div>
            </div>
          </a>
        ))}
      </div>
    </Section>
  );
}

// ---- mock notes (design-review documentation, not product UI) --------------
function MockNotes() {
  const groups = [
    { t: "1 · Apartment / House / Villa", body: "Residential layout. Shows bedrooms, bathrooms, built-up area and floor as the headline tiles, with furnishing, parking, property age, facing and (for house/villa) plot area in the detail rows.", icon: "bed" },
    { t: "2 · Residential land / plot", body: "Land layout. Headline tiles become plot area, dimensions, road access and build suitability. Bedroom / bathroom / furnishing cards are hidden; boundary, title clarity and corner-plot status take their place.", icon: "maximize" },
    { t: "3 · Commercial building", body: "Commercial layout. Headline tiles become built-up area, floor count, road frontage and visibility. Usage type, parking / loading, power backup and lift show in detail rows. No residential-only language.", icon: "building" },
  ];
  return (
    <section style={{ border: "1px dashed var(--border-strong)", borderRadius: "var(--radius-xl)", padding: "24px", background: "var(--surface-subtle)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "9px", marginBottom: "6px" }}>
        <Icon name="sliders-horizontal" size={16} color="var(--text-muted)" />
        <h2 style={{ margin: 0, fontSize: "13px", fontWeight: 700, letterSpacing: "var(--tracking-caps)", textTransform: "uppercase", color: "var(--text-muted)" }}>Mock notes · property-type adaptation</h2>
      </div>
      <p style={{ margin: "0 0 18px", fontSize: "13px", color: "var(--text-muted)", maxWidth: "80ch", lineHeight: 1.55 }}>For design review only — not shown to buyers. The same page adapts to each non-agricultural property type using conditional cards, so irrelevant fields are hidden rather than shown empty. Use the type switcher (bottom of screen) to preview each. Agricultural properties are out of scope here.</p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "14px" }} className="upt-notes">
        {groups.map((g) => (
          <div key={g.t} style={{ background: "var(--paper)", border: "1px solid var(--border)", borderRadius: "var(--radius-md)", padding: "16px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}><Icon name={g.icon} size={16} color="var(--navy-700)" /><span style={{ fontSize: "13.5px", fontWeight: 700, color: "var(--text-strong)" }}>{g.t}</span></div>
            <p style={{ margin: 0, fontSize: "12.5px", color: "var(--text-body)", lineHeight: 1.55, textWrap: "pretty" }}>{g.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

// ---- skeleton --------------------------------------------------------------
function Sk({ w, h, r }) { return <div className="upt-skel" style={{ width: w, height: h, borderRadius: r || "var(--radius-sm)" }} />; }
function Skeleton() {
  return (
    <div className="upt-grid" style={gridStyle}>
      <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
        <Sk w="100%" h="440px" r="var(--radius-xl)" />
        <div style={{ background: "var(--paper)", border: "1px solid var(--border)", borderRadius: "var(--radius-xl)", padding: "26px", display: "flex", flexDirection: "column", gap: "12px" }}>
          <Sk w="180px" h="22px" /><Sk w="60%" h="34px" /><Sk w="40%" h="16px" />
        </div>
        <div style={{ background: "var(--paper)", border: "1px solid var(--border)", borderRadius: "var(--radius-xl)", padding: "26px", display: "flex", gap: "12px" }}>
          {[0, 1, 2, 3].map((i) => <Sk key={i} w="25%" h="86px" r="var(--radius-md)" />)}
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
        <Sk w="100%" h="360px" r="var(--radius-lg)" /><Sk w="100%" h="150px" r="var(--radius-xl)" />
      </div>
    </div>
  );
}

const gridStyle = { display: "grid", gridTemplateColumns: "minmax(0,1.7fr) minmax(320px,1fr)", gap: "28px", alignItems: "start" };

// ---- page ------------------------------------------------------------------
function UPTListing({ kind = "apartment", state = "default" }) {
  const p = window.UPT_LISTINGS[kind] || window.UPT_LISTINGS.apartment;
  const [saved, setSaved] = React.useState(state === "saved");
  React.useEffect(() => { setSaved(state === "saved"); }, [state]);

  const signedIn = state === "signedin";
  const noPhotos = state === "nophotos";
  const priceGated = state === "gated";
  const brokerUnavailable = state === "nobroker";

  return (
    <div style={{ background: "var(--background)", minHeight: "100vh" }}>
      <Header signedIn={signedIn} />
      <main style={{ maxWidth: "1180px", margin: "0 auto", padding: "22px 28px 96px" }} className="upt-main">
        <a href="#" style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "13px", fontWeight: 600, color: "var(--text-muted)", textDecoration: "none", marginBottom: "14px", whiteSpace: "nowrap" }}>
          <Icon name="arrow-right" size={15} style={{ transform: "rotate(180deg)" }} />Back to search results
        </a>
        <Breadcrumb p={p} />
        {state === "loading" ? <Skeleton /> : (
          <div className="upt-grid" style={gridStyle}>
            <div style={{ display: "flex", flexDirection: "column", gap: "20px", minWidth: 0 }}>
              <Gallery p={p} saved={saved} onSave={() => setSaved(!saved)} noPhotos={noPhotos} />
              <Summary p={p} priceGated={priceGated} />
              <Details p={p} />
              <Description p={p} />
              <Location p={p} />
              <Transparency p={p} />
            </div>
            <ActionPanel p={p} saved={saved} onSave={() => setSaved(!saved)} signedIn={signedIn} brokerAvailable={!brokerUnavailable} />
          </div>
        )}
      </main>
      <MobileBar saved={saved} onSave={() => setSaved(!saved)} />
    </div>
  );
}

window.UPTListing = UPTListing;
})();
