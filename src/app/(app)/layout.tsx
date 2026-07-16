import Nav from "@/components/Nav";
import { requireProfile } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const profile = await requireProfile();

  return (
    <div className="min-h-screen">
      <Nav profile={profile} />
      <main className="mx-auto max-w-shell px-6 py-14 sm:py-20">{children}</main>
    </div>
  );
}
