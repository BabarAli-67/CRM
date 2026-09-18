import { io } from 'socket.io-client';
import api from '../config/api.config.js';

let socketRef = null;

/** Socket.IO connects to the HTTP origin, not the /api/v1 REST prefix. */
const getSocketOrigin = () => {
  const base = api.defaults.baseURL || 'http://localhost:5000/api/v1';
  return String(base).replace(/\/api\/v1\/?$/, '');
};

/**
 * Return the shared socket. Reuse an existing instance even while it is still
 * connecting — tearing it down mid-handshake orphans listeners attached by
 * onTypingUpdate / onMessageNew / etc.
 */
export function getSocket() {
  if (socketRef) {
    return socketRef;
  }

  const token = localStorage.getItem('flashcrm_token');
  socketRef = io(getSocketOrigin(), {
    auth: { token },
    autoConnect: true,
  });

  return socketRef;
}

export function disconnectSocket() {
  if (!socketRef) return;
  socketRef.disconnect();
  socketRef = null;
}
