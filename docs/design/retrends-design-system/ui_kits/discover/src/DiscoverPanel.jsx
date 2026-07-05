// Unified Discover Portal — panel body. Exports window.DiscoverPanelBody
// Pure view: renders the right-panel content for the current `layer`, driven by
// the ctx bag from DiscoverPortal. Every level mirrors the map layer 1:1.
const { Icon: NIcon, Button: NButton } = window.ReTrendsDesignSystem_f37966;
const noun = window.BLR_NOUN;
const title = window.BLR_TITLE;
const CO = window.BLR_COUNTS;

function ListingGrid({ list, ctx, distFrom }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
      {list.map((l) => (
        <window.DPListingCard key={l.id} listing={l} onHover={ctx.setActive} onOpen={() => {}}
          saved={ctx.saved.includes(l.id)} onToggleSave={ctx.toggleSave}
          distanceKm={distFrom ? window.BLR_DIST(distFrom, l) : null} />
      ))}
    </div>
  );
}
function ColStack({ children }) { return <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>{children}</div>; }

function SearchRow({ ctx }) {
  const hide = ctx.layer === "area-listings" || ctx.layer === "school-homes";
  if (!ctx.showSearch || hide) return null;
  return <window.DPScopedSearch scopeLabel={ctx.scopeLabel} searchMode={ctx.searchMode} onModeChange={ctx.setSearchMode} results={ctx.searchResults} onPick={ctx.onPickSearch} />;
}

function RegionJourneys({ ctx }) {
  const D = window.BLR_DATA;
  const rName = ctx.regionObj ? ctx.regionObj.name : ctx.city;
  const inR = ctx.regionObj ? ` in ${rName}` : "";
  const homes = ctx.scope ? CO.homesRegion(ctx.scope) : CO.totalHomes;
  const areas = ctx.scope ? D.areas.filter((a) => a.region === ctx.scope).length : D.areas.length;
  const groups = ctx.scope ? D.groups.filter((g) => g.region === ctx.scope).length : D.groups.length;
  const schools = ctx.scope ? CO.schoolsRegion(ctx.scope) : CO.totalSchools;
  return (
    <ColStack>
      <window.DPRichJourneyCard accent="area" primary title={`Search by area${inR}`}
        desc={`Browse the ${groups} area groups${inR}, then open the homes inside the single area that fits.`}
        chips={[`${areas} areas`, `${homes} homes`, "Locality insights"]} cta="Explore areas" onClick={() => ctx.setJourney("area")} />
      <window.DPRichJourneyCard accent="school" title={`Search near a school${inR}`}
        desc={`Pick a school${inR} as your anchor and see only the homes within an easy daily commute of it.`}
        chips={["3 / 5 / 10 km radius", `${schools} schools`]} cta="Find homes near schools" onClick={() => ctx.setJourney("school")} />
      <window.DPRichJourneyCard accent="listings" title={`View all listings${inR}`}
        desc={ctx.regionObj ? `Every verified home in ${rName} on one filterable list — skip the funnel.` : "Skip the funnel — browse every verified home on one filterable list."}
        chips={[`${homes} homes`, "One filterable list"]} cta="View all listings" onClick={() => ctx.setJourney("listings")} />
      <window.DPRichJourneyCard accent="agri" separated title="Find agricultural land"
        desc="Farmland isn't tied to a residential region — this clears the region scope and opens the city-wide agri journey, searched by corridor, direction and distance from town."
        chips={["Clears region scope", "By corridor & direction"]} cta="Search farmland" onClick={() => ctx.setJourney("agri")} />
    </ColStack>
  );
}

