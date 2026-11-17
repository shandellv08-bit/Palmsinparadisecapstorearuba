/** Small inline icons. Decorative unless given a label by the caller. */
const base = { fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };

export const SearchIcon = () => (
  <svg viewBox="0 0 24 24" {...base}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
);
export const BagIcon = () => (
  <svg viewBox="0 0 24 24" {...base}><path d="M5 8h14l-1 12H6L5 8Z" /><path d="M9 8V6a3 3 0 0 1 6 0v2" /></svg>
);
export const MenuIcon = () => (
  <svg viewBox="0 0 24 24" {...base}><path d="M4 7h16M4 12h16M4 17h16" /></svg>
);
export const CloseIcon = () => (
  <svg viewBox="0 0 24 24" {...base}><path d="M6 6l12 12M18 6 6 18" /></svg>
);
export const PinIcon = () => (
  <svg viewBox="0 0 24 24" {...base}><path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21Z" /><circle cx="12" cy="9.5" r="2.5" /></svg>
);
export const TruckIcon = () => (
  <svg viewBox="0 0 24 24" {...base}><path d="M3 6h11v10H3zM14 10h4l3 3v3h-7" /><circle cx="7" cy="17.5" r="1.8" /><circle cx="17.5" cy="17.5" r="1.8" /></svg>
);
export const ChatIcon = () => (
  <svg viewBox="0 0 24 24" {...base}><path d="M4 5h16v11H9l-5 4V5Z" /></svg>
);

/** The Palms in Paradise mark: a palm over a cap crown. Original drawing. */
export const PalmMark = () => (
  <svg viewBox="0 0 48 48" aria-hidden="true">
    <path d="M6 40c0-9.9 8.1-18 18-18s18 8.1 18 18v1H6v-1Z" fill="var(--sea)" />
    <path d="M4 41h40" stroke="var(--papaya-ink)" strokeWidth="3.5" strokeLinecap="round" />
    <path d="M24 30c.8-6 .4-11-1.4-16" stroke="var(--papaya)" strokeWidth="2.6" strokeLinecap="round" fill="none" />
    <g fill="var(--papaya)">
      <path d="M22.8 14c-4-4.8-10-5.6-14.6-2.6 4.6-.6 9.2.8 14.6 2.6Z" />
      <path d="M22.8 14c-1.6-5.6 1-10.6 6.4-12-3 3.2-4.8 7.2-6.4 12Z" />
      <path d="M22.8 14c4.4-4 10.6-4 14.6-.4-4.4-.8-9.2 0-14.6.4Z" />
      <path d="M22.8 14c-5.4-.8-10.6 2.2-12 7.2 3-3.6 7.2-5.8 12-7.2Z" />
      <path d="M22.8 14c5-.6 9.8 2.6 10.8 7.8-2.8-3.8-6.6-6.2-10.8-7.8Z" />
    </g>
  </svg>
);

/** Large palm fronds used as background decoration on the banner. */
export const Fronds = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 400 400" aria-hidden="true" fill="currentColor">
    <path d="M200 210C150 120 60 95 0 130c70-12 140 15 200 80Z" />
    <path d="M200 210C180 110 230 30 320 10c-55 45-95 110-120 200Z" />
    <path d="M200 210c80-70 160-70 200-20-70-20-140-10-200 20Z" />
    <path d="M200 210C110 200 40 250 30 330c40-60 100-100 170-120Z" />
    <path d="M200 210c90-10 160 40 170 120-40-60-100-100-170-120Z" />
    <path d="M196 208c10 60 6 130-20 192h12c22-62 24-130 14-192h-6Z" />
  </svg>
);
