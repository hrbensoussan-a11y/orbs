import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { EntryWithTags } from "@/lib/entries";
import { formatLongDate } from "@/lib/format";
import { moodEmoji, MOODS } from "@/lib/definitions";

function renderMarkdown(e: EntryWithTags): string {
  const lines: string[] = [];
  const date = formatLongDate(e.entryDate);
  lines.push(`## ${e.title ? e.title : date}`);
  const meta: string[] = [];
  if (e.title) meta.push(date); // sinon la date est déjà dans le titre
  if (e.mood) {
    const label = MOODS.find((m) => m.value === e.mood)?.label ?? "";
    meta.push(`Humeur : ${moodEmoji(e.mood) ?? ""} ${label}`.trim());
  }
  if (e.location) meta.push(`Lieu : ${e.location}`);
  if (e.tags.length) meta.push(`Tags : ${e.tags.map((t) => `#${t.name}`).join(" ")}`);
  if (meta.length) lines.push(`*${meta.join(" · ")}*`);
  lines.push("");
  lines.push(e.content || "_(vide)_");
  return lines.join("\n");
}

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const format = request.nextUrl.searchParams.get("format") === "md" ? "md" : "json";
  const entries = await prisma.entry.findMany({
    where: { userId: user.id },
    include: { tags: true },
    orderBy: { entryDate: "asc" },
  });

  const stamp = new Date().toISOString().slice(0, 10);

  if (format === "md") {
    const header = `# Journal de ${user.name ?? user.email}\n\nExporté le ${new Date().toLocaleString("fr-FR")}\n`;
    const body =
      entries.map((e) => renderMarkdown(e)).join("\n\n---\n\n") ||
      "_Aucune entrée._";
    return new NextResponse(`${header}\n${body}\n`, {
      headers: {
        "content-type": "text/markdown; charset=utf-8",
        "content-disposition": `attachment; filename="orbs-export-${stamp}.md"`,
      },
    });
  }

  const json = JSON.stringify(
    {
      exportedAt: new Date().toISOString(),
      user: { email: user.email, name: user.name },
      entries,
    },
    null,
    2,
  );
  return new NextResponse(json, {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="orbs-export-${stamp}.json"`,
    },
  });
}
