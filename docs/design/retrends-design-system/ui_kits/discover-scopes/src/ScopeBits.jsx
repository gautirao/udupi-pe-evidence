// Discover — Result Scopes · shared primitives.
// Result-scope chips deliberately do NOT look like breadcrumb crumbs: they are
// square-cornered, bordered, removable containers with a scope glyph; the
// breadcrumb is plain text separated by chevrons with no container at all.
const { Icon: BIcon } = window.ReTrendsDesignSystem_f37966;

const SCOPE_META = {
  areas: { label: "Selected areas", glyph: "pin", tint: "var(--navy-100)", fg: "var(--navy-800)", edge: "var(--navy-700)" },
  polygon: { label: "Drawn area", glyph: "poly", tint: "var(--accent-tint)", fg: "var(--copper-600)", edge: "var(--copper-500)" },
  viewport: { label: "Visible map area", glyph: "frame", tint: "var(--surface-subtle)", fg: "var(--text-strong)", edge: "var(--border-strong)" },
};

function ScopeGlyph({ kind, size, color }) {
  const s = size || 13, c = color || "currentColor";
  if (kind === "poly") return (<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 8 12 3l8 4-2 11-11 2z" strokeDasharray="4 3" /><circle cx="4" cy="8" r="1.6" fill={c} /><circle cx="20" cy="7" r="1.6" fill={c} /></svg>);
  if (kind === "frame") return (<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 8V5a2 2 0 0 1 2-2h3" /><path d="M16 3h3a2 2 0 0 1 2 2v3" /><path d="M21 16v3a2 2 0 0 1-2 2h-3" /><path d="M8 21H5a2 2 0 0 1-2-2v-3" /></svg>);
  return (<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" /><circle cx="12" cy="10" r="3" /></svg>);
}

// A single result-scope chip. `draft` = pending edit, not yet committed.
function ScopeChip({ kind, label, onRemove, draft, focused, tone }) {
  const meta = SCOPE_META[kind] || SCOPE_META.areas;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: "7px", padding: "6px 7px 6px 10px",
      borderRadius: "var(--radius-sm)", background: focused ? meta.fg : (tone === "muted" ? "var(--surface-subtle)" : meta.tint),
      border: `1.5px ${draft ? "dashed" : "solid"} ${focused ? meta.fg : meta.edge}`,
      color: focused ? "#fff" : meta.fg, fontFamily: "var(--font-sans)", fontSize: "12.5px", fontWeight: 700, whiteSpace: "nowrap",
    }}>
      <ScopeGlyph kind={meta.glyph} size={13} color={focused ? "#fff" : meta.fg} />
      {label}
      {onRemove && (
        <button onClick={onRemove} aria-label={`Remove ${label}`} style={{
          display: "inline-flex", alignItems: "center", justifyContent: "center", width: "18px", height: "18px",
          border: "none", borderRadius: "var(--radius-sm)", background: focused ? "rgba(255,255,255,0.2)" : "rgba(27,42,69,0.08)",
          color: "inherit", cursor: "pointer", padding: 0,
        }}><BIcon name="x" size={12} /></button>
      )}
    </span>
  );
}

// The result-scope bar — "what the listings below are for", above everything else.
function ScopeBar({ kind, chips, note, draft, actions, onRemove, focusedId }) {
  const meta = SCOPE_META[kind] || SCOPE_META.areas;
  return (
    <div style={{ border: `1px solid var(--border)`, borderLeft: `3px solid ${meta.edge}`, background: "var(--surface-card)", borderRadius: "var(--radius-lg)", padding: "12px 14px", marginBottom: "14px", boxShadow: "var(--shadow-xs)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "9px" }}>
        <ScopeGlyph kind={meta.glyph} size={14} color={meta.fg} />
        <span style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "var(--tracking-caps)", textTransform: "uppercase", color: "var(--text-muted)" }}>
          {draft ? "Result scope — draft" : "Result scope"}
        </span>
        <span style={{ marginLeft: "auto", fontSize: "11.5px", fontWeight: 700, color: meta.fg }}>{meta.label}</span>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "7px" }}>
        {(chips || []).map((c) => (
          <ScopeChip key={c.id || c.label} kind={kind} label={c.label} draft={draft} focused={focusedId === c.id}
            onRemove={c.removable === false ? null : (onRemove ? () => onRemove(c.id) : () => { })} />
        ))}
      </div>
      {note && <p style={{ margin: "10px 0 0", fontSize: "12px", lineHeight: 1.5, color: "var(--text-muted)", textWrap: "pretty" }}>{note}</p>}
      {actions && <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginTop: "11px" }}>{actions}</div>}
    </div>
  );
}

