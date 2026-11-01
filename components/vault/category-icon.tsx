import { Code, FileKey, Folder, Globe, Landmark, KeyRound, Mail, Server, Share2, StickyNote, Wifi, type LucideIcon } from "lucide-react";

const ICONS: Record<string, LucideIcon> = {
  email: Mail,
  social: Share2,
  website: Globe,
  banking: Landmark,
  dev: Code,
  server: Server,
  api: KeyRound,
  wifi: Wifi,
  license: FileKey,
  note: StickyNote,
};

export function CategoryIcon({ id, size = 18, className }: { id: string; size?: number; className?: string }) {
  const Icon = ICONS[id] ?? Folder;
  return <Icon size={size} className={className} />;
}
