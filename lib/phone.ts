/**
 * Normaliza um telefone para E.164. Números sem indicativo são tratados como
 * portugueses (9 dígitos a começar por 2 ou 9). Devolve null se não parecer válido.
 */
export function normalizePhone(raw: string): string | null {
  let digits = raw.replace(/[^\d+]/g, "");
  if (digits.startsWith("00")) digits = "+" + digits.slice(2);
  if (!digits.startsWith("+")) {
    if (/^[29]\d{8}$/.test(digits)) digits = "+351" + digits;
    else if (/^\d{10,15}$/.test(digits)) digits = "+" + digits;
    else return null;
  }
  return /^\+\d{8,15}$/.test(digits) ? digits : null;
}
