import type { CSSProperties } from "react";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { BottomNav } from "@/components/BottomNav";
import { FONT_SIZES } from "@/lib/constants";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();
  const settings = await prisma.settings.findUnique({
    where: { userId: user.id },
  });

  const readingSize = FONT_SIZES[settings?.fontSize ?? "base"] ?? "1.0625rem";
  const style = { "--reading-size": readingSize } as CSSProperties;

  return (
    <div style={style} className="min-h-dvh">
      {/* Le fond vivant est global (body::before/::after). */}
      <main className="w-full pb-28">{children}</main>
      <BottomNav />
    </div>
  );
}
