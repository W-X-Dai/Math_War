const SUPERSCRIPTS = Object.freeze({
  '-': '⁻',
  0: '⁰',
  1: '¹',
  2: '²',
  3: '³',
  4: '⁴',
  5: '⁵',
  6: '⁶',
  7: '⁷',
  8: '⁸',
  9: '⁹',
  x: 'ˣ',
});

export function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function superscript(value) {
  return [...String(value)].map((character) => SUPERSCRIPTS[character] ?? character).join('');
}

export function prettyFormula(value) {
  return String(value)
    .replaceAll(' - ', ' − ')
    .replace(/\^\(([-\dx]+)\)/g, (_, power) => superscript(power))
    .replace(/\^(-?\d+|[-]?x)/g, (_, power) => superscript(power));
}

export function formatValue(value) {
  if (Number.isInteger(value)) return String(value);
  const rounded = Math.round(value * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2).replace(/0+$/, '');
}

