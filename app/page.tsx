import { redirect } from "next/navigation";

// Le proxy redirige déjà "/" vers /timeline ou /login. Ce fichier est un
// filet de sécurité si le proxy est désactivé.
export default function Home() {
  redirect("/timeline");
}