function DiscoverPanelBody({ ctx }) {
  const { layer, mode, regionObj, groupObj, zoneObj, areaObj, schoolObj, corridorObj, clusterObj } = ctx;
  const city = ctx.city;
  const rShort = regionObj ? regionObj.short : null;
  const changeRegionBtn = ctx.scope ? <window.DPGhostBtn onClick={ctx.changeRegion}>Change region</window.DPGhostBtn> : null;

  // ============ CITY LANDING (neutral) — editorial hero, journey CTAs first, regions second ============
  if (layer === "region-bubbles") {
    const D = window.BLR_DATA;
    return (
      <>
        {/* A. Editorial hero */}
        <div style={{ display: "flex", alignItems: "center", gap: "7px", marginBottom: "14px" }}>
          <NIcon name="map-pin" size={15} color="var(--accent)" />
          <span style={{ fontSize: "12px", fontWeight: 700, letterSpacing: "var(--tracking-caps)", textTransform: "uppercase", color: "var(--text-muted)", whiteSpace: "nowrap" }}>Discover {city}</span>
        </div>
        <h1 style={{ margin: "0 0 14px", fontFamily: "var(--font-serif)", fontWeight: 600, fontSize: "36px", lineHeight: 1.1, letterSpacing: "-0.02em", color: "var(--text-strong)", textWrap: "balance" }}>
          Find your place in {city}, your way.
        </h1>
        <p style={{ margin: "0 0 12px", fontSize: "16px", lineHeight: 1.55, color: "var(--text-body)", maxWidth: "48ch", textWrap: "pretty" }}>
          Browse verified properties across {city}. Pick how you'd like to start — by neighbourhood, by school, or by farmland.
        </p>
        <p style={{ margin: "0 0 14px", fontSize: "12.5px", color: "var(--text-muted)" }}>
          {mode === "Rent" ? "Showing monthly rents in \u20b9 — the same homes, reworded for renting." : "Showing sale prices in \u20b9 across every journey."}
        </p>

        {/* City + Buy/Rent controls — restored from discover_city.html */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: "12px", alignItems: "flex-end", padding: "14px", marginBottom: "28px", background: "var(--paper)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", boxShadow: "var(--shadow-xs)" }}>
          <label style={{ display: "flex", flexDirection: "column", gap: "6px", flex: "1 1 170px" }}>
            <span style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "var(--tracking-caps)", textTransform: "uppercase", color: "var(--text-muted)" }}>City</span>
            <div style={{ position: "relative" }}>
              <select value={city} onChange={(e) => ctx.changeCity(e.target.value)} style={{
                width: "100%", appearance: "none", WebkitAppearance: "none", padding: "9px 34px 9px 12px",
                border: "1px solid var(--border-strong)", borderRadius: "var(--radius-md)", background: "var(--input-bg)",
                fontFamily: "var(--font-sans)", fontSize: "14px", fontWeight: 600, color: "var(--text-strong)", cursor: "pointer",
              }}>
                {ctx.cities.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <span style={{ position: "absolute", right: "11px", top: "50%", transform: "translateY(-50%)", pointerEvents: "none", display: "inline-flex" }}>
                <NIcon name="chevron-down" size={16} color="var(--grey-500)" />
              </span>
            </div>
          </label>
          <div style={{ display: "flex", flexDirection: "column", gap: "6px", flex: "1 1 200px" }}>
            <span style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "var(--tracking-caps)", textTransform: "uppercase", color: "var(--text-muted)" }}>Looking to</span>
            <div style={{ display: "flex", gap: "3px", padding: "3px", background: "var(--input-bg)", borderRadius: "var(--radius-md)", border: "1px solid var(--border-strong)" }}>
              {["Buy", "Rent"].map((opt) => {
                const on = mode === opt;
                return (
                  <button key={opt} onClick={() => ctx.setMode(opt)} style={{
                    flex: 1, padding: "8px 0", textAlign: "center", cursor: "pointer", border: "none", borderRadius: "var(--radius-sm)",
                    fontFamily: "var(--font-sans)", fontSize: "13.5px", fontWeight: 600,
                    background: on ? "var(--paper)" : "transparent", color: on ? "var(--text-strong)" : "var(--text-muted)",
                    boxShadow: on ? "var(--shadow-sm)" : "none", transition: "background var(--dur-fast), color var(--dur-fast)",
                  }}>{opt}</button>
                );
              })}
            </div>
          </div>
        </div>

        {/* B. Journey CTAs — the primary decision */}
        <window.DPSection icon="route">Choose how you want to search</window.DPSection>
        <ColStack>
          <window.DPRichJourneyCard accent="area" primary title="Explore by area"
            desc={`Start with the neighbourhood. Explore ${city} localities, then open the properties inside the area that fits.`}
            chips={[`${D.areas.length} areas`, `${CO.totalHomes} properties`, "Locality insights"]} cta="Explore areas" onClick={() => ctx.setJourney("area")} />
          <window.DPRichJourneyCard accent="school" title="Search near a school"
            desc="Pick a school as your anchor and see only the homes within an easy daily commute of it."
            chips={["3 / 5 / 10 km radius", `${CO.totalSchools} schools`]} cta="Find homes near schools" onClick={() => ctx.setJourney("school")} />
          <window.DPRichJourneyCard accent="listings" title="View all listings"
            desc={`Skip the funnel — browse every verified home across ${city} on one filterable list.`}
            chips={[`${CO.totalHomes} properties`, "One filterable list"]} cta="View all listings" onClick={() => ctx.setJourney("listings")} />
          <window.DPRichJourneyCard accent="agri" separated title="Find agricultural land"
            desc="Looking for farmland instead? It's searched by corridor, direction and distance from town — a separate journey, kept apart from residential neighbourhoods."
            chips={["By corridor & direction", "Farmland only"]} cta="Search farmland" onClick={() => ctx.setJourney("agri")} />
        </ColStack>

        {/* C. Macro regions — secondary "or start with a region" */}
        <div style={{ height: "1px", background: "var(--border)", margin: "30px 0 26px" }} />
        <window.DPSection icon="map-pin" right={<span style={{ fontSize: "13px", color: "var(--text-muted)" }}>{D.regions.length} regions</span>}>Or start with a region</window.DPSection>
        <p style={{ margin: "-4px 0 14px", fontSize: "13px", lineHeight: 1.5, color: "var(--text-muted)", textWrap: "pretty" }}>
          Prefer to narrow by part of the city first? Pick a region to scope the map, then choose how to search inside it.
        </p>
        <ColStack>{D.regions.map((r) => <window.DPRegionCard key={r.id} region={r} onView={ctx.pickRegion} />)}</ColStack>

        {/* D. Trust note */}
        <div style={{ display: "flex", alignItems: "center", gap: "11px", marginTop: "26px", paddingTop: "20px", borderTop: "1px solid var(--border)" }}>
          <span style={{ width: "34px", height: "34px", flex: "none", borderRadius: "var(--radius-md)", background: "var(--evergreen-50)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <NIcon name="shield-check" size={19} color="var(--evergreen-600)" />
          </span>
          <p style={{ margin: 0, fontSize: "13px", lineHeight: 1.45, color: "var(--text-body)" }}>
            <strong style={{ color: "var(--text-strong)" }}>Every listing is verified.</strong> Documents checked, RERA registered and broker-confirmed — before it reaches you.
          </p>
        </div>
      </>
    );
  }

  // ============ REGION SELECTED (journey null) ============
  if (layer === "region-hotspots") {
    const hotspots = window.BLR_DATA.areas.filter((a) => a.region === ctx.scope).map((a) => ({ a, c: CO.homesArea(a.id) })).sort((x, y) => y.c - x.c).slice(0, 4);
    return (
      <>
        <window.DPBackLink onClick={ctx.back}>Back to all regions</window.DPBackLink>
        <window.DPHeaderBand eyebrow="Region" title={regionObj.name} sub={regionObj.blurb} crumb={[`Discover ${city}`, regionObj.name]}
          stats={[{ value: CO.homesRegion(ctx.scope), label: noun(mode, CO.homesRegion(ctx.scope)) }]} actions={changeRegionBtn} />
        <SearchRow ctx={ctx} />
        <window.DPSection icon="route">Continue in {rShort} Bangalore</window.DPSection>
        <RegionJourneys ctx={ctx} />
        <div style={{ marginTop: "22px" }}>
          <window.DPSection icon="map-pin">Top areas</window.DPSection>
          <ColStack>{hotspots.map(({ a }) => <window.DPAreaCard key={a.id} area={a} mode={mode} onView={ctx.pickArea} />)}</ColStack>
        </div>
      </>
    );
  }

  // ============ AREA JOURNEY — groups ============
  if (layer === "area-groups") {
    const groups = window.BLR_DATA.groups.filter((g) => !ctx.scope || g.region === ctx.scope);
    return (
      <>
        <window.DPBackLink onClick={ctx.back}>{ctx.scope ? `Back to ${rShort} overview` : `Back to Discover ${city}`}</window.DPBackLink>
        <window.DPHeaderBand eyebrow="Search by area" title={ctx.scope ? `Area groups in ${rShort}` : `Area groups across ${city}`}
          sub="Pick a group to narrow to its areas, or jump straight to an area with search." crumb={ctx.scope ? [`Discover ${city}`, regionObj.name, "Search by area"] : [`Discover ${city}`, "Search by area"]}
          stats={[{ value: ctx.scope ? CO.homesRegion(ctx.scope) : CO.totalHomes, label: noun(mode, ctx.scope ? CO.homesRegion(ctx.scope) : CO.totalHomes) }]} actions={changeRegionBtn} />
        <SearchRow ctx={ctx} />
        <window.DPSection icon="layers" right={<span style={{ fontSize: "13px", color: "var(--text-muted)" }}>{groups.length} groups</span>}>Area groups</window.DPSection>
        <ColStack>{groups.map((g) => <window.DPGroupCard key={g.id} group={g} mode={mode} onView={ctx.pickGroup} />)}</ColStack>
      </>
    );
  }

  // ============ AREA JOURNEY — areas in group ============
  if (layer === "area-areas") {
    const areas = window.BLR_DATA.areas.filter((a) => a.group === ctx.groupId);
    return (
      <>
        <window.DPBackLink onClick={ctx.back}>Back to area groups{ctx.scope ? ` in ${rShort}` : ""}</window.DPBackLink>
        <window.DPHeaderBand eyebrow="Area group" title={groupObj.name} sub={groupObj.blurb} crumb={[`Discover ${city}`, regionObj.name, groupObj.name]}
          stats={[{ value: CO.homesGroup(ctx.groupId), label: noun(mode, CO.homesGroup(ctx.groupId)) }]} />
        <SearchRow ctx={ctx} />
        <window.DPSection icon="map-pin" right={<span style={{ fontSize: "13px", color: "var(--text-muted)" }}>{areas.length} areas</span>}>Areas inside {groupObj.name}</window.DPSection>
        <ColStack>{areas.map((a) => <window.DPAreaCard key={a.id} area={a} mode={mode} onView={ctx.pickArea} />)}</ColStack>
      </>
    );
  }

  // ============ AREA / ALL LISTINGS ============
  if (layer === "area-listings") {
    const listings = ctx.areaListings;
    const isAll = ctx.journey === "listings" || !ctx.areaObj;
    const heading = isAll ? (ctx.scope ? `All homes in ${regionObj.name}` : `All homes in ${city}`) : areaObj.name;
    const crumb = isAll ? (ctx.scope ? [`Discover ${city}`, regionObj.name, "All listings"] : [`Discover ${city}`, "All listings"]) : [`Discover ${city}`, regionObj.name, groupObj ? groupObj.name : "By area", areaObj.name];
    return (
      <>
        <window.DPBackLink onClick={ctx.back}>{isAll ? (ctx.scope ? `Back to ${rShort} overview` : `Back to Discover ${city}`) : `Back to areas${groupObj ? ` in ${groupObj.name}` : ""}`}</window.DPBackLink>
        <window.DPHeaderBand eyebrow={isAll ? "All listings" : "Selected area"} title={heading} sub={isAll ? "Every residential listing in scope — narrow with the filters below." : areaObj.blurb}
          crumb={crumb} stats={[{ value: listings.length, label: noun(mode, listings.length) }]} actions={isAll && ctx.scope ? changeRegionBtn : null} />
        <window.DPFilterBar f={ctx.filters} setF={ctx.setFilters} onClear={() => ctx.setFilters(window.DP_DEFAULT_FILTERS)} />
        {listings.length === 0 ? (
          <window.DPEmpty icon="sliders-horizontal" title="No homes match these filters" body="Widen the budget or bedrooms, turn off Verified only, or switch Buy/Rent."
            actions={<><NButton variant="primary" size="md" onClick={() => ctx.setFilters(window.DP_DEFAULT_FILTERS)}>Clear filters</NButton><NButton variant="outline" size="md" onClick={() => ctx.setMode(mode === "Rent" ? "Buy" : "Rent")}>Switch to {mode === "Rent" ? "Buy" : "Rent"}</NButton></>} />
        ) : (
          <>
            <window.DPSection icon="building" right={<span style={{ fontSize: "13px", color: "var(--text-muted)" }}><span style={{ fontFamily: "var(--font-mono)", fontWeight: 600, color: "var(--text-strong)" }}>{listings.length}</span> shown</span>}>{title(mode)} {isAll ? "in scope" : `in ${areaObj.name}`}</window.DPSection>
            <ListingGrid list={listings} ctx={ctx} />
          </>
        )}
      </>
    );
  }

  // ============ SCHOOL JOURNEY — zones ============
  if (layer === "school-zones") {
    const zones = window.BLR_DATA.zones.filter((z) => !ctx.scope || z.region === ctx.scope);
    return (
      <>
        <window.DPBackLink onClick={ctx.back}>{ctx.scope ? `Back to ${rShort} overview` : `Back to Discover ${city}`}</window.DPBackLink>
        <window.DPHeaderBand eyebrow="Search near school" accent="plum" icon="building" title={ctx.scope ? `School zones in ${rShort}` : `School zones across ${city}`}
          sub="Search a school or area directly, or pick a zone below." crumb={ctx.scope ? [`Discover ${city}`, regionObj.name, "Search near school"] : [`Discover ${city}`, "Search near school"]}
          stats={[{ value: ctx.scope ? CO.schoolsRegion(ctx.scope) : CO.totalSchools, label: "schools" }]} actions={changeRegionBtn} />
        <SearchRow ctx={ctx} />
        <window.DPSection icon="layers" right={<span style={{ fontSize: "13px", color: "var(--text-muted)" }}>{zones.length} zones</span>}>School zones</window.DPSection>
        <ColStack>{zones.map((z) => <window.DPZoneCard key={z.id} zone={z} onView={ctx.pickZone} />)}</ColStack>
      </>
    );
  }

  // ============ SCHOOL JOURNEY — areas in zone ============
  if (layer === "school-areas") {
    const areas = window.BLR_DATA.areas.filter((a) => a.zone === ctx.zoneId);
    return (
      <>
        <window.DPBackLink onClick={ctx.back}>Back to school zones{ctx.scope ? ` in ${rShort}` : ""}</window.DPBackLink>
        <window.DPHeaderBand eyebrow="School zone" accent="plum" icon="layers" title={zoneObj.name} sub={zoneObj.blurb} crumb={[`Discover ${city}`, regionObj.name, zoneObj.name]}
          stats={[{ value: CO.schoolsZone(ctx.zoneId), label: "schools" }, { value: CO.homesZone(ctx.zoneId), label: "nearby homes" }]} />
        <SearchRow ctx={ctx} />
        <window.DPSection icon="map-pin" right={<span style={{ fontSize: "13px", color: "var(--text-muted)" }}>{areas.length} areas</span>}>Areas in {zoneObj.name}</window.DPSection>
        <ColStack>{areas.map((a) => <window.DPSchoolAreaCard key={a.id} area={a} onView={ctx.pickArea} />)}</ColStack>
      </>
    );
  }

  // ============ SCHOOL JOURNEY — schools in area ============
  if (layer === "school-schools") {
    const schools = window.BLR_DATA.schools.filter((s) => s.areaId === ctx.areaId);
    return (
      <>
        <window.DPBackLink onClick={ctx.back}>Back to areas in {zoneObj ? zoneObj.name : "zone"}</window.DPBackLink>
        <window.DPHeaderBand eyebrow="Schools in area" accent="plum" icon="map-pin" title={`Schools in ${areaObj.name}`} sub="Choose a school to see homes within 3, 5 or 10 km."
          crumb={[`Discover ${city}`, regionObj.name, areaObj.name]} stats={[{ value: CO.schoolsArea(ctx.areaId), label: "schools" }, { value: CO.homesArea(ctx.areaId), label: "nearby homes" }]} />
        <SearchRow ctx={ctx} />
        <window.DPSection icon="building" right={<span style={{ fontSize: "13px", color: "var(--text-muted)" }}>{schools.length} schools</span>}>Schools in {areaObj.name}</window.DPSection>
        {schools.length === 0 ? (
          <window.DPEmpty accent="plum" icon="building" title="No schools mapped here yet" body="Try a nearby area in this zone." actions={<NButton variant="primary" size="md" onClick={ctx.back}>Back to areas</NButton>} />
        ) : <ColStack>{schools.map((s) => <window.DPSchoolCard key={s.id} school={s} radiusKm={5} onView={ctx.pickSchool} />)}</ColStack>}
      </>
    );
  }

  // ============ SCHOOL JOURNEY — homes near school ============
  if (layer === "school-homes") {
    const homes = ctx.schoolHomes;
    return (
      <>
        <window.DPBackLink onClick={ctx.back}>Back to schools in {areaObj ? areaObj.name : "area"}</window.DPBackLink>
        <window.DPHeaderBand eyebrow="Selected school" accent="plum" icon="building" title={schoolObj.name} sub={schoolObj.address}
          crumb={[`Discover ${city}`, regionObj.name, areaObj ? areaObj.name : "", schoolObj.name.split(",")[0]].filter(Boolean)}
          stats={[{ value: homes.length, label: noun(mode, homes.length) }, { value: `${ctx.radiusKm} km`, label: "radius" }]}
          actions={<window.DPGhostBtn onClick={ctx.back}>Change school</window.DPGhostBtn>} />
        <window.DPRadius value={ctx.radiusKm} onChange={ctx.setRadiusKm} school={schoolObj} />
        {homes.length === 0 ? (
          <window.DPEmpty accent="plum" icon="route" title={`No homes within ${ctx.radiusKm} km`} body={`No ${mode === "Rent" ? "rentals" : "homes"} within ${ctx.radiusKm} km of ${schoolObj.name.split(",")[0]}. Try a wider radius or change the school.`}
            actions={<>{ctx.radiusKm < 10 && <NButton variant="primary" size="md" onClick={() => ctx.setRadiusKm(ctx.radiusKm === 3 ? 5 : 10)}>Try {ctx.radiusKm === 3 ? 5 : 10} km</NButton>}<NButton variant="outline" size="md" onClick={ctx.back}>Change school</NButton></>} />
        ) : (
          <>
            <window.DPSection icon="map-pin" right={<span style={{ fontSize: "13px", color: "var(--text-muted)" }}><span style={{ fontFamily: "var(--font-mono)", fontWeight: 600, color: "var(--text-strong)" }}>{homes.length}</span> within {ctx.radiusKm} km</span>}>Homes near {schoolObj.name.split(",")[0]}</window.DPSection>
            <ListingGrid list={homes} ctx={ctx} distFrom={schoolObj} />
          </>
        )}
      </>
    );
  }

  // ============ AGRI — corridors ============
  if (layer === "agri-corridors") {
    const corridors = window.BLR_DATA.agri.corridors;
    return (
      <>
        <window.DPBackLink onClick={ctx.back}>Back to Discover {city}</window.DPBackLink>
        <window.DPHeaderBand eyebrow="Agricultural land" accent="agri" icon="layers" title={`Agricultural land near ${city}`}
          sub="Farmland is searched by corridor, direction and distance from town — not by residential neighbourhood." crumb={[`Discover ${city}`, "Agricultural land"]}
          stats={[{ value: window.BLR_AGRI.totalParcels, label: "parcels" }, { value: corridors.length, label: "corridors" }]} />
        <div style={{ display: "flex", alignItems: "flex-start", gap: "10px", padding: "12px 14px", background: "var(--evergreen-50)", border: "1px solid var(--evergreen-100, #CFE6D9)", borderRadius: "var(--radius-md)", marginBottom: "20px", fontSize: "12.5px", color: "var(--text-body)", lineHeight: 1.5 }}>
          <NIcon name="layers" size={15} color="var(--evergreen-600)" style={{ flex: "none", marginTop: "1px" }} />
          Agricultural land is a separate model — parcels, corridors and distances, kept apart from residential counts and neighbourhoods.
        </div>
        <window.DPSection icon="layers" right={<span style={{ fontSize: "13px", color: "var(--text-muted)" }}>{corridors.length} corridors</span>}>Direction / corridor</window.DPSection>
        <ColStack>{corridors.map((c) => <window.DPCorridorCard key={c.id} corridor={c} onView={ctx.pickCorridor} />)}</ColStack>
      </>
    );
  }

  // ============ AGRI — direction selected: distance band + grouped towns ============
  if (layer === "agri-clusters") {
    const AG = window.BLR_AGRI;
    const km = ctx.maxKm;
    const towns = AG.visibleTowns(ctx.corridorId, km);
    const nP = AG.dirProps(ctx.corridorId, km), nT = AG.dirGroups(ctx.corridorId, km), nA = AG.dirAcres(ctx.corridorId, km);
    return (
      <>
        <window.DPBackLink onClick={ctx.back}>Back to directions</window.DPBackLink>
        <window.DPHeaderBand eyebrow="Direction / corridor" accent="agri" icon="layers" title={corridorObj.label} sub={corridorObj.blurb}
          crumb={[`Discover ${city}`, "Agricultural land", corridorObj.short]}
          stats={[{ value: nP, label: "parcels" }, { value: nT, label: nT === 1 ? "town" : "towns" }, { value: nA.toFixed(1), label: "acres" }]} />
        <window.DPDistanceChips distances={ctx.agriDistances} value={km} onChange={ctx.setMaxKm} count={(k) => AG.dirProps(ctx.corridorId, k)} />
        <div style={{ display: "flex", alignItems: "center", gap: "16px", padding: "16px 18px", background: "var(--evergreen-50)", border: "1px solid var(--evergreen-100, #CFE6D9)", borderRadius: "var(--radius-lg)", marginBottom: "20px" }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: "30px", fontWeight: 700, color: "var(--evergreen-700, #1F694A)", lineHeight: 1 }}>{nP}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: "13.5px", fontWeight: 700, color: "var(--text-strong)" }}>Agri {ctx.mode === "Rent" ? "leases" : "parcels for sale"} · grouped into {nT} {nT === 1 ? "town" : "towns"}</div>
            <div style={{ fontSize: "12.5px", color: "var(--text-muted)", marginTop: "2px", fontFamily: "var(--font-mono)" }}>{nA.toFixed(2)} acres total · within {km} km {corridorObj.dir}</div>
          </div>
        </div>
        {towns.length === 0 ? (
          <window.DPEmpty accent="agri" icon="route" title={`No towns within ${km} km`} body="Increase the distance band to include towns further out along this direction."
            actions={<NButton variant="primary" size="md" onClick={() => ctx.setMaxKm(ctx.agriDistances[ctx.agriDistances.length - 1])}>Widen to {ctx.agriDistances[ctx.agriDistances.length - 1]} km</NButton>} />
        ) : (
          <>
            <window.DPSection icon="map-pin" right={<span style={{ fontSize: "13px", color: "var(--text-muted)" }}>{towns.length} {towns.length === 1 ? "town" : "towns"}</span>}>Towns in {corridorObj.short}</window.DPSection>
            <ColStack>{towns.map((c) => <window.DPClusterCard key={c.id} cluster={c} onView={ctx.pickCluster} />)}</ColStack>
          </>
        )}
      </>
    );
  }

  // ============ AGRI — parcels in cluster ============
  if (layer === "agri-parcels") {
    const parcels = ctx.parcels;
    return (
      <>
        <window.DPBackLink onClick={ctx.back}>Back to towns in {corridorObj.short}</window.DPBackLink>
        <window.DPHeaderBand eyebrow="Town / locality" accent="agri" icon="map-pin" title={clusterObj.name} sub={clusterObj.blurb}
          crumb={[`Discover ${city}`, "Agricultural land", corridorObj.short, clusterObj.name]}
          stats={[{ value: window.BLR_AGRI.townProps(ctx.clusterId), label: "parcels" }, { value: window.BLR_AGRI.townAcres(ctx.clusterId).toFixed(1), label: "acres" }, { value: `${clusterObj.distKm} km`, label: "from city" }]} />
        <window.DPAgriFilters f={ctx.agriFilters} setF={ctx.setAgriFilters} onClear={() => ctx.setAgriFilters(window.DP_AGRI_DEFAULTS)} />
        {parcels.length === 0 ? (
          <window.DPEmpty accent="agri" icon="sliders-horizontal" title="No parcels match these filters" body="Widen the size or price, or clear the water / road / soil filters."
            actions={<NButton variant="primary" size="md" onClick={() => ctx.setAgriFilters(window.DP_AGRI_DEFAULTS)}>Clear filters</NButton>} />
        ) : (
          <>
            <window.DPSection icon="layers" right={<span style={{ fontSize: "13px", color: "var(--text-muted)" }}><span style={{ fontFamily: "var(--font-mono)", fontWeight: 600, color: "var(--text-strong)" }}>{parcels.length}</span> shown</span>}>Parcels in {clusterObj.name}</window.DPSection>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
              {parcels.map((p) => <window.DPParcelCard key={p.id} parcel={p} onOpen={() => {}} saved={ctx.saved.includes(p.id)} onToggleSave={ctx.toggleSave} />)}
            </div>
          </>
        )}
      </>
    );
  }

  return null;
}

window.DiscoverPanelBody = DiscoverPanelBody;
