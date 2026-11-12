import { CALLBACK_LIST_TABS } from '../../utils/callbackListTabs.js';

/**
 * Orange pill tabs for Agent / Closer callback list filtering.
 */
export default function CallbackListTabs({
  activeTab,
  counts = {},
  onChange,
  ariaLabel = 'Callback list sections',
}) {
  return (
    <nav
      className="mb-6 flex flex-wrap gap-2 rounded-2xl border border-zinc-800/80 bg-zinc-950/50 p-1.5"
      aria-label={ariaLabel}
    >
      {CALLBACK_LIST_TABS.map((item) => {
        const active = activeTab === item.id;
        const count = counts[item.id] ?? 0;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onChange?.(item.id)}
            className={`relative flex-1 rounded-full px-4 py-2.5 font-display text-sm font-semibold transition sm:flex-none ${
              active
                ? 'bg-orange-600 text-white shadow-lg shadow-orange-600/25'
                : 'text-zinc-400 hover:bg-zinc-800/60 hover:text-white'
            }`}
          >
            <span className="inline-flex items-center justify-center gap-2">
              {item.label}
              <span
                className={`inline-flex min-w-[1.25rem] items-center justify-center rounded-full px-1.5 py-0.5 text-[11px] font-bold tabular-nums ${
                  active
                    ? 'bg-white/20 text-white'
                    : count > 0
                      ? 'bg-orange-600/20 text-orange-300'
                      : 'bg-zinc-800 text-zinc-500'
                }`}
              >
                {count}
              </span>
            </span>
          </button>
        );
      })}
    </nav>
  );
}
