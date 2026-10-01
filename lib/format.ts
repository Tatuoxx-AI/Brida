export const SALON_TZ = "Europe/Lisbon";

const money = new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" });

export const formatMoney = (value: number) => money.format(value);

export const formatDateTime = (iso: string, tz = SALON_TZ) =>
  new Intl.DateTimeFormat("pt-PT", { dateStyle: "medium", timeStyle: "short", timeZone: tz }).format(new Date(iso));

export const formatTime = (iso: string, tz = SALON_TZ) =>
  new Intl.DateTimeFormat("pt-PT", { hour: "2-digit", minute: "2-digit", timeZone: tz }).format(new Date(iso));

/** Link wa.me com a mensagem já escrita. phone em E.164 (+351…). */
export const whatsappLink = (phone: string, text?: string) =>
  `https://wa.me/${phone.replace(/\D/g, "")}${text ? `?text=${encodeURIComponent(text)}` : ""}`;

/** "+351965809800" → "+351 965 809 800" (números portugueses); outros ficam como estão. */
export const formatPhone = (e164: string) => {
  const m = e164.match(/^\+351(\d{3})(\d{3})(\d{3})$/);
  return m ? `+351 ${m[1]} ${m[2]} ${m[3]}` : e164;
};
