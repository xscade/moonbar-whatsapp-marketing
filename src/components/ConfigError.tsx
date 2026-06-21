export function ConfigError({ message }: { message: string }) {
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <section className="w-full max-w-3xl rounded-lg border border-moon-red/20 bg-white p-6 shadow-soft">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-moon-red">
          Deployment configuration
        </p>
        <h1 className="mt-3 text-3xl font-semibold text-moon-ink">
          Moonbar needs production environment variables.
        </h1>
        <p className="mt-4 text-sm leading-6 text-moon-ink/70">
          The app is deployed, but the server could not connect to MongoDB or
          read the required runtime configuration.
        </p>
        <pre className="mt-4 overflow-auto rounded-lg bg-moon-ink p-4 text-xs leading-6 text-moon-cream">
          {message}
        </pre>
        <div className="mt-5 grid gap-2 text-sm text-moon-ink/72">
          <p className="font-semibold text-moon-ink">Check these in Vercel:</p>
          <p>Project Settings → Environment Variables → Production</p>
          <p>
            Add `MONGODB_URI`, `WHATSAPP_ACCESS_TOKEN`,
            `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_BUSINESS_ACCOUNT_ID`,
            `WHATSAPP_APP_ID`, `WHATSAPP_APP_SECRET`,
            `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_GRAPH_API_VERSION`, and
            `WHATSAPP_GRAPH_BASE_URL`.
          </p>
          <p>
            If using MongoDB Atlas, allow Vercel serverless egress by adding
            `0.0.0.0/0` to Atlas Network Access, then redeploy.
          </p>
        </div>
      </section>
    </main>
  );
}
