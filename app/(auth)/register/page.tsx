import Link from "next/link";

export default function Page() {
  return (
    <div className="flex w-full max-w-sm flex-col gap-3 rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
      <h1 className="text-2xl font-semibold">Registration is closed</h1>
      <p className="text-sm text-slate-500">This is a private vault. New accounts are created by the owner.</p>
      <Link href="/login" className="text-sm text-indigo-600 underline">Back to log in</Link>
    </div>
  );
}
