import { describe, it, expect } from 'vitest';
import { buildAgriculturalDescription, type AgriculturalDescriptionFacts } from '../agriculturalDescriptionBuilder';

const EMPTY_FACTS: AgriculturalDescriptionFacts = {
  locality: '',
  landArea: null,
  landAreaUnit: 'acre',
  facing: '',
  waterSource: '',
  soilType: '',
  roadAccess: '',
  cultivationStatus: '',
  landCategory: '',
  farmhouseAvailable: '',
  fencingDone: '',
  crops: [],
  features: [],
  priceRupees: null,
};

describe('buildAgriculturalDescription — no-fabrication guarantee', () => {
  it('composes only entered facts and stays generic when nothing is filled in', () => {
    const text = buildAgriculturalDescription(EMPTY_FACTS, 'default');
    expect(text.toLowerCase()).toContain('agricultural land');
    expect(text).not.toMatch(/verified/i);
    expect(text).not.toMatch(/guaranteed/i);
    expect(text).not.toMatch(/yield/i);
    expect(text).not.toMatch(/approved/i);
    expect(text).not.toMatch(/legal/i);
    expect(text).not.toMatch(/ai.?generated/i);
  });

  it('never invents a price, crops, or land-record details that were not entered', () => {
    const text = buildAgriculturalDescription(EMPTY_FACTS, 'default');
    expect(text).not.toMatch(/priced at/i);
    expect(text).not.toMatch(/grown/i);
    expect(text).not.toMatch(/fenced/i);
    expect(text).not.toMatch(/farmhouse/i);
  });

  it('echoes exactly the facts entered, including FE-only crops/features, without a verification claim', () => {
    const facts: AgriculturalDescriptionFacts = {
      ...EMPTY_FACTS,
      locality: 'Hejamadi, Udupi',
      landArea: 2.5,
      landAreaUnit: 'acre',
      waterSource: 'BOREWELL',
      soilType: 'RED_LATERITE',
      roadAccess: 'TARRED_ROAD',
      cultivationStatus: 'CULTIVATED',
      landCategory: 'FARMLAND',
      farmhouseAvailable: 'true',
      fencingDone: 'true',
      crops: ['Areca nut', 'Coconut'],
      features: ['Irrigation channel'],
      priceRupees: 7_800_000,
    };
    const text = buildAgriculturalDescription(facts, 'default');
    expect(text).toContain('Hejamadi, Udupi');
    expect(text).toContain('2.5 acre');
    expect(text.toLowerCase()).toContain('borewell');
    expect(text.toLowerCase()).toContain('red laterite');
    expect(text.toLowerCase()).toContain('farmhouse on the land');
    expect(text.toLowerCase()).toContain('fenced');
    expect(text.toLowerCase()).toContain('areca nut');
    expect(text).toContain('as noted by the seller');
    expect(text).toMatch(/priced at/i);
    expect(text).not.toMatch(/verified/i);
    expect(text).not.toMatch(/ai.?generated/i);
  });

  it('short tone omits crops/features and stays to two sentences', () => {
    const facts: AgriculturalDescriptionFacts = {
      ...EMPTY_FACTS,
      locality: 'Manipal',
      landArea: 1,
      landAreaUnit: 'acre',
      crops: ['Coconut'],
      priceRupees: 1_000_000,
    };
    const text = buildAgriculturalDescription(facts, 'short');
    expect(text.split(/(?<=\.)\s/).length).toBeLessThanOrEqual(2);
  });
});
