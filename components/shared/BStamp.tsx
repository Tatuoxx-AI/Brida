import { useId } from "react";
import { cn } from "@/lib/utils";
import { B_PATH } from "@/lib/brand-icon";

/**
 * Carimbo da Brida: o "B" dourado do ícone sobre um quadrado escuro (cores do site), ligeiramente rodado,
 * como um carimbo de papel. Usado nas horas reservadas da agenda e no cartão de fidelidade.
 */
export function BStamp({ size = 28, rotate = -8, className, title }: { size?: number; rotate?: number; className?: string; title?: string }) {
  const id = useId().replace(/:/g, "");
  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      className={cn("shrink-0 drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)]", className)}
      style={{ transform: `rotate(${rotate}deg)` }}
    >
      <defs>
        <linearGradient id={`g${id}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#f6dc96" />
          <stop offset="0.5" stopColor="#d9ad52" />
          <stop offset="1" stopColor="#a87b2a" />
        </linearGradient>
        <radialGradient id={`r${id}`} cx="0.3" cy="0.25" r="0.9">
          {/* mesmo castanho-preto do fundo do site (como o ícone da app) */}
          <stop offset="0" stopColor="#2a2318" />
          <stop offset="1" stopColor="#0b0a09" />
        </radialGradient>
      </defs>
      <rect x="3" y="3" width="94" height="94" rx="14" fill={`url(#r${id})`} stroke={`url(#g${id})`} strokeWidth="2.5" />
      <g transform="translate(50 51) scale(0.74) translate(-55 -53)">
        <path d={B_PATH} fill={`url(#g${id})`} fillRule="evenodd" stroke="#000" strokeWidth="5" strokeLinejoin="round" paintOrder="stroke" />
      </g>
    </svg>
  );
}
