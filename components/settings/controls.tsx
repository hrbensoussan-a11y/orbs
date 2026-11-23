"use client";

// Briques visuelles des Réglages — Verre & Jardin, inspiration iOS.
//
//   <SettingsGroup title="…">          groupe titré (une seule carte de verre)
//     <SettingRow id="…" title desc>   ligne : texte à gauche, contrôle à droite
//       <Switch … />                    (ou `stack` : contrôle sous le texte)
//
// Les lignes sont séparées par un filet discret (pas de bordure partout) et
// portent l'ancre `reglage-<id>` utilisée par la recherche des Réglages.

import type { ReactNode } from "react";
import Link from "next/link";
import { Check, ChevronRight } from "lucide-react";
import { settingAnchor } from "@/lib/settings/catalog";

export function SettingsGroup({
  title,
  footer,
  children,
}: {
  title?: string;
  /** Note discrète sous le groupe (explication, limite honnête). */
  footer?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="st-group">
      {title && <h3 className="st-group-title">{title}</h3>}
      <div className="st-list">{children}</div>
      {footer && <div className="st-group-footer">{footer}</div>}
    </section>
  );
}

export function SettingRow({
  id,
  title,
  desc,
  icon,
  stack,
  disabled,
  children,
}: {
  /** Ancre pour la recherche (voir lib/settings/catalog). */
  id?: string;
  title: ReactNode;
  desc?: ReactNode;
  icon?: ReactNode;
  /** Contrôle sous le texte (grilles, sélecteurs larges). */
  stack?: boolean;
  /** Ligne inactive (dépend d'un autre réglage désactivé). */
  disabled?: boolean;
  children?: ReactNode;
}) {
  return (
    <div
      id={id ? settingAnchor(id) : undefined}
      className={`st-row${stack ? " st-row--stack" : ""}${disabled ? " st-row--off" : ""}`}
      aria-disabled={disabled || undefined}
    >
      <div className="st-row-head">
        {icon && (
          <span className="st-row-icon" aria-hidden>
            {icon}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="st-row-title">{title}</p>
          {desc && <p className="st-row-desc">{desc}</p>}
        </div>
        {!stack && children !== undefined && <div className="st-row-control">{children}</div>}
      </div>
      {stack && children !== undefined && <div className="st-row-body">{children}</div>}
    </div>
  );
}

/** Interrupteur accessible (role="switch"), style iOS. */
export function Switch({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="st-switch"
    >
      <span className="st-switch-knob" />
    </button>
  );
}

/** Choix exclusif sous forme de pastilles (style segmenté). */
export function Segmented<T extends string | number>({
  value,
  options,
  onChange,
  label,
  disabled,
}: {
  value: T;
  options: readonly { value: T; label: ReactNode }[];
  onChange: (v: T) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <div className="st-seg" role="radiogroup" aria-label={label}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={String(o.value)}
            type="button"
            role="radio"
            aria-checked={on}
            disabled={disabled}
            onClick={() => onChange(o.value)}
            className="st-seg-item"
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** Tuile de choix (thème, voix, mode…) avec coche quand elle est choisie. */
export function OptionTile({
  selected,
  onSelect,
  children,
  label,
  disabled,
  className = "",
}: {
  selected: boolean;
  onSelect: () => void;
  children: ReactNode;
  label?: string;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      aria-label={label}
      disabled={disabled}
      onClick={onSelect}
      className={`st-tile ${className}`}
    >
      {children}
      <span className="st-tile-check" aria-hidden>
        <Check size={12} strokeWidth={3} />
      </span>
    </button>
  );
}

/** Ligne-lien vers une autre page (ex. Centre de compte), avec chevron. */
export function SettingLink({
  id,
  href,
  title,
  desc,
  icon,
}: {
  id?: string;
  href: string;
  title: ReactNode;
  desc?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <Link href={href} id={id ? settingAnchor(id) : undefined} className="st-row st-row--link">
      <span className="st-row-head">
        {icon && (
          <span className="st-row-icon" aria-hidden>
            {icon}
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className="st-row-title block">{title}</span>
          {desc && <span className="st-row-desc block">{desc}</span>}
        </span>
        <ChevronRight size={17} aria-hidden className="st-chevron" />
      </span>
    </Link>
  );
}

/**
 * Lien vers une catégorie voisine des Réglages (« Voir aussi »), sans quitter
 * la page : les rappels, par exemple, se règlent entre Notifications (son) et
 * Agenda (quand être prévenu·e).
 */
export function SettingJump({
  category,
  title,
  desc,
  icon,
}: {
  category: string;
  title: ReactNode;
  desc?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <button
      type="button"
      className="st-jump"
      onClick={() => {
        window.history.pushState(null, "", `/settings?c=${category}`);
        window.scrollTo({ top: 0 });
      }}
    >
      {icon && (
        <span className="st-row-icon" aria-hidden>
          {icon}
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="st-jump-title">{title}</span>
        {desc && <span className="st-jump-desc">{desc}</span>}
      </span>
      <ChevronRight size={17} aria-hidden className="st-chevron" />
    </button>
  );
}

/**
 * Choix multiples en pastilles (profil d'apprentissage, jours de repos…) :
 * chaque pastille est un bouton à bascule (`aria-pressed`) ; une coche
 * apparaît sur les pastilles choisies.
 */
export function PillToggles({
  options,
  selected,
  onToggle,
  label,
  disabled,
  isDisabled,
  className = "",
}: {
  options: readonly { id: string; label: ReactNode; ariaLabel?: string }[];
  selected: readonly string[];
  onToggle: (id: string) => void;
  label: string;
  disabled?: boolean;
  /** Désactive une pastille précise (ex. dernier jour actif). */
  isDisabled?: (id: string, on: boolean) => boolean;
  className?: string;
}) {
  return (
    <div className={`st-pills ${className}`} role="group" aria-label={label}>
      {options.map((o) => {
        const on = selected.includes(o.id);
        return (
          <button
            key={o.id}
            type="button"
            className="st-pill"
            aria-pressed={on}
            aria-label={o.ariaLabel}
            disabled={disabled || isDisabled?.(o.id, on)}
            onClick={() => onToggle(o.id)}
          >
            <Check size={13} strokeWidth={3} aria-hidden className="st-pill-check" />
            <span>{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}
