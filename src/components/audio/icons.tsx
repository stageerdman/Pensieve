// Self-contained glyph set for the audio element (kept local so the element is portable
// to the phone app per the decouple convention). Stroke/fill use currentColor; every SVG
// sets explicit width/height so an unsized glyph can never balloon its container.

interface P {
  size?: number;
}
const box = (size = 16) => ({ width: size, height: size, viewBox: "0 0 24 24", "aria-hidden": true as const });

export const PlayIcon = ({ size }: P) => (
  <svg {...box(size)} fill="currentColor">
    <path d="M8 5.5v13a.75.75 0 0 0 1.14.64l10.5-6.5a.75.75 0 0 0 0-1.28L9.14 4.86A.75.75 0 0 0 8 5.5Z" />
  </svg>
);
export const PauseIcon = ({ size }: P) => (
  <svg {...box(size)} fill="currentColor">
    <rect x="6.5" y="5" width="3.6" height="14" rx="1" />
    <rect x="13.9" y="5" width="3.6" height="14" rx="1" />
  </svg>
);
export const StopIcon = ({ size }: P) => (
  <svg {...box(size)} fill="currentColor">
    <rect x="6.5" y="6.5" width="11" height="11" rx="2" />
  </svg>
);
export const MicIcon = ({ size }: P) => (
  <svg {...box(size)} fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
    <rect x="9" y="3" width="6" height="11" rx="3" />
    <path d="M5 11a7 7 0 0 0 14 0" />
    <path d="M12 18v3" />
  </svg>
);
export const MoreIcon = ({ size }: P) => (
  <svg {...box(size)} fill="currentColor">
    <circle cx="5" cy="12" r="1.7" />
    <circle cx="12" cy="12" r="1.7" />
    <circle cx="19" cy="12" r="1.7" />
  </svg>
);
export const TranscriptIcon = ({ size }: P) => (
  <svg {...box(size)} fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 6h14" />
    <path d="M5 10h10" />
    <path d="M5 14h14" />
    <path d="M5 18h8" />
  </svg>
);
export const DownloadIcon = ({ size }: P) => (
  <svg {...box(size)} fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 4v11" />
    <path d="m7.5 11 4.5 4.5 4.5-4.5" />
    <path d="M5 19.5h14" />
  </svg>
);
// Vertical split (two side-by-side panes) — "Split to Transcript".
export const VSplitIcon = ({ size }: P) => (
  <svg {...box(size)} fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <path d="M12 4v16" />
  </svg>
);
// Horizontal split (stacked rows) — "Dropdown Transcript".
export const HSplitIcon = ({ size }: P) => (
  <svg {...box(size)} fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <path d="M3 12h18" />
  </svg>
);
export const RegenerateIcon = ({ size }: P) => (
  <svg {...box(size)} fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 11a8 8 0 1 0-.9 4.5" />
    <path d="M20 5v6h-6" />
  </svg>
);
export const LocateIcon = ({ size }: P) => (
  <svg {...box(size)} fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3" />
    <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
  </svg>
);
