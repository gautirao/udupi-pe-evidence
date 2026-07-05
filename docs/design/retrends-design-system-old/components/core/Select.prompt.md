One-line: Native-backed styled dropdown matching the Input fill, with a Lucide chevron.

```jsx
<Select label="City" value={city} onChange={e => setCity(e.target.value)}
        options={["Bangalore", "Udupi", "Mangalore"]} />
<Select label="Type" options={[{value:"sale",label:"Buy"},{value:"rent",label:"Rent"}]} />
```

Options accept plain strings or `{value,label}`. Same warm fill + navy focus ring as Input.
