import { redirect } from "next/navigation";

// O perfil do cliente fica guardado no aparelho — não há login.
export default function Entrar() {
  redirect("/perfil");
}
