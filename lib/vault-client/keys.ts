// Vault key lives only in this module's memory: not React state, not storage. A page reload locks the vault.
// shortcut: raw bytes, not a non-extractable CryptoKey in a worker; harden before shipping beyond personal use.
type Unlocked = { vk: Uint8Array; userId: string };
let vault: Unlocked | null = null;
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());

export const setVault = (vk: Uint8Array, userId: string) => {
  vault = { vk, userId };
  emit();
};
export const getVault = () => vault;
export const isUnlocked = () => vault !== null;
export const lockVault = () => {
  vault?.vk.fill(0);
  vault = null;
  emit();
};
export const subscribe = (f: () => void) => {
  subs.add(f);
  return () => {
    subs.delete(f);
  };
};
