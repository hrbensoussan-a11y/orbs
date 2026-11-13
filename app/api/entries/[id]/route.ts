import { NextResponse, type NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { parseTags } from "@/lib/definitions";
import { tagConnectInput } from "@/lib/entries";

function normalizeMood(value: unknown): number | null {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1 || n > 5) return null;
  return n;
}

function parseDate(value: unknown): Date | undefined {
  if (typeof value !== "string" || !value) return undefined;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

async function ownedEntry(userId: string, id: string) {
  const entry = await prisma.entry.findUnique({
    where: { id },
    select: { userId: true },
  });
  if (!entry) return "not-found" as const;
  if (entry.userId !== userId) return "forbidden" as const;
  return "ok" as const;
}

export async function GET(
  _request: NextRequest,
  ctx: RouteContext<"/api/entries/[id]">,
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const entry = await prisma.entry.findUnique({
    where: { id },
    include: { tags: true },
  });
  if (!entry || entry.userId !== user.id) {
    return NextResponse.json({ error: "not-found" }, { status: 404 });
  }
  return NextResponse.json(entry);
}

export async function PATCH(
  request: NextRequest,
  ctx: RouteContext<"/api/entries/[id]">,
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;

  const owner = await ownedEntry(user.id, id);
  if (owner === "not-found")
    return NextResponse.json({ error: "not-found" }, { status: 404 });
  if (owner === "forbidden")
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = await request.json().catch(() => ({}) as Record<string, unknown>);
  const data: Prisma.EntryUpdateInput = {};

  if ("content" in body) data.content = String(body.content ?? "");
  if ("title" in body)
    data.title = body.title ? String(body.title).slice(0, 200) : null;
  if ("mood" in body) data.mood = normalizeMood(body.mood);
  if ("location" in body)
    data.location = body.location ? String(body.location).slice(0, 200) : null;
  if ("promptText" in body)
    data.promptText = body.promptText
      ? String(body.promptText).slice(0, 500)
      : null;
  if ("template" in body)
    data.template = body.template ? String(body.template).slice(0, 50) : null;
  if ("favorite" in body) data.favorite = Boolean(body.favorite);
  if ("pinned" in body) data.pinned = Boolean(body.pinned);
  if ("locked" in body) data.locked = Boolean(body.locked);
  if ("entryDate" in body) {
    const d = parseDate(body.entryDate);
    if (d) data.entryDate = d;
  }
  if ("tags" in body) {
    const names = parseTags(body.tags);
    data.tags = { set: [], connectOrCreate: tagConnectInput(user.id, names) };
  }

  const entry = await prisma.entry.update({
    where: { id },
    data,
    include: { tags: true },
  });
  return NextResponse.json(entry);
}

export async function DELETE(
  _request: NextRequest,
  ctx: RouteContext<"/api/entries/[id]">,
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;

  const owner = await ownedEntry(user.id, id);
  if (owner === "not-found")
    return NextResponse.json({ error: "not-found" }, { status: 404 });
  if (owner === "forbidden")
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  await prisma.entry.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
