import { describe, it, expect } from 'vitest';
import { personTints } from './personColor.js';
import { factFor, PERSON_FACTS } from './personFacts.js';

describe('personTints', () => {
  it('reproduces the agreed purple exactly', () => {
    const t = personTints('#7f77dd');
    expect(t.stripe).toBe('#7f77dd');
    expect(t.header).toBe('#f2f1fc');
    expect(t.body).toBe('#f6f5fd');
  });

  it('makes the body lighter than the header, and the border darker than both', () => {
    const { header, body, border } = personTints('#378add');
    const lum = (h) => parseInt(h.slice(1, 3), 16) + parseInt(h.slice(3, 5), 16) + parseInt(h.slice(5, 7), 16);
    expect(lum(body)).toBeGreaterThan(lum(header));
    expect(lum(border)).toBeLessThan(lum(header));
  });

  it('falls back to neutral grey for a blank or malformed colour', () => {
    for (const bad of ['', null, undefined, 'nonsense', '#12']) {
      expect(personTints(bad).stripe).toBe('#6b7280');
    }
  });

  it('accepts shorthand hex', () => {
    expect(personTints('#abc').stripe).toBe('#abc');
    expect(personTints('#abc').header).toMatch(/^#[0-9a-f]{6}$/);
  });
});

describe('factFor', () => {
  it('gives every person 60 facts', () => {
    for (const id of Object.keys(PERSON_FACTS)) {
      expect(PERSON_FACTS[id].length).toBe(60);
    }
  });

  it('is stable for a given day, so it does not flicker on refresh', () => {
    expect(factFor('rachel', '2026-10-19')).toBe(factFor('rachel', '2026-10-19'));
  });

  it('changes from one day to the next', () => {
    expect(factFor('rachel', '2026-10-19')).not.toBe(factFor('rachel', '2026-10-20'));
  });

  it('runs 60 days without repeating', () => {
    const seen = new Set();
    for (let i = 0; i < 60; i++) {
      const d = new Date(Date.UTC(2026, 9, 19) + i * 86400000).toISOString().slice(0, 10);
      seen.add(factFor('will', d));
    }
    expect(seen.size).toBe(60);
  });

  it('returns empty for a person with no list, rather than throwing', () => {
    expect(factFor('nobody', '2026-10-19')).toBe('');
    expect(factFor(undefined, '2026-10-19')).toBe('');
  });

  it('does not advance all five lists in lockstep', () => {
    const idx = ['neal', 'rachel', 'elmira', 'will', 'claire']
      .map((p) => PERSON_FACTS[p].indexOf(factFor(p, '2026-10-19')));
    expect(new Set(idx).size).toBeGreaterThan(1);
  });
});
