// Listings inventory — find, inspect, edit, publish/unpublish/archive/restore listings
// across their full lifecycle. Same table density, filter conventions, drawer structure
// and confirmation patterns as the Pending Approvals queue.
const { Icon: LSIcon, Badge: LSBadge, Button: LSButton, Input: LSInput, Select: LSSelect } = window.ReTrendsDesignSystem_f37966;

const LS_DEFAULT_FILTERS = { types: [], localities: [], brokers: [], visibility: "any", quality: "any", updated: "any" };
const LS_TABS = [["all", "All listings"], ["published", "Published"], ["pending_approval", "Pending approval"], ["needs_attention", "Needs attention"], ["archived", "Archived"]];

function LS_TabBar({ tab, setTab, counts }) {
  return (
    <div style={{ display: "flex", gap: "4px", marginBottom: "18px", borderBottom: "1px solid var(--border)" }}>
      {LS_TABS.map(([key, label]) => (
        <button key={key} onClick={() => setTab(key)} style={{ padding: "9px 14px", background: "transparent", border: "none", borderBottom: "2px solid " + (tab === key ? "var(--navy-800)" : "transparent"), color: tab === key ? "var(--text-strong)" : "var(--text-muted)", fontWeight: tab === key ? 700 : 600, fontSize: "13.5px", cursor: "pointer", display: "flex", alignItems: "center", gap: "6px" }}>
          {label} <span style={{ fontFamily: "var(--font-mono)", fontSize: "12px", color: tab === key ? "var(--navy-800)" : "var(--text-muted)" }}>{counts[key]}</span>
        </button>
      ))}
    </div>
  );
}

function LS_ToggleChip({ active, onClick, children }) {
  return <button onClick={onClick} style={{ padding: "5px 12px", borderRadius: "var(--radius-full)", fontSize: "12.5px", fontWeight: 600, cursor: "pointer", border: "1px solid " + (active ? "var(--navy-800)" : "var(--border-strong)"), background: active ? "var(--navy-800)" : "var(--paper)", color: active ? "#fff" : "var(--text-body)" }}>{children}</button>;
}

