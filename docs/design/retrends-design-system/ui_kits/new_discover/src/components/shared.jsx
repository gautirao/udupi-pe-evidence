// Unified Discover Portal — shared UI primitives (one copy, used everywhere).
// Exports (window): DPBuyRent, DPBackLink, DPCrumb, DPSection, DPHeaderBand,
//   DPGhostBtn, DPScopedSearch, DPFilterBar, DPAgriFilters, DPRadius, DPEmpty,
//   DP_DEFAULT_FILTERS, DP_applyFilters, DP_AGRI_DEFAULTS, DP_applyAgri
const { Icon: SIcon, Button: SButton, Input: SInput } = window.ReTrendsDesignSystem_f37966;

function BuyRent({ value, onChange }) {
  return (
    <div style={{ display: "inline-flex", background: "var(--input-bg)", borderRadius: "var(--radius-full)", padding: "3px", border: "1px solid var(--border)" }}>
      {["Buy", "Rent"].map((opt) => {
        const on = value === opt;
        return (
          <button key={opt} onClick={() => onChange(opt)} style={{
            border: "none", cursor: "pointer", padding: "6px 18px", borderRadius: "var(--radius-full)",
            fontFamily: "var(--font-sans)", fontSize: "13px", fontWeight: 600,
            background: on ? "var(--paper)" : "transparent", color: on ? "var(--text-strong)" : "var(--text-muted)",
            boxShadow: on ? "var(--shadow-sm)" : "none", transition: "box-shadow var(--dur-fast) var(--ease-standard)",
          }}>{opt}</button>
        );
      })}
    </div>
  );
}

function BackLink({ children, onClick }) {
  const [h, setH] = React.useState(false);
  return (
    <button onClick={onClick} onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)} style={{
      display: "inline-flex", alignItems: "center", gap: "6px", border: "none", background: "transparent",
      color: h ? "var(--text-strong)" : "var(--text-muted)", cursor: "pointer",
      fontFamily: "var(--font-sans)", fontSize: "13px", fontWeight: 600, padding: 0, marginBottom: "16px",
      transition: "color var(--dur-fast) var(--ease-standard)",
    }}>
      <SIcon name="arrow-right" size={14} style={{ transform: "rotate(180deg)" }} />{children}
    </button>
  );
}

// Crumb (light, on-canvas) — clickable segments. items = [{label, onClick?}]
function Crumb({ items }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap", marginBottom: "14px" }}>
      {items.map((b, i) => {
        const last = i === items.length - 1;
        const clickable = b.onClick && !last;
        return (
          <React.Fragment key={i}>
            {i > 0 && <SIcon name="chevron-right" size={13} color="var(--grey-400)" />}
            <button disabled={!clickable} onClick={b.onClick} style={{
              border: "none", background: "transparent", padding: 0, cursor: clickable ? "pointer" : "default",
              fontFamily: "var(--font-sans)", fontSize: "12.5px", fontWeight: 600,
              color: last ? (b.accent ? "var(--copper-600)" : "var(--text-strong)") : "var(--text-muted)",
            }}>{b.label}</button>
          </React.Fragment>
        );
      })}
    </div>
  );
}

function Section({ icon, children, right, tight }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: tight ? "10px" : "14px", gap: "12px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        {icon && <SIcon name={icon} size={16} color="var(--text-muted)" />}
        <span style={{ fontSize: "12px", fontWeight: 700, letterSpacing: "var(--tracking-caps)", textTransform: "uppercase", color: "var(--text-muted)" }}>{children}</span>
      </div>
      {right}
    </div>
  );
}

function GhostBtn({ children, onClick }) {
  const [h, setH] = React.useState(false);
  return (
    <button onClick={onClick} onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)} style={{
      display: "inline-flex", alignItems: "center", gap: "6px", padding: "7px 13px", borderRadius: "var(--radius-md)",
      border: "1px solid rgba(255,255,255,0.28)", background: h ? "rgba(255,255,255,0.12)" : "transparent",
      color: "#fff", cursor: "pointer", fontFamily: "var(--font-sans)", fontSize: "12.5px", fontWeight: 600,
      transition: "background var(--dur-fast) var(--ease-standard)", whiteSpace: "nowrap",
    }}>{children}</button>
  );
}

