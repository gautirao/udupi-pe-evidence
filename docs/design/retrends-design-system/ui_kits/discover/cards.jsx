// ReTrends Discover — result cards + right-side results panels.
// Exports: RTStackCard, RTAgriCard, RTResidentialResults, RTAgriResults.
const { Icon: I, TrustBadge: TB, Input: RTInput, Select: RTSelect } = window.ReTrendsDesignSystem_f37966;

/* ---------- shared small controls ---------- */
function Segmented({ value, onChange, options }) {
  return (
    <div style={{ display: "inline-flex", padding: "3px", gap: "2px", background: "var(--input-bg)", borderRadius: "var(--radius-full)", border: "1px solid var(--border)" }}>
      {options.map((o) => {
        const on = o === value;
        return (
          <button key={o} onClick={() => onChange(o)} style={{
            padding: "6px 16px", border: "none", cursor: "pointer", borderRadius: "var(--radius-full)",
            fontFamily: "var(--font-sans)", fontSize: "13px", fontWeight: 600,
            background: on ? "var(--paper)" : "transparent", color: on ? "var(--text-strong)" : "var(--text-muted)",
            boxShadow: on ? "var(--shadow-xs)" : "none", transition: "all var(--dur-fast) var(--ease-standard)",
          }}>{o}</button>
        );
      })}
    </div>
  );
}

function Chip({ label, active, onClick }) {
  return (
    <button onClick={onClick} style={{
      padding: "7px 14px", borderRadius: "var(--radius-full)", cursor: "pointer",
      fontFamily: "var(--font-sans)", fontSize: "13px", fontWeight: 600, whiteSpace: "nowrap",
      border: active ? "1px solid var(--navy-800)" : "1px solid var(--border-strong)",
      background: active ? "var(--navy-800)" : "var(--paper)", color: active ? "#fff" : "var(--text-body)",
      transition: "all var(--dur-fast) var(--ease-standard)",
    }}>{label}</button>
  );
}

function IconBtn({ icon, label, onClick }) {
  const [h, setH] = React.useState(false);
  return (
    <button onClick={onClick} onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)} title={label} style={{
      display: "inline-flex", alignItems: "center", gap: "6px", padding: label ? "7px 12px" : "8px",
      borderRadius: "var(--radius-md)", cursor: "pointer", border: "1px solid var(--border)",
      background: h ? "var(--surface-subtle)" : "var(--paper)", color: "var(--text-body)",
      fontFamily: "var(--font-sans)", fontSize: "13px", fontWeight: 600,
      transition: "all var(--dur-fast) var(--ease-standard)",
    }}>
      <I name={icon} size={15} color="var(--text-muted)" />{label}
    </button>
  );
}

function Tag({ children, tone }) {
  const map = {
    sale: { bg: "var(--navy-100)", fg: "var(--navy-700)" },
    neutral: { bg: "var(--grey-100)", fg: "var(--text-body)" },
  };
  const c = map[tone] || map.neutral;
  return (
    <span style={{ fontSize: "12px", fontWeight: 600, padding: "3px 9px", borderRadius: "var(--radius-xs)", background: c.bg, color: c.fg }}>{children}</span>
  );
}

function Fact({ icon, children }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "13px", color: "var(--text-body)" }}>
      <I name={icon} size={15} color="var(--grey-400)" />{children}
    </span>
  );
}

/* selected/hover frame shared by both card types */
function cardFrame(selected, hover) {
  return {
    position: "relative", background: "var(--surface-card)", borderRadius: "var(--radius-lg)", overflow: "hidden",
    border: selected ? "1px solid var(--accent)" : "1px solid var(--border)",
    boxShadow: selected ? "0 0 0 3px rgba(176,92,58,0.18), var(--shadow-lg)" : (hover ? "var(--shadow-lg)" : "var(--shadow-sm)"),
    transform: hover && !selected ? "translateY(-2px)" : "none",
    transition: "box-shadow var(--dur-normal) var(--ease-standard), transform var(--dur-normal) var(--ease-standard), border-color var(--dur-fast) var(--ease-standard)",
    cursor: "pointer", fontFamily: "var(--font-sans)", scrollMarginTop: "16px",
  };
}

function CardImage({ src, alt, trustTier, hover, height }) {
  return (
    <div style={{ position: "relative", height: (height || 184) + "px", background: "var(--surface-muted)", overflow: "hidden" }}>
      <img src={src} alt={alt} style={{ width: "100%", height: "100%", objectFit: "cover", transform: hover ? "scale(1.04)" : "scale(1)", transition: "transform var(--dur-slow) var(--ease-standard)" }} />
      <div style={{ position: "absolute", top: "12px", right: "12px" }}><TB tier={trustTier} size="sm" /></div>
    </div>
  );
}

