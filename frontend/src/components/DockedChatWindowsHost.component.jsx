import DockedChatWindow from './DockedChatWindow.component.jsx';
import MessageToastBridge from './MessageToastBridge.component.jsx';
import useChatWidget from '../hooks/useChatWidget.hook.js';

/**
 * Renders open docked chat windows anchored to the bottom-right of the viewport.
 * Array order is oldest → newest; flex from the right stacks leftward as more open.
 * Always mounts MessageToastBridge so incoming chimes/toasts work with zero windows.
 */
export default function DockedChatWindowsHost() {
  const { openWindows, closeChatWindow, toggleMinimize } = useChatWidget();

  return (
    <>
      <MessageToastBridge />
      {openWindows.length > 0 ? (
        <div
          className="pointer-events-none fixed bottom-0 right-0 z-50 flex flex-row items-end gap-2 px-2"
          aria-live="polite"
        >
          {openWindows.map((win) => (
            <div key={win.conversationId} className="pointer-events-auto">
              <DockedChatWindow
                conversationId={win.conversationId}
                contact={win.contact}
                minimized={win.minimized}
                onClose={() => closeChatWindow(win.conversationId)}
                onToggleMinimize={() => toggleMinimize(win.conversationId)}
              />
            </div>
          ))}
        </div>
      ) : null}
    </>
  );
}
