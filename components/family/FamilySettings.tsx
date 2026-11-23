import { Users, X } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { displayName } from "@/lib/family";
import { createFamilyCode, removeParent, setShareMood } from "@/app/actions/family";

export async function FamilySettings({ userId }: { userId: string }) {
  const me = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      familyCode: true,
      familyCodeExpires: true,
      shareMood: true,
      parents: { include: { parent: { select: { id: true, name: true, firstName: true, email: true } } } },
    },
  });
  if (!me) return null;
  const codeValid = me.familyCode && me.familyCodeExpires && me.familyCodeExpires > new Date();

  return (
    <section className="card p-5">
      <div className="flex items-center gap-3 mb-3">
        <span className="icon-chip coral"><Users size={20} aria-hidden /></span>
        <div>
          <h2 className="font-semibold">Espace famille</h2>
          <p className="text-sm text-ink-3">Tes parents voient ta progression et t’envoient des défis.</p>
        </div>
      </div>

      {me.parents.length > 0 && (
        <ul className="flex flex-col gap-2 mb-4">
          {me.parents.map(({ parent }) => (
            <li key={parent.id} className="flex items-center gap-2 rounded-[var(--r-inner)] bg-fill px-3 py-2">
              <span aria-hidden>🏡</span>
              <span className="flex-1 font-semibold truncate">{displayName(parent)}</span>
              <form action={removeParent}>
                <input type="hidden" name="parentId" value={parent.id} />
                <button type="submit" className="text-ink-3 hover:text-ink-2 p-1" title="Retirer" aria-label={`Retirer ${displayName(parent)}`}>
                  <X size={16} aria-hidden />
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}

      {codeValid ? (
        <div className="rounded-[var(--r-inner)] bg-fill p-4 text-center mb-4">
          <p className="text-sm text-ink-3">Donne ce code à ton parent (valable 24 h)</p>
          <p className="display text-3xl font-semibold tracking-[0.3em] mt-1 select-all">
            {me.familyCode!.slice(0, 3)}-{me.familyCode!.slice(3)}
          </p>
          <p className="text-xs text-ink-3 mt-1">Il le saisit dans son Espace parent.</p>
        </div>
      ) : (
        <form action={createFamilyCode} className="mb-4">
          <button type="submit" className="btn-primary w-full">Générer un code famille</button>
        </form>
      )}

      <form action={setShareMood} className="flex items-center gap-3">
        <label className="flex items-center gap-3 flex-1 cursor-pointer">
          <input type="checkbox" name="shareMood" defaultChecked={me.shareMood} className="h-5 w-5 accent-[var(--green)]" />
          <span className="text-sm">
            Partager mon humeur du journal
            <span className="block text-xs text-ink-3">Le contenu de tes pages reste toujours privé.</span>
          </span>
        </label>
        <button type="submit" className="btn-ghost !py-1.5">OK</button>
      </form>
    </section>
  );
}
