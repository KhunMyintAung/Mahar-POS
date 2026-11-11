"use client";

import { useState } from "react";
import { MapPin } from "lucide-react";
import { api } from "@/lib/client";
import { Button, Input, useToast } from "./ui";
import { useAuth } from "./AppShell";

/** Asks a shop that has no city yet which city it is in.
 *
 *  Sign-up did not ask for one before November 2026, so most shops have none, and the public
 *  list of shops and the admin's list had nothing to show. Only someone who may change the
 *  shop's settings is asked; it goes away for good once a city is saved.
 */
export function CityPrompt() {
  const { me, hasPerm, refreshAuth } = useAuth();
  const { push } = useToast();
  const [city, setCity] = useState("");
  const [busy, setBusy] = useState(false);

  if (!me?.business || me.business.city || !hasPerm("settings.manage")) return null;

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!city.trim()) return;
    setBusy(true);
    try {
      await api("/api/v1/settings", { method: "PATCH", body: { city: city.trim() } });
      await refreshAuth();
      push("City saved");
    } catch (error) {
      push(error instanceof Error ? error.message : "Could not save", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save} className="rounded-xl border border-blue-200 bg-blue-50 p-3 dark:border-blue-900 dark:bg-blue-950/40">
      <div className="flex items-start gap-2">
        <MapPin size={18} className="mt-0.5 shrink-0 text-blue-600 dark:text-blue-400" />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold">Which city is your shop in?</div>
          <p className="text-xs text-gray-600 dark:text-gray-400">It is shown next to your shop name in the public list of shops using Mahar POS.</p>
          <div className="mt-2 flex gap-2">
            <div className="min-w-0 flex-1">
              <Input value={city} onChange={(e) => setCity(e.target.value)} placeholder="City / Town" maxLength={80} autoComplete="address-level2" aria-label="City / Town" />
            </div>
            <Button type="submit" disabled={busy || !city.trim()}>Save</Button>
          </div>
        </div>
      </div>
    </form>
  );
}
