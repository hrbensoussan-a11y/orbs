import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";

export type EntryWithTags = Prisma.EntryGetPayload<{
  include: { tags: true };
}>;

/** connectOrCreate pour attacher des tags (créés à la volée par utilisateur). */
export function tagConnectInput(userId: string, names: string[]) {
  return names.map((name) => ({
    where: { userId_name: { userId, name } },
    create: { userId, name },
  }));
}

/** Aperçu texte : retire le balisage Markdown le plus courant et tronque. */
export function excerpt(content: string, max = 180): string {
  const plain = content
    .replace(/```[\s\S]*?```/g, " ") // blocs de code
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ") // images
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1") // liens -> texte
    .replace(/[#>*_`~\-]+/g, " ") // marqueurs md
    .replace(/\s+([,.;:!?…])/g, "$1") // espace avant ponctuation
    .replace(/\s+/g, " ")
    .trim();
  if (plain.length <= max) return plain;
  return plain.slice(0, max).trimEnd() + "…";
}

export async function getTimelineEntries(
  userId: string,
): Promise<EntryWithTags[]> {
  return prisma.entry.findMany({
    where: { userId },
    include: { tags: true },
    orderBy: [{ pinned: "desc" }, { entryDate: "desc" }, { createdAt: "desc" }],
  });
}

export async function getEntry(
  userId: string,
  id: string,
): Promise<EntryWithTags | null> {
  const entry = await prisma.entry.findUnique({
    where: { id },
    include: { tags: true },
  });
  if (!entry || entry.userId !== userId) return null;
  return entry;
}

export type SearchFilters = {
  query?: string;
  mood?: number;
  tag?: string;
  from?: Date;
  to?: Date;
};

export async function searchEntries(
  userId: string,
  filters: SearchFilters,
): Promise<EntryWithTags[]> {
  const where: Prisma.EntryWhereInput = { userId };

  if (filters.query && filters.query.trim()) {
    const q = filters.query.trim();
    where.OR = [{ title: { contains: q } }, { content: { contains: q } }];
  }
  if (filters.mood) where.mood = filters.mood;
  if (filters.tag) where.tags = { some: { userId, name: filters.tag } };
  if (filters.from || filters.to) {
    where.entryDate = {};
    if (filters.from) where.entryDate.gte = filters.from;
    if (filters.to) where.entryDate.lte = filters.to;
  }

  return prisma.entry.findMany({
    where,
    include: { tags: true },
    orderBy: [{ entryDate: "desc" }, { createdAt: "desc" }],
    take: 200,
  });
}

/** Toutes les étiquettes de l'utilisateur, avec un décompte d'usage. */
export async function getUserTags(userId: string) {
  return prisma.tag.findMany({
    where: { userId },
    include: { _count: { select: { entries: true } } },
    orderBy: { name: "asc" },
  });
}
