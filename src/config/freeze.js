/** Recursively freeze developer-authored configuration at module load time. */
export function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;

  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}
