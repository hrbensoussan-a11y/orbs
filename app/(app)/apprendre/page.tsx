import { GraduationCap } from "lucide-react";
import { ComingSoon } from "@/components/ComingSoon";

export default function ApprendrePage() {
  return (
    <ComingSoon
      Icon={GraduationCap}
      tone="lilac"
      title="Apprendre"
      description="Révise tes cours et tes définitions : fiches, quiz et mémorisation espacée, à partir de ce que tu as en classe."
      note="Module en préparation."
    />
  );
}
