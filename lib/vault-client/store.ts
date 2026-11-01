import { decryptOverview, decryptSecret, encryptItem, toDraft, type Draft, type Overview, type SecretData } from "./items";
import { getVault, isUnlocked, subscribe as onKeys } from "./keys";

export type ListItem = { id: string; rev: number; updatedAt: string; overview: Overview };
type State = { status: "idle" | "loading" | "ready" | "error"; items: ListItem[]; error: string; skipped: number };

const IDLE: State = { status: "idle", items: [], error: "", skipped: 0 };
let state = IDLE;
const subs = new Set<() => void>();
const set = (s: Partial<State>) => {
  state = { ...state, ...s };
  subs.forEach((f) => f());
};

export const getState = () => state;
export const subscribe = (f: () => void) => {
  subs.add(f);
  return () => {
    subs.delete(f);
  };
};
// Locking wipes every decrypted overview from memory.
onKeys(() => {
  if (!isUnlocked() && state !== IDLE) set(IDLE);
});

const need = () => {
  const v = getVault();
  if (!v) throw new Error("Vault is locked");
  return v;
};
const json = async (res: Response) => {
  const d = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(d.error ?? "Request failed");
  return d;
};
const req = (method: string, url: string, body?: unknown) =>
  fetch(url, { method, headers: { "content-type": "application/json", "x-mv-csrf": "1" }, body: body === undefined ? undefined : JSON.stringify(body) }).then(json);

export async function loadItems() {
  const { vk, userId } = need();
  set({ status: "loading", error: "" });
  try {
    const { items } = await fetch("/api/vault/items").then(json);
    let skipped = 0;
    const out: ListItem[] = [];
    await Promise.all(
      items.map(async (i: { id: string; rev: number; updatedAt: string; overview: string }) => {
        try {
          out.push({ id: i.id, rev: i.rev, updatedAt: i.updatedAt, overview: await decryptOverview(vk, userId, i.id, i.overview) });
        } catch {
          skipped++; // tampered or foreign blob: AES-GCM refused it
        }
      }),
    );
    out.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    set({ status: "ready", items: out, skipped });
  } catch (e) {
    set({ status: "error", error: e instanceof Error ? e.message : "Could not load the vault" });
  }
}

export async function createItem(d: Draft) {
  const { vk, userId } = need();
  const id = crypto.randomUUID();
  const { overview, overviewB64, secretB64 } = await encryptItem(vk, userId, id, d);
  const r = await req("POST", "/api/vault/items", { id, overview: overviewB64, secret: secretB64 });
  set({ items: [{ id, rev: r.rev, updatedAt: r.updatedAt, overview }, ...state.items] });
  return id;
}

export async function updateItem(item: ListItem, d: Draft) {
  const { vk, userId } = need();
  const { overview, overviewB64, secretB64 } = await encryptItem(vk, userId, item.id, d, item.overview);
  const r = await req("PUT", `/api/vault/items/${item.id}`, { rev: item.rev, overview: overviewB64, secret: secretB64 });
  const next = { id: item.id, rev: r.rev, updatedAt: r.updatedAt, overview };
  set({ items: [next, ...state.items.filter((i) => i.id !== item.id)] });
}

export async function deleteItem(id: string) {
  await req("DELETE", `/api/vault/items/${id}`);
  set({ items: state.items.filter((i) => i.id !== id) });
}

/** Fetches and decrypts one item's secret half. Callers must drop the result quickly. */
export async function revealSecret(id: string): Promise<SecretData> {
  const { vk, userId } = need();
  const { secret } = await fetch(`/api/vault/items/${id}`).then(json);
  return decryptSecret(vk, userId, id, secret);
}

export async function toggleFavorite(item: ListItem) {
  const s = await revealSecret(item.id);
  await updateItem(item, { ...toDraft(item.overview, s), favorite: !item.overview.favorite });
}
