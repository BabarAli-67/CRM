/**
 * Short session greeting for tooltips / aria labels.
 * Example: "Hi, Babar Ali · Closer"
 */
export function formatSessionIdentity(user, roleLabel) {
  const name =
    String(user?.fullName || '').trim() ||
    String(user?.username || '').trim();
  const role = String(roleLabel || '').trim();

  const greeting = name ? `Hi, ${name}` : '';
  if (greeting && role) return `${greeting} · ${role}`;
  return greeting || role || '';
}
