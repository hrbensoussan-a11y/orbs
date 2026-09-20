"use client";

import { useState } from "react";
import { ArrowLeft, Trash2, Plus, Zap } from "lucide-react";
import type { Kind } from "@/lib/learn/types";
import { KIND_META, SUBJECTS } from "@/lib/learn/types";
import { createDeck, updateDeck } from "@/lib/learn/store";
import { parsePaste } from "@/lib/learn/text";
import type { LearnCtx } from "./ctx";

type Row = { t: string; d: string };

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

  const [name, setName] = useState(editing?.name ?? "");
  const [subject, setSubject] = useState(editing?.subject ?? presetSubject ?? "Autre");
  const [kind, setKind] = useState<Kind>(editing?.kind ?? "definitions");
  const [rows, setRows] = useState<Row[]>(
    editing ? editing.cards.map((c) => ({ t: c.t, d: c.d })) : [{ t: "", d: "" }],
  );
  const [paste, setPaste] = useState("");
  const [sep, setSep] = useState("auto");
  const [pasteInfo, setPasteInfo] = useState<string | null>(null);

  const meta = KIND_META[kind];

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

  function setRow(i: number, patch: Partial<Row>) {
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  }
  function addRow() {
    setRows((rs) => [...rs, { t: "", d: "" }]);
  }
  function removeRow(i: number) {
    setRows((rs) => (rs.length > 1 ? rs.filter((_, j) => j !== i) : rs));
  }

  const cleanPairs = rows
    .map((r) => ({ t: r.t.trim(), d: r.d.trim() }))
    .filter((r) => r.t && r.d);
  const canSave = name.trim().length > 0 && cleanPairs.length > 0;

  function save() {
    if (!canSave) return;
    if (editing) {
      updateDeck(ctx.s, editing.id, { name, subject, pairs: cleanPairs });
    } else {
      createDeck(ctx.s, name, subject, kind, cleanPairs);
    }
    ctx.save();
    onDone();
  }

  return (
    <div className="mx-auto max-w-xl px-4 pt-[calc(env(safe-area-inset-top,0px)+14px)]">
      <button className="btn-ghost !py-1.5 mb-4" onClick={onDone}>
        <ArrowLeft size={16} aria-hidden /> Tous les paquets
      </button>

      <h1 className="text-2xl font-semibold mb-5 flex items-center gap-2">
        {editing ? "Modifier le paquet" : "Nouveau paquet"}
      </h1>

      <div className="flex flex-col gap-5">
        <label className="flex flex-col gap-1.5">
          <span className="text-sm text-ink-2">Nom du paquet</span>
          <input
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="ex. SVT — La cellule"
          />
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
                    disabled={!m.ready}
                    onClick={() => m.ready && setKind(k)}
                    className={`card p-3.5 text-left transition ${
                      active ? "!border-[var(--green)] ring-1 ring-[var(--green)]" : ""
                    } ${m.ready ? "" : "opacity-55"}`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{m.label}</span>
                      {!m.ready && <span className="chip">bientôt</span>}
                    </div>
                    <p className="text-sm text-ink-2 mt-1 leading-snug">{m.desc}</p>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Coller un cours */}
        <section className="card p-4">
          <div className="flex items-center gap-2 font-semibold">
            <Zap size={17} className="text-amber" aria-hidden /> Coller mon cours d’un coup
          </div>
          <p className="text-sm text-ink-2 mt-1 mb-3">
            Une ligne par carte. Le séparateur entre le {meta.f1.toLowerCase()} et
            {" "}{(meta.f2 || "la réponse").toLowerCase()} est détecté tout seul.
          </p>
          <textarea
            className="input min-h-32 font-mono !text-sm"
            value={paste}
            onChange={(e) => setPaste(e.target.value)}
            placeholder={"mot : définition\nautre mot : sa définition\nterme — explication"}
          />
          <div className="flex flex-wrap items-center gap-3 mt-3">
            <select className="input max-w-56" value={sep} onChange={(e) => setSep(e.target.value)}>
              {SEPS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
            <button className="btn-primary" onClick={applyPaste} disabled={!paste.trim()}>
              Créer les cartes
            </button>
          </div>
          {pasteInfo && <p className="text-sm text-ink-2 mt-2">{pasteInfo}</p>}
        </section>

        {/* Éditeur manuel */}
        <section>
          <div className="flex items-center justify-between mb-2">
            <h2 className="font-semibold">Cartes</h2>
            <span className="text-sm text-ink-3">
              {cleanPairs.length} carte{cleanPairs.length > 1 ? "s" : ""}
            </span>
          </div>
          <div className="flex flex-col gap-2.5">
            {rows.map((r, i) => (
              <div key={i} className="flex items-start gap-2">
                <input
                  className="input"
                  value={r.t}
                  onChange={(e) => setRow(i, { t: e.target.value })}
                  placeholder={meta.f1}
                />
                <input
                  className="input"
                  value={r.d}
                  onChange={(e) => setRow(i, { d: e.target.value })}
                  placeholder={meta.f2 || "Réponse"}
                />
                <button
                  className="btn-ghost !px-2.5 shrink-0"
                  onClick={() => removeRow(i)}
                  aria-label="Retirer"
                >
                  <Trash2 size={15} className="text-coral" aria-hidden />
                </button>
              </div>
            ))}
          </div>
          <button className="btn-ghost w-full mt-3" onClick={addRow}>
            <Plus size={16} aria-hidden /> Ajouter une carte
          </button>
        </section>

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
