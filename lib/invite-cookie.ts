// Partilhado entre o middleware (que grava o cookie) e o servidor (que o lê).
//
// Ficheiro à parte e sem "server-only" de propósito: o `lib/invite.ts` é
// server-only e o middleware corre noutro ambiente — importá-lo de lá rebentava
// a compilação.

export const INVITE_COOKIE = "brida_convite";
/** 60 dias: chega para alguém decidir vir ao salão depois de ler o convite. */
export const INVITE_MAX_AGE = 60 * 24 * 3600;
/** Códigos como os que o `invite_code` gera: 8 letras/dígitos em maiúsculas. */
export const INVITE_CODE_RE = /^[A-Z0-9]{6,16}$/;
/** O caminho que o QR abre. */
export const INVITE_PATH_RE = /^\/convite\/([A-Za-z0-9]{6,16})\/?$/;
