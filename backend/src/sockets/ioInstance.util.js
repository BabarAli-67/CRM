let ioRef = null;

export function setIO(io) {
  ioRef = io;
}

export function getIO() {
  return ioRef;
}

export function emitToUser(userId, event, payload) {
  if (!ioRef) return;
  ioRef.to('user:' + String(userId)).emit(event, payload);
}
