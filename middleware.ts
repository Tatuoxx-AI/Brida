import { NextResponse, type NextRequest } from "next/server";

// O painel do gerente vive internamente em /painel, mas só é servido pelo
// endereço secreto (MANAGER_PATH). Quem tentar /painel diretamente vê um 404.
const INTERNAL = "/painel";

export function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const secret = process.env.MANAGER_PATH?.replace(/^\/+|\/+$/g, "");

  if (path === INTERNAL || path.startsWith(`${INTERNAL}/`)) {
    return NextResponse.rewrite(new URL("/_nao-existe", request.url));
  }
  if (secret && (path === `/${secret}` || path.startsWith(`/${secret}/`))) {
    const url = request.nextUrl.clone();
    url.pathname = INTERNAL + path.slice(secret.length + 1);
    const res = NextResponse.rewrite(url);
    res.headers.set("X-Robots-Tag", "noindex, nofollow");
    return res;
  }
  return NextResponse.next();
}

export const config = {
  // webhooks e ficheiros estáticos ficam de fora
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/webhooks|api/cron|sounds/|fotos/|icone-app/|manifest.webmanifest|media/|icon.svg|.*\\.(?:svg|png|jpg|jpeg|gif|webp|mp3)$).*)"],
};
