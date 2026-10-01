"use client";

import { useRef } from "react";
import { revealEntrance } from "@/actions/secret";

/** Um ponto final como outro qualquer. */
export function SecretDot() {
  const taps = useRef<number[]>([]);

  async function onTap() {
    const now = Date.now();
    taps.current = [...taps.current.filter((t) => now - t < 1500), now];
    if (taps.current.length < 3) return;
    taps.current = [];
    const to = await revealEntrance();
    if (to) window.location.assign(to);
  }

  return (
    <span onClick={onTap} className="select-none">
      .
    </span>
  );
}
