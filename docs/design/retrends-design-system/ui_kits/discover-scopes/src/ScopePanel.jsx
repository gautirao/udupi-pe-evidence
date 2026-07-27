// Discover — Result Scopes · panel block renderer.
// Every state declares an ordered list of blocks; this file is the only place
// that knows how a block looks, so 50+ states stay visually consistent.
const { Icon: PI, Badge: PBadge, TrustBadge: PTrust, Button: PButton } = window.ReTrendsDesignSystem_f37966;
const RSB = () => window;

function Crumb({ items, compact }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "5px", flexWrap: "wrap", marginBottom: "12px" }}>
      {items.map((b, i) => (
        <React.Fragment key={i}>
          {i > 0 && <PI name="chevron-right" size={12} color="var(--grey-400)" />}
          <span style={{ fontFamily: "var(--font-sans)", fontSize: compact ? "11.5px" : "12.5px", fontWeight: 600, color: i === items.length - 1 ? "var(--text-strong)" : "var(--text-muted)" }}>{b}</span>
        </React.Fragment>
      ))}
    </div>
  );
}

function FilterChips({ chips }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap", marginBottom: "14px" }}>
      <span style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "var(--tracking-caps)", textTransform: "uppercase", color: "var(--text-muted)", marginRight: "2px" }}>Filters</span>
      {chips.map((c) => (
        <span key={c} style={{ display: "inline-flex", alignItems: "center", gap: "5px", padding: "4px 10px", borderRadius: "var(--radius-full)", border: "1px solid var(--border)", background: "var(--surface-subtle)", fontFamily: "var(--font-mono)", fontSize: "11px", fontWeight: 600, color: "var(--text-body)" }}>{c}</span>
      ))}
    </div>
  );
}

function ResultHeading({ label, value, count, sub, tone }) {
  return (
    <div style={{ marginBottom: "14px" }}>
      <div style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "var(--tracking-caps)", textTransform: "uppercase", color: "var(--text-muted)", marginBottom: "5px" }}>{label}</div>
      <h2 style={{ margin: 0, fontFamily: "var(--font-serif)", fontSize: "22px", fontWeight: 600, letterSpacing: "-0.02em", color: "var(--text-strong)", lineHeight: 1.2, textWrap: "pretty" }}>{value}</h2>
      {count != null && (
        <div style={{ marginTop: "7px", display: "flex", alignItems: "baseline", gap: "7px" }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: "19px", fontWeight: 700, color: tone === "zero" ? "var(--text-muted)" : "var(--text-strong)" }}>{count}</span>
          <span style={{ fontSize: "13px", color: "var(--text-muted)" }}>{sub || "listings"}</span>
        </div>
      )}
    </div>
  );
}

function SuggestionRow({ s, onGo }) {
  const [h, setH] = React.useState(false);
  const added = s.state === "added", blocked = s.state === "blocked", dup = s.state === "duplicate";
  return (
    <div onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}
      style={{ display: "flex", alignItems: "center", gap: "12px", padding: "12px 14px", borderRadius: "var(--radius-lg)", background: "var(--surface-card)", border: `1px ${dup || blocked ? "solid var(--ochre-600, #A8791F)" : "solid var(--border)"}`, boxShadow: h ? "var(--shadow-md)" : "var(--shadow-xs)", transition: "box-shadow var(--dur-normal) var(--ease-standard)" }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
          <span style={{ fontSize: "14px", fontWeight: 700, color: "var(--text-strong)", letterSpacing: "-0.01em" }}>{s.name}</span>
          {s.rel && <span style={{ fontSize: "11px", fontWeight: 600, color: "var(--text-muted)", padding: "2px 7px", borderRadius: "var(--radius-full)", background: "var(--surface-subtle)", border: "1px solid var(--border)" }}>{s.rel}</span>}
        </div>
        <div style={{ marginTop: "4px", fontFamily: "var(--font-mono)", fontSize: "11.5px", color: "var(--text-body)" }}>
          {s.loading ? <span style={{ color: "var(--text-muted)" }}>Counting…</span>
            : s.countError ? <span style={{ color: "var(--ochre-700, #7A5714)" }}>Count unavailable</span>
              : <>{s.listings} listings · {s.schools} schools</>}
        </div>
      </div>
      {added ? (
        <span style={{ display: "inline-flex", alignItems: "center", gap: "5px", fontSize: "12.5px", fontWeight: 700, color: "var(--evergreen-600)" }}><PI name="check" size={15} color="var(--evergreen-600)" />Added</span>
      ) : (
        <window.RSBtn size="sm" variant={blocked ? "ghost" : "outline"} disabled={blocked} onClick={() => onGo(s.to)}>+ Add</window.RSBtn>
      )}
    </div>
  );
}

