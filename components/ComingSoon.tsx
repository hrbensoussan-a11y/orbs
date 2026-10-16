import type { LucideIcon } from "lucide-react";

const TONE_CLASS: Record<string, string> = {
  green: "green",
  amber: "amber",
  coral: "coral",
  sky: "sky",
  lilac: "lilac",
};

export function ComingSoon({
  Icon,
  title,
  description,
  note,
  tone = "green",
}: {
  Icon: LucideIcon;
  title: string;
  description: string;
  note: string;
  tone?: "green" | "amber" | "coral" | "sky" | "lilac";
}) {
  return (
    <div className="mx-auto max-w-md px-4 pt-[calc(env(safe-area-inset-top,0px)+18px)]">
      <div className="card p-8 flex flex-col items-center text-center gap-4 mt-6">
        <span className={`icon-chip ${TONE_CLASS[tone]} !w-16 !h-16 !rounded-[22px]`}>
          <Icon size={30} strokeWidth={1.8} aria-hidden />
        </span>
        <h1 className="text-2xl font-semibold">{title}</h1>
        <p className="text-ink-2 leading-relaxed max-w-[34ch]">{description}</p>
        <span className="chip mt-1">Bientôt</span>
        <p className="text-xs text-ink-3 mt-1">{note}</p>
      </div>
    </div>
  );
}
