"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, Card, Input, Select } from "@/components/ui";
import { PwaInstall } from "@/components/PwaInstall";
import { GoogleSignIn } from "@/components/GoogleSignIn";
import { SELECTABLE_BUSINESS_CATEGORIES, BUSINESS_CATEGORY_LABELS } from "@/lib/modules";
import { LanguageSwitch } from "@/components/LanguageProvider";
import { api } from "@/lib/client";

/** A category named in the link, for sending people here from somewhere that already knows
 *  what kind of shop they run.
 *
 *  Read straight off the URL rather than through useSearchParams, which would force this
 *  page to render dynamically for the sake of one optional parameter. Anything unrecognised
 *  is ignored, so a mistyped link is an ordinary sign-up rather than an error.
 */
function categoryFromUrl(): string {
  if (typeof window === "undefined") return "";
  const raw = new URLSearchParams(window.location.search).get("type")?.toUpperCase() ?? "";
  return (SELECTABLE_BUSINESS_CATEGORIES as readonly string[]).includes(raw) ? raw : "";
}

export default function RegisterPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    businessName: "",
    username: "",
    email: "",
    phone: "",
    currency: "MMK",
    businessCategory: "",
    password: "",
    confirmPassword: "",
  });
  const [presetCategory, setPresetCategory] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Deferred a tick so this is an ordinary update rather than one during mount.
    const timer = window.setTimeout(() => {
      const category = categoryFromUrl();
      if (!category) return;
      setForm((current) => ({ ...current, businessCategory: category }));
      setPresetCategory(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  function update(name: keyof typeof form, value: string) {
    setForm((current) => ({ ...current, [name]: value }));
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    if (form.password !== form.confirmPassword) {
      setError("Passwords do not match");
      return;
    }
    if (!form.businessCategory) {
      setError("Choose a business category");
      return;
    }
    setLoading(true);
    try {
      await api("/api/v1/auth/register", {
        method: "POST",
        body: {
          businessName: form.businessName,
          username: form.username,
          email: form.email,
          phone: form.phone || undefined,
          currency: form.currency,
          timezone: "Asia/Yangon",
          password: form.password,
          businessCategory: form.businessCategory,
        },
      });
      router.push("/");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="relative flex min-w-0 w-full flex-1 items-center justify-center overflow-x-hidden p-4 pb-8 pt-20">
      <LanguageSwitch className="absolute right-4 top-4" />
      <Card className="w-full max-w-xl">
        <div className="mb-6 flex flex-col items-center gap-2 pt-2">
          <div className="rounded-xl bg-white p-1.5 ring-1 ring-gray-100 dark:ring-gray-800">
            <Image src="/mahar-pos-logo.svg" alt="Mahar Mini POS" width={48} height={48} />
          </div>
          <h1 className="text-xl font-bold">Create your Mahar Mini POS</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">Free private workspace for your business</p>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <Input
            label="Business name"
            value={form.businessName}
            onChange={(event) => update("businessName", event.target.value)}
            autoFocus
            required
          />
          <Input
            label="Phone"
            type="tel"
            value={form.phone}
            onChange={(event) => update("phone", event.target.value)}
            autoComplete="tel"
          />
          <Select
            label="Business category"
            value={form.businessCategory}
            onChange={(event) => update("businessCategory", event.target.value)}
            required
          >
            <option value="">Choose category...</option>
            {/* Driven by the shared list: these were written out by hand and a new business
                type was added without appearing here. */}
            {SELECTABLE_BUSINESS_CATEGORIES.map((category) => (
              <option key={category} value={category}>
                {BUSINESS_CATEGORY_LABELS[category]}
              </option>
            ))}
          </Select>
          {/* Chosen for them by the link they followed. Said out loud, and still editable,
              so nobody signs up as the wrong kind of shop without noticing. */}
          {presetCategory && (
            <p className="-mt-2 text-xs text-gray-500 dark:text-gray-400">
              Chosen for you from the link you followed. Change it if it is not right.
            </p>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Username"
              value={form.username}
              onChange={(event) => update("username", event.target.value.toLowerCase())}
              autoComplete="username"
              required
            />
            <Select
              label="Main currency"
              value={form.currency}
              onChange={(event) => update("currency", event.target.value)}
            >
              <option value="MMK">MMK</option>
              <option value="THB">THB</option>
            </Select>
          </div>
          <Input
            label="Email"
            type="email"
            value={form.email}
            onChange={(event) => update("email", event.target.value)}
            autoComplete="email"
            required
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Password"
              type="password"
              value={form.password}
              onChange={(event) => update("password", event.target.value)}
              autoComplete="new-password"
              minLength={8}
              required
            />
            <Input
              label="Confirm password"
              type="password"
              value={form.confirmPassword}
              onChange={(event) => update("confirmPassword", event.target.value)}
              autoComplete="new-password"
              minLength={8}
              required
            />
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Use at least 8 characters.
          </p>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <Button
            type="submit"
            disabled={
              loading ||
              !form.businessName ||
              !form.businessCategory ||
              !form.username ||
              !form.email ||
              !form.password
            }
            className="w-full"
          >
            {loading ? "Creating account..." : "Create free account"}
          </Button>
        </form>

        <GoogleSignIn label="Sign up with Google" />

        <p className="mt-5 text-center text-sm text-gray-500 dark:text-gray-400">
          Already have an account?{" "}
          <Link className="font-medium text-blue-600 hover:text-blue-700" href="/login">
            Sign in
          </Link>
        </p>
        <div className="mt-3 flex justify-center">
          <PwaInstall />
        </div>
        <div className="mt-4 flex flex-wrap justify-center gap-4 text-xs">
          <Link className="text-gray-500 hover:text-blue-600" href="/features">What is Mahar Mini POS?</Link>
          <Link className="text-gray-500 hover:text-blue-600" href="/privacy">Privacy</Link>
          <Link className="text-gray-500 hover:text-red-600" href="/account-deletion">Delete account</Link>
        </div>
      </Card>
    </main>
  );
}
