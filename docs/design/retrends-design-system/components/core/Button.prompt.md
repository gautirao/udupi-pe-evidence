One-line: ReTrends button — ink-navy `primary` for default actions, restrained copper `accent` for the one hero CTA per view.

```jsx
<Button variant="primary">Explore on map</Button>
<Button variant="accent" size="lg"><Icon name="search" size={18} />Search</Button>
<Button variant="outline" size="sm">View all trends</Button>
<Button variant="ghost" size="icon"><Icon name="heart" size={18} /></Button>
```

Variants: primary · accent · secondary · outline · ghost · link. Sizes: sm · md · lg · icon. Icons go inline as `<Icon>` children. Hover lifts 1px + darkens; disabled drops to 50% opacity. Don't use more than one `accent` button per screen.
