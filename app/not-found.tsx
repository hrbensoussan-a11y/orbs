import Link from "next/link";

export default function NotFound() {
  return (
    <main className="min-h-dvh flex items-center justify-center px-4 text-center">
      <div>
        <p className="font-serif text-3xl">Page introuvable</p>
        <p className="text-muted mt-2">
          Cette page n’existe pas (ou n’est pas la tienne).
        </p>
        <Link href="/timeline" className="btn-primary mt-6 inline-flex">
          Retour au journal
        </Link>
      </div>
    </main>
  );
}
