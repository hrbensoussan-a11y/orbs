import { Suspense } from "react";
import {
  CreditCard,
  Database,
  Download,
  FileJson,
  FileText,
  LogOut,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logout } from "@/app/actions/auth";
import { getBillingState } from "@/lib/billing/store";
import { isProAccountEmail } from "@/lib/proAccess";
import { displayName } from "@/lib/family";
import { Avatar } from "@/components/avatar/Avatar";
import { ConfirmSubmit } from "@/components/ConfirmSubmit";
import { SettingsShell } from "@/components/settings/SettingsShell";
import { SettingLink, SettingRow, SettingsGroup } from "@/components/settings/controls";
import { AppearanceSettings } from "@/components/settings/AppearanceSettings";
import { LearningSettings } from "@/components/settings/LearningSettings";
import { AssistantSettings } from "@/components/settings/AssistantSettings";
import { LearningProfileSettings } from "@/components/settings/LearningProfileSettings";
import { AiHistorySettings } from "@/components/settings/AiHistorySettings";
import { toAiRetention } from "@/lib/ai/retention";
import { toAiStyle } from "@/lib/ai/style";
import { parseLearningProfile } from "@/lib/ai/learningProfile";
import { AiOrbSettings } from "@/components/ai/AiOrbSettings";
import { AiTagsSettings } from "@/components/ai/AiTagsSettings";
import {
  AgendaReminderSettings,
  NotificationGeneralSettings,
} from "@/components/agenda/NotificationSettings";

export const dynamic = "force-dynamic";

// Réglages d'Orbs : six catégories, une navigation intérieure (menu latéral
// sur grand écran, liste iOS sur mobile) et une recherche. Chaque contrôle est
// relié à un réglage réel ; rien n'est dupliqué du Centre de compte (/compte),
// vers lequel la catégorie « Compte et données » renvoie.

export default async function SettingsPage() {
  const user = await requireUser();
  const [settings, billing] = await Promise.all([
    prisma.settings.findUnique({
      where: { userId: user.id },
      select: {
        fontSize: true,
        lineSpacing: true,
        aiStyle: true,
        learningProfile: true,
        aiRetention: true,
        aiHistoryClearedAt: true,
      },
    }),
    getBillingState(user.id),
  ]);
  const pro = isProAccountEmail(user.email);
  const name = [user.firstName, user.lastName].filter(Boolean).join(" ").trim() || displayName(user);

  const compte = (
    <>
      <SettingsGroup title="Mon compte">
        <div className="st-row">
          <div className="st-row-head">
            <span className="st-account-avatar !w-14 !h-14" aria-hidden>
              <Avatar config={user.avatar} size={56} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="st-row-title !text-[1.05rem] !font-semibold">{name}</p>
              <p className="st-row-desc truncate">{pro ? "Compte professionnel (accès par code)" : user.email}</p>
            </div>
          </div>
        </div>
        <SettingLink
          id="centre-compte"
          href="/compte#profil"
          icon={<UserRound size={17} />}
          title="Profil"
          desc="Nom, classe, établissement et avatar"
        />
        <SettingLink
          href="/compte#securite"
          icon={<ShieldCheck size={17} />}
          title="Sécurité"
          desc={pro ? "Accès par code professionnel" : "Mot de passe"}
        />
        <SettingLink
          href="/compte#abonnement"
          icon={<CreditCard size={17} />}
          title="Abonnement et crédits"
          desc={billing.hasPaidAccess ? "Ton offre et tes crédits IA" : "Découvrir Orbs Plus et Ultimate"}
        />
        <SettingLink
          href="/compte#donnees"
          icon={<Database size={17} />}
          title="Mes données"
          desc="Archive complète du compte, suppression"
        />
      </SettingsGroup>

      <SettingsGroup
        title="Journal"
        footer="Ton journal t’appartient : l’export est libre et complet. C’est aussi ta sauvegarde, garde une copie en lieu sûr."
      >
        <SettingRow
          id="export-journal"
          icon={<Download size={17} />}
          title="Exporter mon journal"
          desc="Toutes tes pages, avec leurs humeurs et leurs tags."
          stack
        >
          <div className="flex flex-wrap gap-2.5">
            <a href="/api/export?format=json" className="btn-ghost" download>
              <FileJson size={15} aria-hidden /> JSON
            </a>
            <a href="/api/export?format=md" className="btn-ghost" download>
              <FileText size={15} aria-hidden /> Markdown
            </a>
          </div>
        </SettingRow>
      </SettingsGroup>

      <SettingsGroup>
        <SettingRow
          id="deconnexion"
          icon={<LogOut size={17} />}
          title="Se déconnecter"
          desc="Tes données restent sur ton compte."
        >
          <form action={logout}>
            <ConfirmSubmit
              className="btn-ghost"
              tone="danger"
              icon={<LogOut size={20} />}
              title="Se déconnecter ?"
              message={
                pro
                  ? "Tu te reconnecteras avec ton code professionnel. Tes données restent sur ton compte."
                  : "Tu devras te reconnecter avec ton e-mail et ton mot de passe. Tes données restent sur ton compte."
              }
              confirmLabel="Oui, me déconnecter"
              cancelLabel="Non, rester"
            >
              <span style={{ color: "var(--coral)" }}>Déconnexion</span>
            </ConfirmSubmit>
          </form>
        </SettingRow>
      </SettingsGroup>
    </>
  );

  return (
    <div className="st-page">
      {/* useSearchParams (catégorie ouverte) : rendu client sous Suspense. */}
      <Suspense>
        <SettingsShell
          account={{
            name,
            email: pro ? "Compte professionnel" : user.email,
            avatar: <Avatar config={user.avatar} size={52} />,
          }}
          sections={{
            apparence: (
              <AppearanceSettings
                initialFontSize={settings?.fontSize ?? "base"}
                initialLineSpacing={settings?.lineSpacing ?? "normal"}
              />
            ),
            notifications: <NotificationGeneralSettings />,
            agenda: <AgendaReminderSettings />,
            apprentissage: <LearningSettings />,
            assistant: (
              <>
                <AssistantSettings
                  hasPaidAccess={billing.hasPaidAccess}
                  initialStyle={toAiStyle(settings?.aiStyle)}
                />
                <LearningProfileSettings
                  initial={{
                    schoolClass: user.schoolClass ?? "",
                    profile: parseLearningProfile(settings?.learningProfile),
                  }}
                  firstName={(user.firstName || "").trim() || null}
                />
                <AiHistorySettings
                  initialRetention={toAiRetention(settings?.aiRetention)}
                  initialClearedAt={settings?.aiHistoryClearedAt?.getTime() ?? null}
                />
                <AiOrbSettings />
                <AiTagsSettings />
              </>
            ),
            compte,
          }}
        />
      </Suspense>
    </div>
  );
}
