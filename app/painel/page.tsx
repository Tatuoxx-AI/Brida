import { isManager, managerPath } from "@/lib/manager-auth";
import { one } from "@/lib/db";
import { whatsappLink } from "@/lib/format";
import { ManagerApp } from "@/components/manager/ManagerApp";
import { ManagerLogin } from "@/components/manager/ManagerLogin";

export default async function Painel() {
  if (!(await isManager())) return <ManagerLogin />;
  const s = await one<{ whatsapp: string | null }>(`select whatsapp from public.salon_settings where id = 1`);
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Lisbon" }).format(new Date());
  return (
    <ManagerApp
      today={today}
      whatsappUrl={whatsappLink(s?.whatsapp ?? "", "Olá!")}
      base={managerPath()!}
      vapidKey={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? ""}
    />
  );
}
