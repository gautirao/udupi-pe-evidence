One-line: Text input on the warm `--input-bg` fill, with label/hint/error and inline icons.

```jsx
<Input label="Locality" placeholder="Search localities…"
       leadingIcon={<Icon name="map-pin" size={16} />} />
<Input label="Budget" hint="Enter max price in ₹" />
<Input error="Required field" placeholder="Email" />
```

Focus shows a navy ring. Pass `leadingIcon`/`trailingIcon` as `<Icon>` nodes. Sizes sm/md/lg.