// Navy header band. accent: "copper" | "plum" | "agri" tints the icon chip.
function HeaderBand({ eyebrow, title, sub, crumb, stats, onBack, backLabel, actions, icon, accent }) {
  const chip = accent === "plum" ? "var(--plum-500)" : accent === "agri" ? "var(--evergreen-600)" : "var(--accent)";
  return (
    <div style={{ background: "var(--surface-navy)", color: "var(--text-on-navy)", borderRadius: "var(--radius-xl)", padding: "20px 22px", marginBottom: "20px", boxShadow: "var(--shadow-md)" }}>
      {onBack && (
        <button onClick={onBack} style={{
          display: "inline-flex", alignItems: "center", gap: "6px", border: "none", background: "transparent",
          color: "rgba(255,255,255,0.75)", cursor: "pointer", fontFamily: "var(--font-sans)", fontSize: "13px", fontWeight: 600, padding: 0, marginBottom: "14px",
        }}>
          <SIcon name="arrow-right" size={14} style={{ transform: "rotate(180deg)" }} />{backLabel}
        </button>
      )}
      {crumb && (
        <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", color: "rgba(255,255,255,0.55)", marginBottom: "10px", flexWrap: "wrap" }}>
          {crumb.map((b, i) => (
            <React.Fragment key={i}>
              {i > 0 && <SIcon name="chevron-right" size={12} color="rgba(255,255,255,0.4)" />}
              <span style={{ fontWeight: 600, color: i === crumb.length - 1 ? "rgba(255,255,255,0.92)" : "rgba(255,255,255,0.55)" }}>{b}</span>
            </React.Fragment>
          ))}
        </div>
      )}
      <div style={{ display: "flex", alignItems: "flex-start", gap: "14px" }}>
        <div style={{ flex: "none", width: "46px", height: "46px", borderRadius: "var(--radius-md)", background: chip, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <SIcon name={icon || "map-pin"} size={22} color="#fff" />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "var(--tracking-caps)", textTransform: "uppercase", color: "rgba(255,255,255,0.6)", marginBottom: "4px" }}>{eyebrow}</div>
          <h2 style={{ margin: 0, fontFamily: "var(--font-serif)", fontSize: "22px", fontWeight: 600, letterSpacing: "-0.01em", lineHeight: 1.2 }}>{title}</h2>
          {sub && <div style={{ marginTop: "7px", fontSize: "13px", color: "rgba(255,255,255,0.7)", textWrap: "pretty", lineHeight: 1.5 }}>{sub}</div>}
        </div>
      </div>
      {(stats && stats.length || actions) && (
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: "16px", marginTop: "18px", paddingTop: "16px", borderTop: "1px solid rgba(255,255,255,0.14)" }}>
          <div style={{ display: "flex", gap: "26px" }}>
            {(stats || []).map((s) => (
              <div key={s.label}>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: "22px", fontWeight: 600 }}>{typeof s.value === "number" ? s.value.toLocaleString("en-IN") : s.value}</div>
                <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.6)" }}>{s.label}</div>
              </div>
            ))}
          </div>
          {actions && <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", justifyContent: "flex-end" }}>{actions}</div>}
        </div>
      )}
    </div>
  );
}

