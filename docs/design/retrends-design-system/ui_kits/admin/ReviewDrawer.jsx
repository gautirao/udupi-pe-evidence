// Right-hand review drawer: full submission evidence + a persistent decision bar.
// No tabs — one scannable scroll. Approve / Return / Reject are the only exit paths,
// each with its own confirmation so an admin can never act without seeing consequences.
const { Icon: DrIcon, Badge: DrBadge, Button: DrButton } = window.ReTrendsDesignSystem_f37966;

const PA_RETURN_REASONS = ["Incorrect or incomplete details", "Better photos required", "Price needs verification", "Location needs correction", "Duplicate listing", "Other"];
const PA_REJECT_REASONS = ["Fraudulent or scam listing", "Fake or stolen photos", "Broker impersonation", "Duplicate / spam listing", "Outside PropertySignal coverage", "Other"];

function PA_Fact({ label, value }) {
  return (
    <div>
      <div style={{ fontSize: "11px", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "3px" }}>{label}</div>
      <div style={{ fontSize: "14px", color: "var(--text-strong)", fontWeight: 600 }}>{value}</div>
    </div>
  );
}

function PA_CheckRow({ ok, label, note }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: "9px", padding: "7px 0" }}>
      <span style={{ flex: "none", marginTop: "1px", width: "18px", height: "18px", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", background: ok ? "var(--positive-bg)" : "var(--caution-bg)", color: ok ? "var(--positive)" : "var(--caution)" }}>
        <DrIcon name={ok ? "check" : "alert-triangle"} size={11} strokeWidth={2.5} />
      </span>
      <div>
        <div style={{ fontSize: "13.5px", fontWeight: 600, color: "var(--text-strong)" }}>{label}</div>
        {note && <div style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "1px" }}>{note}</div>}
      </div>
    </div>
  );
}

