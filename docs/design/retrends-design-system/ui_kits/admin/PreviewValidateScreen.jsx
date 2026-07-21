// ReTrends Admin — STEP 3 (CENTREPIECE): Preview & validate.
// A thin, lightweight shell around the REAL Discover map (window.DPMap) driven with
// the real Discover data (window.BLR_DATA). The operator navigates the true Discover
// hierarchy naturally by clicking markers — City → Region → Area group → Area →
// Simulated listing — and checks five reversible boxes. No issue editor, no rigid
// step controller. Exports window.RTA_PreviewValidate.
const { Icon: S3Icon, Button: S3Button, Badge: S3Badge } = window.ReTrendsDesignSystem_f37966;

function RTA_Check({ checked, onChange, label, note }) {
  return (
    <div onClick={onChange} style={{ display: "flex", gap: "11px", alignItems: "flex-start", padding: "10px 12px", borderRadius: "var(--radius-md)", background: "var(--paper)", border: "1px solid " + (checked ? "rgba(31,122,92,0.4)" : "var(--border)"), cursor: "pointer", transition: "border-color .15s" }}>
      <span style={{ marginTop: "1px", width: "19px", height: "19px", borderRadius: "5px", flex: "none", display: "flex", alignItems: "center", justifyContent: "center", border: checked ? "none" : "1.5px solid var(--border-strong)", background: checked ? "var(--evergreen-600)" : "var(--paper)", transition: "background .12s" }}>
        {checked && <S3Icon name="check" size={13} color="#fff" strokeWidth={3} />}
      </span>
      <span style={{ minWidth: 0 }}>
        <span style={{ fontWeight: 700, fontSize: "14px", color: "var(--text-strong)" }}>{label}</span>
        <span style={{ display: "block", fontSize: "11.5px", color: "var(--text-muted)", marginTop: "1px", lineHeight: 1.35 }}>{note}</span>
      </span>
    </div>
  );
}