// ---- Scoped search box: placeholder follows scope; Area/School toggle follows intent ----
function ScopedSearch({ scopeLabel, searchMode, onModeChange, results, onPick }) {
  const [q, setQ] = React.useState("");
  const list = q.trim() ? results(q.trim(), searchMode) : [];
  return (
    <div style={{ marginBottom: "22px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "10px", flexWrap: "wrap" }}>
        <div style={{ display: "inline-flex", background: "var(--input-bg)", borderRadius: "var(--radius-full)", padding: "3px", border: "1px solid var(--border)" }}>
          {[["area", "Area"], ["school", "School"]].map(([k, label]) => {
            const on = searchMode === k;
            const tint = k === "school" ? "var(--plum-600)" : "var(--navy-800)";
            return (
              <button key={k} onClick={() => { onModeChange(k); setQ(""); }} style={{
                border: "none", cursor: "pointer", padding: "5px 14px", borderRadius: "var(--radius-full)",
                fontFamily: "var(--font-sans)", fontSize: "12.5px", fontWeight: 600,
                background: on ? tint : "transparent", color: on ? "#fff" : "var(--text-muted)",
                boxShadow: on ? "var(--shadow-sm)" : "none", transition: "background var(--dur-fast) var(--ease-standard)",
              }}>{label}</button>
            );
          })}
        </div>
      </div>
      <SInput placeholder={`Search ${scopeLabel}`} value={q} onChange={(e) => setQ(e.target.value)} leadingIcon={<SIcon name="search" size={16} />} />
      {q.trim() && (
        <div style={{ marginTop: "8px", background: "var(--surface-card)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", boxShadow: "var(--shadow-md)", overflow: "hidden" }}>
          {list.length === 0 ? (
            <div style={{ padding: "14px 16px", fontSize: "13px", color: "var(--text-muted)" }}>No {searchMode} matches “{q}” in {scopeLabel.replace(/^Search /, "")}.</div>
          ) : list.map((r, i) => (
            <button key={r.id} onClick={() => onPick(r)} style={{
              display: "flex", alignItems: "center", gap: "12px", width: "100%", textAlign: "left",
              padding: "12px 16px", border: "none", borderTop: i ? "1px solid var(--border)" : "none",
              background: "transparent", cursor: "pointer", fontFamily: "var(--font-sans)",
            }}
              onMouseEnter={(e) => e.currentTarget.style.background = "var(--surface-subtle)"}
              onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}>
              <div style={{ flex: "none", width: "34px", height: "34px", borderRadius: "var(--radius-md)", background: searchMode === "school" ? "var(--plum-tint)" : "var(--accent-tint)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <SIcon name={searchMode === "school" ? "building" : "map-pin"} size={17} color={searchMode === "school" ? "var(--plum-600)" : "var(--copper-600)"} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: "14px", fontWeight: 700, color: "var(--text-strong)" }}>{r.title}</div>
                <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>{r.sub}</div>
              </div>
              <span style={{ flex: "none", display: "inline-flex", alignItems: "center", gap: "5px", fontSize: "12.5px", fontWeight: 600, color: "var(--primary)", whiteSpace: "nowrap" }}>
                {r.cta} <SIcon name="arrow-right" size={14} />
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ---- Residential listing filters ----
const BUDGETS = [
  { k: "any", label: "Any budget", test: () => true },
  { k: "u1", label: "< ₹1 Cr", test: (p) => p < 10000000 },
  { k: "1-2", label: "₹1–2 Cr", test: (p) => p >= 10000000 && p < 20000000 },
  { k: "2-4", label: "₹2–4 Cr", test: (p) => p >= 20000000 && p < 40000000 },
  { k: "4p", label: "₹4 Cr+", test: (p) => p >= 40000000 },
];
const PTYPES = ["Any type", "Apartment", "Villa", "Independent House", "Penthouse"];
const BEDS = [{ k: 0, label: "Any BHK" }, { k: 1, label: "1+" }, { k: 2, label: "2+" }, { k: 3, label: "3+" }, { k: 4, label: "4+" }];
const DP_DEFAULT_FILTERS = { budget: "any", ptype: "Any type", beds: 0, verified: false };

function Segmented({ options, value, onChange }) {
  return (
    <div style={{ display: "inline-flex", flexWrap: "wrap", gap: "6px" }}>
      {options.map((o) => {
        const on = value === o.k;
        return (
          <button key={o.k} onClick={() => onChange(o.k)} style={{
            border: on ? "1px solid var(--navy-800)" : "1px solid var(--border)",
            background: on ? "var(--navy-800)" : "var(--surface-card)", color: on ? "#fff" : "var(--text-body)",
            cursor: "pointer", padding: "6px 13px", borderRadius: "var(--radius-full)",
            fontFamily: "var(--font-sans)", fontSize: "12.5px", fontWeight: 600, whiteSpace: "nowrap",
          }}>{o.label}</button>
        );
      })}
    </div>
  );
}

function FilterBar({ f, setF, onClear }) {
  const active = f.budget !== "any" || f.ptype !== "Any type" || f.beds !== 0 || f.verified;
  return (
    <div style={{ background: "var(--surface-subtle)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", padding: "16px 18px", marginBottom: "18px", display: "flex", flexDirection: "column", gap: "14px" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        <span style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "var(--tracking-caps)", textTransform: "uppercase", color: "var(--text-muted)" }}>Budget</span>
        <Segmented options={BUDGETS} value={f.budget} onChange={(k) => setF({ ...f, budget: k })} />
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        <span style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "var(--tracking-caps)", textTransform: "uppercase", color: "var(--text-muted)" }}>Property type</span>
        <Segmented options={PTYPES.map((p) => ({ k: p, label: p }))} value={f.ptype} onChange={(k) => setF({ ...f, ptype: k })} />
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "20px", alignItems: "flex-end" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          <span style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "var(--tracking-caps)", textTransform: "uppercase", color: "var(--text-muted)" }}>Bedrooms</span>
          <Segmented options={BEDS} value={f.beds} onChange={(k) => setF({ ...f, beds: k })} />
        </div>
        <button onClick={() => setF({ ...f, verified: !f.verified })} style={{
          display: "inline-flex", alignItems: "center", gap: "8px", padding: "7px 13px", borderRadius: "var(--radius-full)",
          border: f.verified ? "1px solid var(--evergreen-600)" : "1px solid var(--border)",
          background: f.verified ? "var(--trust-verified-bg)" : "var(--surface-card)",
          color: f.verified ? "var(--trust-verified-fg)" : "var(--text-body)", cursor: "pointer",
          fontFamily: "var(--font-sans)", fontSize: "12.5px", fontWeight: 600,
        }}>
          <SIcon name="shield-check" size={15} color={f.verified ? "var(--trust-verified-fg)" : "var(--grey-400)"} />Verified only
        </button>
      </div>
      {active && (
        <button onClick={onClear} style={{ alignSelf: "flex-start", display: "inline-flex", alignItems: "center", gap: "6px", border: "none", background: "transparent", color: "var(--text-muted)", cursor: "pointer", fontFamily: "var(--font-sans)", fontSize: "12.5px", fontWeight: 600, padding: 0 }}>Clear filters <SIcon name="x" size={14} /></button>
      )}
    </div>
  );
}
function DP_applyFilters(list, f) {
  return list.filter((l) => {
    if (!BUDGETS.find((b) => b.k === f.budget).test(l.price)) return false;
    if (f.ptype !== "Any type" && l.propType !== f.ptype) return false;
    if (f.beds && l.beds < f.beds) return false;
    if (f.verified && l.trustTier !== "verified") return false;
    return true;
  });
}

// ---- Agri filters (separate model: corridor · distance · size · road · water · soil) ----
const AGRI_SIZES = [{ k: "any", label: "Any size" }, { k: "u1", label: "< 1 ac" }, { k: "1-3", label: "1–3 ac" }, { k: "3-5", label: "3–5 ac" }, { k: "5p", label: "5 ac+" }];
const AGRI_PRICES = [{ k: "any", label: "Any price" }, { k: "u1", label: "< ₹1 Cr" }, { k: "1-2", label: "₹1–2 Cr" }, { k: "2p", label: "₹2 Cr+" }];
const AGRI_SOILS = ["Any soil", "Red loam", "Red gravel", "Alluvial"];
const DP_AGRI_DEFAULTS = { size: "any", price: "any", road: false, water: false, soil: "Any soil" };

function sizeTest(k, ac) {
  if (k === "u1") return ac < 1; if (k === "1-3") return ac >= 1 && ac < 3;
  if (k === "3-5") return ac >= 3 && ac < 5; if (k === "5p") return ac >= 5; return true;
}
function priceTest(k, p) {
  if (k === "u1") return p < 10000000; if (k === "1-2") return p >= 10000000 && p < 20000000;
  if (k === "2p") return p >= 20000000; return true;
}
// Distance (catchment) is handled by the band chips, not here.
function DP_applyAgri(list, f) {
  return list.filter((p) => {
    if (!sizeTest(f.size, p.acres)) return false;
    if (!priceTest(f.price, p.price)) return false;
    if (f.road && !/road access|highway/i.test(p.road)) return false;
    if (f.water && /^none$/i.test(p.water)) return false;
    if (f.soil !== "Any soil" && p.soil !== f.soil) return false;
    return true;
  });
}
function AgriFilters({ f, setF, onClear }) {
  const active = f.size !== "any" || f.price !== "any" || f.road || f.water || f.soil !== "Any soil";
  return (
    <div style={{ background: "var(--surface-subtle)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", padding: "16px 18px", marginBottom: "18px", display: "flex", flexDirection: "column", gap: "14px" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        <span style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "var(--tracking-caps)", textTransform: "uppercase", color: "var(--text-muted)" }}>Land size</span>
        <Segmented options={AGRI_SIZES} value={f.size} onChange={(k) => setF({ ...f, size: k })} />
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        <span style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "var(--tracking-caps)", textTransform: "uppercase", color: "var(--text-muted)" }}>Price range</span>
        <Segmented options={AGRI_PRICES} value={f.price} onChange={(k) => setF({ ...f, price: k })} />
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        <span style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "var(--tracking-caps)", textTransform: "uppercase", color: "var(--text-muted)" }}>Soil / cultivation</span>
        <Segmented options={AGRI_SOILS.map((s) => ({ k: s, label: s }))} value={f.soil} onChange={(k) => setF({ ...f, soil: k })} />
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "10px" }}>
        <button onClick={() => setF({ ...f, road: !f.road })} style={{
          display: "inline-flex", alignItems: "center", gap: "8px", padding: "7px 13px", borderRadius: "var(--radius-full)",
          border: f.road ? "1px solid var(--evergreen-600)" : "1px solid var(--border)", background: f.road ? "var(--trust-verified-bg)" : "var(--surface-card)",
          color: f.road ? "var(--trust-verified-fg)" : "var(--text-body)", cursor: "pointer", fontFamily: "var(--font-sans)", fontSize: "12.5px", fontWeight: 600,
        }}><SIcon name="route" size={15} color={f.road ? "var(--trust-verified-fg)" : "var(--grey-400)"} />Road access</button>
        <button onClick={() => setF({ ...f, water: !f.water })} style={{
          display: "inline-flex", alignItems: "center", gap: "8px", padding: "7px 13px", borderRadius: "var(--radius-full)",
          border: f.water ? "1px solid var(--evergreen-600)" : "1px solid var(--border)", background: f.water ? "var(--trust-verified-bg)" : "var(--surface-card)",
          color: f.water ? "var(--trust-verified-fg)" : "var(--text-body)", cursor: "pointer", fontFamily: "var(--font-sans)", fontSize: "12.5px", fontWeight: 600,
        }}><SIcon name="check" size={15} color={f.water ? "var(--trust-verified-fg)" : "var(--grey-400)"} />Water available</button>
      </div>
      {active && (
        <button onClick={onClear} style={{ alignSelf: "flex-start", display: "inline-flex", alignItems: "center", gap: "6px", border: "none", background: "transparent", color: "var(--text-muted)", cursor: "pointer", fontFamily: "var(--font-sans)", fontSize: "12.5px", fontWeight: 600, padding: 0 }}>Clear filters <SIcon name="x" size={14} /></button>
      )}
    </div>
  );
}

