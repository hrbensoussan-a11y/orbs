import { NextResponse, type NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { parseTags } from "@/lib/definitions";
import { tagConnectInput, searchEntries } from "@/lib/entries";

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

// GET /api/entries?query=&mood=&tag=&from=&to=  -> liste filtrée
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const p = request.nextUrl.searchParams;
  const moodRaw = p.get("mood");
  const entries = await searchEntries(user.id, {
    query: p.get("query") ?? undefined,
    mood: moodRaw ? Number(moodRaw) : undefined,
    tag: p.get("tag") ?? undefined,
    from: parseDate(p.get("from")),
    to: parseDate(p.get("to")),
  });
  return NextResponse.json(entries);
}

// POST /api/entries  -> crée une entrée (tous les champs optionnels)
export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => ({}) as Record<string, unknown>);

  const data: Prisma.EntryCreateInput = {
    user: { connect: { id: user.id } },
    content: typeof body.content === "string" ? body.content : "",
    title: body.title ? String(body.title).slice(0, 200) : null,
    mood: normalizeMood(body.mood),
    location: body.location ? String(body.location).slice(0, 200) : null,
    promptText: body.promptText ? String(body.promptText).slice(0, 500) : null,
    template: body.template ? String(body.template).slice(0, 50) : null,
  };
  const entryDate = parseDate(body.entryDate);
  if (entryDate) data.entryDate = entryDate;

  const names = parseTags(body.tags);
  if (names.length) {
    data.tags = { connectOrCreate: tagConnectInput(user.id, names) };
  }

  const entry = await prisma.entry.create({ data, include: { tags: true } });
  return NextResponse.json(entry, { status: 201 });
}
