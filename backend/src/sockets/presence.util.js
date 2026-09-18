const onlineUsers = new Map(); // userId (string) -> Set of socket ids

export function addSocket(userId, socketId) {
  const key = String(userId);
  let sockets = onlineUsers.get(key);
  if (!sockets) {
    sockets = new Set();
    onlineUsers.set(key, sockets);
  }
  sockets.add(socketId);
}

export function removeSocket(userId, socketId) {
  const key = String(userId);
  const sockets = onlineUsers.get(key);
  if (!sockets) return;

  sockets.delete(socketId);
  if (sockets.size === 0) {
    onlineUsers.delete(key);
  }
}

export function isOnline(userId) {
  return onlineUsers.has(String(userId));
}

export function getOnlineUserIds() {
  return Array.from(onlineUsers.keys());
}