function ListingGrid({ ids, n, compact, dimmed }) {
  const list = React.useMemo(() => window.RS.listingsFor(ids && ids.length ? ids : ["hebbal"], n || 4), [JSON.stringify(ids), n]);
  return (
    <div style={{ display: "grid", gridTemplateColumns: compact ? "1fr" : "1fr 1fr", gap: "14px", opacity: dimmed ? 0.55 : 1, filter: dimmed ? "saturate(0.7)" : "none", transition: "opacity var(--dur-normal)" }}>
      {list.map((l) => (
        <div key={l.id} style={{ background: "var(--surface-card)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", overflow: "hidden", boxShadow: "var(--shadow-sm)", display: "flex", flexDirection: "column" }}>
          <div style={{ position: "relative", height: compact ? "150px" : "140px", background: "var(--surface-muted)" }}>
            <img src={l.image} alt="" loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            <div style={{ position: "absolute", top: "10px", left: "10px" }}><PTrust tier={l.trustTier} size="sm" /></div>
            <div style={{ position: "absolute", bottom: "9px", left: "10px", padding: "3px 8px", borderRadius: "var(--radius-sm)", background: "var(--navy-900)", color: "#fff", fontFamily: "var(--font-sans)", fontSize: "10.5px", fontWeight: 700 }}>{l.area}</div>
          </div>
          <div style={{ padding: "13px 14px 14px" }}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "8px" }}>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: "17px", fontWeight: 600, color: "var(--text-strong)" }}>{window.RS.inr(l.price)}</span>
              <PBadge tone="neutral" pill>{l.propType}</PBadge>
            </div>
            <h3 style={{ margin: "7px 0 3px", fontSize: "13.5px", fontWeight: 600, color: "var(--text-strong)", lineHeight: 1.3 }}>{l.title}</h3>
            <div style={{ display: "flex", gap: "12px", marginTop: "9px", fontFamily: "var(--font-mono)", fontSize: "11.5px", color: "var(--text-muted)" }}>
              <span>{l.beds} BHK</span><span>{l.baths} bath</span><span>{l.sqft} sq.ft</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function Skeleton({ h }) {
  return <div style={{ height: h || "78px", borderRadius: "var(--radius-lg)", background: "linear-gradient(90deg, var(--surface-subtle) 25%, var(--canvas-200, #EFEDE8) 50%, var(--surface-subtle) 75%)", backgroundSize: "200% 100%", animation: "rsShimmer 1.4s linear infinite" }}></div>;
}

function AlertForm({ b, onGo }) {
  return (
    <div style={{ background: "var(--surface-card)", border: "1px solid var(--border)", borderRadius: "var(--radius-xl)", padding: "18px 20px", marginBottom: "14px", boxShadow: "var(--shadow-md)" }}>
      <h3 style={{ margin: "0 0 4px", fontFamily: "var(--font-serif)", fontSize: "19px", fontWeight: 600, letterSpacing: "-0.01em", color: "var(--text-strong)" }}>{b.title || "Create alert"}</h3>
      <p style={{ margin: "0 0 16px", fontSize: "12.5px", lineHeight: 1.5, color: "var(--text-muted)", textWrap: "pretty" }}>{b.body || "We will email you when new listings match this exact search."}</p>
      <div style={{ border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", overflow: "hidden", marginBottom: "16px" }}>
        {[["Result scope", b.scope], ["Filters", b.filters], b.notIncluded ? ["Not included", b.notIncluded] : null].filter(Boolean).map(([k, v], i) => (
          <div key={k} style={{ display: "flex", gap: "12px", padding: "11px 13px", borderTop: i ? "1px solid var(--border)" : "none", background: i % 2 ? "var(--surface-subtle)" : "var(--surface-card)" }}>
            <span style={{ flex: "none", width: "96px", fontSize: "11px", fontWeight: 700, letterSpacing: "var(--tracking-caps)", textTransform: "uppercase", color: "var(--text-muted)" }}>{k}</span>
            <span style={{ flex: 1, fontSize: "12.5px", fontWeight: 600, color: "var(--text-strong)", lineHeight: 1.5, textWrap: "pretty" }}>{v}</span>
          </div>
        ))}
      </div>
      {b.unsupported && (
        <window.RSCallout tone="warn" title={b.unsupported.title} body={b.unsupported.body} />
      )}
      <div style={{ marginBottom: "16px" }}>
        <div style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "var(--tracking-caps)", textTransform: "uppercase", color: "var(--text-muted)", marginBottom: "8px" }}>How often</div>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          {["Instant", "Daily", "Weekly"].map((f) => {
            const on = (b.frequency || "Daily") === f;
            return (
              <span key={f} style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "8px 14px", borderRadius: "var(--radius-md)", border: on ? "1.5px solid var(--navy-800)" : "1px solid var(--border)", background: on ? "var(--navy-100)" : "var(--surface-card)", fontFamily: "var(--font-sans)", fontSize: "12.5px", fontWeight: 700, color: on ? "var(--navy-800)" : "var(--text-body)" }}>
                {on && <PI name="check" size={13} color="var(--navy-800)" />}{f}{f === "Daily" && <span style={{ fontSize: "10px", fontWeight: 600, opacity: 0.7 }}>default</span>}
              </span>
            );
          })}
        </div>
      </div>
      <div style={{ display: "flex", gap: "9px", flexWrap: "wrap" }}>
        {(b.actions || []).map((a) => <window.RSBtn key={a.label} variant={a.variant} icon={a.icon} onClick={() => onGo(a.to)}>{a.label}</window.RSBtn>)}
      </div>
    </div>
  );
}

