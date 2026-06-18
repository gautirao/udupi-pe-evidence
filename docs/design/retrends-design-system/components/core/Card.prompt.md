One-line: White paper container — the base surface for ReTrends content; add `interactive` for clickable cards.

```jsx
<Card>
  <CardTitle>Koramangala</CardTitle>
  <CardDescription>42 listings · comprehensive market data</CardDescription>
</Card>

<Card interactive onClick={go}>…</Card>
```

`padding`: none/sm/md/lg (default lg). `interactive` adds a 2px hover lift + shadow. Compose freely with Badge, Button, StatTile inside.
