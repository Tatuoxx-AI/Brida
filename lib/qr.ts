import "server-only";
import QRCode from "qrcode";

/**
 * QR Code dos convites, desenhado no servidor.
 *
 * Nas cores do site e com correção de erros alta: o QR vai acabar impresso num
 * cartão, fotografado de lado e lido com pouca luz, e o nível "H" aguenta 30%
 * do desenho estragado. Custa uns módulos a mais, que num código de 8 letras
 * não se dá por eles.
 */

const DOURADO = "#c8a76a";
const ESCURO = "#141210";

export function qrPng(texto: string, largura = 900): Promise<Buffer> {
  return QRCode.toBuffer(texto, {
    type: "png",
    errorCorrectionLevel: "H",
    width: largura,
    margin: 2,
    // Fundo claro de propósito, mesmo num site escuro: metade dos leitores
    // recusa um QR invertido, e um cartão impresso é quase sempre em papel.
    color: { dark: ESCURO, light: "#ffffff" },
  });
}

/** Versão para mostrar no ecrã, nas cores do site. */
export function qrSvg(texto: string): Promise<string> {
  return QRCode.toString(texto, {
    type: "svg",
    errorCorrectionLevel: "H",
    margin: 1,
    color: { dark: DOURADO, light: "#00000000" },
  });
}
