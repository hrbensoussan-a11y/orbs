import { AuthForm } from "@/components/AuthForm";

export default function RegisterPage() {
  return (
    <main className="min-h-dvh flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="font-serif text-3xl">Orbs</h1>
          <p className="text-muted mt-2">
            Quelques secondes, et tu écris ta première page.
          </p>
        </div>
        <div className="card p-6">
          <AuthForm mode="register" />
        </div>
      </div>
    </main>
  );
}
