import { Sparkles } from "lucide-react";
import { ComingSoon } from "@/components/ComingSoon";

export default function IaPage() {
  return (
    <ComingSoon
      Icon={Sparkles}
      tone="sky"
      title="Mode IA"
      description="Pose tes questions à partir de ta scolarité : aide sur un devoir d’anglais, explication d’un cours, ou rédiger un message à un professeur."
      note="Développé par l’équipe IA."
    />
  );
}
