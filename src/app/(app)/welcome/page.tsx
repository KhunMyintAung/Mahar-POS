"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Wallet } from "lucide-react";
import { api } from "@/lib/client";
import { Button, Card, Input, Select, useToast } from "@/components/ui";
import { useAuth } from "@/components/AppShell";
import { BUSINESS_CATEGORIES, BUSINESS_CATEGORY_LABELS } from "@/lib/modules";

/** The one question signing up through Google cannot answer.
 *
 *  Google supplies a name and an email, so the registration form's other fields are not
 *  worth asking for — but nothing about a Google account says whether this is a shop, a
 *  personal wallet, and that choice is what decides which modules
 *  appear. Left unasked, a new account lands on a default that fits nobody in particular.
 */
export default function WelcomePage() {
  const router = useRouter();
  const { me, refreshAuth } = useAuth();
  const { push } = useToast();
  const [businessName, setBusinessName] = useState("");
  const [category, setCategory] = useState("");
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!category) return;
    setBusy(true);
    try {
      await api("/api/v1/settings/category", {
        method: "POST",
        body: {
          category,
          // Left out when untouched, so the name Google gave is kept rather than blanked.
          businessName: businessName.trim() || undefined,
        },
      });
      // The shell decides which sections to show from this, so it has to be re-read
      // before leaving — otherwise the new modules are missing until a reload.
      await refreshAuth();
      router.push("/");
    } catch (error) {
      push(error instanceof Error ? error.message : "Could not save", "error");
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-lg">
      <Card>
        <div className="mb-6 flex flex-col items-center gap-2 pt-2 text-center">
          <div className="rounded-2xl bg-blue-600 p-3 text-white">
            <Wallet size={26} />
          </div>
          <h1 className="text-xl font-bold">Welcome{me?.user.name ? `, ${me.user.name}` : ""}</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            One question, so the app only shows what you use.
          </p>
        </div>

        <div className="space-y-4">
          <Input
            label="Business name"
            value={businessName}
            onChange={(e) => setBusinessName(e.target.value)}
            placeholder={me?.user.name ?? "Your business"}
          />
          <Select
            label="What is this for?"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            <option value="">Choose one…</option>
            {BUSINESS_CATEGORIES.map((key) => (
              <option key={key} value={key}>
                {BUSINESS_CATEGORY_LABELS[key]}
              </option>
            ))}
          </Select>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            You can change any of this later in Settings.
          </p>

          <Button onClick={save} disabled={busy || !category} className="w-full">
            {busy ? "Setting up…" : "Continue"}
          </Button>
          <button
            type="button"
            onClick={() => router.push("/")}
            className="w-full text-center text-sm text-gray-500 hover:text-blue-600 dark:text-gray-400"
          >
            Skip for now
          </button>
        </div>
      </Card>
    </div>
  );
}
