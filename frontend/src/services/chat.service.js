import api from '../config/api.config.js';

const BASE_URL = api.defaults.baseURL || 'http://localhost:5000/api/v1';

export const getContacts = async () => {
  const response = await api.get('/chat/contacts');
  return response.data.data.contacts;
};

export const getConversations = async () => {
  const response = await api.get('/chat/conversations');
  return response.data.data.conversations;
};

export const createOrGetConversation = async (contactId) => {
  const response = await api.post('/chat/conversations', { contactId });
  return response.data.data.conversation;
};

export const getMessages = async (conversationId, params) => {
  const response = await api.get(`/chat/conversations/${conversationId}/messages`, {
    params,
  });
  return response.data.data.messages;
};

export const sendMessage = async (conversationId, payload) => {
  const response = await api.post(
    `/chat/conversations/${conversationId}/messages`,
    payload
  );
  return response.data.data;
};

export const markSeen = async (conversationId) => {
  const response = await api.patch(`/chat/conversations/${conversationId}/seen`);
  return response.data;
};

export const uploadFile = async (conversationId, file) => {
  const formData = new FormData();
  formData.append('file', file);
  // Do not set Content-Type manually — browser must add multipart boundary.
  const response = await api.post(
    `/chat/conversations/${conversationId}/upload`,
    formData
  );
  return response.data.data;
};

export const getAttachmentUrl = (conversationId, storedFilename) =>
  `${BASE_URL}/chat/conversations/${conversationId}/files/${storedFilename}`;
