export const DIRECT_CONSTANT_TOKENS = Object.freeze([
  ...Array.from({ length: 9 }, (_, index) => Object.freeze({
    id: `digit-${index + 1}`,
    label: String(index + 1),
    input: String(index + 1),
    value: index + 1,
  })),
  Object.freeze({
    id: 'digit-0',
    label: '0',
    input: '0',
    value: 0,
  }),
  Object.freeze({ id: 'pi', label: 'π', input: 'π', value: Math.PI }),
  Object.freeze({ id: 'e', label: 'e', input: 'e', value: Math.E }),
]);

const TOKEN_BY_ID = new Map(DIRECT_CONSTANT_TOKENS.map((token) => [token.id, token]));

export function directConstantToken(tokenId) {
  return TOKEN_BY_ID.get(tokenId) ?? null;
}
