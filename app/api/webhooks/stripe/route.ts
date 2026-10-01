import { NextResponse } from "next/server";

// Webhook da Stripe: checkout.session.completed → confirma agendamento/encomenda (idempotente via stripe_events).
export async function POST() {
  return NextResponse.json({ error: "Ainda não implementado" }, { status: 501 });
}
