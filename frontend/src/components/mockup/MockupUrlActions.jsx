import { useState } from 'react';

export default function MockupUrlActions({ url, className = '' }) {
  const [copied, setCopied] = useState(false);
  const href = String(url || '').trim();
  if (!href) return null;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(href);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`}>
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        className="max-w-full truncate text-sm font-medium text-orange-300 hover:text-orange-200"
      >
        {href}
      </a>
      <button
        type="button"
        onClick={copy}
        className="rounded-lg border border-zinc-600 px-2.5 py-1 text-[11px] font-semibold text-zinc-200 hover:bg-zinc-800"
      >
        {copied ? 'Copied' : 'Copy'}
      </button>
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        className="rounded-lg border border-[#F25E26]/40 bg-[#F25E26]/15 px-2.5 py-1 text-[11px] font-semibold text-[#F25E26] hover:bg-[#F25E26]/25"
      >
        Open
      </a>
    </div>
  );
}