/* ---------- residential stacked card ---------- */
const RTStackCard = React.forwardRef(function RTStackCard({ p, selected, onSelect }, ref) {
  const [hover, setHover] = React.useState(false);
  return (
    <div ref={ref} onClick={() => onSelect(p.id)} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)} style={cardFrame(selected, hover)}>
      <CardImage src={p.image} alt={p.title} trustTier={p.trustTier} hover={hover} />
      <div style={{ padding: "16px 18px 18px" }}>
        <h3 style={{ margin: "0 0 6px", fontSize: "17px", fontWeight: 700, color: "var(--text-strong)", letterSpacing: "-0.01em" }}>{p.title}</h3>
        <div style={{ display: "flex", alignItems: "center", gap: "5px", fontSize: "13px", color: "var(--text-muted)", marginBottom: "13px" }}>
          <I name="map-pin" size={14} color="var(--grey-400)" />{p.locality}
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "18px", marginBottom: "14px" }}>
          {p.bedrooms != null && <Fact icon="bed">{p.bedrooms} BHK</Fact>}
          {p.bathrooms != null && <Fact icon="bath">{p.bathrooms}</Fact>}
          <Fact icon="maximize">{p.area.toLocaleString("en-IN")} sq ft</Fact>
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingTop: "14px", borderTop: "1px solid var(--border)" }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: "22px", fontWeight: 600, color: "var(--text-strong)" }}>{p.priceLabel}</span>
          <span style={{ display: "flex", alignItems: "center", gap: "5px", fontSize: "12px", color: "var(--text-muted)" }}><I name="calendar" size={13} />{p.posted}</span>
        </div>
        <div style={{ display: "flex", gap: "8px", marginTop: "13px" }}>
          <Tag tone="neutral">{p.type}</Tag><Tag tone="sale">{p.deal}</Tag>
        </div>
      </div>
    </div>
  );
});

/* ---------- agricultural card (compact, fits 2 columns) ---------- */
const RTAgriCard = React.forwardRef(function RTAgriCard({ p, selected, onSelect }, ref) {
  const [hover, setHover] = React.useState(false);
  const shown = p.facts.slice(0, 4);
  const extra = p.facts.length - shown.length;
  return (
    <div ref={ref} onClick={() => onSelect(p.id)} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)} style={cardFrame(selected, hover)}>
      <CardImage src={p.image} alt={p.title} trustTier={p.trustTier} hover={hover} height={150} />
      <div style={{ padding: "14px 16px 16px" }}>
        <h3 style={{ margin: "0 0 5px", fontSize: "16px", fontWeight: 700, color: "var(--text-strong)", letterSpacing: "-0.01em", lineHeight: 1.25 }}>{p.title}</h3>
        <div style={{ display: "flex", alignItems: "center", gap: "5px", fontSize: "13px", color: "var(--text-muted)", marginBottom: "11px" }}>
          <I name="map-pin" size={14} color="var(--grey-400)" />{p.locality}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "11px" }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: "7px", fontFamily: "var(--font-mono)", fontSize: "14px", fontWeight: 600, color: "var(--text-strong)", padding: "5px 11px", background: "var(--surface-subtle)", borderRadius: "var(--radius-sm)" }}>
            <I name="maximize" size={15} color="var(--accent)" />{p.landArea}
          </span>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "7px", marginBottom: "12px" }}>
          {shown.map((f, i) => (
            <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: "5px", fontSize: "12px", fontWeight: 500, padding: "4px 9px", background: "var(--grey-50)", color: "var(--text-body)", border: "1px solid var(--border)", borderRadius: "var(--radius-xs)" }}>
              <I name="check" size={12} color="var(--evergreen-600)" />{f}
            </span>
          ))}
          {extra > 0 && (
            <span style={{ display: "inline-flex", alignItems: "center", fontSize: "12px", fontWeight: 600, padding: "4px 9px", background: "var(--accent-tint)", color: "var(--copper-600)", borderRadius: "var(--radius-xs)", cursor: "pointer" }}>+{extra} more details</span>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingTop: "12px", borderTop: "1px solid var(--border)" }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: "21px", fontWeight: 600, color: "var(--text-strong)" }}>{p.priceLabel}</span>
          <span style={{ display: "flex", alignItems: "center", gap: "5px", fontSize: "12px", color: "var(--text-muted)" }}><I name="calendar" size={13} />{p.posted}</span>
        </div>
        <div style={{ display: "flex", gap: "8px", marginTop: "12px" }}>
          <Tag tone="neutral">{p.type}</Tag><Tag tone="sale">{p.deal}</Tag>
        </div>
      </div>
    </div>
  );
});

window.RTStackCard = RTStackCard;
window.RTAgriCard = RTAgriCard;
window.RT_Discover_UI = { Segmented, Chip, IconBtn, Tag };