function AlertList({ b, onGo }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px", marginBottom: "14px" }}>
      {b.items.map((it) => (
        <div key={it.name} style={{ background: "var(--surface-card)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", padding: "15px 16px", boxShadow: "var(--shadow-xs)" }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "10px" }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                <window.RSScopeGlyph kind={it.kind === "polygon" ? "poly" : it.kind === "viewport" ? "frame" : "pin"} size={14} color="var(--navy-800)" />
                <span style={{ fontSize: "14.5px", fontWeight: 700, color: "var(--text-strong)", letterSpacing: "-0.01em" }}>{it.name}</span>
                <span style={{ padding: "2px 8px", borderRadius: "var(--radius-full)", fontSize: "10.5px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", background: it.status === "Active" ? "var(--trust-verified-bg)" : "var(--surface-subtle)", color: it.status === "Active" ? "var(--trust-verified-fg)" : "var(--text-muted)", border: "1px solid var(--border)" }}>{it.status}</span>
              </div>
              <div style={{ marginTop: "6px", fontSize: "12.5px", color: "var(--text-muted)", lineHeight: 1.5, textWrap: "pretty" }}>{it.filters}</div>
            </div>
            <span style={{ flex: "none", textAlign: "right" }}>
              <span style={{ display: "block", fontFamily: "var(--font-mono)", fontSize: "17px", fontWeight: 700, color: it.newMatches ? "var(--copper-600)" : "var(--text-muted)" }}>{it.newMatches}</span>
              <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>new</span>
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px", marginTop: "13px", paddingTop: "12px", borderTop: "1px solid var(--border)", flexWrap: "wrap" }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: "11px", color: "var(--text-muted)" }}>{it.frequency} · last checked {it.lastChecked}</span>
            <span style={{ display: "flex", gap: "7px" }}>
              {(it.actions || []).map((a) => <window.RSBtn key={a.label} size="sm" variant={a.variant} onClick={() => onGo(a.to)}>{a.label}</window.RSBtn>)}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

function Block({ b, compact, onGo }) {
  const act = (list) => (list || []).map((a) => <window.RSBtn key={a.label} variant={a.variant} icon={a.icon} size={a.size} disabled={a.disabled} onClick={() => onGo(a.to)}>{a.label}</window.RSBtn>);
  switch (b.t) {
    case "crumb": return <Crumb items={b.items} compact={compact} />;
    case "filters": return <FilterChips chips={b.chips || window.RS.FILTERS} />;
    case "why": return <window.RSWhy>{b.text}</window.RSWhy>;
    case "heading": return <ResultHeading {...b} />;
    case "scopebar": return <window.RSScopeBar kind={b.kind} chips={b.chips} note={b.note} draft={b.draft} focusedId={b.focusedId} actions={act(b.actions)} />;
    case "callout": return <window.RSCallout tone={b.tone} title={b.title} body={b.body} icon={b.icon} actions={act(b.actions)} />;
    case "confirm":
      return (
        <div style={{ background: "var(--surface-card)", border: "1.5px solid var(--copper-500)", borderRadius: "var(--radius-lg)", padding: "16px 17px", marginBottom: "14px", boxShadow: "var(--shadow-md)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "10px" }}>
            <PI name="sliders-horizontal" size={15} color="var(--copper-600)" />
            <span style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "var(--tracking-caps)", textTransform: "uppercase", color: "var(--copper-600)" }}>Replace result scope?</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap", marginBottom: "11px" }}>
            <span style={{ display: "inline-flex", flexDirection: "column", gap: "4px" }}>
              <span style={{ fontSize: "10.5px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-muted)" }}>Now</span>
              <window.RSScopeChip kind={b.fromKind} label={b.from} tone="muted" />
            </span>
            <PI name="arrow-right" size={16} color="var(--grey-400)" style={{ marginTop: "16px" }} />
            <span style={{ display: "inline-flex", flexDirection: "column", gap: "4px" }}>
              <span style={{ fontSize: "10.5px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--copper-600)" }}>After</span>
              <window.RSScopeChip kind={b.toKind} label={b.to} />
            </span>
          </div>
          <p style={{ margin: "0 0 13px", fontSize: "12.5px", lineHeight: 1.55, color: "var(--text-body)", textWrap: "pretty" }}>{b.body}</p>
          <div style={{ display: "flex", gap: "9px", flexWrap: "wrap" }}>{act(b.actions)}</div>
        </div>
      );
    case "stale":
      return (
        <div style={{ background: "var(--ochre-50, #FBF3E2)", border: "1px solid var(--ochre-600, #A8791F)", borderRadius: "var(--radius-lg)", padding: "14px 16px", marginBottom: "14px" }}>
          <div style={{ display: "flex", gap: "11px", alignItems: "flex-start" }}>
            <span style={{ flex: "none", width: "26px", height: "26px", borderRadius: "var(--radius-full)", background: "rgba(255,255,255,0.75)", display: "flex", alignItems: "center", justifyContent: "center" }}><PI name="map-pin" size={15} color="var(--ochre-700, #7A5714)" /></span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: "13.5px", fontWeight: 700, color: "var(--ochre-700, #7A5714)" }}>{b.title}</div>
              <p style={{ margin: "5px 0 0", fontSize: "12.5px", lineHeight: 1.55, color: "var(--text-body)", textWrap: "pretty" }}>{b.body}</p>
              <div style={{ display: "flex", gap: "9px", flexWrap: "wrap", marginTop: "12px" }}>{act(b.actions)}</div>
            </div>
          </div>
        </div>
      );
    case "loading":
      return (
        <div style={{ marginBottom: "14px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "9px", marginBottom: "12px" }}>
            <span className="rs-spin" style={{ width: "15px", height: "15px", borderRadius: "50%", border: "2px solid var(--border-strong)", borderTopColor: "var(--navy-800)", display: "inline-block" }}></span>
            <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-body)" }}>{b.label}</span>
          </div>
          {b.sub && <p style={{ margin: "0 0 12px", fontSize: "12px", color: "var(--text-muted)", lineHeight: 1.5 }}>{b.sub}</p>}
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>{Array.from({ length: b.rows || 3 }).map((_, i) => <Skeleton key={i} h={b.rowH} />)}</div>
        </div>
      );
    case "error":
      return (
        <div style={{ background: "#FBEDE9", border: "1px solid #A33A2A", borderRadius: "var(--radius-lg)", padding: "16px 17px", marginBottom: "14px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "7px" }}>
            <PI name="x" size={16} color="#8A2F21" />
            <span style={{ fontSize: "14px", fontWeight: 700, color: "#8A2F21", letterSpacing: "-0.01em" }}>{b.title}</span>
          </div>
          <p style={{ margin: "0 0 13px", fontSize: "12.5px", lineHeight: 1.55, color: "var(--text-body)", textWrap: "pretty" }}>{b.body}</p>
          <div style={{ display: "flex", gap: "9px", flexWrap: "wrap" }}>{act(b.actions)}</div>
        </div>
      );
    case "draft":
      return (
        <div style={{ marginBottom: "14px" }}>
          {b.feedback && <window.RSCallout tone={b.feedback.tone} title={b.feedback.title} body={b.feedback.body} icon={b.feedback.icon} actions={act(b.feedback.actions)} />}
          <window.RSSection icon="map-pin">Nearby suggestions</window.RSSection>
          {b.note && <p style={{ margin: "-4px 0 11px", fontSize: "12px", color: "var(--text-muted)", lineHeight: 1.5, textWrap: "pretty" }}>{b.note}</p>}
          <div style={{ display: "flex", flexDirection: "column", gap: "9px" }}>
            {(b.suggestions || []).map((s) => <SuggestionRow key={s.name} s={s} onGo={onGo} />)}
          </div>
          {b.more && <div style={{ marginTop: "11px" }}>{act([b.more])}</div>}
        </div>
      );
    case "schools":
      return (
        <div style={{ background: "var(--plum-tint)", border: "1px solid var(--plum-100)", borderRadius: "var(--radius-lg)", padding: "15px 16px", marginBottom: "14px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "9px" }}>
            <PI name="building" size={16} color="var(--plum-600)" />
            <span style={{ fontSize: "13.5px", fontWeight: 700, color: "var(--plum-600)", letterSpacing: "-0.01em" }}>Schools in selected areas</span>
            <span style={{ marginLeft: "auto", fontFamily: "var(--font-mono)", fontSize: "15px", fontWeight: 700, color: "var(--plum-600)" }}>{b.count}</span>
          </div>
          <p style={{ margin: "8px 0 0", fontSize: "12px", lineHeight: 1.55, color: "var(--text-body)", textWrap: "pretty" }}>{b.note}</p>
          {b.items && (
            <div style={{ marginTop: "12px", display: "flex", flexDirection: "column", gap: "8px" }}>
              {b.items.map((g) => (
                <div key={g.area} style={{ background: "var(--surface-card)", borderRadius: "var(--radius-md)", padding: "11px 12px", border: "1px solid var(--border)" }}>
                  <div style={{ fontSize: "12.5px", fontWeight: 700, color: "var(--text-strong)", marginBottom: "6px" }}>{g.area} <span style={{ fontFamily: "var(--font-mono)", fontWeight: 600, color: "var(--text-muted)" }}>· {g.list.length}</span></div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                    {g.list.map((s) => <span key={s} style={{ fontSize: "12px", color: "var(--text-body)" }}>{s}</span>)}
                  </div>
                </div>
              ))}
            </div>
          )}
          {b.boundary && (
            <div style={{ marginTop: "12px", padding: "11px 12px", borderRadius: "var(--radius-md)", background: "rgba(255,255,255,0.7)", border: "1px dashed var(--plum-100)" }}>
              <div style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "var(--tracking-caps)", textTransform: "uppercase", color: "var(--plum-600)", marginBottom: "6px" }}>What this does not mean</div>
              <ul style={{ margin: 0, paddingLeft: "17px", display: "flex", flexDirection: "column", gap: "4px" }}>
                {b.boundary.map((x) => <li key={x} style={{ fontSize: "12px", lineHeight: 1.5, color: "var(--text-body)" }}>{x}</li>)}
              </ul>
            </div>
          )}
          {b.actions && <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginTop: "12px" }}>{act(b.actions)}</div>}
        </div>
      );
    case "alts":
      return (
        <div style={{ marginBottom: "14px" }}>
          <window.RSSection icon="map-pin">{b.title || "Nearby areas that do have matches"}</window.RSSection>
          {b.note && <p style={{ margin: "-4px 0 11px", fontSize: "12px", color: "var(--text-muted)", lineHeight: 1.5, textWrap: "pretty" }}>{b.note}</p>}
          <div style={{ display: "flex", flexDirection: "column", gap: "9px" }}>
            {b.items.map((it) => (
              <div key={it.name} style={{ background: "var(--surface-card)", border: it.preview ? "1.5px solid var(--copper-500)" : "1px solid var(--border)", borderRadius: "var(--radius-lg)", padding: "13px 14px", boxShadow: it.preview ? "var(--shadow-md)" : "var(--shadow-xs)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                      <span style={{ fontSize: "14px", fontWeight: 700, color: "var(--text-strong)" }}>{it.name}</span>
                      {it.rel && <span style={{ fontSize: "11px", fontWeight: 600, color: "var(--text-muted)" }}>{it.rel}</span>}
                    </div>
                    <div style={{ marginTop: "4px", fontFamily: "var(--font-mono)", fontSize: "11.5px", color: "var(--text-body)" }}>{it.countLabel || `${it.count} listings with your current filters${it.schools != null ? ` · ${it.schools} schools` : ""}`}</div>
                  </div>
                  <span style={{ display: "flex", gap: "7px", flex: "none" }}>{act(it.actions)}</span>
                </div>
                {it.preview && (
                  <div style={{ marginTop: "12px", paddingTop: "12px", borderTop: "1px dashed var(--border-strong)" }}>
                    <div style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "var(--tracking-caps)", textTransform: "uppercase", color: "var(--copper-600)", marginBottom: "9px" }}>Preview — not added yet</div>
                    <ListingGrid ids={[it.id]} n={2} compact={compact} />
                    <div style={{ display: "flex", gap: "9px", flexWrap: "wrap", marginTop: "12px" }}>{act(it.previewActions)}</div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      );
    case "relax":
      return (
        <div style={{ marginBottom: "14px" }}>
          <window.RSSection icon="sliders-horizontal">{b.title || "Or change one filter"}</window.RSSection>
          <p style={{ margin: "-4px 0 11px", fontSize: "12px", color: "var(--text-muted)", lineHeight: 1.5, textWrap: "pretty" }}>{b.note || "Nothing changes until you pick one. Your areas stay exactly as they are."}</p>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {b.items.map((it) => (
              <button key={it.label} onClick={() => onGo(it.to)} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", width: "100%", textAlign: "left", padding: "12px 14px", borderRadius: "var(--radius-lg)", border: "1px solid var(--border)", background: "var(--surface-card)", cursor: "pointer", fontFamily: "var(--font-sans)", boxShadow: "var(--shadow-xs)" }}>
                <span style={{ fontSize: "13.5px", fontWeight: 600, color: "var(--text-strong)" }}>{it.label}</span>
                <span style={{ display: "inline-flex", alignItems: "center", gap: "8px", flex: "none" }}>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: "13.5px", fontWeight: 700, color: "var(--copper-600)" }}>{it.count} listings</span>
                  <PI name="arrow-right" size={15} color="var(--grey-400)" />
                </span>
              </button>
            ))}
          </div>
        </div>
      );
    case "listings":
      return (
        <div style={{ marginBottom: "14px" }}>
          {b.label && <window.RSSection right={b.right}>{b.label}</window.RSSection>}
          <ListingGrid ids={b.ids} n={b.n || (compact ? 2 : 4)} compact={compact} dimmed={b.dimmed} />
          {b.footer && <p style={{ margin: "12px 0 0", fontSize: "12px", color: "var(--text-muted)", textAlign: "center" }}>{b.footer}</p>}
        </div>
      );
    case "alertform": return <AlertForm b={b} onGo={onGo} />;
    case "alertlist": return <AlertList b={b} onGo={onGo} />;
    case "actions": return <div style={{ display: "flex", gap: "9px", flexWrap: "wrap", marginBottom: "14px" }}>{act(b.items)}</div>;
    case "divider": return <div style={{ height: "1px", background: "var(--border)", margin: "6px 0 16px" }}></div>;
    default: return null;
  }
}

function ScopePanel({ blocks, compact, onGo }) {
  return (
    <div>
      {(blocks || []).map((b, i) => <Block key={i} b={b} compact={compact} onGo={onGo} />)}
    </div>
  );
}

window.RSPanel = ScopePanel;
