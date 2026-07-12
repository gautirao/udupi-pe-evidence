import fs from "node:fs";
const src = "src/pages/broker/__tests__/EditListing.guard.test.tsx";
const dst = "src/pages/broker/__tests__/EditListing.guard.probe.test.tsx";
let s = fs.readFileSync(src, "utf8");

// FIX under test: make useGetListing return a STABLE (module-level, hoisted) data
// object so `listing` identity is stable across renders → the [listing] effect
// stops firing every render → loop terminates.
// 1) Add a hoisted stable object next to mockRole.
s = s.replace(
  "const mockRole = vi.hoisted(() => ({ current: 'broker' as string | null }));",
  "const mockRole = vi.hoisted(() => ({ current: 'broker' as string | null }));\n" +
  "const stableListing = vi.hoisted(() => ({ id: '123', status: 'DRAFT', propertyType: 'land' }));"
);
// 2) Point the mock's data at the stable object instead of a fresh literal.
s = s.replace(
  "    data: { id: '123', status: 'DRAFT', propertyType: 'land' },",
  "    data: stableListing,"
);

fs.writeFileSync(dst, s);
console.log("probe written to " + dst);
