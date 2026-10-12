import { NextResponse } from "next/server";
import OpenAI from "openai";
import { isManager } from "@/lib/manager-auth";

/**
 * Transcrição do áudio gravado no painel.
 *
 * É a rede de segurança do microfone: o reconhecimento do browser (Web Speech
 * API) não existe no Firefox nem em alguns Android, e nessas máquinas o painel
 * grava o som e manda-o para aqui.
 *
 * O áudio não é guardado — passa em memória para o serviço de transcrição e
 * desaparece no fim do pedido.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX = 15 * 1024 * 1024; // ~2 minutos de webm/opus

export async function POST(req: Request) {
  if (!(await isManager())) return NextResponse.json({ erro: "Sessão expirada." }, { status: 401 });
  if (!process.env.OPENAI_API_KEY) return NextResponse.json({ erro: "Transcrição não configurada." }, { status: 503 });

  const form = await req.formData().catch(() => null);
  const ficheiro = form?.get("audio");
  if (!(ficheiro instanceof File)) return NextResponse.json({ erro: "Áudio em falta." }, { status: 400 });
  if (ficheiro.size > MAX) return NextResponse.json({ erro: "Gravação longa demais." }, { status: 413 });

  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const r = await openai.audio.transcriptions.create({
      file: ficheiro,
      model: process.env.OPENAI_TRANSCRIBE_MODEL ?? "whisper-1",
      language: "pt",
    });
    return NextResponse.json({ texto: r.text?.trim() ?? "" });
  } catch (e) {
    console.error("[painel/transcrever]", e);
    return NextResponse.json({ erro: "Não consegui transcrever." }, { status: 502 });
  }
}