function Btn({ children, variant, size, onClick, disabled, full, icon }) {
  const v = variant || "outline";
  const base = {
    display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "7px",
    padding: size === "sm" ? "6px 11px" : "9px 15px", borderRadius: "var(--radius-md)",
    fontFamily: "var(--font-sans)", fontSize: size === "sm" ? "12.5px" : "13.5px", fontWeight: 600,
    cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.5 : 1, whiteSpace: "nowrap",
    width: full ? "100%" : "auto", transition: "background var(--dur-fast) var(--ease-standard)",
  };
  const skins = {
    primary: { background: "var(--accent)", color: "#fff", border: "1px solid var(--accent)" },
    navy: { background: "var(--navy-800)", color: "#fff", border: "1px solid var(--navy-800)" },
    outline: { background: "var(--surface-card)", color: "var(--text-strong)", border: "1px solid var(--border-strong)" },
    ghost: { background: "transparent", color: "var(--text-muted)", border: "1px solid transparent" },
    danger: { background: "var(--surface-card)", color: "var(--brick-600, #A33A2A)", border: "1px solid var(--brick-600, #A33A2A)" },
  };
  return <button onClick={disabled ? undefined : onClick} disabled={disabled} style={{ ...base, ...(skins[v] || skins.outline) }}>{icon && <BIcon name={icon} size={15} />}{children}</button>;
}

const TONE = {
  info: { bg: "var(--navy-100)", edge: "var(--navy-700)", fg: "var(--navy-800)", icon: "map-pin" },
  warn: { bg: "var(--ochre-50, #FBF3E2)", edge: "var(--ochre-600, #A8791F)", fg: "var(--ochre-700, #7A5714)", icon: "sliders-horizontal" },
  error: { bg: "#FBEDE9", edge: "#A33A2A", fg: "#8A2F21", icon: "x" },
  ok: { bg: "var(--trust-verified-bg)", edge: "var(--evergreen-600)", fg: "var(--trust-verified-fg)", icon: "check" },
  accent: { bg: "var(--accent-tint)", edge: "var(--copper-500)", fg: "var(--copper-600)", icon: "search" },
};

function Callout({ tone, title, body, actions, icon, children }) {
  const t = TONE[tone] || TONE.info;
  return (
    <div style={{ background: t.bg, border: `1px solid ${t.edge}`, borderRadius: "var(--radius-lg)", padding: "14px 16px", marginBottom: "14px" }}>
      <div style={{ display: "flex", gap: "11px", alignItems: "flex-start" }}>
        <span style={{ flex: "none", width: "26px", height: "26px", borderRadius: "var(--radius-full)", background: "rgba(255,255,255,0.7)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <BIcon name={icon || t.icon} size={15} color={t.fg} />
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          {title && <div style={{ fontSize: "13.5px", fontWeight: 700, color: t.fg, letterSpacing: "-0.01em" }}>{title}</div>}
          {body && <p style={{ margin: title ? "5px 0 0" : 0, fontSize: "12.5px", lineHeight: 1.55, color: "var(--text-body)", textWrap: "pretty" }}>{body}</p>}
          {children}
          {actions && <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginTop: "12px" }}>{actions}</div>}
        </div>
      </div>
    </div>
  );
}

