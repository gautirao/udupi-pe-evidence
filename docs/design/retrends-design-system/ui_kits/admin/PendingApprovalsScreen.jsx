// Pending Approvals — admin moderation queue. Search/filter/sort a real table, select
// rows for restricted bulk approval, and open a wide review drawer per listing.
const { Icon: PA_Icon, Badge: PA_Badge, Button: PA_Button, Input: PA_Input, Select: PA_Select } = window.ReTrendsDesignSystem_f37966;

const DEFAULT_FILTERS = { types: [], localities: [], brokers: [], age: "any", flags: [] };
const AGE_OPTIONS = [["any", "Any age"], ["today", "Today"], ["3plus", "3+ days"], ["7plus", "7+ days"], ["21plus", "21+ days"]];

function PA_StatChip({ label, value, warn }) {
  return (
    <div style={{ textAlign: "right" }}>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: "19px", fontWeight: 800, lineHeight: 1, color: warn && value > 0 ? "var(--caution)" : "var(--text-strong)" }}>{value}</div>
      <div style={{ fontSize: "10.5px", fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.03em", marginTop: "2px" }}>{label}</div>
    </div>
  );
}

function PA_Chip({ children, onRemove }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "4px 6px 4px 10px", borderRadius: "var(--radius-full)", background: "var(--navy-100)", color: "var(--navy-800)", fontSize: "12px", fontWeight: 600 }}>
      {children}
      <button onClick={onRemove} style={{ display: "flex", background: "transparent", border: "none", padding: "2px", cursor: "pointer", color: "var(--navy-800)" }}><PA_Icon name="x" size={11} /></button>
    </span>
  );
}

function PA_ToggleChip({ active, onClick, children }) {
  return (
    <button onClick={onClick} style={{ padding: "5px 12px", borderRadius: "var(--radius-full)", fontSize: "12.5px", fontWeight: 600, cursor: "pointer", border: "1px solid " + (active ? "var(--navy-800)" : "var(--border-strong)"), background: active ? "var(--navy-800)" : "var(--paper)", color: active ? "#fff" : "var(--text-body)" }}>{children}</button>
  );
}

