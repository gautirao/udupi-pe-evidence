/**
 * PROPERTY_TYPE_VISUAL_MAP — canonical per-type visual config for map markers and legend.
 *
 * Colours are grounded in the ReTrends design source:
 *   navy    #26395B  (apartment)
 *   copper  #B05C3A  (villa / house — matches existing --copper token)
 *   evergreen #1F7A5C (land — matches existing --evergreen token)
 *   grey    #6B7280  (commercial / warehouse / other — neutral fallback)
 *
 * The icon field names reference lucide-react components but are stored here as
 * string glyph keys ('building' | 'home' | 'landplot') so that PropertyMap.tsx
 * can inline SVG paths in divIcon HTML without importing React into a raw-string
 * context. MapMarkerLegend uses the glyph key to select the right SVG path too.
 *
 * tintBg / tintFg / dotColour: used by MapMarkerLegend disc rendering if needed.
 * These shadow the existing CSS token tints for symmetry but are not required by all consumers.
 */
export type PropertyTypeGlyph = 'building' | 'home' | 'landplot';

export interface PropertyTypeVisual {
  colour: string;
  label: string;
  glyph: PropertyTypeGlyph;
  tintBg: string;
  tintFg: string;
}

/**
 * Inline SVG path data for each glyph, sized for a 12×12 viewport.
 * Paths are simplified single-colour fills suitable for white-on-coloured-disc use.
 */
export const GLYPH_SVG_PATHS: Record<PropertyTypeGlyph, string> = {
  building:
    // Simplified Building2-style: two rectangles stacked (windows omitted for pixel clarity)
    'M2 12V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v8M0 12h12M4 7h1M7 7h1M4 9.5h1M7 9.5h1',
  home:
    // Home icon: roof triangle + door
    'M1 6L6 1l5 5M2 5.5V11a1 1 0 0 0 1 1h2V8h2v4h2a1 1 0 0 0 1-1V5.5',
  landplot:
    // LandPlot: boundary rectangle + tree/plant glyph
    'M1 10h10M1 10V2h10v8M4 7v3M8 7v3M4 7a2 2 0 0 1 4 0',
};

export const PROPERTY_TYPE_VISUAL_MAP: Record<string, PropertyTypeVisual> = {
  apartment: {
    colour: '#26395B',
    label: 'Apartments',
    glyph: 'building',
    tintBg: 'hsl(220 26% 93%)',  // --secondary (navy tint)
    tintFg: 'hsl(219 44% 19%)',  // --secondary-foreground
  },
  villa: {
    colour: '#B05C3A',
    label: 'Villas',
    glyph: 'home',
    tintBg: 'hsl(25 39% 92%)',   // --copper-tint
    tintFg: 'hsl(18 51% 46%)',   // --copper
  },
  house: {
    colour: '#B05C3A',
    label: 'Houses',
    glyph: 'home',
    tintBg: 'hsl(25 39% 92%)',
    tintFg: 'hsl(18 51% 46%)',
  },
  land: {
    colour: '#1F7A5C',
    label: 'Plots / land',
    glyph: 'landplot',
    tintBg: 'hsl(156 25% 93%)',  // --evergreen-tint
    tintFg: 'hsl(160 60% 30%)',  // --evergreen
  },
  commercial: {
    colour: '#6B7280',
    label: 'Other',
    glyph: 'building',
    tintBg: 'hsl(220 9% 92%)',
    tintFg: 'hsl(220 9% 46%)',
  },
  commercial_building: {
    colour: '#6B7280',
    label: 'Other',
    glyph: 'building',
    tintBg: 'hsl(220 9% 92%)',
    tintFg: 'hsl(220 9% 46%)',
  },
  warehouse: {
    colour: '#6B7280',
    label: 'Other',
    glyph: 'building',
    tintBg: 'hsl(220 9% 92%)',
    tintFg: 'hsl(220 9% 46%)',
  },
  commercial_land: {
    colour: '#6B7280',
    label: 'Other',
    glyph: 'landplot',
    tintBg: 'hsl(220 9% 92%)',
    tintFg: 'hsl(220 9% 46%)',
  },
  other: {
    colour: '#6B7280',
    label: 'Other',
    glyph: 'building',
    tintBg: 'hsl(220 9% 92%)',
    tintFg: 'hsl(220 9% 46%)',
  },
};

/** Grey fallback for unknown / unlisted property types. */
const FALLBACK_VISUAL: PropertyTypeVisual = PROPERTY_TYPE_VISUAL_MAP['other'];

/**
 * Returns the visual config for the given property_type string.
 * Falls back to the grey "Other" config for any unrecognised type.
 */
export function getPropertyTypeVisual(type: string): PropertyTypeVisual {
  return PROPERTY_TYPE_VISUAL_MAP[type] ?? FALLBACK_VISUAL;
}
