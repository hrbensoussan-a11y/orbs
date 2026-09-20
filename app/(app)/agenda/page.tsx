import { CalendarCheck } from "lucide-react";
import { ComingSoon } from "@/components/ComingSoon";

export default function AgendaPage() {
  return (
    <ComingSoon
      Icon={CalendarCheck}
      tone="green"
      title="Agenda & tâches"
      description="Ton planning et tes tâches au même endroit, reliés à tes devoirs et à ton journal."
      note="Module en préparation."
    />
  );
}
