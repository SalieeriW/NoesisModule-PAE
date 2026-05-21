export function Logo({ size = 28, className = "" }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 56 56"
      fill="none"
      width={size}
      height={size}
      className={className}
      aria-hidden
      style={{ flexShrink: 0 }}
    >
      <defs>
        <linearGradient id="logo-lg" x1="6" y1="6" x2="50" y2="50" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#E5703A"/>
          <stop offset="100%" stopColor="#7B3115"/>
        </linearGradient>
        <clipPath id="logo-hc">
          <polygon points="28,6 47,17 47,39 28,50 9,39 9,17"/>
        </clipPath>
      </defs>
      <polygon points="28,6 47,17 47,39 28,50 9,39 9,17" fill="rgba(196,92,38,0.07)"/>
      <polygon points="28,6 47,17 47,39 28,50 9,39 9,17" stroke="url(#logo-lg)" strokeWidth="2.2" strokeLinejoin="round"/>
      <g clipPath="url(#logo-hc)">
        <path d="M 41,16 A 22,22 0 0,0 19,38" stroke="url(#logo-lg)" strokeWidth="1.5" strokeLinecap="round" opacity="0.28"/>
        <path d="M 41,23 A 15,15 0 0,0 26,38" stroke="url(#logo-lg)" strokeWidth="2" strokeLinecap="round" opacity="0.58"/>
        <path d="M 41,30 A 8,8 0 0,0 33,38" stroke="url(#logo-lg)" strokeWidth="2.5" strokeLinecap="round" opacity="0.9"/>
        <circle cx="41" cy="38" r="3" fill="url(#logo-lg)"/>
      </g>
    </svg>
  );
}
