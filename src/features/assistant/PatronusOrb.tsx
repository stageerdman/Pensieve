import { useId } from "react";
import "./patronus.css";

// The Patronus orb (Orb D "Pulse Wave": a silky blurred breathing core + dissolving pulse
// rings) as ONE component — the bottom-left trigger and the Patronus block in a form both
// draw it. Gradient/filter ids are per-instance (useId): two orbs on a page would otherwise
// share — and fight over — the same SVG defs.
export function PatronusOrb({ size = 40 }: { size?: number }) {
  const uid = useId().replace(/:/g, "");
  const core = `patronusCore${uid}`;
  const bloom = `patronusBloom${uid}`;
  const blur = `patronusBlur${uid}`;
  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      className="patronus-orb"
      aria-hidden="true"
    >
      <defs>
        <radialGradient id={core} cx="50%" cy="45%" r="60%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.95" />
          <stop
            offset="30%"
            stopColor="hsl(var(--accent-glow))"
            stopOpacity="0.9"
          />
          <stop
            offset="55%"
            stopColor="hsl(var(--accent))"
            stopOpacity="0.7"
          />
          <stop
            offset="80%"
            stopColor="hsl(var(--accent))"
            stopOpacity="0.3"
          />
          <stop
            offset="100%"
            stopColor="hsl(var(--accent))"
            stopOpacity="0"
          />
        </radialGradient>
        <radialGradient id={bloom} cx="50%" cy="48%" r="60%">
          <stop
            offset="0%"
            stopColor="hsl(var(--accent-glow))"
            stopOpacity="0.35"
          />
          <stop
            offset="100%"
            stopColor="hsl(var(--accent-glow))"
            stopOpacity="0"
          />
        </radialGradient>
        <filter
          id={blur}
          x="-60%"
          y="-60%"
          width="220%"
          height="220%"
        >
          <feGaussianBlur stdDeviation="1.8" />
        </filter>
      </defs>
      <g stroke="hsl(var(--accent-glow))" strokeWidth="1" fill="none">
        <circle
          cx="50"
          cy="50"
          r="16"
          className="patronus-ring"
          style={{ animationDelay: "0s" }}
        />
        <circle
          cx="50"
          cy="50"
          r="16"
          className="patronus-ring"
          style={{ animationDelay: "1.2s" }}
        />
        <circle
          cx="50"
          cy="50"
          r="16"
          className="patronus-ring"
          style={{ animationDelay: "2.4s" }}
        />
      </g>
      <circle
        cx="50"
        cy="50"
        r="24"
        fill={`url(#${bloom})`}
        filter={`url(#${blur})`}
      />
      <g className="patronus-breathe">
        <circle
          cx="50"
          cy="50"
          r="16"
          fill={`url(#${core})`}
          filter={`url(#${blur})`}
        />
      </g>
    </svg>
  );
}
