import Link from 'next/link';
import { HumanlyWordmark } from '@/components/brand/humanly-wordmark';
import { marketingHref } from '@/lib/app-origin';

export default function TermsOfServicePage() {
  return (
    <main className="min-h-screen bg-background py-12 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="mb-8">
          <Link href={marketingHref('/')} className="flex items-center gap-2 text-xl font-bold mb-8">
            <HumanlyWordmark size="sm" cursor={false} />
          </Link>
          <h1 className="text-3xl font-bold">Terms of Service</h1>
        </div>

        <div className="prose prose-gray max-w-none space-y-6 text-muted-foreground">
          <section>
            <h2 className="text-lg font-semibold text-foreground mb-2">Use of Service</h2>
            <p className="leading-relaxed">
              By accessing or using the Humanly platform (&quot;Service&quot;), you agree to comply with these Terms of Service
              and all applicable laws and regulations. Humanly provides tools for tracking text provenance and user
              interaction events (such as typing, editing, and clipboard activity) within external forms or surveys
              through embedded scripts provided by the Service.
            </p>
          </section>

          <section>
            <p className="leading-relaxed">
              Users who deploy Humanly tracking scripts are responsible for ensuring that participants or end-users
              are properly informed about the data collection and that such collection complies with applicable privacy
              laws and institutional policies. Humanly does not control how the Service is implemented by task
              owners and is not responsible for any misuse of collected data.
            </p>
          </section>

          <section>
            <p className="leading-relaxed">
              The Service may collect interaction metadata necessary to generate provenance records, analytics, and
              verification certificates. By using the Service, you acknowledge that such data may be stored and
              processed in order to provide core platform functionality.
            </p>
          </section>

          <section>
            <p className="leading-relaxed">
              Humanly reserves the right to suspend or terminate access to the Service if it determines that the
              platform is being used in violation of these Terms, applicable law, or in ways that may harm the
              integrity, security, or availability of the system.
            </p>
          </section>
        </div>

        <div className="mt-10 pt-6 border-t">
          <Link href="/login" className="text-sm text-primary hover:underline">
            ← Back to login
          </Link>
        </div>
      </div>
    </main>
  );
}
