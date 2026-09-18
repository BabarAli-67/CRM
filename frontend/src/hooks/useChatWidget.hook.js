import { useContext } from 'react';
import { ChatWidgetContext } from '../context/ChatWidget.context.jsx';

export default function useChatWidget() {
  const ctx = useContext(ChatWidgetContext);
  if (!ctx) {
    throw new Error('useChatWidget must be used within ChatWidgetProvider');
  }
  return ctx;
}