// ---- Radius selector (school journey: 3 / 5 / 10 km) ----
function Radius({ value, onChange, school }) {
  return (
    <div style={{ marginBottom: "20px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "10px" }}>
        <SIcon name="route" size={15} color="var(--plum-600)" />
        <span style={{ fontSize: "12px", fontWeight: 700, letterSpacing: "var(--tracking-caps)", textTransform: "uppercase", color: "var(--text-muted)" }}>Search radius</span>
      </div>
      <div style={{ display: "flex", gap: "8px" }}>
        {[3, 5, 10].map((km) => {
          const on = value === km;
          const n = window.BLR_HOMES_NEAR(school, km).length;
          return (
            <button key={km} onClick={() => onChange(km)} style={{
              flex: 1, border: on ? "1px solid var(--plum-500)" : "1px solid var(--border)",
              background: on ? "var(--plum-tint)" : "var(--surface-card)", color: "var(--text-strong)",
              cursor: "pointer", padding: "9px 10px", borderRadius: "var(--radius-md)",
              fontFamily: "var(--font-sans)", display: "flex", flexDirection: "column", alignItems: "center", gap: "2px",
            }}>
              <span style={{ fontSize: "13.5px", fontWeight: 700, color: on ? "var(--plum-600)" : "inherit" }}>{km} km</span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: "11px", color: "var(--text-muted)" }}>{n} {n === 1 ? "home" : "homes"}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Empty({ icon = "map-pin", title, body, actions, accent }) {
  const tint = accent === "plum" ? "var(--plum-tint)" : accent === "agri" ? "var(--evergreen-50)" : "var(--canvas-200)";
  const ic = accent === "plum" ? "var(--plum-600)" : accent === "agri" ? "var(--evergreen-600)" : "var(--grey-500)";
  return (
    <div style={{ textAlign: "center", padding: "32px 26px", background: "var(--surface-card)", border: "1px dashed var(--border-strong)", borderRadius: "var(--radius-xl)" }}>
      <div style={{ width: "54px", height: "54px", borderRadius: "var(--radius-full)", background: tint, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
        <SIcon name={icon} size={24} color={ic} />
      </div>
      <h3 style={{ margin: "0 0 8px", fontFamily: "var(--font-serif)", fontSize: "21px", fontWeight: 600, color: "var(--text-strong)", letterSpacing: "-0.01em" }}>{title}</h3>
      <p style={{ margin: "0 auto 20px", maxWidth: "360px", fontSize: "13.5px", lineHeight: 1.55, color: "var(--text-muted)", textWrap: "pretty" }}>{body}</p>
      <div style={{ display: "flex", gap: "10px", justifyContent: "center", flexWrap: "wrap" }}>{actions}</div>
    </div>
  );
}

// ---- Distance-band chips (agri catchment: 10/25/50/100 km from the city) ----
function DistanceChips({ distances, value, onChange, count, originName }) {
  return (
    <div style={{ marginBottom: "18px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "10px" }}>
        <SIcon name="route" size={15} color="var(--evergreen-600)" />
        <span style={{ fontSize: "12px", fontWeight: 700, letterSpacing: "var(--tracking-caps)", textTransform: "uppercase", color: "var(--text-muted)" }}>Distance from {originName || "city"}</span>
      </div>
      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
        {distances.map((km) => {
          const on = value === km;
          const n = count ? count(km) : null;
          const label = km === distances[0] ? `Within ${km} km` : `Up to ${km} km`;
          return (
            <button key={km} onClick={() => onChange(km)} style={{
              display: "inline-flex", alignItems: "center", gap: "7px", padding: "8px 14px", borderRadius: "var(--radius-full)",
              border: on ? "1px solid var(--evergreen-600)" : "1px solid var(--border)",
              background: on ? "var(--evergreen-600)" : "var(--surface-card)", color: on ? "#fff" : "var(--text-body)",
              cursor: "pointer", fontFamily: "var(--font-sans)", fontSize: "12.5px", fontWeight: 600, whiteSpace: "nowrap",
              boxShadow: on ? "var(--shadow-xs)" : "none",
            }}>
              {on && <SIcon name="check" size={13} color="#fff" />}{label}
              {n != null && <span style={{ fontFamily: "var(--font-mono)", fontSize: "11px", color: on ? "rgba(255,255,255,0.8)" : "var(--text-muted)" }}>{n}</span>}
            </button>
          );
        })}
      </div>
      <p style={{ margin: "9px 0 0", fontSize: "12px", color: "var(--text-muted)", lineHeight: 1.5 }}>Includes properties at closer distances too.</p>
    </div>
  );
}

// Wedge polygon from the city centre along a bearing (deg, 0=N,90=E) ± half, out to km.
window.BLR_WEDGE = function (city, bearing, half, km, steps) {
  steps = steps || 14;
  const pts = [[city.lat, city.lon]];
  const kmToLat = 1 / 111, kmToLon = 1 / (111 * Math.cos(city.lat * Math.PI / 180));
  for (let i = 0; i <= steps; i++) {
    const b = (bearing - half + (2 * half) * (i / steps)) * Math.PI / 180;
    pts.push([city.lat + km * Math.cos(b) * kmToLat, city.lon + km * Math.sin(b) * kmToLon]);
  }
  return pts;
};

Object.assign(window, {
  DPBuyRent: BuyRent, DPBackLink: BackLink, DPCrumb: Crumb, DPSection: Section,
  DPHeaderBand: HeaderBand, DPGhostBtn: GhostBtn, DPScopedSearch: ScopedSearch,
  DPFilterBar: FilterBar, DPAgriFilters: AgriFilters, DPRadius: Radius, DPDistanceChips: DistanceChips, DPEmpty: Empty,
  DP_DEFAULT_FILTERS, DP_applyFilters, DP_AGRI_DEFAULTS, DP_applyAgri,
});
