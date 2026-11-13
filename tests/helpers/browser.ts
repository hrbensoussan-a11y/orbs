import { vi } from "vitest";

// Faux navigateur minimal pour tester le stockage local sans DOM réel :
// un `localStorage` en mémoire, une fenêtre et un document qui savent émettre
// des évènements. Suffisant pour les magasins d'Orbs, qui ne font que lire et
// écrire des chaînes.

export class MemoryStorage implements Storage {
  private data = new Map<string, string>();
  /** Si défini, `setItem` échoue (stockage plein / mode privé). */
  failWrites = false;

  get length(): number {
    return this.data.size;
  }
  clear(): void {
    this.data.clear();
  }
  getItem(key: string): string | null {
    return this.data.has(key) ? (this.data.get(key) as string) : null;
  }
  key(index: number): string | null {
    return [...this.data.keys()][index] ?? null;
  }
  removeItem(key: string): void {
    this.data.delete(key);
  }
  setItem(key: string, value: string): void {
    if (this.failWrites) throw new Error("QuotaExceededError");
    this.data.set(key, String(value));
  }
  /** Toutes les clés présentes (pour vérifier où les données atterrissent). */
  keys(): string[] {
    return [...this.data.keys()];
  }
  /** Copie de tout le contenu (pour vérifier que rien n'a bougé). */
  snapshot(): Record<string, string> {
    return Object.fromEntries(this.data);
  }
}

export type FakeBrowser = {
  localStorage: MemoryStorage;
  sessionStorage: MemoryStorage;
  window: EventTarget & { localStorage: MemoryStorage; sessionStorage: MemoryStorage };
  document: EventTarget & { hidden: boolean };
  /** Simule l'évènement reçu quand un AUTRE onglet modifie le stockage. */
  emitStorage(key: string | null, newValue: string | null): void;
  /** Simule le retour d'une page depuis le cache du navigateur. */
  emitPageShow(persisted: boolean): void;
  /** Simule le retour sur l'onglet. */
  emitVisible(): void;
};

/** Installe `window` et `document` globaux. À appeler dans `beforeEach`. */
export function installBrowser(): FakeBrowser {
  const localStorage = new MemoryStorage();
  const sessionStorage = new MemoryStorage();
  const window = Object.assign(new EventTarget(), { localStorage, sessionStorage });
  const document = Object.assign(new EventTarget(), { hidden: false });
  vi.stubGlobal("window", window);
  vi.stubGlobal("document", document);
  return {
    localStorage,
    sessionStorage,
    window,
    document,
    emitStorage(key, newValue) {
      window.dispatchEvent(Object.assign(new Event("storage"), { key, newValue }));
    },
    emitPageShow(persisted) {
      window.dispatchEvent(Object.assign(new Event("pageshow"), { persisted }));
    },
    emitVisible() {
      document.hidden = false;
      document.dispatchEvent(new Event("visibilitychange"));
    },
  };
}
