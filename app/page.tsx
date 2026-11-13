import { redirect } from "next/navigation";

// Le proxy redirige déjà "/" vers /accueil ou /login. Filet de sécurité.
export default function Home() {
  redirect("/accueil");
}
