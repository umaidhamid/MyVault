import { toast } from "@/components/ui/toast";

let timer: ReturnType<typeof setTimeout> | undefined;
export const CLIPBOARD_CLEAR_MS = 20_000;

// Best effort: browsers only allow the overwrite while this tab has focus, and OS clipboard history can keep a copy.
export async function copySecret(text: string, label: string) {
  await navigator.clipboard.writeText(text);
  clearTimeout(timer);
  timer = setTimeout(() => void navigator.clipboard.writeText("").catch(() => {}), CLIPBOARD_CLEAR_MS);
  toast(`${label} copied. Clipboard clears in ${CLIPBOARD_CLEAR_MS / 1000}s.`);
}

export async function copyPlain(text: string, label: string) {
  await navigator.clipboard.writeText(text);
  toast(`${label} copied`);
}
