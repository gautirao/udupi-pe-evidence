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

  it('echoes exactly the facts entered, mapping canonical crop machine values to labels, without a verification claim', () => {
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
      crops: ['ARECA_SUPARI', 'COCONUT'],
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
    // Machine value must never leak into buyer-facing prose.
    expect(text).not.toMatch(/ARECA_SUPARI/);
    expect(text.toLowerCase()).toContain('areca / supari');
    expect(text.toLowerCase()).toContain('coconut');
    expect(text).toContain('as noted by the seller');
    expect(text).toMatch(/priced at/i);
    expect(text).not.toMatch(/verified/i);
    expect(text).not.toMatch(/ai.?generated/i);
  });

  it('AC13: lists ALL selected crops, not just the first 4 — crops are a bounded 12-value enum, not free text', () => {
    const facts: AgriculturalDescriptionFacts = {
      ...EMPTY_FACTS,
      locality: 'Manipal',
      landArea: 3,
      landAreaUnit: 'acre',
      crops: ['PADDY', 'COCONUT', 'ARECA_SUPARI', 'CASHEW', 'BANANA', 'SUGARCANE'],
      priceRupees: 5_000_000,
    };
    const text = buildAgriculturalDescription(facts, 'default').toLowerCase();
    expect(text).toContain('paddy');
    expect(text).toContain('coconut');
    expect(text).toContain('areca / supari');
    expect(text).toContain('cashew');
    expect(text).toContain('banana');
    expect(text).toContain('sugarcane');
  });

  it('AC11: regenerating (rebuilding) after a crop is removed drops it from the text — the builder is wholesale, not additive', () => {
    const withTwoCrops: AgriculturalDescriptionFacts = {
      ...EMPTY_FACTS,
      locality: 'Manipal',
      landArea: 1,
      landAreaUnit: 'acre',
      crops: ['COCONUT', 'PEPPER'],
      priceRupees: 1_000_000,
    };
    const firstText = buildAgriculturalDescription(withTwoCrops, 'default');
    expect(firstText.toLowerCase()).toContain('pepper');

    // Broker removes 'Pepper' and regenerates — the assistant calls the
    // builder fresh with the current facts (AgriculturalDescriptionAssistant
    // REPLACES the description wholesale on Regenerate, never appends).
    const afterRemoval: AgriculturalDescriptionFacts = { ...withTwoCrops, crops: ['COCONUT'] };
    const secondText = buildAgriculturalDescription(afterRemoval, 'default');
    expect(secondText.toLowerCase()).not.toContain('pepper');
    expect(secondText.toLowerCase()).toContain('coconut');
  });

  it('short tone omits crops/features and stays to two sentences', () => {
    const facts: AgriculturalDescriptionFacts = {
      ...EMPTY_FACTS,
      locality: 'Manipal',
      landArea: 1,
      landAreaUnit: 'acre',
      crops: ['COCONUT'],
      priceRupees: 1_000_000,
    };
    const text = buildAgriculturalDescription(facts, 'short');
    expect(text.split(/(?<=\.)\s/).length).toBeLessThanOrEqual(2);
  });
});
