// Wide right-hand listing editor. Sections, not tabs — same single-scroll structure as the
// Pending Approvals review drawer — with inline validation, an unsaved-changes guard, a
// simulated draggable map pin, and lifecycle actions that always route through confirmation.
const { Icon: EdIcon, Badge: EdBadge, Button: EdButton } = window.ReTrendsDesignSystem_f37966;

function EdFact({ label, children }) {
  return <div><div style={{ fontSize: "11px", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "5px" }}>{label}</div>{children}</div>;
}
const fieldStyle = { width: "100%", height: "36px", padding: "0 12px", fontFamily: "var(--font-sans)", fontSize: "13.5px", border: "1px solid var(--border-strong)", borderRadius: "var(--radius-md)", background: "var(--input-bg)", boxSizing: "border-box" };

function ListingsEditor({ listing, onClose, onRequestAction, onSave }) {
  const [form, setForm] = React.useState(null);
  const [dirty, setDirty] = React.useState(false);
  const [errors, setErrors] = React.useState([]);
  const [saving, setSaving] = React.useState(false);
  const [confirmDiscard, setConfirmDiscard] = React.useState(false);
  const [showCoords, setShowCoords] = React.useState(false);
  const [pin, setPin] = React.useState({ x: 50, y: 50 });
  const [dragging, setDragging] = React.useState(false);
  const mapRef = React.useRef(null);

  React.useEffect(() => {
    setForm({ ...listing, priceInput: String(listing.price) });
    setDirty(false); setErrors([]); setShowCoords(false); setPin({ x: 50, y: 50 });
  }, [listing.id]);

  React.useEffect(() => {
    if (!dragging) return;
    const move = (e) => {
      const r = mapRef.current.getBoundingClientRect();
      setPin({ x: Math.max(2, Math.min(98, ((e.clientX - r.left) / r.width) * 100)), y: Math.max(2, Math.min(98, ((e.clientY - r.top) / r.height) * 100)) });
      setDirty(true);
    };
    const up = () => setDragging(false);
    window.addEventListener("mousemove", move); window.addEventListener("mouseup", up);
    return () => { window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", up); };
  }, [dragging]);

  if (!form) return null;
  const set = (patch) => { setForm((f) => ({ ...f, ...patch })); setDirty(true); };
  const broker = window.PA_BROKERS[form.broker];
  const localityValid = window.PL_LOCALITIES.includes(form.locality);
  const price = Number(form.priceInput) || 0;

  const validate = () => {
    const errs = [];
    if (!form.title.trim()) errs.push("Title is required.");
    if (!localityValid) errs.push("Locality must be chosen from the controlled list.");
    if (!(price > 0)) errs.push("Price must be a positive amount.");
    if (price > 5000000000) errs.push("Price looks implausibly high \u2014 double-check the entered amount.");
    return errs;
  };

  const doSave = (thenPublish) => {
    const errs = validate();
    if (errs.length) { setErrors(errs); return; }
    setSaving(true);
    setTimeout(() => {
      onSave(listing.id, { title: form.title, propertyType: form.propertyType, area: form.area, price, locality: form.locality, address: form.address, description: form.description, amenities: form.amenities });
      setSaving(false); setDirty(false); setErrors([]);
      if (thenPublish) onRequestAction("publish", [listing.id]);
    }, 600);
  };

  const requestClose = () => dirty ? setConfirmDiscard(true) : onClose();
  const transitions = window.PL_TRANSITIONS[listing.status] || [];
  const inconsistent = listing.warnings.includes("inconsistent_state");

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 60, display: "flex", justifyContent: "flex-end" }}>
      <div onClick={requestClose} style={{ position: "absolute", inset: 0, background: "rgba(14,22,38,0.38)" }} />
      <div style={{ position: "relative", width: "min(760px, 96vw)", height: "100%", background: "var(--paper)", boxShadow: "var(--shadow-xl)", display: "flex", flexDirection: "column" }}>
        <div style={{ flex: "none", padding: "20px 24px 16px", borderBottom: "1px solid var(--border)" }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "12px" }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: "18px", fontWeight: 700, lineHeight: 1.3 }}>{form.title || "Untitled listing"}</div>
              <div style={{ display: "flex", alignItems: "center", gap: "10px", marginTop: "6px", flexWrap: "wrap" }}>
                <span style={{ fontSize: "12px", fontFamily: "var(--font-mono)", color: "var(--text-muted)" }}>{listing.id}</span>
                <window.PL_LifecycleBadge status={listing.status} />
                <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>Updated {window.PA_formatAge(listing.updatedAt)} by {listing.updatedBy}</span>
              </div>
            </div>
            <div style={{ display: "flex", gap: "8px", flex: "none" }}>
              <EdButton variant="outline" size="sm"><EdIcon name="arrow-up-right" size={14} /> Preview</EdButton>
              <EdButton variant="ghost" size="icon" onClick={requestClose}><EdIcon name="x" size={18} /></EdButton>
            </div>
          </div>
          {confirmDiscard && (
            <div style={{ marginTop: "12px", padding: "10px 14px", background: "var(--caution-bg)", borderRadius: "var(--radius-md)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
              <span style={{ fontSize: "13px", color: "var(--text-strong)" }}>Discard unsaved changes?</span>
              <div style={{ display: "flex", gap: "8px" }}>
                <EdButton variant="ghost" size="sm" onClick={() => setConfirmDiscard(false)}>Keep editing</EdButton>
                <EdButton size="sm" style={{ background: "var(--negative)" }} onClick={onClose}>Discard</EdButton>
              </div>
            </div>
          )}
          {errors.length > 0 && (
            <div style={{ marginTop: "12px", padding: "12px 14px", background: "var(--negative-bg)", borderRadius: "var(--radius-md)" }}>
              <div style={{ fontSize: "13px", fontWeight: 700, color: "var(--negative)", marginBottom: "4px" }}>Fix {errors.length} issue{errors.length === 1 ? "" : "s"} before saving</div>
              {errors.map((e, i) => <div key={i} style={{ fontSize: "12.5px", color: "var(--negative)" }}>{"\u2022"} {e}</div>)}
            </div>
          )}
        </div>

        <div className="upt-scroll" style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "20px 24px" }}>
          <section style={{ marginBottom: "26px" }}>
            <window.PA_SectionTitle icon="file-check">Basic details</window.PA_SectionTitle>
            <label style={{ fontSize: "13px", fontWeight: 600, display: "block", marginBottom: "6px" }}>Title</label>
            <input value={form.title} onChange={(e) => set({ title: e.target.value })} style={{ ...fieldStyle, marginBottom: "4px" }} />
          </section>

          <section style={{ marginBottom: "26px" }}>
            <window.PA_SectionTitle icon="building">Property details</window.PA_SectionTitle>
            <label style={{ fontSize: "13px", fontWeight: 600, display: "block", marginBottom: "6px" }}>Property type</label>
            <select value={form.propertyType} onChange={(e) => set({ propertyType: e.target.value })} style={fieldStyle}>
              {Object.entries(window.PA_PROPERTY_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </section>

          <section style={{ marginBottom: "26px" }}>
            <window.PA_SectionTitle icon="trending-up">Price &amp; area</window.PA_SectionTitle>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
              <div>
                <label style={{ fontSize: "13px", fontWeight: 600, display: "block", marginBottom: "6px" }}>Price (INR)</label>
                <input value={form.priceInput} onChange={(e) => set({ priceInput: e.target.value.replace(/[^0-9]/g, "") })} style={fieldStyle} />
                <div style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "5px" }}>{"\u2248"} {window.PA_formatPrice(price || 0)}</div>
              </div>
              <div>
                <label style={{ fontSize: "13px", fontWeight: 600, display: "block", marginBottom: "6px" }}>Area</label>
                <input value={form.area} onChange={(e) => set({ area: e.target.value })} style={fieldStyle} />
              </div>
            </div>
          </section>

          <section style={{ marginBottom: "26px" }}>
            <window.PA_SectionTitle icon="map-pin" right={<EdBadge tone={form.locationConfidence === "high" ? "positive" : form.locationConfidence === "medium" ? "caution" : "negative"}>{form.locationConfidence[0].toUpperCase() + form.locationConfidence.slice(1)} confidence</EdBadge>}>Location</window.PA_SectionTitle>
            <label style={{ fontSize: "13px", fontWeight: 600, display: "block", marginBottom: "6px" }}>Locality</label>
            <input list="pl-localities" value={form.locality} onChange={(e) => set({ locality: e.target.value })} style={{ ...fieldStyle, borderColor: localityValid ? "var(--border-strong)" : "var(--negative)" }} />
            <datalist id="pl-localities">{window.PL_LOCALITIES.map((l) => <option key={l} value={l} />)}</datalist>
            {!localityValid && <div style={{ fontSize: "12px", color: "var(--negative)", marginTop: "5px" }}>Not a recognized locality {"\u2014"} choose one from the list to avoid spelling variants.</div>}
            <label style={{ fontSize: "13px", fontWeight: 600, display: "block", margin: "14px 0 6px" }}>Full address</label>
            <textarea value={form.address} onChange={(e) => set({ address: e.target.value })} rows={2} style={{ ...fieldStyle, height: "auto", padding: "8px 12px", resize: "vertical" }} />
            {listing.locationOutOfBounds && (
              <div style={{ marginTop: "12px", padding: "10px 12px", background: "var(--caution-bg)", borderRadius: "var(--radius-md)", fontSize: "12.5px", color: "var(--text-strong)", display: "flex", gap: "8px" }}>
                <EdIcon name="alert-triangle" size={14} color="var(--caution)" style={{ flex: "none", marginTop: "1px" }} />
                These coordinates fall outside the {form.locality} locality boundary {"\u2014"} verify before publishing.
              </div>
            )}
            <div ref={mapRef} onMouseDown={(e) => { setDragging(true); const r = mapRef.current.getBoundingClientRect(); setPin({ x: ((e.clientX - r.left) / r.width) * 100, y: ((e.clientY - r.top) / r.height) * 100 }); }}
              style={{ marginTop: "12px", height: "150px", borderRadius: "var(--radius-md)", border: "1px solid var(--border)", background: "repeating-linear-gradient(45deg, var(--surface-subtle) 0 10px, var(--stone-300) 10px 20px)", position: "relative", cursor: "crosshair", userSelect: "none" }}>
              <div style={{ position: "absolute", left: pin.x + "%", top: pin.y + "%", transform: "translate(-50%,-100%)", cursor: "grab" }}>
                <EdIcon name="map-pin" size={26} color="var(--navy-800)" />
              </div>
            </div>
            <div style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "6px" }}>Drag the pin to fine-tune the mapped location.</div>
            <button onClick={() => setShowCoords((s) => !s)} style={{ marginTop: "10px", background: "transparent", border: "none", padding: 0, color: "var(--primary)", fontSize: "12.5px", fontWeight: 600, cursor: "pointer" }}>{showCoords ? "Hide" : "Show"} advanced coordinates</button>
            {showCoords && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginTop: "10px" }}>
                <EdFact label="Latitude"><div style={{ fontFamily: "var(--font-mono)", fontSize: "13px" }}>{listing.lat.toFixed(4)}</div></EdFact>
                <EdFact label="Longitude"><div style={{ fontFamily: "var(--font-mono)", fontSize: "13px" }}>{listing.lon.toFixed(4)}</div></EdFact>
              </div>
            )}
          </section>

          <section style={{ marginBottom: "26px" }}>
            <window.PA_SectionTitle icon="camera" right={<span style={{ fontSize: "12px", color: "var(--text-muted)" }}>{listing.photos.length} photo{listing.photos.length === 1 ? "" : "s"}</span>}>Photos &amp; media</window.PA_SectionTitle>
            {listing.photos.length ? (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(110px, 1fr))", gap: "8px" }}>
                {listing.photos.map((p, i) => <img key={i} src={p} alt="" style={{ width: "100%", height: "80px", objectFit: "cover", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)" }} />)}
              </div>
            ) : (
              <div style={{ padding: "24px 0", textAlign: "center", background: "var(--surface-subtle)", borderRadius: "var(--radius-md)", border: "1px dashed var(--border-strong)" }}>
                <EdIcon name="camera" size={20} color="var(--text-muted)" />
                <div style={{ fontSize: "12.5px", fontWeight: 600, color: "var(--text-muted)", marginTop: "6px" }}>No photos submitted</div>
              </div>
            )}
          </section>

          <section style={{ marginBottom: "26px" }}>
            <window.PA_SectionTitle icon="file-check">Description &amp; amenities</window.PA_SectionTitle>
            <textarea value={form.description} onChange={(e) => set({ description: e.target.value })} rows={3} placeholder="Add a description\u2026" style={{ ...fieldStyle, height: "auto", padding: "8px 12px", resize: "vertical", marginBottom: "12px" }} />
            <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
              {form.amenities.map((a) => <span key={a} style={{ fontSize: "12px", fontWeight: 600, padding: "4px 10px", borderRadius: "var(--radius-full)", background: "var(--surface-subtle)" }}>{a}</span>)}
              {form.amenities.length === 0 && <span style={{ fontSize: "12.5px", color: "var(--text-muted)" }}>No amenities recorded.</span>}
            </div>
          </section>

          <section style={{ marginBottom: "26px" }}>
            <window.PA_SectionTitle icon="users">Broker / contact details</window.PA_SectionTitle>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "10px" }}>
              <div>
                <div style={{ fontSize: "14px", fontWeight: 700 }}>{broker.name}</div>
                <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>{broker.phone} \u00b7 {broker.email}</div>
              </div>
              <window.PA_VerificationBadge tier={broker.verification} />
            </div>
          </section>

          <section style={{ marginBottom: "26px" }}>
            <window.PA_SectionTitle icon="shield-check">Publication &amp; lifecycle</window.PA_SectionTitle>
            {inconsistent && (
              <div style={{ marginBottom: "14px", padding: "12px 14px", background: "var(--negative-bg)", borderRadius: "var(--radius-md)", display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "12px" }}>
                <div style={{ display: "flex", gap: "8px" }}>
                  <EdIcon name="alert-triangle" size={15} color="var(--negative)" style={{ flex: "none", marginTop: "1px" }} />
                  <span style={{ fontSize: "12.5px", color: "var(--text-strong)" }}>This listing is archived but still marked publicly visible {"\u2014"} a legacy data inconsistency. Unpublish to resolve it.</span>
                </div>
                <EdButton size="sm" style={{ background: "var(--negative)", flex: "none" }} onClick={() => onRequestAction("unpublish", [listing.id])}>Fix now</EdButton>
              </div>
            )}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginBottom: "16px" }}>
              <EdFact label="Public visibility"><window.PL_VisibilityBadge visible={listing.visible} inconsistent={inconsistent} /></EdFact>
              <EdFact label="Lifecycle status"><window.PL_LifecycleBadge status={listing.status} /></EdFact>
            </div>
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              {transitions.map((t) => {
                const m = window.PL_ACTION_META[t];
                return <EdButton key={t} variant={t === "publish" ? "primary" : "outline"} size="sm" style={t === "publish" ? { background: m.color } : { borderColor: m.color, color: m.color }} onClick={() => onRequestAction(t, [listing.id])}>{m.label}</EdButton>;
              })}
            </div>
          </section>

          <section>
            <window.PA_SectionTitle icon="calendar">Activity history</window.PA_SectionTitle>
            {listing.history.map((h, i) => (
              <div key={i} style={{ display: "flex", gap: "10px", padding: "6px 0", fontSize: "12.5px" }}>
                <span style={{ flex: "none", color: "var(--text-muted)", fontFamily: "var(--font-mono)", width: "84px" }}>{window.PA_formatDateTime(h.ts).split(",")[0]}</span>
                <span><b style={{ color: "var(--text-strong)" }}>{h.actor}: </b>{h.action}{h.prev != null && <span style={{ color: "var(--text-muted)" }}> ({h.prev} {"\u2192"} {h.next})</span>}{h.reason && <span style={{ color: "var(--text-muted)" }}> {"\u2014"} {h.reason}</span>}</span>
              </div>
            ))}
          </section>
        </div>

        <div style={{ flex: "none", display: "flex", alignItems: "center", gap: "10px", padding: "16px 24px", borderTop: "1px solid var(--border)" }}>
          <EdButton variant="outline" onClick={requestClose}>Cancel</EdButton>
          <div style={{ flex: 1 }} />
          <EdButton variant="secondary" disabled={saving} onClick={() => doSave(false)}>{saving ? "Saving\u2026" : "Save changes"}</EdButton>
          {(listing.status === "unpublished" || listing.status === "draft") && <EdButton disabled={saving} style={{ background: "var(--positive)" }} onClick={() => doSave(true)}>Save &amp; publish</EdButton>}
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { ListingsEditor });