function LS_FiltersPanel({ filters, setFilters, localities, brokerIds, onClose }) {
  const toggle = (key, value) => setFilters((f) => ({ ...f, [key]: f[key].includes(value) ? f[key].filter((v) => v !== value) : [...f[key], value] }));
  const chipGroup = (title, key, options) => (
    <div style={{ marginBottom: "16px" }}>
      <div style={{ fontSize: "11.5px", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.03em", marginBottom: "8px" }}>{title}</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>{options.map(([v, l]) => <LS_ToggleChip key={v} active={filters[key].includes(v)} onClick={() => toggle(key, v)}>{l}</LS_ToggleChip>)}</div>
    </div>
  );
  const segGroup = (title, key, options) => (
    <div style={{ marginBottom: "16px" }}>
      <div style={{ fontSize: "11.5px", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.03em", marginBottom: "8px" }}>{title}</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>{options.map(([v, l]) => <LS_ToggleChip key={v} active={filters[key] === v} onClick={() => setFilters((f) => ({ ...f, [key]: v }))}>{l}</LS_ToggleChip>)}</div>
    </div>
  );
  return (
    <div style={{ position: "absolute", top: "46px", left: 0, zIndex: 30, width: "580px", background: "var(--paper)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", boxShadow: "var(--shadow-lg)", padding: "18px 20px" }}>
      {chipGroup("Property type", "types", Object.entries(window.PA_PROPERTY_TYPES))}
      {chipGroup("Locality", "localities", localities.map((l) => [l, l]))}
      {chipGroup("Broker / source", "brokers", brokerIds.map((b) => [b, window.PA_BROKERS[b].name]))}
      {segGroup("Public visibility", "visibility", [["any", "Any"], ["visible", "Visible"], ["hidden", "Not visible"]])}
      {segGroup("Data quality", "quality", [["any", "Any"], ["high", "High (90%+)"], ["medium", "Medium (60\u201389%)"], ["low", "Low (<60%)"]])}
      {segGroup("Last updated", "updated", [["any", "Any time"], ["7", "Last 7 days"], ["30", "Last 30 days"], ["90", "Stale (90+ days)"]])}
      <div style={{ display: "flex", justifyContent: "flex-end" }}><LSButton size="sm" onClick={onClose}>Done</LSButton></div>
    </div>
  );
}

const lsThStyle = { padding: "10px 14px", textAlign: "left", fontSize: "11px", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.03em", cursor: "pointer", userSelect: "none", background: "var(--surface-subtle)", position: "sticky", top: 0, zIndex: 2, borderBottom: "1px solid var(--border)" };

function ListingsScreen() {
  const [listings, setListings] = React.useState(() => window.PL_LISTINGS.map((l) => ({ ...l })));
  const [search, setSearch] = React.useState("");
  const [filters, setFilters] = React.useState(LS_DEFAULT_FILTERS);
  const [filtersOpen, setFiltersOpen] = React.useState(false);
  const [tab, setTab] = React.useState("all");
  const [sortKey, setSortKey] = React.useState("updatedAt");
  const [sortDir, setSortDir] = React.useState("desc");
  const [page, setPage] = React.useState(1);
  const pageSize = 10;
  const [selected, setSelected] = React.useState(() => new Set());
  const [editorId, setEditorId] = React.useState(null);
  const [confirmAction, setConfirmAction] = React.useState(null);
  const [openMenuId, setOpenMenuId] = React.useState(null);
  const [toast, setToast] = React.useState(null);
  const [infoToast, setInfoToast] = React.useState(null);
  const [previewState, setPreviewState] = React.useState(null);
  const [scenario, setScenario] = React.useState("default");
  const [bulkLocality, setBulkLocality] = React.useState("");
  const [bulkTag, setBulkTag] = React.useState("");
  const toastTimer = React.useRef(null);
  const infoTimer = React.useRef(null);

  React.useEffect(() => {
    setEditorId(null); setConfirmAction(null); setPreviewState(null); setSelected(new Set());
    setSearch(""); setFilters(LS_DEFAULT_FILTERS); setPage(1); setFiltersOpen(false); setTab("all");
    if (scenario === "filtered") { setFilters({ ...LS_DEFAULT_FILTERS, types: ["agricultural_land"] }); setFiltersOpen(true); }
    else if (scenario === "needs-attention") setTab("needs_attention");
    else if (scenario === "editor-open") setEditorId("PS-L-3001");
    else if (scenario === "location-warning") setEditorId("PS-L-3031");
    else if (scenario === "missing-photos") setEditorId("PS-L-3012");
    else if (scenario === "archive-confirm") setConfirmAction({ action: "archive", ids: ["PS-L-3010"] });
    else if (scenario === "empty") setSearch("zzz-no-match-xk9");
    else if (scenario === "loading") setPreviewState("loading");
    else if (scenario === "error") setPreviewState("error");
  }, [scenario]);

  const counts = {
    all: listings.length,
    published: listings.filter((l) => l.status === "published").length,
    pending_approval: listings.filter((l) => l.status === "pending_approval").length,
    needs_attention: listings.filter((l) => l.warnings.length > 0).length,
    archived: listings.filter((l) => l.status === "archived").length,
  };
  const localities = [...new Set(listings.map((l) => l.locality))].sort();
  const brokerIds = [...new Set(listings.map((l) => l.broker))];

  const matchesTab = (l) => tab === "all" ? true : tab === "needs_attention" ? l.warnings.length > 0 : l.status === tab;
  const matchesSearch = (l) => {
    if (!search.trim()) return true;
    const q = search.trim().toLowerCase();
    const broker = window.PA_BROKERS[l.broker];
    return l.title.toLowerCase().includes(q) || l.id.toLowerCase().includes(q) || broker.name.toLowerCase().includes(q) || broker.phone.includes(q) || l.locality.toLowerCase().includes(q);
  };
  const matchesFilters = (l) => {
    if (filters.types.length && !filters.types.includes(l.propertyType)) return false;
    if (filters.localities.length && !filters.localities.includes(l.locality)) return false;
    if (filters.brokers.length && !filters.brokers.includes(l.broker)) return false;
    if (filters.visibility === "visible" && !l.visible) return false;
    if (filters.visibility === "hidden" && l.visible) return false;
    if (filters.quality === "high" && l.completeness < 90) return false;
    if (filters.quality === "medium" && (l.completeness < 60 || l.completeness >= 90)) return false;
    if (filters.quality === "low" && l.completeness >= 60) return false;
    if (filters.updated !== "any") {
      const d = window.PA_ageDays(l.updatedAt);
      if (filters.updated === "7" && d > 7) return false;
      if (filters.updated === "30" && d > 30) return false;
      if (filters.updated === "90" && d < 90) return false;
    }
    return true;
  };
  const filtered = listings.filter((l) => matchesTab(l) && matchesSearch(l) && matchesFilters(l));
  const sorted = [...filtered].sort((a, b) => {
    let av, bv;
    if (sortKey === "price") { av = a.price; bv = b.price; }
    else if (sortKey === "completeness") { av = a.completeness; bv = b.completeness; }
    else if (sortKey === "createdAt") { av = new Date(a.createdAt).getTime(); bv = new Date(b.createdAt).getTime(); }
    else { av = new Date(a.updatedAt).getTime(); bv = new Date(b.updatedAt).getTime(); }
    return sortDir === "asc" ? av - bv : bv - av;
  });
  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const pageClamped = Math.min(page, totalPages);
  const paged = sorted.slice((pageClamped - 1) * pageSize, pageClamped * pageSize);

  const activeFilterCount = filters.types.length + filters.localities.length + filters.brokers.length + (filters.visibility !== "any" ? 1 : 0) + (filters.quality !== "any" ? 1 : 0) + (filters.updated !== "any" ? 1 : 0);
  const hasActiveFilters = activeFilterCount > 0 || !!search.trim() || tab !== "all";
  const resetAll = () => { setFilters(LS_DEFAULT_FILTERS); setSearch(""); setPage(1); setTab("all"); };
  const toggleHeaderSort = (key) => { if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc")); else { setSortKey(key); setSortDir(key === "completeness" ? "asc" : "desc"); } };
  const arrow = (key) => sortKey === key ? (sortDir === "asc" ? " \u2191" : " \u2193") : "";

  const toggleSelect = (id) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleSelectPage = () => setSelected((s) => { const ids = paged.map((l) => l.id); const allSel = ids.every((id) => s.has(id)); const n = new Set(s); ids.forEach((id) => allSel ? n.delete(id) : n.add(id)); return n; });

  const pushToast = (ids, prevMap, message) => { if (toastTimer.current) clearTimeout(toastTimer.current); setToast({ ids, prevMap, message }); toastTimer.current = setTimeout(() => setToast(null), 6000); };
  const pushInfo = (message) => { if (infoTimer.current) clearTimeout(infoTimer.current); setInfoToast(message); infoTimer.current = setTimeout(() => setInfoToast(null), 2400); };

  const applyLifecycle = (ids, action) => {
    const prevMap = {}; listings.forEach((l) => { if (ids.includes(l.id)) prevMap[l.id] = { status: l.status, visible: l.visible }; });
    const newStatus = action === "publish" ? "published" : action === "unpublish" ? "unpublished" : action === "archive" ? "archived" : "unpublished";
    const newVisible = action === "publish";
    setListings((ls) => ls.map((l) => ids.includes(l.id) ? { ...l, status: newStatus, visible: newVisible, warnings: l.warnings.filter((w) => w !== "inconsistent_state"), updatedAt: new Date().toISOString(), updatedBy: "admin:You", history: [...l.history, { ts: new Date().toISOString(), actor: "admin:You", action: window.PL_ACTION_META[action].label + "ed", prev: window.PL_LIFECYCLE_META[l.status].label, next: window.PL_LIFECYCLE_META[newStatus].label }] } : l));
    pushToast(ids, prevMap, window.PL_ACTION_META[action].label + "ed " + ids.length + " listing" + (ids.length === 1 ? "" : "s") + ".");
    setSelected((s) => { const n = new Set(s); ids.forEach((id) => n.delete(id)); return n; });
  };
  const undoLast = () => { if (toast) { setListings((ls) => ls.map((l) => toast.prevMap[l.id] ? { ...l, ...toast.prevMap[l.id] } : l)); setToast(null); if (toastTimer.current) clearTimeout(toastTimer.current); } };

  const requestAction = (action, ids) => setConfirmAction({ action, ids });
  const confirmYes = () => { applyLifecycle(confirmAction.ids, confirmAction.action); setConfirmAction(null); };

  const doSave = (id, patch) => { setListings((ls) => ls.map((l) => l.id === id ? { ...l, ...patch, updatedAt: new Date().toISOString(), updatedBy: "admin:You", history: [...l.history, { ts: new Date().toISOString(), actor: "admin:You", action: "Edited listing details" }] } : l)); pushInfo("Listing updated."); };
  const doDuplicate = (l) => { const copy = { ...l, id: l.id + "-COPY", title: l.title + " (Copy)", status: "draft", visible: false, warnings: [], history: [{ ts: new Date().toISOString(), actor: "admin:You", action: "Duplicated from " + l.id }] }; setListings((ls) => [copy, ...ls]); pushInfo("Duplicated as a new draft."); setOpenMenuId(null); };
  const doTag = () => { if (!bulkTag.trim()) return; setListings((ls) => ls.map((l) => selected.has(l.id) ? { ...l, tags: [...(l.tags || []), bulkTag.trim()] } : l)); pushInfo("Tagged " + selected.size + " listing" + (selected.size === 1 ? "" : "s") + "."); setBulkTag(""); };
  const doLocality = () => { if (!bulkLocality) return; setListings((ls) => ls.map((l) => selected.has(l.id) ? { ...l, locality: bulkLocality } : l)); pushInfo("Locality updated for " + selected.size + " listing" + (selected.size === 1 ? "" : "s") + "."); setBulkLocality(""); };

  const selArr = [...selected];
  const eligibleUnpublish = selArr.filter((id) => listings.find((l) => l.id === id)?.status === "published");
  const eligibleArchive = selArr.filter((id) => listings.find((l) => l.id === id)?.status !== "archived");
  const eligiblePublish = selArr.filter((id) => { const l = listings.find((x) => x.id === id); return l && l.status === "unpublished" && l.completeness >= 90 && l.warnings.length === 0; });

  const editor = editorId && listings.find((l) => l.id === editorId);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", minHeight: 0 }}>
      <window.RTA_Header active="Listings" />
      <div className="upt-scroll" style={{ flex: 1, minHeight: 0, overflowY: "auto", background: "var(--background)" }}>
        <div style={{ maxWidth: "1440px", margin: "0 auto", padding: "26px 28px 60px" }}>

          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: "16px", marginBottom: "18px" }}>
            <div>
              <h1 style={{ fontSize: "23px", fontWeight: 700, margin: 0, color: "var(--text-strong)" }}>Listings</h1>
              <p style={{ fontSize: "13.5px", color: "var(--text-muted)", margin: "5px 0 0" }}>Manage property listings across their lifecycle</p>
            </div>
            <LSButton style={{ background: "var(--positive)" }}><LSIcon name="plus" size={15} /> Add listing</LSButton>
          </div>

          <LS_TabBar tab={tab} setTab={(t) => { setTab(t); setPage(1); }} counts={counts} />

          <div style={{ position: "relative", display: "flex", alignItems: "center", gap: "10px", marginBottom: "10px", flexWrap: "wrap" }}>
            <div style={{ flex: "1 1 300px", maxWidth: "420px" }}><LSInput placeholder="Search title, listing ID, broker, phone or locality" leadingIcon={<LSIcon name="search" size={16} />} value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} /></div>
            <LSButton variant="outline" onClick={() => setFiltersOpen((o) => !o)}><LSIcon name="sliders-horizontal" size={15} /> Filters{activeFilterCount > 0 ? " (" + activeFilterCount + ")" : ""}</LSButton>
            <LSButton variant="ghost" size="sm" onClick={() => { setTab("published"); }}>Published</LSButton>
            <LSButton variant="ghost" size="sm" onClick={() => { setTab("needs_attention"); }}>Needs attention</LSButton>
            <LSButton variant="ghost" size="sm" onClick={() => { setTab("archived"); setSortKey("updatedAt"); setSortDir("desc"); }}>Recently archived</LSButton>
            {hasActiveFilters && <LSButton variant="ghost" onClick={resetAll}>Reset filters</LSButton>}
            <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "12px" }}>
              <span style={{ fontSize: "13px", color: "var(--text-muted)" }}>{filtered.length} result{filtered.length === 1 ? "" : "s"}</span>
              <LSSelect size="sm" value={sortKey + ":" + sortDir} onChange={(e) => { const [k, d] = e.target.value.split(":"); setSortKey(k); setSortDir(d); }}
                options={[{ value: "updatedAt:desc", label: "Recently updated" }, { value: "updatedAt:asc", label: "Oldest updated" }, { value: "createdAt:desc", label: "Newest created" }, { value: "price:desc", label: "Price: high to low" }, { value: "completeness:asc", label: "Completeness: low to high" }]} />
            </div>
            {filtersOpen && <LS_FiltersPanel filters={filters} setFilters={(f) => { setFilters(f); setPage(1); }} localities={localities} brokerIds={brokerIds} onClose={() => setFiltersOpen(false)} />}
          </div>

          {selected.size > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: "12px", padding: "11px 16px", background: "var(--navy-100)", borderRadius: "var(--radius-md)", marginBottom: "12px", flexWrap: "wrap" }}>
              <b style={{ fontSize: "13.5px", color: "var(--navy-800)" }}>{selected.size} selected</b>
              <select value={bulkLocality} onChange={(e) => setBulkLocality(e.target.value)} style={{ height: "30px", fontSize: "12.5px", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-strong)", padding: "0 6px" }}>
                <option value="">{"Assign locality\u2026"}</option>
                {window.PL_LOCALITIES.map((l) => <option key={l} value={l}>{l}</option>)}
              </select>
              <LSButton variant="outline" size="sm" disabled={!bulkLocality} onClick={doLocality}>Apply</LSButton>
              <input value={bulkTag} onChange={(e) => setBulkTag(e.target.value)} placeholder="Add internal tag\u2026" style={{ height: "30px", fontSize: "12.5px", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-strong)", padding: "0 8px", width: "140px" }} />
              <LSButton variant="outline" size="sm" disabled={!bulkTag.trim()} onClick={doTag}>Tag</LSButton>
              <LSButton variant="outline" size="sm" onClick={() => pushInfo("Exported " + selected.size + " listing" + (selected.size === 1 ? "" : "s") + ".")}>Export</LSButton>
              <LSButton variant="outline" size="sm" disabled={!eligibleUnpublish.length} style={{ borderColor: "var(--caution)", color: "var(--caution)" }} onClick={() => requestAction("unpublish", eligibleUnpublish)}>Unpublish {eligibleUnpublish.length}</LSButton>
              <LSButton variant="outline" size="sm" disabled={!eligibleArchive.length} onClick={() => requestAction("archive", eligibleArchive)}>Archive {eligibleArchive.length}</LSButton>
              <LSButton size="sm" disabled={!eligiblePublish.length} style={{ background: "var(--positive)" }} onClick={() => requestAction("publish", eligiblePublish)}>Publish {eligiblePublish.length} eligible</LSButton>
              <LSButton variant="ghost" size="sm" onClick={() => setSelected(new Set())}>Clear</LSButton>
            </div>
          )}

          <div style={{ background: "var(--paper)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", overflow: "hidden" }}>
            <div style={{ maxHeight: "calc(100vh - 330px)", minHeight: "260px", overflowY: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "var(--font-sans)", tableLayout: "fixed" }}>
                <colgroup>
                  <col className="pa-c-check" style={{ width: "3%" }} /><col className="pa-c-listing" style={{ width: "14%" }} /><col className="pa-col-broker pa-c-broker" style={{ width: "10%" }} /><col className="pa-col-type pa-c-type" style={{ width: "9%" }} />
                  <col className="pa-c-locality" style={{ width: "8%" }} /><col className="pa-c-price" style={{ width: "8%" }} /><col className="pa-c-status" style={{ width: "10%" }} /><col className="pa-c-quality" style={{ width: "8%" }} /><col className="pa-c-visibility" style={{ width: "12%" }} /><col className="pa-c-updated" style={{ width: "7%" }} /><col className="pa-c-actions" style={{ width: "11%" }} />
                </colgroup>
                <thead>
                  <tr>
                    <th style={{ ...lsThStyle, cursor: "default" }}><input type="checkbox" checked={paged.length > 0 && paged.every((l) => selected.has(l.id))} onChange={toggleSelectPage} style={{ width: "15px", height: "15px" }} /></th>
                    <th style={lsThStyle}>Listing</th>
                    <th className="pa-col-broker" style={lsThStyle}>Broker / source</th>
                    <th className="pa-col-type" style={lsThStyle}>Type</th>
                    <th style={lsThStyle}>Locality</th>
                    <th onClick={() => toggleHeaderSort("price")} style={lsThStyle}>Price{arrow("price")}</th>
                    <th style={lsThStyle}>Status</th>
                    <th onClick={() => toggleHeaderSort("completeness")} style={lsThStyle}>Quality{arrow("completeness")}</th>
                    <th style={lsThStyle}>Visibility</th>
                    <th onClick={() => toggleHeaderSort("updatedAt")} style={lsThStyle}>Updated{arrow("updatedAt")}</th>
                    <th style={{ ...lsThStyle, cursor: "default" }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {previewState === "loading" ? Array.from({ length: 6 }).map((_, i) => (
                    <tr key={i}><td colSpan={11} style={{ padding: "14px 16px" }}><div className="upt-shimmer" style={{ height: "16px", borderRadius: "var(--radius-sm)", background: "var(--grey-100)" }} /></td></tr>
                  )) : previewState === "error" ? (
                    <tr><td colSpan={11} style={{ padding: "56px 16px", textAlign: "center" }}>
                      <LSIcon name="alert-triangle" size={26} color="var(--negative)" />
                      <div style={{ fontSize: "15px", fontWeight: 700, margin: "12px 0 4px" }}>Couldn't load the inventory</div>
                      <div style={{ fontSize: "13px", color: "var(--text-muted)", marginBottom: "16px" }}>A network error interrupted the request. Nothing was changed.</div>
                      <LSButton variant="outline" onClick={() => setPreviewState(null)}>Retry</LSButton>
                    </td></tr>
                  ) : paged.length === 0 ? (
                    <tr><td colSpan={11} style={{ padding: "56px 16px", textAlign: "center" }}>
                      <LSIcon name="search" size={26} color="var(--text-muted)" />
                      <div style={{ fontSize: "15px", fontWeight: 700, margin: "12px 0 4px" }}>No listings match these filters</div>
                      <div style={{ fontSize: "13px", color: "var(--text-muted)", marginBottom: "16px" }}>Try a different search term or reset your filters.</div>
                      <LSButton variant="outline" onClick={resetAll}>Reset filters</LSButton>
                    </td></tr>
                  ) : paged.map((l) => {
                    const broker = window.PA_BROKERS[l.broker];
                    const inconsistent = l.warnings.includes("inconsistent_state");
                    return (
                      <tr key={l.id} className="pa-row" onClick={() => setEditorId(l.id)} style={{ borderBottom: "1px solid var(--border)" }}>
                        <td style={{ padding: "12px 8px 12px 12px" }} onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={selected.has(l.id)} onChange={() => toggleSelect(l.id)} style={{ width: "15px", height: "15px" }} /></td>
                        <td style={{ padding: "10px 14px" }}>
                          <div style={{ display: "flex", gap: "10px" }}>
                            <window.PL_Thumb photos={l.photos} />
                            <div style={{ minWidth: 0 }}>
                              <div style={{ fontSize: "13.5px", fontWeight: 700, color: "var(--text-strong)", lineHeight: 1.3, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{l.title}</div>
                              <div style={{ fontSize: "11px", fontFamily: "var(--font-mono)", color: "var(--text-muted)", margin: "2px 0 3px" }}>{l.id}</div>
                              <window.PL_WarningInline warnings={l.warnings} />
                            </div>
                          </div>
                        </td>
                        <td className="pa-col-broker" style={{ padding: "12px 14px" }}>
                          <div style={{ fontSize: "13px", fontWeight: 600 }}>{broker.name}</div>
                          <div style={{ marginTop: "3px" }}><window.PA_VerificationBadge tier={broker.verification} size="sm" /></div>
                        </td>
                        <td className="pa-col-type" style={{ padding: "12px 14px" }}><window.PA_TypeLabel type={l.propertyType} /></td>
                        <td style={{ padding: "12px 14px", fontSize: "13px", color: "var(--text-body)" }}>{l.locality}</td>
                        <td style={{ padding: "12px 14px", fontSize: "13px", fontFamily: "var(--font-mono)", fontWeight: 700 }}>{window.PA_formatPrice(l.price)}</td>
                        <td style={{ padding: "12px 14px" }}><window.PL_LifecycleBadge status={l.status} /></td>
                        <td style={{ padding: "12px 14px" }}><window.PL_CompletenessCell pct={l.completeness} missing={l.missingFields} /></td>
                        <td style={{ padding: "12px 14px" }}><window.PL_VisibilityBadge visible={l.visible} inconsistent={inconsistent} /></td>
                        <td style={{ padding: "12px 14px", fontSize: "12.5px", color: "var(--text-muted)" }}>{window.PA_formatAge(l.updatedAt)}</td>
                        <td style={{ padding: "12px 12px", position: "relative" }} onClick={(e) => e.stopPropagation()}>
                          <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                            <LSButton variant="outline" size="sm" onClick={() => setEditorId(l.id)}>Open</LSButton>
                            <button aria-label={"More actions for " + l.title} onClick={() => setOpenMenuId(openMenuId === l.id ? null : l.id)} style={{ background: "transparent", border: "1px solid var(--border-strong)", borderRadius: "var(--radius-sm)", width: "30px", height: "30px", cursor: "pointer", color: "var(--text-muted)", fontSize: "16px", lineHeight: 1 }}>{"\u22ef"}</button>
                          </div>
                          {openMenuId === l.id && (
                            <div onMouseLeave={() => setOpenMenuId(null)} style={{ position: "absolute", right: "12px", top: "44px", zIndex: 10, width: "200px", background: "var(--paper)", border: "1px solid var(--border)", borderRadius: "var(--radius-md)", boxShadow: "var(--shadow-lg)", overflow: "hidden" }}>
                              {[["Preview public listing", () => { pushInfo("Opens the public listing in a new tab."); setOpenMenuId(null); }], ["View on map", () => { pushInfo("Opens this listing on the map."); setOpenMenuId(null); }], ["Duplicate", () => doDuplicate(l)], ["View activity", () => { setEditorId(l.id); setOpenMenuId(null); }]].map(([label, fn]) => (
                                <button key={label} onClick={fn} style={{ display: "block", width: "100%", textAlign: "left", padding: "9px 12px", background: "transparent", border: "none", fontSize: "13px", cursor: "pointer", color: "var(--text-body)" }}>{label}</button>
                              ))}
                              <div style={{ borderTop: "1px solid var(--border)" }} />
                              {window.PL_TRANSITIONS[l.status].map((t) => (
                                <button key={t} onClick={() => { requestAction(t, [l.id]); setOpenMenuId(null); }} style={{ display: "block", width: "100%", textAlign: "left", padding: "9px 12px", background: "transparent", border: "none", fontSize: "13px", cursor: "pointer", color: window.PL_ACTION_META[t].color, fontWeight: 600 }}>{window.PL_ACTION_META[t].label}</button>
                              ))}
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {!previewState && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "14px" }}>
              <span style={{ fontSize: "13px", color: "var(--text-muted)" }}>{sorted.length === 0 ? "0" : ((pageClamped - 1) * pageSize + 1) + "\u2013" + Math.min(pageClamped * pageSize, sorted.length)} of {sorted.length}</span>
              <div style={{ display: "flex", gap: "6px" }}>
                <LSButton variant="outline" size="sm" disabled={pageClamped <= 1} onClick={() => setPage((p) => p - 1)}>Previous</LSButton>
                <LSButton variant="outline" size="sm" disabled={pageClamped >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</LSButton>
              </div>
            </div>
          )}
        </div>
      </div>

      {editor && <window.ListingsEditor listing={editor} onClose={() => setEditorId(null)} onRequestAction={requestAction} onSave={doSave} />}
      {confirmAction && <window.PL_ConfirmDialog action={confirmAction.action} count={confirmAction.ids.length} onConfirm={confirmYes} onCancel={() => setConfirmAction(null)} />}

      {toast && (
        <div style={{ position: "fixed", bottom: "24px", left: "50%", transform: "translateX(-50%)", zIndex: 80, display: "flex", alignItems: "center", gap: "16px", background: "var(--navy-800)", color: "#fff", padding: "12px 20px", borderRadius: "var(--radius-md)", boxShadow: "var(--shadow-xl)" }}>
          <span style={{ fontSize: "13.5px", fontWeight: 600 }}>{toast.message}</span>
          <button onClick={undoLast} style={{ background: "transparent", border: "none", color: "#fff", fontWeight: 700, textDecoration: "underline", cursor: "pointer", fontSize: "13px", padding: 0 }}>Undo</button>
        </div>
      )}
      {infoToast && !toast && (
        <div style={{ position: "fixed", bottom: "24px", left: "50%", transform: "translateX(-50%)", zIndex: 80, background: "var(--navy-800)", color: "#fff", padding: "12px 20px", borderRadius: "var(--radius-md)", boxShadow: "var(--shadow-xl)", fontSize: "13.5px", fontWeight: 600 }}>{infoToast}</div>
      )}

      <div style={{ flex: "none", display: "flex", justifyContent: "flex-end", alignItems: "center", gap: "8px", padding: "8px 16px", borderTop: "1px solid var(--border)", background: "var(--paper)" }}>
        <span style={{ fontSize: "10.5px", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.03em" }}>Design preview</span>
        <select value={scenario} onChange={(e) => setScenario(e.target.value)} style={{ fontSize: "12px", fontFamily: "var(--font-sans)", border: "1px solid var(--border-strong)", borderRadius: "var(--radius-sm)", padding: "4px 6px" }}>
          <option value="default">Default inventory</option>
          <option value="filtered">Filtered results</option>
          <option value="needs-attention">Needs attention tab</option>
          <option value="editor-open">Editor open</option>
          <option value="location-warning">Location validation warning</option>
          <option value="missing-photos">Missing photo data</option>
          <option value="archive-confirm">Archive confirmation</option>
          <option value="empty">Empty results</option>
          <option value="loading">Loading</option>
          <option value="error">Server error</option>
        </select>
      </div>
    </div>
  );
}

Object.assign(window, { ListingsScreen });
