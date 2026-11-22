import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { exportAccountData } from "@/lib/account";

// Archive JSON complète des données personnelles du compte connecté
// (centre de compte → « Mes données »). Distinct de /api/export (export
// « journal » seul, en JSON ou Markdown) : celui-ci couvre le profil, les
// préférences, l'espace famille, l'abonnement et les crédits.
//
// Authentification par cookie de session UNIQUEMENT (getCurrentUser) : aucun
// identifiant n'est jamais accepté en paramètre, donc personne ne peut faire
// télécharger les données d'un autre compte en changeant une valeur dans
// l'URL ou le corps de la requête.
export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const data = await exportAccountData(user.id);
  const stamp = new Date().toISOString().slice(0, 10);

  return new NextResponse(JSON.stringify(data, null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="orbs-mon-compte-${stamp}.json"`,
    },
  });
}
