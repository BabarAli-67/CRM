import { createContext, useState } from 'react';

const ChatWidgetContext = createContext(null);

const MAX_OPEN_WINDOWS = 3;

const ChatWidgetProvider = ({ children }) => {
  const [openWindows, setOpenWindows] = useState([]);

  const openChatWindow = (conversationId, contact) => {
    setOpenWindows((prev) => {
      const idx = prev.findIndex((w) => w.conversationId === conversationId);
      let next;

      if (idx !== -1) {
        // Re-open existing: un-minimize and move to end (rightmost / most recent)
        next = [...prev];
        const [existing] = next.splice(idx, 1);
        next.push({
          ...existing,
          minimized: false,
          contact: contact ?? existing.contact,
        });
      } else {
        next = [...prev, { conversationId, contact, minimized: false }];
      }

      // Cap at 3 expanded windows: minimize oldest non-minimized before/when
      // adding would exceed the Design Assumptions cap (do not refuse to open).
      while (next.filter((w) => !w.minimized).length > MAX_OPEN_WINDOWS) {
        const oldestExpandedIdx = next.findIndex((w) => !w.minimized);
        if (oldestExpandedIdx === -1) break;
        next = next.map((w, i) =>
          i === oldestExpandedIdx ? { ...w, minimized: true } : w
        );
      }

      return next;
    });
  };

  const closeChatWindow = (conversationId) => {
    setOpenWindows((prev) =>
      prev.filter((w) => w.conversationId !== conversationId)
    );
  };

  const toggleMinimize = (conversationId) => {
    setOpenWindows((prev) =>
      prev.map((w) =>
        w.conversationId === conversationId
          ? { ...w, minimized: !w.minimized }
          : w
      )
    );
  };

  return (
    <ChatWidgetContext.Provider
      value={{
        openWindows,
        openChatWindow,
        closeChatWindow,
        toggleMinimize,
      }}
    >
      {children}
    </ChatWidgetContext.Provider>
  );
};

export { ChatWidgetContext };
export default ChatWidgetProvider;