function Section({ children, right, icon }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", marginBottom: "11px", marginTop: "4px" }}>
      <span style={{ display: "inline-flex", alignItems: "center", gap: "7px", fontSize: "11.5px", fontWeight: 700, letterSpacing: "var(--tracking-caps)", textTransform: "uppercase", color: "var(--text-muted)" }}>
        {icon && <BIcon name={icon} size={14} color="var(--grey-500)" />}{children}
      </span>
      {right}
    </div>
  );
}

// "Why did the visible rows change?" — the panel must always say so (#2015).
function WhyNote({ children }) {
  return (
    <p style={{ margin: "0 0 12px", display: "flex", gap: "7px", alignItems: "flex-start", fontSize: "12px", lineHeight: 1.5, color: "var(--text-muted)", textWrap: "pretty" }}>
      <span style={{ flex: "none", marginTop: "2px" }}><BIcon name="chevron-right" size={12} color="var(--copper-500)" /></span>{children}
    </p>
  );
}

// ---------------- Map overlays ----------------
function OverlayPill({ children, tone, onClick, sub }) {
  const solid = tone === "primary" || tone === "navy";
  return (
    <button onClick={onClick} style={{
      display: "inline-flex", flexDirection: "column", alignItems: "center", gap: "1px",
      padding: sub ? "7px 14px 6px" : "8px 14px", borderRadius: "var(--radius-md)",
      background: tone === "primary" ? "var(--accent)" : tone === "navy" ? "var(--navy-800)" : "rgba(255,255,255,0.96)",
      color: solid ? "#fff" : "var(--text-strong)",
      border: solid ? "1px solid rgba(255,255,255,0.35)" : "1px solid var(--border-strong)",
      boxShadow: "var(--shadow-lg)", cursor: "pointer", fontFamily: "var(--font-sans)", fontSize: "12.5px", fontWeight: 700, whiteSpace: "nowrap",
    }}>
      <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>{children}</span>
      {sub && <span style={{ fontSize: "10px", fontWeight: 600, opacity: solid ? 0.82 : 0.7 }}>{sub}</span>}
    </button>
  );
}

