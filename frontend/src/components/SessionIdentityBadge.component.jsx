const ROLE_FALLBACK = {
  super_admin: 'Super Admin',
  admin: 'Auditor',
  sales_agent: 'Sales Agent',
  closer: 'Closer',
  cst_manager: 'CST Manager',
  tech_team: 'Tech Team',
};

/**
 * Clean header identity: "Hi, Full Name" + separate role badge.
 * No @username — keeps the navbar executive and uncluttered.
 */
export default function SessionIdentityBadge({
  user,
  roleLabel,
  className = '',
}) {
  const displayRole =
    roleLabel || ROLE_FALLBACK[user?.role] || user?.role || '';
  const displayName =
    String(user?.fullName || '').trim() ||
    String(user?.username || '').trim();

  if (!displayName && !displayRole) return null;

  return (
    <div
      className={`inline-flex max-w-full flex-wrap items-center gap-2.5 ${className}`}
    >
      {displayName ? (
        <p className="truncate text-sm font-medium text-zinc-200">
          Hi, <span className="text-white">{displayName}</span>
        </p>
      ) : null}
      {displayRole ? (
        <span className="inline-flex shrink-0 items-center rounded-full border border-orange-500/30 bg-orange-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-orange-300">
          {displayRole}
        </span>
      ) : null}
    </div>
  );
}
