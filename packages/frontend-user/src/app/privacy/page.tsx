import Link from 'next/link';
import { HumanlyWordmark } from '@/components/brand/humanly-wordmark';
import { marketingHref } from '@/lib/app-origin';

export default function PrivacyPolicyPage() {
  return (
    <main className="min-h-screen bg-background py-12 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="mb-8">
          <Link href={marketingHref('/')} className="flex items-center gap-2 text-xl font-bold mb-8">
            <HumanlyWordmark size="sm" cursor={false} />
          </Link>
          <h1 className="text-3xl font-bold">Privacy Policy</h1>
        </div>

        <div className="prose prose-gray max-w-none space-y-6 text-muted-foreground">
          <section>
            <p className="leading-relaxed">
              <strong className="text-foreground">Last updated:</strong> March 18, 2026
            </p>
            <p className="leading-relaxed">
              Welcome to Humanly (&ldquo;Humanly,&rdquo; &ldquo;we,&rdquo; &ldquo;our,&rdquo; or &ldquo;us&rdquo;). We respect your
              privacy and are committed to protecting the personal information you provide when using our website,
              platform, and related services (collectively, the &ldquo;Services&rdquo;).
            </p>
            <p className="leading-relaxed">
              This Privacy Policy explains what information we collect, how we use it, how we share it, and the
              choices you have regarding your information.
            </p>
            <p className="leading-relaxed">
              By accessing or using Humanly, you agree to the collection and use of information in accordance with
              this Privacy Policy.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-2">1. Information We Collect</h2>
            <p className="leading-relaxed mb-3">We may collect the following types of information:</p>

            <h3 className="text-base font-semibold text-foreground mb-2">a. Information You Provide Directly</h3>
            <p className="leading-relaxed">When you use our Services, you may provide us with information such as:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Your name</li>
              <li>Email address</li>
              <li>Account login credentials</li>
              <li>Documents, files, or PDFs you upload</li>
              <li>Messages, prompts, questions, notes, or other content you submit</li>
              <li>Feedback, support requests, or other communications you send to us</li>
            </ul>

            <h3 className="text-base font-semibold text-foreground mb-2 mt-5">b. Information Collected Automatically</h3>
            <p className="leading-relaxed">
              When you access or use the Services, we may automatically collect certain technical information,
              including:
            </p>
            <ul className="list-disc pl-5 space-y-1">
              <li>IP address</li>
              <li>Browser type and version</li>
              <li>Device type and operating system</li>
              <li>Pages viewed and interactions within the Services</li>
              <li>Access times and dates</li>
              <li>Referral URLs</li>
              <li>Log data, error reports, and performance diagnostics</li>
            </ul>

            <h3 className="text-base font-semibold text-foreground mb-2 mt-5">c. Usage and Activity Data</h3>
            <p className="leading-relaxed">
              To improve our Services, we may collect information about how users interact with Humanly, including:
            </p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Document activity and engagement data</li>
              <li>Feature usage statistics</li>
              <li>Writing and editing interaction data</li>
              <li>AI feature usage, including prompts and generated responses</li>
              <li>Session and performance analytics</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-2">2. How We Use Your Information</h2>
            <p className="leading-relaxed">We use the information we collect for purposes such as:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Providing, operating, and maintaining the Services</li>
              <li>Creating and managing user accounts</li>
              <li>Enabling document upload, storage, retrieval, and collaboration features</li>
              <li>Powering AI-assisted features and responses</li>
              <li>Improving platform functionality, safety, accuracy, and user experience</li>
              <li>Monitoring performance, debugging issues, and preventing abuse</li>
              <li>Communicating with you about updates, service notices, or support matters</li>
              <li>Enforcing our Terms of Service and other policies</li>
              <li>Complying with legal obligations</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-2">3. AI Features and Uploaded Content</h2>
            <p className="leading-relaxed">
              Humanly may allow users to upload documents and interact with AI-powered tools.
            </p>
            <p className="leading-relaxed">
              When you use these features, your uploaded documents, prompts, and related content may be processed to
              provide search, summarization, question answering, writing assistance, or other AI-enabled
              functionality.
            </p>
            <p className="leading-relaxed">
              We may temporarily store or process this content in order to operate the Services. We may use service
              providers or third-party infrastructure to process such requests on our behalf.
            </p>
            <p className="leading-relaxed">
              You should avoid uploading highly sensitive personal information unless you are comfortable doing so and
              such upload is necessary for your use of the Services.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-2">4. Cookies and Similar Technologies</h2>
            <p className="leading-relaxed">We may use cookies, local storage, and similar technologies to:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Keep you signed in</li>
              <li>Remember preferences and settings</li>
              <li>Analyze usage patterns</li>
              <li>Improve site performance and reliability</li>
              <li>Support security and fraud prevention</li>
            </ul>
            <p className="leading-relaxed">
              You can control cookies through your browser settings. However, disabling certain cookies may affect the
              functionality of the Services.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-2">5. How We Share Information</h2>
            <p className="leading-relaxed">We do not sell your personal information. We may share information in the following circumstances:</p>

            <h3 className="text-base font-semibold text-foreground mb-2">a. Service Providers</h3>
            <p className="leading-relaxed">
              We may share information with trusted third-party vendors and service providers that help us operate the
              Services, such as hosting, cloud storage, analytics, authentication, and AI infrastructure providers.
            </p>

            <h3 className="text-base font-semibold text-foreground mb-2 mt-5">b. Legal Compliance</h3>
            <p className="leading-relaxed">
              We may disclose information if required to do so by law, regulation, legal process, or governmental
              request.
            </p>

            <h3 className="text-base font-semibold text-foreground mb-2 mt-5">c. Protection of Rights</h3>
            <p className="leading-relaxed">
              We may disclose information when we believe it is necessary to protect the rights, property, safety, or
              security of Humanly, our users, or others.
            </p>

            <h3 className="text-base font-semibold text-foreground mb-2 mt-5">d. Business Transfers</h3>
            <p className="leading-relaxed">
              If Humanly is involved in a merger, acquisition, financing, reorganization, or sale of assets, user
              information may be transferred as part of that transaction.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-2">6. Data Retention</h2>
            <p className="leading-relaxed">We retain personal information only for as long as necessary to:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Provide the Services</li>
              <li>Maintain legitimate business records</li>
              <li>Resolve disputes</li>
              <li>Enforce our agreements</li>
              <li>Comply with legal obligations</li>
            </ul>
            <p className="leading-relaxed">
              Uploaded documents, account information, and usage records may be deleted upon request, subject to
              backup, security, legal, or technical limitations.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-2">7. Data Security</h2>
            <p className="leading-relaxed">
              We take reasonable administrative, technical, and organizational measures to help protect your
              information from unauthorized access, loss, misuse, alteration, or disclosure.
            </p>
            <p className="leading-relaxed">
              However, no method of transmission over the Internet or electronic storage is completely secure.
              Therefore, we cannot guarantee absolute security.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-2">8. Your Rights and Choices</h2>
            <p className="leading-relaxed">
              Depending on your location, you may have rights regarding your personal information, including the right
              to:
            </p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Access the personal information we hold about you</li>
              <li>Request correction of inaccurate information</li>
              <li>Request deletion of your information</li>
              <li>Object to or restrict certain processing</li>
              <li>Withdraw consent where processing is based on consent</li>
            </ul>
            <p className="leading-relaxed">
              To exercise these rights, please contact us using the contact details below.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-2">9. International Data Transfers</h2>
            <p className="leading-relaxed">
              Your information may be processed and stored in countries other than your own, including countries where
              our service providers operate. By using the Services, you understand that your information may be
              transferred across borders and may be subject to different data protection laws.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-2">10. Children&apos;s Privacy</h2>
            <p className="leading-relaxed">
              Humanly is not intended for children under the age of 13, or under any higher minimum age required by
              applicable law in your jurisdiction. We do not knowingly collect personal information from children
              without appropriate authorization. If you believe a child has provided personal information to us, please
              contact us so we can take appropriate action.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-2">11. Third-Party Services and Links</h2>
            <p className="leading-relaxed">
              The Services may contain links to third-party websites or integrate third-party services. We are not
              responsible for the privacy practices of those third parties. We encourage you to review their privacy
              policies separately.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-2">12. Changes to This Privacy Policy</h2>
            <p className="leading-relaxed">
              We may update this Privacy Policy from time to time. If we make material changes, we will post the
              updated version on this page and update the &ldquo;Last updated&rdquo; date above. Your continued use of
              the Services after any changes become effective constitutes your acceptance of the revised Privacy
              Policy.
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
