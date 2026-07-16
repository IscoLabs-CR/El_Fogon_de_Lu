import LoginForm from "./LoginForm";

export const dynamic = "force-dynamic";

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-16">
      <div className="w-full max-w-sm">
        <div className="reveal mb-10">
          <p className="eyebrow mb-3">Control de ventas</p>
          <h1 className="font-serif text-4xl leading-[1.1] tracking-[-0.03em]">
            El Fogon de Lu
          </h1>
        </div>
        <LoginForm />
      </div>
    </main>
  );
}
