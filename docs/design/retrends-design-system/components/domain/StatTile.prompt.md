One-line: KPI tile for trends/area dashboards — uppercase label, mono value, colored trend delta.

```jsx
<StatTile label="Avg. price" value="₹1.42" unit="Cr" delta="12.4%" hint="vs last year" />
<StatTile label="Per sq.ft" value="₹8,750" delta="-2.1%" />
<StatTile label="Active listings" value="428" />
```

Delta direction is inferred from a leading "-" (negative = red `trending-down`), or force it with `deltaDir`. Lay several out in a flex/grid row.
