/**
 * Display a populated user ref as "Full Name (@username)".
 * Falls back gracefully when only one field (or an id string) is present.
 */
export function formatUserRef(ref) {
  if (!ref) return '';
  if (typeof ref === 'string') return '';

  const name = String(ref.fullName || '').trim();
  const username = String(ref.username || '').trim();

  if (name && username) return `${name} (@${username})`;
  if (name) return name;
  if (username) return `@${username}`;
  return '';
}