function PA_ReviewDrawer({ listing, initialView, onClose, onApprove, onReturn, onReject }) {
  const [view, setView] = React.useState(initialView || "review");
  const [previewNote, setPreviewNote] = React.useState(false);
  const [returnReasons, setReturnReasons] = React.useState([]);
  const [returnNote, setReturnNote] = React.useState("");
  const [rejectReason, setRejectReason] = React.useState("");
  const [rejectNote, setRejectNote] = React.useState("");

  React.useEffect(() => { setView(initialView || "review"); setReturnReasons([]); setReturnNote(""); setRejectReason(""); setRejectNote(""); }, [listing.id, initialView]);

  const broker = window.PA_BROKERS[listing.broker];
  const hasFlag = (f) => listing.flags.includes(f);
  const toggleReason = (r) => setReturnReasons((rs) => rs.includes(r) ? rs.filter((x) => x !== r) : [...rs, r]);
  const returnMessage = returnReasons.length || returnNote ? [...returnReasons.map((r) => "• " + r), returnNote ? "\n" + returnNote : ""].join("\n").trim() : "";

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 60, display: "flex", justifyContent: "flex-end" }}>
      <div onClick={onClose} style={{ position: "absolute", inset: 0, background: "rgba(14,22,38,0.38)" }} />
      <div style={{ position: "relative", width: "min(680px, 94vw)", height: "100%", background: "var(--paper)", boxShadow: "var(--shadow-xl)", display: "flex", flexDirection: "column" }}>
        <div style={{ flex: "none", display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "12px", padding: "20px 24px 16px", borderBottom: "1px solid var(--border)" }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: "18px", fontWeight: 700, color: "var(--text-strong)", lineHeight: 1.3 }}>{listing.title}</div>
            <div style={{ fontSize: "12.5px", fontFamily: "var(--font-mono)", color: "var(--text-muted)", marginTop: "3px" }}>{listing.id}</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", flex: "none" }}>
            <div style={{ position: "relative" }}>
              <DrButton variant="outline" size="sm" onClick={() => { setPreviewNote(true); setTimeout(() => setPreviewNote(false), 1800); }}>
                <DrIcon name="arrow-up-right" size={14} /> Preview public listing
              </DrButton>
              {previewNote && <div style={{ position: "absolute", top: "40px", right: 0, background: "var(--navy-800)", color: "#fff", fontSize: "11.5px", padding: "6px 10px", borderRadius: "var(--radius-sm)", whiteSpace: "nowrap", boxShadow: "var(--shadow-md)" }}>Opens the public listing in a new tab</div>}
            </div>
            <DrButton variant="ghost" size="icon" onClick={onClose} aria-label="Close review drawer"><DrIcon name="x" size={18} /></DrButton>
          </div>
        </div>

        <div className="upt-scroll" style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "20px 24px" }}>
          {view === "review" && (<>
            <section style={{ marginBottom: "26px" }}>
              <window.PA_SectionTitle icon="users">Broker</window.PA_SectionTitle>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "10px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <div style={{ width: "36px", height: "36px", borderRadius: "50%", background: "var(--navy-100)", color: "var(--navy-800)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: "13px" }}>{broker.name.split(" ").map((s) => s[0]).slice(0, 2).join("")}</div>
                  <div>
                    <div style={{ fontSize: "14.5px", fontWeight: 700, color: "var(--text-strong)" }}>{broker.name}</div>
                    <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>Member since {broker.memberSince} · {broker.totalSubmissions} submissions</div>
                  </div>
                </div>
                <window.PA_VerificationBadge tier={broker.verification} />
              </div>
            </section>

            <section style={{ marginBottom: "26px" }}>
              <window.PA_SectionTitle icon="camera" right={<span style={{ fontSize: "12px", color: "var(--text-muted)" }}>{listing.photos.length} photo{listing.photos.length === 1 ? "" : "s"}</span>}>Photos</window.PA_SectionTitle>
              {listing.photos.length ? (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))", gap: "8px" }}>
                  {listing.photos.map((p, i) => <img key={i} src={p} alt="" style={{ width: "100%", height: "88px", objectFit: "cover", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)" }} />)}
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "6px", padding: "28px 0", background: "var(--surface-subtle)", borderRadius: "var(--radius-md)", border: "1px dashed var(--border-strong)" }}>
                  <DrIcon name="camera" size={22} color="var(--text-muted)" />
                  <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-muted)" }}>No photos submitted</div>
                </div>
              )}
            </section>

            <section style={{ marginBottom: "26px" }}>
              <window.PA_SectionTitle icon="building">Key facts</window.PA_SectionTitle>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px 20px" }}>
                <PA_Fact label="Price" value={window.PA_formatPrice(listing.price)} />
                <PA_Fact label="Property type" value={window.PA_PROPERTY_TYPES[listing.propertyType]} />
                <PA_Fact label="Area" value={listing.area} />
                <PA_Fact label="Locality" value={listing.locality} />
              </div>
              <div style={{ marginTop: "16px" }}><PA_Fact label="Full address" value={listing.address} /></div>
            </section>

            <section style={{ marginBottom: "26px" }}>
              <window.PA_SectionTitle icon="map-pin" right={<DrBadge tone={listing.locationConfidence === "high" ? "positive" : listing.locationConfidence === "medium" ? "caution" : "negative"}>{listing.locationConfidence[0].toUpperCase() + listing.locationConfidence.slice(1)} confidence</DrBadge>}>Location</window.PA_SectionTitle>
              <div style={{ height: "120px", borderRadius: "var(--radius-md)", border: "1px solid var(--border)", background: "repeating-linear-gradient(45deg, var(--surface-subtle) 0 10px, var(--stone-300) 10px 20px)", display: "flex", alignItems: "center", justifyContent: "center", position: "relative" }}>
                <DrIcon name="map-pin" size={26} color="var(--navy-800)" />
              </div>
              <div style={{ fontSize: "12px", fontFamily: "var(--font-mono)", color: "var(--text-muted)", marginTop: "6px" }}>{listing.lat.toFixed(4)}, {listing.lon.toFixed(4)}</div>
            </section>

            <section style={{ marginBottom: "26px" }}>
              <window.PA_SectionTitle icon="file-check">Description &amp; amenities</window.PA_SectionTitle>
              <p style={{ fontSize: "13.5px", color: "var(--text-body)", lineHeight: 1.6, margin: "0 0 12px" }}>{listing.description}</p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                {listing.amenities.map((a) => <span key={a} style={{ fontSize: "12px", fontWeight: 600, padding: "4px 10px", borderRadius: "var(--radius-full)", background: "var(--surface-subtle)", color: "var(--text-body)" }}>{a}</span>)}
              </div>
            </section>

            <section style={{ marginBottom: "26px" }}>
              <window.PA_SectionTitle icon="shield-check">Automated quality &amp; risk checks</window.PA_SectionTitle>
              <PA_CheckRow ok={!hasFlag("missing_info")} label="Listing details complete" note={hasFlag("missing_info") ? "Missing: " + (listing.missingFields || []).join(", ") : "Title, price, area and address all present."} />
              <PA_CheckRow ok={!hasFlag("suspicious_price")} label="Price within expected range" note={hasFlag("suspicious_price") ? listing.priceNote : "Consistent with recent comparable sales."} />
              <PA_CheckRow ok={!hasFlag("location_unverified")} label="Location verified" note={hasFlag("location_unverified") ? "Coordinates could not be matched to the stated address with confidence." : "Coordinates match the stated address."} />
              <PA_CheckRow ok={listing.photos.length > 0} label="Photos submitted" note={listing.photos.length === 0 ? "No photos were attached to this submission." : listing.photos.length + " photo(s) attached."} />
              <PA_CheckRow ok={!hasFlag("possible_duplicate")} label="No duplicate detected" note={hasFlag("possible_duplicate") ? "Similar to an existing submission — see below." : "No matching listings found."} />
              <PA_CheckRow ok={!hasFlag("broker_unverified")} label="Broker identity verified" note={hasFlag("broker_unverified") ? "This broker's identity has not yet been verified." : "Broker verification is up to date."} />
            </section>

            {listing.duplicateMatches && (
              <section style={{ marginBottom: "26px" }}>
                <window.PA_SectionTitle icon="layers">Possible duplicate matches</window.PA_SectionTitle>
                {listing.duplicateMatches.map((m) => (
                  <div key={m.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", padding: "12px", borderRadius: "var(--radius-md)", border: "1px solid var(--border-strong)", background: "var(--caution-bg)" }}>
                    <div>
                      <div style={{ fontSize: "13.5px", fontWeight: 700, color: "var(--text-strong)" }}>{m.title}</div>
                      <div style={{ fontSize: "12px", fontFamily: "var(--font-mono)", color: "var(--text-muted)" }}>{m.id} · {m.similarity}% match</div>
                    </div>
                    <DrButton variant="outline" size="sm">Compare</DrButton>
                  </div>
                ))}
              </section>
            )}

            <section style={{ marginBottom: "26px" }}>
              <window.PA_SectionTitle icon="message-circle">Contact details</window.PA_SectionTitle>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px 20px" }}>
                <PA_Fact label="Contact name" value={listing.contact.name} />
                <PA_Fact label="Phone" value={listing.contact.phone} />
              </div>
            </section>

            <section>
              <window.PA_SectionTitle icon="calendar">Submission &amp; activity</window.PA_SectionTitle>
              <div style={{ fontSize: "13px", color: "var(--text-body)", marginBottom: "10px" }}>Submitted {window.PA_formatDateTime(listing.submittedAt)}</div>
              {listing.history.map((h, i) => (
                <div key={i} style={{ display: "flex", gap: "10px", padding: "6px 0", fontSize: "12.5px" }}>
                  <span style={{ flex: "none", color: "var(--text-muted)", fontFamily: "var(--font-mono)", width: "84px" }}>{window.PA_formatDateTime(h.ts).split(",")[0]}</span>
                  <span style={{ color: "var(--text-body)" }}><b style={{ color: "var(--text-strong)" }}>{h.actor}: </b>{h.action}</span>
                </div>
              ))}
            </section>
          </>)}

          {view === "approve" && (
            <div style={{ padding: "8px 0" }}>
              <DrIcon name="shield-check" size={26} color="var(--positive)" />
              <h3 style={{ fontSize: "18px", fontWeight: 700, margin: "12px 0 6px" }}>Approve and publish this listing?</h3>
              <p style={{ fontSize: "13.5px", color: "var(--text-muted)", margin: "0 0 18px", lineHeight: 1.6 }}>It will immediately become visible to buyers on PropertySignal.</p>
              <div style={{ border: "1px solid var(--border)", borderRadius: "var(--radius-md)", padding: "14px 16px", display: "flex", flexDirection: "column", gap: "8px", marginBottom: "20px" }}>
                <div style={{ fontSize: "14.5px", fontWeight: 700 }}>{listing.title}</div>
                <div style={{ fontSize: "13px", color: "var(--text-muted)" }}>{listing.id} · {listing.locality} · {window.PA_formatPrice(listing.price)} · {broker.name}</div>
              </div>
              <div style={{ display: "flex", gap: "10px" }}>
                <DrButton variant="outline" onClick={() => setView("review")}>Cancel</DrButton>
                <DrButton style={{ background: "var(--positive)" }} onClick={() => onApprove(listing.id)}>Confirm &amp; publish</DrButton>
              </div>
            </div>
          )}

          {view === "return" && (
            <div style={{ padding: "8px 0" }}>
              <h3 style={{ fontSize: "18px", fontWeight: 700, margin: "0 0 4px" }}>Return for edits</h3>
              <p style={{ fontSize: "13.5px", color: "var(--text-muted)", margin: "0 0 16px" }}>The broker can revise and resubmit. Select what needs to change.</p>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "16px" }}>
                {PA_RETURN_REASONS.map((r) => (
                  <label key={r} style={{ display: "flex", alignItems: "center", gap: "9px", fontSize: "13.5px", color: "var(--text-strong)", cursor: "pointer" }}>
                    <input type="checkbox" checked={returnReasons.includes(r)} onChange={() => toggleReason(r)} style={{ width: "16px", height: "16px", accentColor: "var(--caution)" }} />
                    {r}
                  </label>
                ))}
              </div>
              <label style={{ fontSize: "13px", fontWeight: 600, display: "block", marginBottom: "6px" }}>Note to broker (optional)</label>
              <textarea value={returnNote} onChange={(e) => setReturnNote(e.target.value)} rows={3} placeholder="Add any specific detail…" style={{ width: "100%", resize: "vertical", padding: "10px 12px", fontFamily: "var(--font-sans)", fontSize: "13.5px", border: "1px solid var(--border-strong)", borderRadius: "var(--radius-md)", background: "var(--input-bg)", marginBottom: "16px", boxSizing: "border-box" }} />
              {returnMessage && (
                <div style={{ marginBottom: "18px" }}>
                  <div style={{ fontSize: "11px", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "6px" }}>Exact message the broker will see</div>
                  <div style={{ whiteSpace: "pre-line", fontSize: "13px", color: "var(--text-body)", background: "var(--surface-subtle)", borderRadius: "var(--radius-md)", padding: "12px 14px", lineHeight: 1.6 }}>{returnMessage}</div>
                </div>
              )}
              <div style={{ display: "flex", gap: "10px" }}>
                <DrButton variant="outline" onClick={() => setView("review")}>Cancel</DrButton>
                <DrButton disabled={!returnReasons.length} style={{ background: "var(--caution)" }} onClick={() => onReturn(listing.id, returnReasons, returnNote)}>Send back to broker</DrButton>
              </div>
            </div>
          )}

          {view === "reject" && (
            <div style={{ padding: "8px 0" }}>
              <DrIcon name="alert-triangle" size={24} color="var(--negative)" />
              <h3 style={{ fontSize: "18px", fontWeight: 700, margin: "10px 0 4px" }}>Reject this listing</h3>
              <p style={{ fontSize: "13.5px", color: "var(--negative)", margin: "0 0 16px", lineHeight: 1.6 }}>This is different from returning for edits — the broker cannot correct and resubmit. The listing will not be published.</p>
              <label style={{ fontSize: "13px", fontWeight: 600, display: "block", marginBottom: "6px" }}>Reason (required)</label>
              <select value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} style={{ width: "100%", height: "36px", padding: "0 12px", fontFamily: "var(--font-sans)", fontSize: "13.5px", border: "1px solid var(--border-strong)", borderRadius: "var(--radius-md)", background: "var(--input-bg)", marginBottom: "14px", boxSizing: "border-box" }}>
                <option value="">Select a reason…</option>
                {PA_REJECT_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
              <label style={{ fontSize: "13px", fontWeight: 600, display: "block", marginBottom: "6px" }}>Note (required)</label>
              <textarea value={rejectNote} onChange={(e) => setRejectNote(e.target.value)} rows={3} placeholder="Explain why this listing is rejected…" style={{ width: "100%", resize: "vertical", padding: "10px 12px", fontFamily: "var(--font-sans)", fontSize: "13.5px", border: "1px solid var(--border-strong)", borderRadius: "var(--radius-md)", background: "var(--input-bg)", marginBottom: "18px", boxSizing: "border-box" }} />
              <div style={{ display: "flex", gap: "10px" }}>
                <DrButton variant="outline" onClick={() => setView("review")}>Cancel</DrButton>
                <DrButton disabled={!rejectReason || !rejectNote.trim()} style={{ background: "var(--negative)" }} onClick={() => onReject(listing.id, rejectReason, rejectNote)}>Confirm rejection</DrButton>
              </div>
            </div>
          )}
        </div>

        {view === "review" && (
          <div style={{ flex: "none", display: "flex", alignItems: "center", gap: "10px", padding: "16px 24px", borderTop: "1px solid var(--border)", background: "var(--paper)" }}>
            <DrButton style={{ background: "var(--positive)", flex: 1 }} onClick={() => setView("approve")}><DrIcon name="check" size={15} /> Approve</DrButton>
            <DrButton variant="outline" style={{ borderColor: "var(--caution)", color: "var(--caution)", flex: 1 }} onClick={() => setView("return")}><DrIcon name="pencil" size={15} /> Return for edits</DrButton>
            <DrButton variant="ghost" style={{ color: "var(--text-muted)" }} onClick={() => setView("reject")}>Reject</DrButton>
          </div>
        )}
      </div>
    </div>
  );
}

Object.assign(window, { PA_ReviewDrawer });
