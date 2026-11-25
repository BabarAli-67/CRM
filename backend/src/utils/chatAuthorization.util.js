export const SALES_SILO = ['sales_agent', 'closer'];
export const LEADERSHIP = ['super_admin', 'admin'];

const ALL_ROLES = [
  'super_admin',
  'admin',
  'sales_agent',
  'closer',
  'cst_manager',
  'tech_head',
  'tech_team',
];

/**
 * Whether two users are allowed to open/message a 1:1 conversation.
 *
 * Hierarchy:
 * - Super Admin / Admin ↔ anyone
 * - Sales silo (Agent ↔ Closer) unchanged; never cross into Tech/CST
 * - CST Manager ↔ Tech Head (+ other CST Managers); never individual Tech members
 * - Tech Head ↔ CST Manager + all Tech members
 * - Tech members ↔ Tech Head only (not CST / Closer / Agent / peer Tech)
 */
export function canMessage(userA, userB) {
  if (!userA || !userB) return false;

  const idA = String(userA._id);
  const idB = String(userB._id);
  if (idA === idB) return false;

  const roleA = userA.role;
  const roleB = userB.role;

  if (LEADERSHIP.includes(roleA) || LEADERSHIP.includes(roleB)) {
    return true;
  }

  // Agent / Closer silo — unchanged
  if (SALES_SILO.includes(roleA) && SALES_SILO.includes(roleB)) {
    return true;
  }

  // Tech Head hub: CST Managers + Tech members (+ peer Tech Heads)
  if (roleA === 'tech_head') {
    return (
      roleB === 'cst_manager' ||
      roleB === 'tech_team' ||
      roleB === 'tech_head'
    );
  }
  if (roleB === 'tech_head') {
    return (
      roleA === 'cst_manager' ||
      roleA === 'tech_team' ||
      roleA === 'tech_head'
    );
  }

  // CST Managers may message each other (existing peer chat)
  if (roleA === 'cst_manager' && roleB === 'cst_manager') {
    return true;
  }

  // Tech members: only Tech Head / leadership (already handled above)
  // Explicitly block tech ↔ cst, tech ↔ tech, tech ↔ sales
  return false;
}

/**
 * Roles the given role may list as chat contacts.
 * Must stay in sync with canMessage().
 */
export function getAllowedContactRoles(role) {
  if (LEADERSHIP.includes(role)) {
    return [...ALL_ROLES];
  }

  if (SALES_SILO.includes(role)) {
    return [...SALES_SILO, ...LEADERSHIP];
  }

  if (role === 'cst_manager') {
    return ['cst_manager', 'tech_head', ...LEADERSHIP];
  }

  if (role === 'tech_head') {
    return ['cst_manager', 'tech_head', 'tech_team', ...LEADERSHIP];
  }

  if (role === 'tech_team') {
    return ['tech_head', ...LEADERSHIP];
  }

  return [];
}
