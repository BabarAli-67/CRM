import { createContext, useState } from 'react';
import api from '../config/api.config.js';
import { disconnectSocket } from '../utils/socketClient.util.js';

const AuthContext = createContext(null);

const getStoredUser = () => {
  try {
    const stored = localStorage.getItem('flashcrm_user');
    return stored ? JSON.parse(stored) : null;
  } catch {
    return null;
  }
};

const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(getStoredUser);
  const [loading] = useState(false);

  const login = async (email, password) => {
    const { data } = await api.post('/auth/login', { email, password });
    const { user: loggedInUser, token } = data.data;

    localStorage.setItem('flashcrm_token', token);
    localStorage.setItem('flashcrm_user', JSON.stringify(loggedInUser));
    setUser(loggedInUser);

    return data;
  };

  const register = async (payload) => {
    const { data } = await api.post('/auth/register', payload);
    return data;
  };

  const logout = () => {
    disconnectSocket();
    localStorage.removeItem('flashcrm_token');
    localStorage.removeItem('flashcrm_user');
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export { AuthContext };
export default AuthProvider;
