export default function BillingSettingsPage() {
  return (
    <section
      className="mx-auto w-full max-w-4xl px-5 py-10 sm:px-8 lg:py-14"
      data-humanly-ee-feature="HUMANLY_EE_BILLING_UI"
    >
      <header>
        <p className="text-sm uppercase text-muted-foreground">Settings</p>
        <h1 className="mt-2 text-3xl font-light sm:text-4xl">Billing</h1>
      </header>

      <div className="mt-8 rounded-md border border-border/80 bg-background p-6 sm:p-8">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-sm text-muted-foreground">Current plan</p>
            <h2 className="mt-1 text-2xl font-light">Free</h2>
          </div>
          <span className="w-fit rounded-md bg-secondary px-3 py-1.5 text-sm text-muted-foreground">
            Humanly Cloud
          </span>
        </div>
        <p className="mt-8 max-w-2xl text-sm leading-6 text-muted-foreground">
          Billing controls are not available in the current research preview. No
          payment method is required for the Free plan.
        </p>
      </div>
    </section>
  );
}
