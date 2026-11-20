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
 * Black / White palette — orange reserved for primary CTAs elsewhere.
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
        <p className="truncate text-sm font-medium text-[#A3A3A3]">
          Hi, <span className="text-white">{displayName}</span>
        </p>
      ) : null}
      {displayRole ? (
        <span className="inline-flex shrink-0 items-center rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-white">
          {displayRole}
        </span>
      ) : null}
    </div>
  );
}
