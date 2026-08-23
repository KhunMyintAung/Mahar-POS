import Link from "next/link";

export const metadata = {
  title: "Privacy Policy - Mahar Mini POS",
};

export default function PrivacyPage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8 text-gray-800 dark:text-gray-200 sm:py-12">
      <h1 className="text-2xl font-bold">Mahar Mini POS Privacy Policy</h1>
      <p className="mt-2 text-sm text-gray-500">Last updated: July 25, 2026</p>

      <div className="mt-8 space-y-6 text-sm leading-7">
        <section>
          <h2 className="text-lg font-semibold">Who operates Mahar Mini POS</h2>
          <p className="mt-2">
            Mahar Mini POS is developed and operated by Khun Myint Aung. This policy applies to
            the Mahar Mini POS and Mini Mart features available in the Google Play edition.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold">Data we collect</h2>
          <p className="mt-2">
            We store account details you provide, including your name, username, email,
            optional phone number, business details, and password in hashed form. We also
            store the wallet records, contacts, sales, purchases, inventory, credit records,
            settings, and audit history that you enter into your private workspace.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold">How data is used and protected</h2>
          <p className="mt-2">
            Data is used to provide the app, secure accounts, keep business records, and
            troubleshoot service problems. Each business has a separate workspace. Data is
            transmitted over HTTPS and stored in a protected PostgreSQL database. We do not
            sell personal data or use advertising SDKs.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold">Sharing and retention</h2>
          <p className="mt-2">
            We do not share workspace data with other registered businesses. Service
            infrastructure providers may process data only as needed to host and operate the
            app. Data is retained while the account is active and is deleted after a verified
            account deletion request is completed, except where limited retention is required
            for security, fraud prevention, or legal obligations.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold">Your choices</h2>
          <p className="mt-2">
            You can review and update account and business information in the app. You can
            also request deletion of your account and associated workspace data from the
            account deletion page.
          </p>
          <Link className="mt-2 inline-block font-medium text-blue-600 hover:text-blue-700" href="/account-deletion">
            Request account deletion
          </Link>
        </section>

        <section>
          <h2 className="text-lg font-semibold">Contact</h2>
          <p className="mt-2">
            Privacy and deletion questions can be submitted through the account deletion page
            or the Mahar Mini POS community support link shown on the About page.
          </p>
        </section>
      </div>

      <Link className="mt-8 inline-block text-sm font-medium text-blue-600 hover:text-blue-700" href="/">
        Back to Mahar Mini POS
      </Link>
    </main>
  );
}