function RTA_PreviewValidate({ city, validation, onToggle, onReset, onExit, onGoLaunch }) {
  const P = window.RTA_PREVIEW_PATH;
  const D = window.BLR_DATA;
  const CO = window.BLR_COUNTS;
  const items = window.RTA_VALIDATION;
  const region = D.regions.find((r) => r.id === P.regionId);
  const group = D.groups.find((g) => g.id === P.groupId);
  const area = D.areas.find((a) => a.id === P.areaId);

  const [nav, setNav] = React.useState({ level: "city" });
  const [active, setActive] = React.useState(null);
  const [notReady, setNotReady] = React.useState(false);

  const allDone = items.every((it) => validation[it.key]);

  // At the area level the not-yet-live city shows its single simulated first listing —
  // a real Discover listing pin inside the area, so clicking it opens the real,
  // image-led Discover listing card (window.DPMap's own popup). Never persisted.
  const areaListings = React.useMemo(
    () => (nav.areaId ? [P.sim] : []),
    [nav.areaId]
  );

  // derive real DPMap props from the current navigation level
  let layer = "region-bubbles", scope = null, selection = {}, crumb = [D.city.name], listings = [], summary;
  if (nav.level === "city") {
    summary = { icon: "map-pin", color: "var(--accent)", count: CO.totalHomes, noun: "homes across the city" };
  } else if (nav.level === "region") {
    const r = D.regions.find((x) => x.id === nav.regionId);
    layer = "area-groups"; scope = nav.regionId; crumb = [D.city.name, r.short];
    summary = { icon: "building", color: "var(--accent)", count: CO.homesRegion(nav.regionId), noun: "homes in " + r.short };
  } else if (nav.level === "group") {
    const r = D.regions.find((x) => x.id === nav.regionId); const g = D.groups.find((x) => x.id === nav.groupId);
    layer = "area-areas"; scope = nav.regionId; selection = { groupId: nav.groupId }; crumb = [D.city.name, r.short, g.name];
    summary = { icon: "building", color: "var(--accent)", count: CO.homesGroup(nav.groupId), noun: "homes in " + g.name };
  } else if (nav.level === "area") {
    const r = D.regions.find((x) => x.id === nav.regionId); const g = D.groups.find((x) => x.id === nav.groupId); const a = D.areas.find((x) => x.id === nav.areaId);
    layer = "area-listings"; scope = nav.regionId; selection = { groupId: nav.groupId, areaId: nav.areaId };
    crumb = [D.city.name, r.short, g.name, a.name]; listings = areaListings;
    summary = { icon: "map-pin", color: "var(--accent)", count: areaListings.length, noun: "simulated listing in " + a.name };
  }

  // deeper navigation (real Discover marker clicks)
  const onPickRegion = (id) => setNav({ level: "region", regionId: id });
  const onPickGroup = (id) => { const g = D.groups.find((x) => x.id === id); setNav({ level: "group", regionId: g.region, groupId: id }); };
  const onPickArea = (id) => { const a = D.areas.find((x) => x.id === id); setNav({ level: "area", regionId: a.region, groupId: a.group, areaId: id }); };

  // clickable breadcrumb for going back up levels (reversible navigation)
  const crumbNav = [{ label: D.city.name, go: () => setNav({ level: "city" }) }];
  if (nav.regionId) crumbNav.push({ label: D.regions.find((x) => x.id === nav.regionId).short, go: () => setNav({ level: "region", regionId: nav.regionId }) });
  if (nav.groupId) crumbNav.push({ label: D.groups.find((x) => x.id === nav.groupId).name, go: () => setNav({ level: "group", regionId: nav.regionId, groupId: nav.groupId }) });
  if (nav.areaId) crumbNav.push({ label: D.areas.find((x) => x.id === nav.areaId).name, go: () => setNav({ level: "area", regionId: nav.regionId, groupId: nav.groupId, areaId: nav.areaId }) });

  const bannerPill = (children, warn) => (
    <span style={{ display: "inline-flex", alignItems: "center", gap: "7px", padding: "4px 11px", borderRadius: "var(--radius-full)", fontFamily: "var(--font-mono)", fontSize: "11px", background: "rgba(255,255,255,0.14)", border: "1px solid rgba(255,255,255,0.25)", color: warn ? "#F4EEDD" : "#fff", whiteSpace: "nowrap" }}>{children}</span>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      {/* PERSISTENT PREVIEW BANNER */}
      <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap", flex: "none", padding: "11px 18px", background: "var(--navy-900)", color: "#fff", borderBottom: "3px solid var(--accent)" }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: "7px", fontFamily: "var(--font-mono)", fontSize: "12px", fontWeight: 700, color: "#F4EEDD" }}>
          <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: "var(--copper-400)" }} /> PREVIEW MODE · SANDBOX
        </span>
        {bannerPill(<>City <b>{city.name}</b></>)}
        {bannerPill(<>Revision <b>rev {city.rev} (draft)</b></>)}
        {bannerPill(<><S3Icon name="shield" size={12} /> This city is NOT LIVE</>, true)}
        {bannerPill(<>Isolated preview · production users can’t access this</>, true)}
        <div style={{ marginLeft: "auto", display: "flex", gap: "8px" }}>
          <button onClick={onExit} style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "6px 12px", borderRadius: "var(--radius-md)", border: "1px solid #fff", background: "#fff", color: "var(--navy-900)", cursor: "pointer", fontFamily: "var(--font-sans)", fontSize: "12.5px", fontWeight: 700 }}>
            <S3Icon name="x" size={14} /> Exit preview
          </button>
        </div>
      </div>

      <div style={{ flex: 1, minHeight: 0, display: "flex" }}>
        {/* LIGHTWEIGHT VALIDATION RAIL */}
        <div className="upt-scroll" style={{ width: "312px", flex: "none", borderRight: "1px solid var(--border)", background: "var(--surface-subtle)", overflowY: "auto", padding: "16px" }}>
          <div style={{ fontFamily: "var(--font-serif)", fontSize: "19px", fontWeight: 600, letterSpacing: "-0.01em", marginBottom: "3px" }}>Review this preview</div>
          <p style={{ margin: "0 0 14px", fontSize: "12.5px", color: "var(--text-muted)", lineHeight: 1.45 }}>Walk the map like a buyer would, then tick each part you’ve checked. You can untick and revisit anything.</p>

          {/* clickable breadcrumb — go back to any level */}
          <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: "4px", marginBottom: "14px", fontFamily: "var(--font-mono)", fontSize: "11.5px" }}>
            {crumbNav.map((c, i) => (
              <React.Fragment key={i}>
                {i > 0 && <span style={{ color: "var(--grey-400)" }}>›</span>}
                <button onClick={c.go} style={{ border: "none", background: "transparent", cursor: "pointer", padding: "2px 4px", borderRadius: "var(--radius-xs)", color: i === crumbNav.length - 1 ? "var(--navy-800)" : "var(--text-muted)", fontWeight: i === crumbNav.length - 1 ? 700 : 500, fontFamily: "var(--font-mono)", fontSize: "11.5px" }}>{c.label}</button>
              </React.Fragment>
            ))}
          </div>

          {/* five reversible checkboxes */}
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {items.map((it) => (
              <RTA_Check key={it.key} checked={!!validation[it.key]} onChange={() => onToggle(it.key)} label={it.label} note={it.note} />
            ))}
          </div>

          {/* outcome */}
          <div style={{ marginTop: "16px", paddingTop: "14px", borderTop: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: "8px" }}>
            <S3Button variant="primary" size="md" fullWidth disabled={!allDone} onClick={() => allDone && onGoLaunch()}>
              <S3Icon name="check" size={16} /> Mark preview validated
            </S3Button>
            {!allDone && <div style={{ fontFamily: "var(--font-mono)", fontSize: "10.5px", color: "var(--text-muted)", textAlign: "center" }}>Enabled once all five are checked</div>}
            <S3Button variant="outline" size="md" fullWidth onClick={() => setNotReady((v) => !v)}>Preview not ready</S3Button>
            <button onClick={onReset} style={{ padding: "8px", border: "none", background: "transparent", color: "var(--text-muted)", cursor: "pointer", fontFamily: "var(--font-sans)", fontSize: "12.5px", fontWeight: 600 }}>↺ Reset validation</button>
          </div>

          {notReady && (
            <div style={{ marginTop: "12px", background: "var(--ochre-50)", border: "1px solid rgba(169,116,28,0.3)", borderRadius: "var(--radius-md)", padding: "12px 13px", animation: "rtaFade .2s ease" }}>
              <p style={{ margin: "0 0 10px", fontSize: "12.5px", lineHeight: 1.5, color: "var(--text-body)" }}>
                Update the generated review spreadsheet or pipeline input, discard this preview revision, rerun preparation, and return to preview.
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                <S3Button variant="outline" size="sm" fullWidth onClick={onExit}>Back to city launch</S3Button>
                <S3Button variant="outline" size="sm" fullWidth onClick={onExit}>Discard preview revision</S3Button>
              </div>
            </div>
          )}

          <div style={{ marginTop: "16px", display: "flex", alignItems: "flex-start", gap: "8px", fontSize: "11.5px", color: "var(--text-muted)", lineHeight: 1.4 }}>
            <S3Icon name="shield" size={14} color="var(--text-muted)" />
            <span>This is the real Discover experience, read-only, on the sandbox revision. Nothing here changes production.</span>
          </div>
        </div>

        {/* THE REAL DISCOVER MAP — reused unchanged, driven by natural marker clicks */}
        <div style={{ flex: 1, minWidth: 0, minHeight: 0, position: "relative" }}>
          <window.DPMap
            layer={layer} scope={scope} selection={selection}
            listings={listings} parcels={[]} activeListing={active}
            crumb={crumb} summary={summary}
            onActivate={setActive}
            onPickRegion={onPickRegion} onPickGroup={onPickGroup} onPickArea={onPickArea}
            onPickSchool={() => {}} onPickZone={() => {}} onPickCorridor={() => {}} onPickCluster={() => {}}
            isMobile={false}
          />

          {/* guided review path — guidance only, non-blocking */}
          <div style={{ position: "absolute", top: "16px", left: "50%", transform: "translateX(-50%)", zIndex: 520, pointerEvents: "none", display: "flex", alignItems: "center", gap: "8px", maxWidth: "calc(100% - 300px)", padding: "8px 14px", background: "rgba(252,251,248,0.94)", backdropFilter: "blur(6px)", borderRadius: "var(--radius-full)", boxShadow: "var(--shadow-md)", border: "1px solid var(--border)", fontFamily: "var(--font-sans)", fontSize: "12.5px", color: "var(--text-body)", whiteSpace: "nowrap", overflow: "hidden" }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: "10.5px", fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase", color: "var(--text-muted)" }}>Review path</span>
            {P.reviewLine.map((seg, i) => (
              <React.Fragment key={i}>
                {i > 0 && <span style={{ color: "var(--grey-400)" }}>→</span>}
                <span style={{ fontWeight: i === P.reviewLine.length - 1 ? 700 : 600, color: i === P.reviewLine.length - 1 ? "var(--copper-600)" : "var(--text-strong)" }}>{seg}</span>
              </React.Fragment>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

window.RTA_PreviewValidate = RTA_PreviewValidate;
