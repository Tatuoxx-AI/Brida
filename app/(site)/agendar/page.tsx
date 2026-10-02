import { redirect } from "next/navigation";

// A marcação vive na secção Agenda da página inicial.
export default function Agendar() {
  redirect("/#agenda");
}
