// Udupi agri-discovery — split layout shell. Exports window.AgriDiscovery
// 48% map · 52% panel, one warm surface, selection synced between them.
function AgriDiscovery() {
  const [mode, setMode] = React.useState("Buy");
  const [selectedGroup, setSelectedGroup] = React.useState(null);

  return (
    <div style={{
      display: "grid", gridTemplateColumns: "48fr 52fr",
      height: "calc(100vh - 60px)", background: "var(--background)",
    }}>
      <div style={{ position: "relative", borderRight: "1px solid var(--border)" }}>
        <window.AgriMap groups={window.AGRI_DATA.groups} selectedGroup={selectedGroup} onPickGroup={(id) => setSelectedGroup(selectedGroup === id ? null : id)} />
      </div>
      <window.AgriPanel mode={mode} setMode={setMode} selectedGroup={selectedGroup} setSelectedGroup={setSelectedGroup} />
    </div>
  );
}

window.AgriDiscovery = AgriDiscovery;
