// Tints derived from a person's own `color` in the People tab (#61).
//
// Computed rather than hand-picked, so changing the colour in the sheet moves
// the avatar, the stripe and the card tint together — one value to edit, and a
// new family member needs no code change.
//
// The three mixes were matched by eye against the agreed design and then fixed
// as a formula. Note that mixing by a constant amount does NOT give equal
// *perceived* lightness across hues: a pale yellow reads weaker than a pale blue
// at the same mix. That's accepted — consistency of rule beats consistency of
// appearance here, because the rule survives someone editing the sheet.
const HEADER_MIX = 0.90; // card background
const BODY_MIX = 0.93;   // the chore region below it, a hair lighter
const BORDER_MIX = 0.69; // outline, dark enough to read against white

const FALLBACK = '#6b7280';

function parseHex(hex) {
  const s = String(hex || '').trim().replace(/^#/, '');
  const full = s.length === 3 ? s.replace(/./g, (c) => c + c) : s;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return null;
  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
  ];
}

function towardWhite(rgb, amount) {
  return (
    '#' +
    rgb
      .map((c) => Math.round(c + (255 - c) * amount).toString(16).padStart(2, '0'))
      .join('')
  );
}

// { stripe, header, body, border } for a person. Falls back to a neutral grey
// for a missing or malformed colour, so a blank cell renders a plain card rather
// than an untinted one with a broken border.
export function personTints(color) {
  const rgb = parseHex(color) ?? parseHex(FALLBACK);
  return {
    stripe: parseHex(color) ? String(color).trim() : FALLBACK,
    header: towardWhite(rgb, HEADER_MIX),
    body: towardWhite(rgb, BODY_MIX),
    border: towardWhite(rgb, BORDER_MIX),
  };
}
