export type FieldTemplate = { label: string; secret?: boolean };
export type Category = { id: string; label: string; fields: FieldTemplate[] };

/** Categories pre-fill the form with the fields people usually need; every field can be edited or removed. */
export const CATEGORIES: Category[] = [
  { id: "email", label: "Email", fields: [{ label: "Email address" }, { label: "Password", secret: true }, { label: "Recovery email" }, { label: "Recovery phone" }, { label: "2FA method" }] },
  { id: "social", label: "Social Media", fields: [{ label: "Username" }, { label: "Email" }, { label: "Password", secret: true }, { label: "Recovery email" }, { label: "Phone number" }] },
  { id: "website", label: "Websites", fields: [{ label: "Username / Email" }, { label: "Password", secret: true }] },
  { id: "banking", label: "Banking", fields: [{ label: "Account number" }, { label: "Username" }, { label: "Password", secret: true }, { label: "PIN", secret: true }] },
  { id: "dev", label: "Development", fields: [{ label: "Username" }, { label: "Password", secret: true }, { label: "Access token", secret: true }] },
  { id: "server", label: "Servers", fields: [{ label: "Host / IP" }, { label: "Username" }, { label: "Password", secret: true }, { label: "SSH private key", secret: true }] },
  { id: "api", label: "API Keys", fields: [{ label: "API key", secret: true }, { label: "API secret", secret: true }] },
  { id: "wifi", label: "Wi-Fi", fields: [{ label: "Network name" }, { label: "Password", secret: true }] },
  { id: "license", label: "Software Licenses", fields: [{ label: "Registered to" }, { label: "License key", secret: true }] },
  { id: "note", label: "Secure Notes", fields: [] },
  { id: "other", label: "Other", fields: [{ label: "Username" }, { label: "Password", secret: true }] },
];

export const categoryLabel = (id: string) => CATEGORIES.find((c) => c.id === id)?.label ?? "Other";
