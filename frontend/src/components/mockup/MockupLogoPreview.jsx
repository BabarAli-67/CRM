import useMockupFile from '../../hooks/useMockupFile.hook.js';

export default function MockupLogoPreview({ mockupId, hasLogo = true }) {
  const { url, isLoading, isError } = useMockupFile(
    mockupId,
    'logo',
    Boolean(mockupId) && hasLogo
  );

  if (!hasLogo) {
    return (
      <span className="inline-flex items-center rounded-md border border-dashed border-zinc-600 bg-zinc-950/60 px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
        No Logo Provided
      </span>
    );
  }

  if (isLoading) {
    return <span className="text-xs text-zinc-500">Loading logo…</span>;
  }

  if (isError || !url) {
    return <span className="text-xs text-red-400">Logo unavailable</span>;
  }

  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-2"
      title="Open logo"
    >
      <img
        src={url}
        alt="Logo"
        className="h-12 w-12 rounded-lg border border-zinc-700 object-contain bg-zinc-950"
      />
      <span className="text-xs font-medium text-orange-300 hover:text-orange-200">
        Preview / Download
      </span>
    </a>
  );
}
