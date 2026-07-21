// Udupi agri-discovery — CORRIDOR-SELECTION shell. Exports window.CorridorDiscovery
// 48% map · 52% panel. Hover + selection state is shared so the directional cue on the
// map and the corridor card on the right stay in sync.
function CorridorDiscovery() {
  const [mode, setMode] = React.useState("Buy");
  const [selected, setSelected] = React.useState(null);
  const [hovered, setHovered] = React.useState(null);
  const active = hovered || selected;

  return (
    <div style={{
      display: "grid", gridTemplateColumns: "48fr 52fr",
      height: "calc(100vh - 60px)", background: "var(--background)",
    }}>
      <div style={{ position: "relative", borderRight: "1px solid var(--border)" }}>
        <window.CorridorMap
          corridors={window.CORRIDOR_DATA.corridors}
          city={window.CORRIDOR_DATA.city}
          active={active}
          onPick={(id) => setSelected(selected === id ? null : id)}
          onHover={setHovered}
        />
      </div>
      <window.CorridorPanel
        mode={mode} setMode={setMode}
        selected={selected} setSelected={setSelected}
        hovered={hovered} setHovered={setHovered}
      />
    </div>
  );
}

window.CorridorDiscovery = CorridorDiscovery;