function PA_FiltersPanel({ filters, setFilters, localities, brokerIds, onClose }) {
  const toggle = (key, value) => setFilters((f) => ({ ...f, [key]: f[key].includes(value) ? f[key].filter((v) => v !== value) : [...f[key], value] }));
  const group = (title, key, options) => (
    <div style={{ marginBottom: "16px" }}>
      <div style={{ fontSize: "11.5px", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.03em", marginBottom: "8px" }}>{title}</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
        {options.map(([value, label]) => <PA_ToggleChip key={value} active={filters[key].includes(value)} onClick={() => toggle(key, value)}>{label}</PA_ToggleChip>)}
      </div>
    </div>
  );
  return (
    <div style={{ position: "absolute", top: "46px", left: 0, zIndex: 30, width: "560px", background: "var(--paper)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", boxShadow: "var(--shadow-lg)", padding: "18px 20px" }}>
      {group("Property type", "types", Object.entries(window.PA_PROPERTY_TYPES))}
      {group("Locality", "localities", localities.map((l) => [l, l]))}
      {group("Broker", "brokers", brokerIds.map((b) => [b, window.PA_BROKERS[b].name]))}
      <div style={{ marginBottom: "16px" }}>
        <div style={{ fontSize: "11.5px", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.03em", marginBottom: "8px" }}>Submission age</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
          {AGE_OPTIONS.map(([value, label]) => <PA_ToggleChip key={value} active={filters.age === value} onClick={() => setFilters((f) => ({ ...f, age: value }))}>{label}</PA_ToggleChip>)}
        </div>
      </div>
      {group("Review flags", "flags", Object.entries(window.PA_FLAG_META).map(([k, m]) => [k, m.label]))}
      <div style={{ display: "flex", justifyContent: "flex-end" }}><PA_Button size="sm" onClick={onClose}>Done</PA_Button></div>
    </div>
  );
}

function PA_Screen() {
  const [listings, setListings] = React.useState(() => window.PA_LISTINGS.map((l) => ({ ...l })));
  const [search, setSearch] = React.useState("");
  const [filters, setFilters] = React.useState(DEFAULT_FILTERS);
  const [filtersOpen, setFiltersOpen] = React.useState(false);
  const [sortKey, setSortKey] = React.useState("submittedAt");
  const [sortDir, setSortDir] = React.useState("asc");
  const [page, setPage] = React.useState(1);
  const pageSize = 10;
  const [selected, setSelected] = React.useState(() => new Set());
  const [drawer, setDrawer] = React.useState(null);
  const [toast, setToast] = React.useState(null);
  const [previewState, setPreviewState] = React.useState(null);
  const [scenario, setScenario] = React.useState("default");
  const toastTimer = React.useRef(null);

  React.useEffect(() => {
    setDrawer(null); setPreviewState(null); setSelected(new Set());
    setSearch(""); setFilters(DEFAULT_FILTERS); setPage(1); setFiltersOpen(false);
    if (scenario === "filtered") { setFilters({ ...DEFAULT_FILTERS, types: ["agricultural_land"], flags: ["possible_duplicate"] }); setFiltersOpen(true); }
    else if (scenario === "empty") setSearch("zzz-no-match-xk9");
    else if (scenario === "loading") setPreviewState("loading");
    else if (scenario === "error") setPreviewState("error");
    else if (scenario === "drawer-duplicate") setDrawer({ id: "PS-24631", initialView: "review" });
    else if (scenario === "drawer-return") setDrawer({ id: "PS-24675", initialView: "return" });
  }, [scenario]);

  const pending = listings.filter((l) => l.status === "pending");
  const newToday = pending.filter((l) => window.PA_formatAge(l.submittedAt) === "Today");
  const over7 = pending.filter((l) => window.PA_ageDays(l.submittedAt) > 7);
  const needsAttention = pending.filter((l) => l.flags.length > 0);
  const localities = [...new Set(listings.map((l) => l.locality))].sort();
  const brokerIds = [...new Set(listings.map((l) => l.broker))];

  const matchesSearch = (l) => {
    if (!search.trim()) return true;
    const q = search.trim().toLowerCase();
    return l.title.toLowerCase().includes(q) || l.id.toLowerCase().includes(q) || window.PA_BROKERS[l.broker].name.toLowerCase().includes(q) || l.locality.toLowerCase().includes(q);
  };
  const matchesFilters = (l) => {
    if (filters.types.length && !filters.types.includes(l.propertyType)) return false;
    if (filters.localities.length && !filters.localities.includes(l.locality)) return false;
    if (filters.brokers.length && !filters.brokers.includes(l.broker)) return false;
    if (filters.flags.length && !filters.flags.some((f) => l.flags.includes(f))) return false;
    if (filters.age !== "any") {
      const d = window.PA_ageDays(l.submittedAt);
      if (filters.age === "today" && window.PA_formatAge(l.submittedAt) !== "Today") return false;
      if (filters.age === "3plus" && d < 3) return false;
      if (filters.age === "7plus" && d <= 7) return false;
      if (filters.age === "21plus" && d < 21) return false;
    }
    return true;
  };
  const filtered = pending.filter((l) => matchesSearch(l) && matchesFilters(l));
  const sorted = [...filtered].sort((a, b) => {
    let av, bv;
    if (sortKey === "price") { av = a.price; bv = b.price; }
    else if (sortKey === "locality") { av = a.locality; bv = b.locality; }
    else if (sortKey === "title") { av = a.title; bv = b.title; }
    else { av = new Date(a.submittedAt).getTime(); bv = new Date(b.submittedAt).getTime(); }
    const cmp = typeof av === "string" ? av.localeCompare(bv) : av - bv;
    return sortDir === "asc" ? cmp : -cmp;
  });
  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const pageClamped = Math.min(page, totalPages);
  const paged = sorted.slice((pageClamped - 1) * pageSize, pageClamped * pageSize);

  const activeFilterCount = filters.types.length + filters.localities.length + filters.brokers.length + filters.flags.length + (filters.age !== "any" ? 1 : 0);
  const hasActiveFilters = activeFilterCount > 0 || !!search.trim();
  const resetFilters = () => { setFilters(DEFAULT_FILTERS); setSearch(""); setPage(1); };

  const toggleHeaderSort = (key) => { if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc")); else { setSortKey(key); setSortDir("asc"); } };
  const sortArrow = (key) => sortKey === key ? (sortDir === "asc" ? " \u2191" : " \u2193") : "";

  const toggleSelect = (id) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleSelectPage = () => setSelected((s) => { const ids = paged.map((l) => l.id); const allSel = ids.every((id) => s.has(id)); const n = new Set(s); ids.forEach((id) => allSel ? n.delete(id) : n.add(id)); return n; });

  const pushToast = (ids, message) => { if (toastTimer.current) clearTimeout(toastTimer.current); setToast({ ids, message }); toastTimer.current = setTimeout(() => setToast(null), 6000); };
  const applyStatus = (ids, status) => setListings((ls) => ls.map((l) => ids.includes(l.id) ? { ...l, status } : l));
  const findNext = (afterId) => {
    const idx = sorted.findIndex((l) => l.id === afterId);
    for (let i = idx + 1; i < sorted.length; i++) if (sorted[i].id !== afterId) return sorted[i];
    for (let i = 0; i < idx; i++) if (sorted[i].id !== afterId) return sorted[i];
    return null;
  };
  const doApprove = (id) => { const next = findNext(id); applyStatus([id], "approved"); setSelected((s) => { const n = new Set(s); n.delete(id); return n; }); pushToast([id], "Listing approved and published."); setDrawer(next ? { id: next.id, initialView: "review" } : null); };
  const doReturn = (id) => { const next = findNext(id); applyStatus([id], "returned"); pushToast([id], "Returned to broker for edits."); setDrawer(next ? { id: next.id, initialView: "review" } : null); };
  const doReject = (id) => { const next = findNext(id); applyStatus([id], "rejected"); pushToast([id], "Listing rejected."); setDrawer(next ? { id: next.id, initialView: "review" } : null); };
  const eligibleSelected = [...selected].filter((id) => { const l = listings.find((x) => x.id === id); return l && l.flags.length === 0; });
  const doBulkApprove = () => { applyStatus(eligibleSelected, "approved"); setSelected(new Set()); pushToast(eligibleSelected, eligibleSelected.length + " listing" + (eligibleSelected.length === 1 ? "" : "s") + " approved and published."); };
  const undoLast = () => { if (toast) { applyStatus(toast.ids, "pending"); setToast(null); if (toastTimer.current) clearTimeout(toastTimer.current); } };

  const drawerListing = drawer && listings.find((l) => l.id === drawer.id);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", minHeight: 0 }}>
      <window.RTA_Header active="Listings" />
      <div className="upt-scroll" style={{ flex: 1, minHeight: 0, overflowY: "auto", background: "var(--background)" }}>
        <div style={{ maxWidth: "1360px", margin: "0 auto", padding: "26px 28px 60px" }}>

          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: "18px", marginBottom: "22px" }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <div style={{ width: "32px", height: "32px", borderRadius: "var(--radius-md)", background: "var(--navy-800)", display: "flex", alignItems: "center", justifyContent: "center", flex: "none" }}><PA_Icon name="file-check" size={17} color="#fff" /></div>
                <h1 style={{ fontSize: "23px", fontWeight: 700, margin: 0, color: "var(--text-strong)" }}>Pending approvals</h1>
                <PA_Badge tone="navy" pill>{pending.length} pending</PA_Badge>
              </div>
              <p style={{ fontSize: "13.5px", color: "var(--text-muted)", margin: "5px 0 0 42px" }}>Review broker-submitted listings</p>
            </div>
            <div style={{ display: "flex", gap: "20px", padding: "4px 0" }}>
              <PA_StatChip label="New today" value={newToday.length} />
              <div style={{ width: "1px", background: "var(--border)" }} />
              <PA_StatChip label="Over 7 days old" value={over7.length} warn />
              <div style={{ width: "1px", background: "var(--border)" }} />
              <PA_StatChip label="Needs attention" value={needsAttention.length} warn />
            </div>
          </div>

          <div style={{ position: "relative", display: "flex", alignItems: "center", gap: "10px", marginBottom: "10px", flexWrap: "wrap" }}>
            <div style={{ flex: "1 1 300px", maxWidth: "420px" }}>
              <PA_Input placeholder="Search title, listing ID, broker or locality" leadingIcon={<PA_Icon name="search" size={16} />} value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
            </div>
            <PA_Button variant="outline" onClick={() => setFiltersOpen((o) => !o)}>
              <PA_Icon name="sliders-horizontal" size={15} /> Filters{activeFilterCount > 0 ? " (" + activeFilterCount + ")" : ""}
            </PA_Button>
            {hasActiveFilters && <PA_Button variant="ghost" onClick={resetFilters}>Reset filters</PA_Button>}
            <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "12px" }}>
              <span style={{ fontSize: "13px", color: "var(--text-muted)" }}>{filtered.length} result{filtered.length === 1 ? "" : "s"}</span>
              <PA_Select size="sm" value={sortKey + ":" + sortDir} onChange={(e) => { const [k, d] = e.target.value.split(":"); setSortKey(k); setSortDir(d); }}
                options={[{ value: "submittedAt:asc", label: "Oldest first" }, { value: "submittedAt:desc", label: "Newest first" }, { value: "price:desc", label: "Price: high to low" }, { value: "price:asc", label: "Price: low to high" }, { value: "locality:asc", label: "Locality A\u2013Z" }]} />
            </div>
            {filtersOpen && <PA_FiltersPanel filters={filters} setFilters={(f) => { setFilters(f); setPage(1); }} localities={localities} brokerIds={brokerIds} onClose={() => setFiltersOpen(false)} />}
          </div>

          {activeFilterCount > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginBottom: "16px" }}>
              {filters.types.map((t) => <PA_Chip key={t} onRemove={() => setFilters((f) => ({ ...f, types: f.types.filter((x) => x !== t) }))}>{window.PA_PROPERTY_TYPES[t]}</PA_Chip>)}
              {filters.localities.map((t) => <PA_Chip key={t} onRemove={() => setFilters((f) => ({ ...f, localities: f.localities.filter((x) => x !== t) }))}>{t}</PA_Chip>)}
              {filters.brokers.map((t) => <PA_Chip key={t} onRemove={() => setFilters((f) => ({ ...f, brokers: f.brokers.filter((x) => x !== t) }))}>{window.PA_BROKERS[t].name}</PA_Chip>)}
              {filters.age !== "any" && <PA_Chip onRemove={() => setFilters((f) => ({ ...f, age: "any" }))}>{AGE_OPTIONS.find((a) => a[0] === filters.age)[1]}</PA_Chip>}
              {filters.flags.map((t) => <PA_Chip key={t} onRemove={() => setFilters((f) => ({ ...f, flags: f.flags.filter((x) => x !== t) }))}>{window.PA_FLAG_META[t].label}</PA_Chip>)}
            </div>
          )}

          {selected.size > 0 && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", padding: "11px 16px", background: "var(--navy-100)", borderRadius: "var(--radius-md)", marginBottom: "12px", flexWrap: "wrap" }}>
              <div style={{ fontSize: "13.5px", color: "var(--navy-800)" }}>
                <b>{selected.size} selected</b>
                {selected.size !== eligibleSelected.length && <span style={{ marginLeft: "8px", color: "var(--caution)" }}>· {selected.size - eligibleSelected.length} flagged, excluded from bulk approval</span>}
              </div>
              <div style={{ display: "flex", gap: "8px" }}>
                <PA_Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>Clear selection</PA_Button>
                <PA_Button size="sm" disabled={!eligibleSelected.length} style={{ background: "var(--positive)" }} onClick={doBulkApprove}>Approve {eligibleSelected.length} eligible</PA_Button>
              </div>
            </div>
          )}

          <div style={{ background: "var(--paper)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "var(--font-sans)" }}>
              <colgroup>
                <col className="pa-c-check" style={{ width: "3%" }} />
                <col className="pa-c-listing" style={{ width: "20%" }} />
                <col className="pa-col-broker pa-c-broker" style={{ width: "13%" }} />
                <col className="pa-col-type pa-c-type" style={{ width: "10%" }} />
                <col className="pa-c-locality" style={{ width: "9%" }} />
                <col className="pa-c-price" style={{ width: "9%" }} />
                <col className="pa-c-submitted" style={{ width: "11%" }} />
                <col className="pa-c-status" style={{ width: "15%" }} />
                <col className="pa-c-review" style={{ width: "10%" }} />
              </colgroup>
              <thead>
                <tr style={{ background: "var(--surface-subtle)", borderBottom: "1px solid var(--border)" }}>
                  <th style={{ width: "40px", padding: "10px 8px 10px 16px" }}><input type="checkbox" checked={paged.length > 0 && paged.every((l) => selected.has(l.id))} onChange={toggleSelectPage} style={{ width: "15px", height: "15px" }} /></th>
                  <th onClick={() => toggleHeaderSort("title")} style={thStyle}>Listing{sortArrow("title")}</th>
                  <th className="pa-col-broker" style={thStyle}>Broker</th>
                  <th className="pa-col-type" style={thStyle}>Type</th>
                  <th style={thStyle}>Locality</th>
                  <th onClick={() => toggleHeaderSort("price")} style={thStyle}>Price{sortArrow("price")}</th>
                  <th onClick={() => toggleHeaderSort("submittedAt")} style={thStyle}>Submitted{sortArrow("submittedAt")}</th>
                  <th style={thStyle}>Status</th>
                  <th style={{ ...thStyle, cursor: "default" }}></th>
                </tr>
              </thead>
              <tbody>
                {previewState === "loading" ? Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i} style={{ borderBottom: "1px solid var(--border)" }}>
                    <td colSpan={9} style={{ padding: "14px 16px" }}><div className="upt-shimmer" style={{ height: "16px", borderRadius: "var(--radius-sm)", background: "var(--grey-100)" }} /></td>
                  </tr>
                )) : previewState === "error" ? (
                  <tr><td colSpan={9} style={{ padding: "56px 16px", textAlign: "center" }}>
                    <PA_Icon name="alert-triangle" size={26} color="var(--negative)" />
                    <div style={{ fontSize: "15px", fontWeight: 700, color: "var(--text-strong)", margin: "12px 0 4px" }}>Couldn't load the queue</div>
                    <div style={{ fontSize: "13px", color: "var(--text-muted)", marginBottom: "16px" }}>A network error interrupted the request. Nothing was changed.</div>
                    <PA_Button variant="outline" onClick={() => setPreviewState(null)}>Retry</PA_Button>
                  </td></tr>
                ) : paged.length === 0 ? (
                  <tr><td colSpan={9} style={{ padding: "56px 16px", textAlign: "center" }}>
                    <PA_Icon name="search" size={26} color="var(--text-muted)" />
                    <div style={{ fontSize: "15px", fontWeight: 700, color: "var(--text-strong)", margin: "12px 0 4px" }}>No listings match these filters</div>
                    <div style={{ fontSize: "13px", color: "var(--text-muted)", marginBottom: "16px" }}>Try a different search term or reset your filters.</div>
                    <PA_Button variant="outline" onClick={resetFilters}>Reset filters</PA_Button>
                  </td></tr>
                ) : paged.map((l) => {
                  const broker = window.PA_BROKERS[l.broker];
                  return (
                    <tr key={l.id} className="pa-row" onClick={() => setDrawer({ id: l.id })} style={{ borderBottom: "1px solid var(--border)" }}>
                      <td style={{ padding: "12px 8px 12px 16px" }} onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={selected.has(l.id)} onChange={() => toggleSelect(l.id)} style={{ width: "15px", height: "15px" }} /></td>
                      <td style={{ padding: "12px 14px", maxWidth: "260px" }}>
                        <div style={{ fontSize: "13.5px", fontWeight: 700, color: "var(--text-strong)", lineHeight: 1.35, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{l.title}</div>
                        <div style={{ fontSize: "11.5px", fontFamily: "var(--font-mono)", color: "var(--text-muted)", marginTop: "3px" }}>{l.id}</div>
                      </td>
                      <td className="pa-col-broker" style={{ padding: "12px 14px" }}>
                        <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-strong)" }}>{broker.name}</div>
                        <div style={{ marginTop: "3px" }}><window.PA_VerificationBadge tier={broker.verification} size="sm" /></div>
                      </td>
                      <td className="pa-col-type" style={{ padding: "12px 14px" }}><window.PA_TypeLabel type={l.propertyType} /></td>
                      <td style={{ padding: "12px 14px", fontSize: "13px", color: "var(--text-body)" }}>{l.locality}</td>
                      <td style={{ padding: "12px 14px", fontSize: "13px", fontFamily: "var(--font-mono)", fontWeight: 700, color: "var(--text-strong)" }}>{window.PA_formatPrice(l.price)}</td>
                      <td style={{ padding: "12px 14px" }}><window.PA_AgeCell iso={l.submittedAt} /></td>
                      <td style={{ padding: "12px 14px" }}><window.PA_FlagList flags={l.flags} max={2} /></td>
                      <td style={{ padding: "12px 16px 12px 8px", textAlign: "right" }} onClick={(e) => e.stopPropagation()}>
                        <PA_Button variant="outline" size="sm" onClick={() => setDrawer({ id: l.id })}>Review</PA_Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {!previewState && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "14px" }}>
              <span style={{ fontSize: "13px", color: "var(--text-muted)" }}>{sorted.length === 0 ? "0" : ((pageClamped - 1) * pageSize + 1) + "\u2013" + Math.min(pageClamped * pageSize, sorted.length)} of {sorted.length}</span>
              <div style={{ display: "flex", gap: "6px" }}>
                <PA_Button variant="outline" size="sm" disabled={pageClamped <= 1} onClick={() => setPage((p) => p - 1)}>Previous</PA_Button>
                <PA_Button variant="outline" size="sm" disabled={pageClamped >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</PA_Button>
              </div>
            </div>
          )}
        </div>
      </div>

      {drawerListing && <window.PA_ReviewDrawer listing={drawerListing} initialView={drawer.initialView} onClose={() => setDrawer(null)} onApprove={doApprove} onReturn={doReturn} onReject={doReject} />}

      {toast && (
        <div style={{ position: "fixed", bottom: "24px", left: "50%", transform: "translateX(-50%)", zIndex: 80, display: "flex", alignItems: "center", gap: "16px", background: "var(--navy-800)", color: "#fff", padding: "12px 20px", borderRadius: "var(--radius-md)", boxShadow: "var(--shadow-xl)" }}>
          <span style={{ fontSize: "13.5px", fontWeight: 600 }}>{toast.message}</span>
          <button onClick={undoLast} style={{ background: "transparent", border: "none", color: "#fff", fontWeight: 700, textDecoration: "underline", cursor: "pointer", fontSize: "13px", padding: 0 }}>Undo</button>
        </div>
      )}

      <div style={{ flex: "none", display: "flex", justifyContent: "flex-end", alignItems: "center", gap: "8px", padding: "8px 16px", borderTop: "1px solid var(--border)", background: "var(--paper)" }}>
        <span style={{ fontSize: "10.5px", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.03em" }}>Design preview</span>
        <select value={scenario} onChange={(e) => setScenario(e.target.value)} style={{ fontSize: "12px", fontFamily: "var(--font-sans)", border: "1px solid var(--border-strong)", borderRadius: "var(--radius-sm)", padding: "4px 6px", background: "var(--paper)" }}>
          <option value="default">Default queue</option>
          <option value="filtered">Filters applied</option>
          <option value="empty">Empty results</option>
          <option value="loading">Loading</option>
          <option value="error">Error</option>
          <option value="drawer-duplicate">{"Drawer \u2014 duplicate warning"}</option>
          <option value="drawer-return">{"Drawer \u2014 return for edits"}</option>
        </select>
      </div>
    </div>
  );
}
const thStyle = { padding: "10px 14px", textAlign: "left", fontSize: "11.5px", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.03em", cursor: "pointer", userSelect: "none" };

Object.assign(window, { PA_Screen });
