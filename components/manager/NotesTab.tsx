"use client";

import { useCallback, useEffect, useState } from "react";
import { Pin, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { mgrAddNote, mgrDeleteNote, mgrNotes, mgrTogglePin, type MgrManagerNote } from "@/actions/manager";
import { Btn, Card, Empty, TextArea, useFlash } from "./ui";

export function NotesTab() {
  const [notes, setNotes] = useState<MgrManagerNote[] | null>(null);
  const [text, setText] = useState("");
  const flash = useFlash();
  const load = useCallback(() => {
    mgrNotes().then(setNotes);
  }, []);
  useEffect(load, [load]);

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Card>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const r = await mgrAddNote(text);
            flash.show(r, "Nota guardada ✓");
            if (r.ok) {
              setText("");
              load();
            }
          }}
          className="space-y-3"
        >
          <TextArea value={text} onChange={(e) => setText(e.target.value)} placeholder="Encomendar oxidante 30 vol, ligar ao fornecedor, ideias para o Instagram…" />
          <div className="flex items-center gap-3">
            <Btn type="submit">Guardar nota</Btn>
            {flash.node}
          </div>
        </form>
      </Card>
      {notes === null ? null : notes.length === 0 ? (
        <Empty>Ainda sem notas.</Empty>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {notes.map((n) => (
            <li key={n.id} className={cn("flex flex-col rounded-2xl border bg-[#141210] p-4", n.pinned ? "border-gold/60" : "border-gold/15")}>
              <p className="flex-1 text-sm whitespace-pre-wrap">{n.content}</p>
              <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                {new Intl.DateTimeFormat("pt-PT", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Lisbon" }).format(new Date(n.created_at))}
                <button type="button" title={n.pinned ? "Desafixar" : "Fixar no topo"} onClick={async () => (await mgrTogglePin(n.id), load())} className={cn("ml-auto p-1 hover:text-gold", n.pinned && "text-gold")}>
                  <Pin className="size-4" />
                </button>
                <button type="button" title="Apagar" onClick={async () => confirm("Apagar esta nota?") && (await mgrDeleteNote(n.id), load())} className="p-1 hover:text-red-300">
                  <Trash2 className="size-4" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
