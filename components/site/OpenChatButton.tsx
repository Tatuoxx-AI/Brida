"use client";

import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { openChat } from "@/lib/chat-store";

export function OpenChatButton({
  children,
  message,
  variant = "solid",
  className,
}: {
  children: React.ReactNode;
  message?: string;
  variant?: "solid" | "outline";
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={() => openChat(message)}
      className={cn(
        "inline-flex h-12 items-center gap-2 rounded-full px-7 font-label text-xs tracking-[0.2em] uppercase transition",
        variant === "solid"
          ? "bg-accent text-accent-foreground hover:brightness-110"
          : "border border-foreground/30 text-foreground hover:border-accent hover:text-accent",
        className,
      )}
    >
      <Sparkles className="size-4" />
      {children}
    </button>
  );
}
