"use client";

import { useRef, useState } from "react";
import { ArrowLeft, Trash2, Plus, Zap, Camera, X } from "lucide-react";
import type { Kind } from "@/lib/learn/types";
import { KIND_META, SUBJECTS } from "@/lib/learn/types";
import { createDeck, updateDeck } from "@/lib/learn/store";
import {
  parsePaste,
  clozeBlankCount,
  tokenizeMarked,
  toggleMarkedToken,
} from "@/lib/learn/text";
import type { LearnCtx } from "./ctx";

type Row = { t: string; d: string };
type Item = { title: string; body: string };

const SEPS: { value: string; label: string }[] = [
  { value: "auto", label: "Détection automatique" },
  { value: ":", label: "Deux-points ( : )" },
  { value: "—", label: "Tiret ( — )" },
  { value: "=", label: "Égal ( = )" },
  { value: "\t", label: "Tabulation" },
  { value: "|", label: "Barre ( | )" },
];

export function CreateDeck({
  ctx,
  editId,
  presetSubject,
  onDone,
}: {
  ctx: LearnCtx;
  editId?: string;
  presetSubject?: string;
  onDone: () => void;
}) {
  const editing = editId ? ctx.s.decks[editId] : null;
  const initialKind: Kind = editing?.kind ?? "definitions";

  const [name, setName] = useState(editing?.name ?? "");
  const [subject, setSubject] = useState(editing?.subject ?? presetSubject ?? "Autre");
  const [kind, setKind] = useState<Kind>(initialKind);

  // Éditeurs (un état par famille)
  const [rows, setRows] = useState<Row[]>(
    editing && (initialKind === "definitions" || initialKind === "questions")
      ? editing.cards.map((c) => ({ t: c.t, d: c.d }))
      : [{ t: "", d: "" }],
  );
  const [items, setItems] = useState<Item[]>(
    editing && (initialKind === "memorize" || initialKind === "order")
      ? editing.cards.map((c) => ({ title: c.t, body: c.d }))
      : [{ title: "", body: "" }],
  );
  const [passages, setPassages] = useState<string[]>(
    editing && initialKind === "cloze" ? editing.cards.map((c) => c.t) : [""],
  );

  const [paste, setPaste] = useState("");
  const [sep, setSep] = useState("auto");
  const [pasteInfo, setPasteInfo] = useState<string | null>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  const photoInput = useRef<HTMLInputElement | null>(null);

  const meta = KIND_META[kind];
  const isDefLike = kind === "definitions" || kind === "questions";
  const isTextItems = kind === "memorize" || kind === "order";

  // ---- Collage (def/questions) ----
  function applyPaste() {
    const res = parsePaste(paste, sep);
    if (!res.pairs.length) {
      setPasteInfo("Aucune carte détectée — vérifie le séparateur.");
      return;
    }
    const existing = rows.filter((r) => r.t.trim() || r.d.trim());
    setRows([...existing, ...res.pairs]);
    setPaste("");
    setPasteInfo(
      `${res.pairs.length} carte${res.pairs.length > 1 ? "s" : ""} ajoutée${res.pairs.length > 1 ? "s" : ""}` +
        (res.ignored ? ` · ${res.ignored} ligne(s) ignorée(s)` : ""),
    );
  }
  function onPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (photo) URL.revokeObjectURL(photo);
    setPhoto(URL.createObjectURL(f));
    e.target.value = "";
  }

  // ---- Pairs à enregistrer selon le type ----
  const cleanPairs: Row[] =
    kind === "cloze"
      ? passages.map((p) => p.trim()).filter((p) => clozeBlankCount(p) > 0).map((t) => ({ t, d: "" }))
      : isTextItems
        ? items
            .map((i) => ({ t: i.title.trim(), d: i.body.trim() }))
            .filter((i) => i.t && i.d)
        : rows.map((r) => ({ t: r.t.trim(), d: r.d.trim() })).filter((r) => r.t && r.d);

  const canSave = name.trim().length > 0 && cleanPairs.length > 0;

  function save() {
    if (!canSave) return;
    if (editing) updateDeck(ctx.s, editing.id, { name, subject, pairs: cleanPairs });
    else createDeck(ctx.s, name, subject, kind, cleanPairs);
    ctx.save();
    if (photo) URL.revokeObjectURL(photo);
    onDone();
  }

  const countLabel = `${cleanPairs.length} ${
    kind === "cloze" ? "passage" : "carte"
  }${cleanPairs.length > 1 ? "s" : ""}`;

  return (
    <div className="mx-auto max-w-xl px-4 pt-[calc(env(safe-area-inset-top,0px)+14px)]">
      <button className="btn-ghost !py-1.5 mb-4" onClick={onDone}>
        <ArrowLeft size={16} aria-hidden /> Tous les paquets
      </button>

      <h1 className="text-2xl font-semibold mb-5">{editing ? "Modifier le paquet" : "Nouveau paquet"}</h1>

      <div className="flex flex-col gap-5">
        <label className="flex flex-col gap-1.5">
          <span className="text-sm text-ink-2">Nom du paquet</span>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="ex. SVT — La cellule" />
        </label>

        <div>
          <div className="text-sm text-ink-2 mb-2">Matière</div>
          <div className="flex flex-wrap gap-2">
            {[...SUBJECTS, "Autre"].map((s) => (
              <button
                key={s}
                onClick={() => setSubject(s)}
                className={
                  subject === s
                    ? "rounded-full px-3.5 py-1.5 text-sm font-medium bg-[var(--green)] text-white"
                    : "btn-ghost !py-1.5 !px-3.5 text-sm"
                }
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        {!editing && (
          <div>
            <div className="text-sm text-ink-2 mb-2">Type de fiche</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {(Object.keys(KIND_META) as Kind[]).map((k) => {
                const m = KIND_META[k];
                const active = kind === k;
                return (
                  <button
                    key={k}
                    onClick={() => setKind(k)}
                    className={`card p-3.5 text-left transition ${active ? "!border-[var(--green)] ring-1 ring-[var(--green)]" : ""}`}
                  >
                    <div className="font-semibold">{m.label}</div>
                    <p className="text-sm text-ink-2 mt-1 leading-snug">{m.desc}</p>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* ---------- Éditeur : Définitions / Questions ---------- */}
        {isDefLike && (
          <>
            <section className="card p-4">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 font-semibold">
                  <Zap size={17} className="text-amber" aria-hidden /> Coller mon cours d’un coup
                </div>
                <button className="btn-ghost !py-1.5" onClick={() => photoInput.current?.click()}>
                  <Camera size={15} aria-hidden /> Photo
                </button>
                <input ref={photoInput} type="file" accept="image/*" hidden onChange={onPhoto} />
              </div>
              <p className="text-sm text-ink-2 mt-1 mb-3">
                Une ligne par carte. Le séparateur est détecté tout seul.
              </p>
              {photo && (
                <div className="mb-3">
                  <div className="flex items-center justify-between mb-1 text-sm text-ink-2">
                    <span>Recopie le contenu ci-dessous 👇</span>
                    <button className="text-ink-3 hover:text-ink" onClick={() => { URL.revokeObjectURL(photo); setPhoto(null); }} aria-label="Retirer la photo">
                      <X size={16} aria-hidden />
                    </button>
                  </div>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={photo} alt="Cours importé" className="rounded-[var(--r-inner)] max-h-64 w-auto mx-auto border border-line" />
                </div>
              )}
              <textarea
                className="input min-h-32 font-mono !text-sm"
                value={paste}
                onChange={(e) => setPaste(e.target.value)}
                placeholder={"mot : définition\nautre mot : sa définition\nterme — explication"}
              />
              <div className="flex flex-wrap items-center gap-3 mt-3">
                <select className="input max-w-56" value={sep} onChange={(e) => setSep(e.target.value)}>
                  {SEPS.map((s) => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </select>
                <button className="btn-primary" onClick={applyPaste} disabled={!paste.trim()}>
                  Créer les cartes
                </button>
              </div>
              {pasteInfo && <p className="text-sm text-ink-2 mt-2">{pasteInfo}</p>}
            </section>

            <section>
              <div className="flex items-center justify-between mb-2">
                <h2 className="font-semibold">Cartes</h2>
                <span className="text-sm text-ink-3">{countLabel}</span>
              </div>
              <div className="flex flex-col gap-2.5">
                {rows.map((r, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <input className="input" value={r.t} onChange={(e) => setRows((rs) => rs.map((x, j) => (j === i ? { ...x, t: e.target.value } : x)))} placeholder={meta.f1} />
                    <input className="input" value={r.d} onChange={(e) => setRows((rs) => rs.map((x, j) => (j === i ? { ...x, d: e.target.value } : x)))} placeholder={meta.f2 || "Réponse"} />
                    <button className="btn-ghost !px-2.5 shrink-0" onClick={() => setRows((rs) => (rs.length > 1 ? rs.filter((_, j) => j !== i) : rs))} aria-label="Retirer">
                      <Trash2 size={15} className="text-coral" aria-hidden />
                    </button>
                  </div>
                ))}
              </div>
              <button className="btn-ghost w-full mt-3" onClick={() => setRows((rs) => [...rs, { t: "", d: "" }])}>
                <Plus size={16} aria-hidden /> Ajouter une carte
              </button>
            </section>
          </>
        )}

        {/* ---------- Éditeur : Par cœur / Remettre dans l'ordre ---------- */}
        {isTextItems && (
          <section>
            <div className="flex items-center justify-between mb-2">
              <h2 className="font-semibold">{countLabel}</h2>
            </div>
            <p className="text-sm text-ink-2 mb-3">
              {kind === "order"
                ? "Écris les éléments dans le BON ordre, un par ligne. Ils seront mélangés à la révision."
                : "Le titre pour t’y retrouver, puis le texte exact à mémoriser."}
            </p>
            <div className="flex flex-col gap-4">
              {items.map((it, i) => (
                <div key={i} className="card p-3.5 flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <input className="input" value={it.title} onChange={(e) => setItems((xs) => xs.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))} placeholder="Titre" />
                    <button className="btn-ghost !px-2.5 shrink-0" onClick={() => setItems((xs) => (xs.length > 1 ? xs.filter((_, j) => j !== i) : xs))} aria-label="Retirer">
                      <Trash2 size={15} className="text-coral" aria-hidden />
                    </button>
                  </div>
                  <textarea
                    className="input min-h-24"
                    value={it.body}
                    onChange={(e) => setItems((xs) => xs.map((x, j) => (j === i ? { ...x, body: e.target.value } : x)))}
                    placeholder={kind === "order" ? "Premier élément\nDeuxième élément\nTroisième élément" : "Le texte à connaître, mot pour mot…"}
                  />
                </div>
              ))}
            </div>
            <button className="btn-ghost w-full mt-3" onClick={() => setItems((xs) => [...xs, { title: "", body: "" }])}>
              <Plus size={16} aria-hidden /> Ajouter {kind === "order" ? "une liste" : "un texte"}
            </button>
          </section>
        )}

        {/* ---------- Éditeur : Texte à trous ---------- */}
        {kind === "cloze" && (
          <section>
            <div className="flex items-center justify-between mb-2">
              <h2 className="font-semibold">{countLabel}</h2>
            </div>
            <p className="text-sm text-ink-2 mb-3">
              Colle un passage de ton cours, puis clique les mots à cacher.
            </p>
            <div className="flex flex-col gap-4">
              {passages.map((p, i) => (
                <div key={i} className="card p-3.5 flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-ink-2">Passage {i + 1}</span>
                    <button className="btn-ghost !px-2.5" onClick={() => setPassages((ps) => (ps.length > 1 ? ps.filter((_, j) => j !== i) : ps))} aria-label="Retirer">
                      <Trash2 size={15} className="text-coral" aria-hidden />
                    </button>
                  </div>
                  <textarea
                    className="input min-h-24"
                    value={p}
                    onChange={(e) => setPassages((ps) => ps.map((x, j) => (j === i ? e.target.value : x)))}
                    placeholder="Colle ici un passage de ton cours…"
                  />
                  <div className="text-xs text-ink-3">Clique un mot pour le cacher (ou le réafficher).</div>
                  <ClozePreview text={p} onChange={(next) => setPassages((ps) => ps.map((x, j) => (j === i ? next : x)))} />
                </div>
              ))}
            </div>
            <button className="btn-ghost w-full mt-3" onClick={() => setPassages((ps) => [...ps, ""])}>
              <Plus size={16} aria-hidden /> Ajouter un passage
            </button>
          </section>
        )}

        <button className="btn-primary w-full !py-3 text-base" onClick={save} disabled={!canSave}>
          {editing ? "Enregistrer les modifications" : "Enregistrer le paquet"}
        </button>
        <p className="text-center text-xs text-ink-3 pb-2">
          Tes fiches sont enregistrées dans ton navigateur, rien n’est envoyé nulle part.
        </p>
      </div>
    </div>
  );
}

/* Aperçu cloze cliquable : chaque mot est un bouton ; un trou est surligné. */
function ClozePreview({ text, onChange }: { text: string; onChange: (next: string) => void }) {
  const tokens = tokenizeMarked(text);
  if (!text.trim()) {
    return <div className="rounded-[var(--r-inner)] bg-fill p-3 text-sm text-ink-3 italic">L’aperçu apparaîtra ici.</div>;
  }
  return (
    <div className="rounded-[var(--r-inner)] bg-fill p-3 leading-relaxed whitespace-pre-wrap">
      {tokens.map((tk, i) => {
        if (tk.kind === "other") return <span key={i}>{tk.src}</span>;
        const blank = tk.kind === "blank";
        return (
          <button
            key={i}
            onClick={() => onChange(toggleMarkedToken(tokens, i))}
            className={`rounded-md px-0.5 transition ${
              blank
                ? "bg-[color-mix(in_srgb,var(--green)_22%,transparent)] text-green-ink font-medium"
                : "hover:bg-fill2"
            }`}
          >
            {tk.word}
          </button>
        );
      })}
    </div>
  );
}
