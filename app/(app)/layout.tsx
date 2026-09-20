import type { CSSProperties } from "react";
import { cookies } from "next/headers";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AppHeader } from "@/components/AppHeader";
import { THEME_COOKIE, FONT_SIZES, type ThemeName } from "@/lib/constants";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();
  const settings = await prisma.settings.findUnique({
    where: { userId: user.id },
  });

  const theme: ThemeName =
    (await cookies()).get(THEME_COOKIE)?.value === "dark" ? "dark" : "light";

  const readingFont =
    settings?.font === "sans" ? "var(--font-sans)" : "var(--font-serif)";
  const readingSize = FONT_SIZES[settings?.fontSize ?? "base"] ?? "1.125rem";

  const style = {
    "--reading-font": readingFont,
    "--reading-size": readingSize,
  } as CSSProperties;

  return (
    <div style={style} className="min-h-dvh flex flex-col">
      <AppHeader theme={theme} />
      <main className="flex-1 w-full">{children}</main>
    </div>
  );
}
