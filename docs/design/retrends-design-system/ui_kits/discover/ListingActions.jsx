// Udupi Property Tracker — Listing detail: gallery + buyer action panel.
// Exports: UPT_Gallery, UPT_ActionPanel, UPT_MobileBar, UPT_AreaTrends, UPT_PanelCard
(function () {
const { Button, Icon, Badge } = window.ReTrendsDesignSystem_f37966;

// ---- polished image placeholder -------------------------------------------
function Placeholder({ label, height, radius, small }) {
  return (
    <div style={{
      position: "relative", width: "100%", height: height || "100%", borderRadius: radius || 0, overflow: "hidden",
      background: "linear-gradient(160deg, var(--canvas-100) 0%, var(--canvas-200) 55%, var(--stone-300) 100%)",
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: small ? 0 : "12px",
    }}>
      <div style={{ position: "absolute", inset: 0, backgroundImage: "repeating-linear-gradient(135deg, transparent 0 17px, rgba(27,42,69,0.022) 17px 18px)", pointerEvents: "none" }} />
      <span style={{ position: "relative", width: small ? "26px" : "46px", height: small ? "26px" : "46px", borderRadius: "var(--radius-full)", background: "rgba(255,255,255,0.72)", border: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Icon name="camera" size={small ? 13 : 21} color="var(--grey-500)" strokeWidth={1.8} />
      </span>
      {!small && <span style={{ position: "relative", fontFamily: "var(--font-mono)", fontSize: "10.5px", letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--grey-500)" }}>{label}</span>}
    </div>
  );
}

// ---- round glass control on the gallery -----------------------------------
function GlassBtn({ icon, onClick, active, label }) {
  const [h, setH] = React.useState(false);
  return (
    <button onClick={onClick} aria-label={label} onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}
      style={{
        width: "38px", height: "38px", borderRadius: "var(--radius-full)", border: "1px solid rgba(255,255,255,0.6)",
        background: h ? "#fff" : "rgba(255,255,255,0.9)", backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)",
        display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
        boxShadow: "var(--shadow-sm)", transition: "background var(--dur-fast)",
      }}>
      <Icon name={icon} size={17} color={active ? "var(--accent)" : "var(--navy-800)"} />
    </button>
  );
}

// ---- gallery ---------------------------------------------------------------
function Gallery({ p, saved, onSave, noPhotos }) {
  const photos = noPhotos ? [] : (p.photos || []);
  const [i, setI] = React.useState(0);
  const has = photos.length > 0;
  const cur = has ? photos[i] : null;
  const go = (d) => setI((x) => (x + d + photos.length) % photos.length);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      <div style={{ position: "relative", height: "440px", borderRadius: "var(--radius-xl)", overflow: "hidden", border: "1px solid var(--border)", boxShadow: "var(--shadow-sm)" }}>
        {has ? <Placeholder label={cur.label} /> : (
          <div style={{ position: "relative", width: "100%", height: "100%", background: "linear-gradient(160deg, var(--canvas-100), var(--canvas-200))", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "12px", textAlign: "center", padding: "0 24px" }}>
            <span style={{ width: "56px", height: "56px", borderRadius: "var(--radius-xl)", background: "var(--paper)", border: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Icon name="camera" size={26} color="var(--grey-400)" />
            </span>
            <div style={{ fontSize: "16px", fontWeight: 700, color: "var(--text-strong)" }}>No photos yet</div>
            <div style={{ fontSize: "13.5px", color: "var(--text-muted)", maxWidth: "320px", lineHeight: 1.5 }}>This listing doesn't have photos yet. Request a viewing or ask the lister to add them.</div>
          </div>
        )}

        <div style={{ position: "absolute", top: "16px", left: "16px", display: "flex", gap: "8px" }}>
          <Badge tone={p.trustTier} pill style={{ padding: "5px 11px", boxShadow: "var(--shadow-xs)" }}>
            <Icon name={p.trustTier === "verified" ? "shield-check" : "shield"} size={13} />
            {p.trustTier === "verified" ? "Verified listing" : "Trusted listing"}
          </Badge>
          <Badge tone="neutral" pill style={{ background: "rgba(255,255,255,0.9)", color: "var(--text-body)", padding: "5px 11px", boxShadow: "var(--shadow-xs)" }}>
            <Icon name="calendar" size={12} />Updated {p.updated}
          </Badge>
        </div>

        <div style={{ position: "absolute", top: "16px", right: "16px", display: "flex", gap: "8px" }}>
          <GlassBtn icon="arrow-up-right" label="Share listing" />
          <GlassBtn icon="heart" label="Save listing" active={saved} onClick={onSave} />
        </div>

        {has && photos.length > 1 && (
          <React.Fragment>
            <button onClick={() => go(-1)} aria-label="Previous photo" style={navArrow("left")}><Icon name="chevron-right" size={18} color="var(--navy-800)" style={{ transform: "rotate(180deg)" }} /></button>
            <button onClick={() => go(1)} aria-label="Next photo" style={navArrow("right")}><Icon name="chevron-right" size={18} color="var(--navy-800)" /></button>
            <div style={{ position: "absolute", bottom: "14px", right: "16px", padding: "4px 11px", borderRadius: "var(--radius-full)", background: "rgba(14,22,38,0.72)", color: "#fff", fontFamily: "var(--font-mono)", fontSize: "12px", fontWeight: 500, backdropFilter: "blur(4px)" }}>{i + 1} / {photos.length}</div>
          </React.Fragment>
        )}
      </div>

      {has && (
        <div style={{ display: "flex", gap: "10px" }}>
          {photos.map((ph, idx) => (
            <button key={idx} onClick={() => setI(idx)} style={{
              width: "92px", height: "66px", flex: "none", padding: 0, borderRadius: "var(--radius-md)", overflow: "hidden", cursor: "pointer",
              border: idx === i ? "2px solid var(--navy-800)" : "1px solid var(--border)",
              boxShadow: idx === i ? "var(--shadow-sm)" : "none", background: "none",
            }}>
              <Placeholder label={ph.label} small />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
const navArrow = (side) => ({
  position: "absolute", top: "50%", transform: "translateY(-50%)", [side]: "14px",
  width: "38px", height: "38px", borderRadius: "var(--radius-full)", border: "1px solid var(--border)",
  background: "rgba(255,255,255,0.92)", backdropFilter: "blur(6px)", display: "flex", alignItems: "center", justifyContent: "center",
  cursor: "pointer", boxShadow: "var(--shadow-sm)",
});

// ============================================================================
//  Booking — request a viewing time (quick chips + 14-day calendar)
// ============================================================================
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DOW1 = ["S", "M", "T", "W", "T", "F", "S"];
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WINDOW = 14; // days the buyer can request across
const midnight = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const TODAY = midnight(new Date(2026, 5, 23)); // sample "today" for the mock
const addDays = (d, n) => { const x = new Date(d); x.setDate(d.getDate() + n); return x; };
const sameDay = (a, b) => a && b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
const longDate = (d) => `${DOW[d.getDay()]}, ${d.getDate()} ${MON[d.getMonth()]}`;

// Preferred-time options vary by weekday — these are buyer request slots, NOT confirmed availability.
function slotsFor(d) {
  const wd = d.getDay();
  if (wd === 0) return ["10:00 AM", "12:30 PM", "4:00 PM"];          // Sunday — fewer
  if (wd === 6) return ["9:00 AM", "11:00 AM", "1:00 PM", "4:00 PM", "6:00 PM"]; // Saturday — more
  return ["9:30 AM", "11:30 AM", "2:00 PM", "4:30 PM", "6:30 PM"];   // weekday
}

function MiniCalendar({ sel, onPick, last }) {
  const start = addDays(TODAY, -TODAY.getDay()); // Sunday of this week
  const weeks = []; let cur = new Date(start);
  while (cur <= last) { const row = []; for (let k = 0; k < 7; k++) { row.push(new Date(cur)); cur = addDays(cur, 1); } weeks.push(row); }
  const inWin = (d) => d >= TODAY && d <= last;
  const monthLabel = TODAY.getMonth() === last.getMonth() ? `${MON[TODAY.getMonth()]} ${TODAY.getFullYear()}` : `${MON[TODAY.getMonth()]} – ${MON[last.getMonth()]} ${last.getFullYear()}`;
  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: "var(--radius-md)", padding: "12px", marginTop: "10px", background: "var(--surface-subtle)" }}>
      <div style={{ fontSize: "12px", fontWeight: 700, color: "var(--text-strong)", textAlign: "center", marginBottom: "8px" }}>{monthLabel}</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: "3px", marginBottom: "4px" }}>
        {DOW1.map((d, i) => <div key={i} style={{ textAlign: "center", fontSize: "10px", fontWeight: 700, color: "var(--text-muted)" }}>{d}</div>)}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "3px" }}>
        {weeks.map((row, wi) => (
          <div key={wi} style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: "3px" }}>
            {row.map((d, di) => {
              const ok = inWin(d), on = sameDay(d, sel), isToday = sameDay(d, TODAY);
              return (
                <button key={di} disabled={!ok} onClick={() => ok && onPick(d)} title={ok ? longDate(d) : "Not available for requests"}
                  style={{
                    height: "30px", borderRadius: "var(--radius-sm)", cursor: ok ? "pointer" : "default",
                    fontFamily: "var(--font-mono)", fontSize: "12.5px", fontWeight: on ? 700 : 500,
                    border: on ? "1px solid var(--navy-800)" : isToday && ok ? "1px solid var(--border-strong)" : "1px solid transparent",
                    background: on ? "var(--navy-800)" : ok ? "var(--paper)" : "transparent",
                    color: on ? "#fff" : ok ? "var(--text-strong)" : "var(--grey-300)",
                  }}>{d.getDate()}</button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

function Booking({ signedIn, brokerAvailable }) {
  const [sel, setSel] = React.useState(null);
  const [slot, setSlot] = React.useState(null);
  const [cal, setCal] = React.useState(false);
  const [status, setStatus] = React.useState("idle"); // idle | loading | sent
  const [name, setName] = React.useState("");
  const [contact, setContact] = React.useState("");

  const last = addDays(TODAY, WINDOW - 1);
  const quick = []; for (let k = 0; k < 5; k++) { const d = addDays(TODAY, k); quick.push({ d, label: k === 0 ? "Today" : k === 1 ? "Tom" : DOW[d.getDay()] }); }
  const pick = (d) => { setSel(d); setSlot(null); };          // new date → reset slot (slots update per date)
  const inQuick = sel && quick.some((q) => sameDay(q.d, sel));
  const anonReady = signedIn || (name.trim() && contact.trim());
  const canSubmit = sel && slot && anonReady && status === "idle";
  const submit = () => { if (!canSubmit) return; setStatus("loading"); setTimeout(() => setStatus("sent"), 1100); };

  // broker unavailable / no request times
  if (!brokerAvailable) {
    return (
      <div style={{ background: "var(--surface-subtle)", borderRadius: "var(--radius-md)", padding: "16px" }}>
        <div style={{ display: "flex", gap: "10px" }}>
          <Icon name="calendar" size={18} color="var(--grey-400)" style={{ flex: "none", marginTop: "1px" }} />
          <div>
            <div style={{ fontSize: "14px", fontWeight: 700, color: "var(--text-strong)", marginBottom: "3px" }}>Viewing requests aren't open yet</div>
            <div style={{ fontSize: "12.5px", color: "var(--text-body)", lineHeight: 1.55 }}>No broker is assigned to this listing yet, so we can't take a viewing request. Send a message below and our team will help arrange one.</div>
          </div>
        </div>
      </div>
    );
  }

  if (status === "sent") {
    return (
      <Notice tone="positive" icon="check" title="Viewing request sent"
        body={`We've passed on your preferred time — ${longDate(sel)}${slot ? ", " + slot : ""}. This is a request, not a confirmed booking: the lister will get back to you to lock in a final time.`}>
        <Button variant="outline" size="sm" onClick={() => { setStatus("idle"); setSel(null); setSlot(null); setCal(false); }}>Request another time</Button>
      </Notice>
    );
  }

  const loading = status === "loading";
  const slots = sel ? slotsFor(sel) : [];

  return (
    <div>
      <div style={{ fontSize: "15px", fontWeight: 700, color: "var(--text-strong)", marginBottom: "3px" }}>Request a viewing time</div>
      <p style={{ margin: "0 0 12px", fontSize: "12px", color: "var(--text-muted)", lineHeight: 1.45 }}>Pick a preferred day and time in the next 2 weeks — the lister confirms the final slot.</p>

      {/* quick date chips */}
      <div style={{ display: "flex", gap: "7px", marginBottom: "8px" }}>
        {quick.map((q, idx) => {
          const on = sameDay(q.d, sel);
          return (
            <button key={idx} onClick={() => pick(q.d)} disabled={loading} style={{
              flex: 1, padding: "8px 0", borderRadius: "var(--radius-md)", cursor: loading ? "default" : "pointer",
              border: on ? "1px solid var(--navy-800)" : "1px solid var(--border)", background: on ? "var(--navy-800)" : "var(--paper)",
              display: "flex", flexDirection: "column", alignItems: "center", gap: "1px",
            }}>
              <span style={{ fontSize: "10px", fontWeight: 600, color: on ? "rgba(255,255,255,0.7)" : "var(--text-muted)" }}>{q.label}</span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: "14px", fontWeight: 600, color: on ? "#fff" : "var(--text-strong)" }}>{q.d.getDate()}</span>
            </button>
          );
        })}
      </div>

      {/* more dates / calendar toggle */}
      <button onClick={() => setCal(!cal)} disabled={loading} style={{
        display: "inline-flex", alignItems: "center", gap: "6px", border: "none", background: "none", cursor: loading ? "default" : "pointer",
        fontFamily: "var(--font-sans)", fontSize: "12.5px", fontWeight: 600, color: "var(--navy-700)", padding: "2px 0",
      }}>
        <Icon name="calendar" size={14} />{cal ? "Hide calendar" : "Choose another date"}<Icon name="chevron-down" size={13} style={{ transform: cal ? "rotate(180deg)" : "none" }} />
      </button>
      {cal && <MiniCalendar sel={sel} onPick={pick} last={last} />}
      {cal && <div style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "6px" }}>Requests open through {longDate(last)}.</div>}

      {/* selected-date echo when chosen outside the quick chips */}
      {sel && !inQuick && (
        <div style={{ display: "inline-flex", alignItems: "center", gap: "7px", marginTop: "10px", padding: "5px 11px", borderRadius: "var(--radius-full)", background: "var(--navy-100)", fontSize: "12.5px", fontWeight: 600, color: "var(--navy-800)" }}>
          <Icon name="calendar" size={13} />{longDate(sel)}
        </div>
      )}

      {/* time slots — appear once a date is picked, update per date */}
      {sel && (
        <div style={{ marginTop: "16px" }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: "7px", marginBottom: "9px" }}>
            <span style={{ fontSize: "13px", fontWeight: 700, color: "var(--text-strong)" }}>Preferred time</span>
            <span style={{ fontSize: "11.5px", color: "var(--text-muted)" }}>· {longDate(sel)}</span>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "7px" }}>
            {slots.map((s) => {
              const on = slot === s;
              return (
                <button key={s} onClick={() => setSlot(s)} disabled={loading} style={{
                  padding: "7px 13px", borderRadius: "var(--radius-full)", cursor: loading ? "default" : "pointer",
                  fontFamily: "var(--font-mono)", fontSize: "12.5px", fontWeight: 500,
                  border: on ? "1px solid var(--accent)" : "1px solid var(--border)",
                  background: on ? "var(--accent-tint)" : "var(--paper)", color: on ? "var(--accent-hover)" : "var(--text-body)",
                }}>{s}</button>
              );
            })}
          </div>
        </div>
      )}

      {/* anonymous — ask for contact (or sign in) before submitting */}
      {sel && slot && !signedIn && (
        <div style={{ marginTop: "16px", paddingTop: "14px", borderTop: "1px solid var(--border)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "9px" }}>
            <span style={{ fontSize: "12.5px", fontWeight: 700, color: "var(--text-strong)" }}>How should the lister reach you?</span>
            <a href="#" style={{ fontSize: "12px", fontWeight: 600, color: "var(--navy-700)", textDecoration: "none" }}>Sign in</a>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            <Field placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} />
            <Field placeholder="Phone or email" value={contact} onChange={(e) => setContact(e.target.value)} />
          </div>
        </div>
      )}

      <div style={{ marginTop: "16px" }}>
        <Button variant="accent" size="lg" fullWidth disabled={!canSubmit} onClick={submit}>
          {loading ? <React.Fragment><Spinner />Sending request…</React.Fragment> : <React.Fragment><Icon name="calendar" size={16} />Request viewing time</React.Fragment>}
        </Button>
        <p style={{ margin: "9px 0 0", fontSize: "11.5px", color: "var(--text-muted)", lineHeight: 1.5, textAlign: "center" }}>
          {!sel ? "Pick a day to see preferred times." : !slot ? "Pick a preferred time to continue." : "These are your preferred times — not a confirmed booking. The lister confirms the final slot."}
        </p>
      </div>
    </div>
  );
}

// ---- contact broker --------------------------------------------------------
function Contact({ brokerAvailable, signedIn }) {
  const [open, setOpen] = React.useState(false);
  const [status, setStatus] = React.useState("idle");
  const send = () => { setStatus("loading"); setTimeout(() => setStatus("sent"), 1000); };

  if (status === "sent") {
    return <Notice tone="positive" icon="check" title="Message sent"
      body="Your message has been passed on. If a verified broker is assigned to this listing, they'll reply to you — usually within a day." />;
  }

  if (!open) {
    return (
      <div>
        <Button variant="outline" size="lg" fullWidth onClick={() => setOpen(true)}>
          <Icon name="message-circle" size={16} />{brokerAvailable ? "Contact broker" : "Ask about this listing"}
        </Button>
        <div style={{ display: "flex", alignItems: "flex-start", gap: "8px", marginTop: "12px", fontSize: "12.5px", color: "var(--text-muted)", lineHeight: 1.5 }}>
          <Icon name={brokerAvailable ? "shield-check" : "users"} size={14} color={brokerAvailable ? "var(--evergreen-600)" : "var(--grey-400)"} style={{ flex: "none", marginTop: "1px" }} />
          {brokerAvailable
            ? "Listed by a verified broker. We pass your message on — no numbers shared until you both agree."
            : "No broker is assigned yet. Send a message and our team will help you reach the lister."}
        </div>
      </div>
    );
  }

  const loading = status === "loading";
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: "13px", fontWeight: 700, color: "var(--text-strong)" }}>Send a message</span>
        <button onClick={() => setOpen(false)} aria-label="Close" style={{ border: "none", background: "none", cursor: "pointer", padding: 0, display: "flex" }}><Icon name="x" size={16} color="var(--text-muted)" /></button>
      </div>
      {!signedIn && <Field placeholder="Your name" />}
      {!signedIn && <Field placeholder="Phone or email" />}
      <textarea defaultValue={"Hi, I'm interested in this listing. Is it still available, and can I arrange a viewing?"} rows={3} style={{
        width: "100%", resize: "vertical", padding: "10px 12px", borderRadius: "var(--radius-md)", border: "1px solid var(--border-strong)",
        background: "var(--input-bg)", fontFamily: "var(--font-sans)", fontSize: "13.5px", color: "var(--text-strong)", lineHeight: 1.5, boxSizing: "border-box",
      }} />
      <Button variant="primary" size="md" fullWidth disabled={loading} onClick={send}>
        {loading ? <React.Fragment><Spinner />Sending…</React.Fragment> : <React.Fragment><Icon name="arrow-right" size={15} />Send message</React.Fragment>}
      </Button>
    </div>
  );
}
function Field(props) {
  return <input {...props} style={{ width: "100%", height: "38px", padding: "0 12px", borderRadius: "var(--radius-md)", border: "1px solid var(--border-strong)", background: "var(--input-bg)", fontFamily: "var(--font-sans)", fontSize: "13.5px", color: "var(--text-strong)", boxSizing: "border-box" }} />;
}

// ---- small shared bits -----------------------------------------------------
function Spinner() {
  return <span style={{ width: "15px", height: "15px", borderRadius: "50%", border: "2px solid rgba(255,255,255,0.4)", borderTopColor: "#fff", display: "inline-block", animation: "upt-spin 0.7s linear infinite" }} />;
}
function Notice({ tone, icon, title, body, children }) {
  const fg = tone === "negative" ? "var(--negative)" : "var(--positive)";
  const bg = tone === "negative" ? "var(--negative-bg)" : "var(--positive-bg)";
  return (
    <div style={{ background: bg, borderRadius: "var(--radius-md)", padding: "16px" }}>
      <div style={{ display: "flex", gap: "10px", marginBottom: children ? "12px" : 0 }}>
        <Icon name={icon} size={18} color={fg} strokeWidth={2.2} style={{ flex: "none", marginTop: "1px" }} />
        <div>
          <div style={{ fontSize: "14px", fontWeight: 700, color: "var(--text-strong)", marginBottom: "3px" }}>{title}</div>
          <div style={{ fontSize: "12.5px", color: "var(--text-body)", lineHeight: 1.55, textWrap: "pretty" }}>{body}</div>
        </div>
      </div>
      {children}
    </div>
  );
}
function PanelCard({ children, pad }) {
  return <div style={{ background: "var(--paper)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", padding: pad || "20px", boxShadow: "var(--shadow-sm)" }}>{children}</div>;
}

// ---- area trends CTA (route-ready) ----------------------------------------
function AreaTrends({ p }) {
  const href = `/trends/${p.citySlug}/areas/${p.areaSlug}`;
  return (
    <a href={href} style={{ display: "block", textDecoration: "none", position: "relative", overflow: "hidden", background: "var(--navy-800)", borderRadius: "var(--radius-xl)", padding: "22px" }}>
      <div style={{ position: "absolute", bottom: "-50px", right: "-30px", width: "200px", height: "200px", borderRadius: "var(--radius-full)", background: "radial-gradient(circle at 40% 40%, rgba(176,92,58,0.30), transparent 65%)", pointerEvents: "none" }} />
      <div style={{ position: "relative" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "10px" }}>
          <Icon name="trending-up" size={17} color="var(--copper-400)" />
          <span style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "var(--tracking-caps)", textTransform: "uppercase", color: "var(--copper-400)" }}>Area insights</span>
        </div>
        <div style={{ fontFamily: "var(--font-serif)", fontSize: "20px", fontWeight: 600, color: "#fff", letterSpacing: "-0.01em", marginBottom: "6px" }}>See area insights for {p.area}</div>
        <p style={{ margin: "0 0 14px", fontSize: "13px", lineHeight: 1.55, color: "rgba(255,255,255,0.72)" }}>Price context, how active the market is, nearby schools and whether {p.area} fits what you're looking for.</p>
        <span style={{ display: "inline-flex", alignItems: "center", gap: "7px", fontSize: "13.5px", fontWeight: 600, color: "#fff" }}>View trends in this area<Icon name="arrow-right" size={15} color="var(--copper-400)" /></span>
      </div>
    </a>
  );
}

// ---- full action panel (the main action hub) -------------------------------
function ActionPanel({ p, saved, onSave, signedIn, brokerAvailable }) {
  return (
    <div style={{ position: "sticky", top: "84px", display: "flex", flexDirection: "column", gap: "16px" }}>
      <PanelCard>
        {signedIn && (
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "14px", paddingBottom: "14px", borderBottom: "1px solid var(--border)" }}>
            <span style={{ width: "30px", height: "30px", borderRadius: "var(--radius-full)", background: "var(--navy-800)", color: "#fff", fontSize: "12px", fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center" }}>PK</span>
            <span style={{ fontSize: "13px", color: "var(--text-body)" }}>Signed in as <strong style={{ color: "var(--text-strong)" }}>Priya K.</strong></span>
          </div>
        )}
        <Booking signedIn={signedIn} brokerAvailable={brokerAvailable} />
        <div style={{ height: "1px", background: "var(--border)", margin: "18px 0" }} />
        <Contact brokerAvailable={brokerAvailable} signedIn={signedIn} />
        <Button variant={saved ? "secondary" : "ghost"} size="md" fullWidth onClick={onSave} style={{ marginTop: "12px" }}>
          <Icon name="heart" size={16} color={saved ? "var(--accent)" : "currentColor"} />{saved ? "Saved to favourites" : "Save listing"}
        </Button>
      </PanelCard>
      <AreaTrends p={p} />
    </div>
  );
}

// ---- mobile sticky bottom bar ----------------------------------------------
function MobileBar({ saved, onSave }) {
  return (
    <div className="upt-mobilebar" style={{
      position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 50, display: "none",
      background: "var(--paper)", borderTop: "1px solid var(--border)", boxShadow: "0 -4px 16px rgba(17,24,39,0.08)",
      padding: "10px 14px calc(10px + env(safe-area-inset-bottom))", gap: "10px", alignItems: "center",
    }}>
      <button onClick={onSave} aria-label="Save" style={{ width: "48px", height: "46px", flex: "none", borderRadius: "var(--radius-md)", border: "1px solid var(--border-strong)", background: "var(--paper)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
        <Icon name="heart" size={19} color={saved ? "var(--accent)" : "var(--navy-800)"} />
      </button>
      <Button variant="outline" size="lg" style={{ flex: 1 }}><Icon name="message-circle" size={16} />Contact</Button>
      <Button variant="accent" size="lg" style={{ flex: 1.3 }}><Icon name="calendar" size={16} />Request viewing</Button>
    </div>
  );
}

Object.assign(window, { UPT_Placeholder: Placeholder, UPT_Gallery: Gallery, UPT_ActionPanel: ActionPanel, UPT_MobileBar: MobileBar, UPT_AreaTrends: AreaTrends, UPT_PanelCard: PanelCard });
})();
