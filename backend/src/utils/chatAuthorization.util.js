export const SALES_SILO = ['sales_agent', 'closer'];
export const FULFILLMENT_SILO = ['cst_manager', 'tech_team'];
export const LEADERSHIP = ['super_admin', 'admin'];

const ALL_ROLES = [
  'super_admin',
  'admin',
  'sales_agent',
  'closer',
  'cst_manager',
  'tech_team',
];

/**
 * Whether two users are allowed to open/message a 1:1 conversation.
 * Leadership ↔ anyone; Sales silo ↔ Sales; Fulfillment silo ↔ Fulfillment.
 * Cross-silo Sales ↔ Fulfillment is blocked. Self-conversations are blocked.
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

  if (SALES_SILO.includes(roleA) && SALES_SILO.includes(roleB)) {
    return true;
  }

  if (FULFILLMENT_SILO.includes(roleA) && FULFILLMENT_SILO.includes(roleB)) {
    return true;
  }

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

  if (FULFILLMENT_SILO.includes(role)) {
    return [...FULFILLMENT_SILO, ...LEADERSHIP];
  }

  return [];
}
