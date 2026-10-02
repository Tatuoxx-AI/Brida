// Ícone da marca: "B" dourado com contorno preto. Desenhado como caminho (não como
// texto) para sair igual no separador do browser, no ecrã do telemóvel e nos avisos.

// B serifado numa caixa 100×100 (contorno exterior + duas "barrigas" vazadas)
const B_PATH =
  "M24 14 H57 C73 14 82 22 82 34 C82 43 76 49 68 51 C79 53 86 61 86 72 C86 86 75 92 59 92 H24 V86 H31 V20 H24 Z " +
  "M44 21 V47 H55 C64 47 69 42 69 34 C69 26 64 21 55 21 Z " +
  "M44 54 V85 H57 C67 85 73 80 73 70 C73 60 66 54 56 54 Z";

const GRADIENT = `<linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
  <stop offset="0" stop-color="#f6dc96"/><stop offset="0.5" stop-color="#d9ad52"/><stop offset="1" stop-color="#a87b2a"/>
</linearGradient>`;

/** Favicon: B dourado com contorno preto grosso, fundo transparente. */
export function faviconSvg(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
<defs>${GRADIENT}</defs>
<path d="${B_PATH}" fill="url(#g)" fill-rule="evenodd" stroke="#000" stroke-width="9" stroke-linejoin="round" paint-order="stroke"/>
</svg>`;
}

/** Ícone de app (ecrã inicial/avisos): fundo preto, aro dourado fino e o B com contorno. */
export function appIconSvg(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
<defs>${GRADIENT}<radialGradient id="bg" cx="0.3" cy="0.2" r="1"><stop offset="0" stop-color="#2a2318"/><stop offset="0.7" stop-color="#0b0a09"/></radialGradient></defs>
<rect width="100" height="100" fill="url(#bg)"/>
<circle cx="50" cy="50" r="44" fill="none" stroke="url(#g)" stroke-width="1.6" opacity="0.7"/>
<g transform="translate(50 50) scale(0.72) translate(-55 -53)">
<path d="${B_PATH}" fill="url(#g)" fill-rule="evenodd" stroke="#000" stroke-width="7" stroke-linejoin="round" paint-order="stroke"/>
</g>
</svg>`;
}

export const svgDataUri = (svg: string) => `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
