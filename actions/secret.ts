"use server";

import { headers } from "next/headers";
import { managerPath } from "@/lib/manager-auth";
import { rateLimit } from "@/lib/rate-limit";

/** Devolve o endereço do painel. Só existe do lado do servidor. */
export async function revealEntrance(): Promise<string | null> {
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (!rateLimit(`entrance:${ip}`, 10, 10 * 60_000)) return null;
  return managerPath();
}