function MapOverlays({ cfg, compact, onAction }) {
  const o = cfg.overlay || {};
  const pad = compact ? 10 : 14;
  const act = (a) => () => onAction && onAction(a);
  return (
    <>
      {o.scopeBadge && (
        <div style={{ position: "absolute", top: pad, left: pad, zIndex: 500, display: "flex", flexDirection: "column", gap: "6px", alignItems: "flex-start", maxWidth: compact ? "70%" : "58%" }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: "7px", padding: "6px 11px", borderRadius: "var(--radius-sm)", background: "rgba(255,255,255,0.96)", border: `1.5px solid ${(SCOPE_META[o.scopeBadge.kind] || SCOPE_META.areas).edge}`, boxShadow: "var(--shadow-md)", fontFamily: "var(--font-sans)", fontSize: "11.5px", fontWeight: 700, color: "var(--text-strong)" }}>
            <ScopeGlyph kind={(SCOPE_META[o.scopeBadge.kind] || SCOPE_META.areas).glyph} size={13} color={(SCOPE_META[o.scopeBadge.kind] || SCOPE_META.areas).fg} />
            {o.scopeBadge.label}
          </span>
          {o.crumb && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: "5px", padding: "4px 10px", borderRadius: "var(--radius-full)", background: "rgba(255,255,255,0.9)", boxShadow: "var(--shadow-sm)", fontFamily: "var(--font-sans)", fontSize: "10.5px", fontWeight: 600, color: "var(--text-muted)" }}>{o.crumb}</span>
          )}
        </div>
      )}
      {o.searchThisArea && (
        <div style={{ position: "absolute", top: pad, left: "50%", transform: "translateX(-50%)", zIndex: 520 }}>
          <OverlayPill tone="primary" onClick={act(o.searchThisArea)} sub={o.searchThisArea.sub}>
            <BIcon name="search" size={14} color="#fff" />Search this area
          </OverlayPill>
        </div>
      )}
      {o.buttons && o.buttons.length > 0 && (
        <div style={{ position: "absolute", top: pad, right: pad, zIndex: 500, display: "flex", flexDirection: "column", gap: "7px", alignItems: "flex-end" }}>
          {o.buttons.map((b) => <OverlayPill key={b.label} tone={b.tone} onClick={act(b)}>{b.icon && <BIcon name={b.icon} size={14} color={b.tone === "primary" || b.tone === "navy" ? "#fff" : "var(--navy-800)"} />}{b.label}</OverlayPill>)}
        </div>
      )}
      {o.returnTo && (
        <div style={{ position: "absolute", bottom: compact ? 54 : 18, left: "50%", transform: "translateX(-50%)", zIndex: 520, maxWidth: "92%" }}>
          <OverlayPill tone="navy" onClick={act(o.returnTo)}>
            <BIcon name="arrow-right" size={14} color="#fff" style={{ transform: "rotate(180deg)" }} />{o.returnTo.label}
          </OverlayPill>
        </div>
      )}
      {o.inView && (
        <div style={{ position: "absolute", bottom: compact ? 12 : 16, left: pad, zIndex: 500, display: "flex", flexDirection: "column", gap: "6px", alignItems: "flex-start" }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "5px 10px", borderRadius: "var(--radius-full)", background: "rgba(255,255,255,0.94)", boxShadow: "var(--shadow-sm)", border: "1px solid var(--border)", fontFamily: "var(--font-mono)", fontSize: "11px", fontWeight: 600, color: "var(--text-body)" }}>{o.inView}</span>
          {o.showAll && <OverlayPill onClick={act(o.showAll)}>{o.showAll.label}</OverlayPill>}
        </div>
      )}
      {cfg.viewportFrame && (
        <div style={{ position: "absolute", inset: compact ? "16px" : "24px", zIndex: 450, pointerEvents: "none", border: "2.5px dashed var(--navy-800)", borderRadius: "var(--radius-md)", background: "rgba(27,42,69,0.04)" }}>
          <span style={{ position: "absolute", top: "-11px", left: "12px", padding: "2px 9px", borderRadius: "var(--radius-sm)", background: "var(--navy-800)", color: "#fff", fontFamily: "var(--font-sans)", fontSize: "10px", fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase" }}>Visible map area</span>
        </div>
      )}
      {o.legend && (
        <div style={{ position: "absolute", bottom: compact ? 12 : 16, left: pad, zIndex: 500, display: "flex", flexDirection: "column", gap: "5px", padding: "9px 11px", borderRadius: "var(--radius-md)", background: "rgba(255,255,255,0.94)", border: "1px solid var(--border)", boxShadow: "var(--shadow-sm)", fontFamily: "var(--font-sans)", fontSize: "10.5px", color: "var(--text-body)" }}>
          {[["Explore ›", "Hierarchy destination — changes the breadcrumb"], ["Tap to zoom", "Visual cluster — map focus only"], ["Tap to view homes", "Canonical area — joins the result scope"]].map(([a, b]) => (
            <div key={a} style={{ display: "flex", gap: "7px", alignItems: "center" }}>
              <span style={{ fontWeight: 700, color: "var(--navy-800)", minWidth: "92px" }}>{a}</span><span style={{ color: "var(--text-muted)" }}>{b}</span>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

Object.assign(window, { RSScopeChip: ScopeChip, RSScopeBar: ScopeBar, RSBtn: Btn, RSCallout: Callout, RSSection: Section, RSWhy: WhyNote, RSMapOverlays: MapOverlays, RSScopeGlyph: ScopeGlyph, RS_SCOPE_META: SCOPE_META });
