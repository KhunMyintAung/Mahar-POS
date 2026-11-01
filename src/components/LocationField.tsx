"use client";

import { useState } from "react";
import { MapPin } from "lucide-react";
import { Button, Input } from "@/components/ui";
import { mapLink, pointText } from "@/lib/mapLink";

/** A customer's location: paste a Google Maps link, or stand at the customer's place and
 *  take the phone's own position. */
export function LocationField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [finding, setFinding] = useState(false);
  const [error, setError] = useState("");

  function here() {
    if (!navigator.geolocation) return setError("This browser can't give a location");
    setFinding(true);
    setError("");
    navigator.geolocation.getCurrentPosition(
      (p) => { onChange(pointText(p.coords.latitude, p.coords.longitude)); setFinding(false); },
      () => { setError("Location not allowed or not found — paste a Google Maps link instead"); setFinding(false); },
      { enableHighAccuracy: true, timeout: 15_000 },
    );
  }

  const link = mapLink(value);
  return (
    <div className="space-y-1">
      <Input label="Location (Google Maps link)" value={value} onChange={(e) => onChange(e.target.value)} placeholder="https://maps.app.goo.gl/…" />
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <Button type="button" size="sm" variant="secondary" onClick={here} disabled={finding}>
          <MapPin size={14} className="mr-1 inline" />{finding ? "Finding…" : "Use my current location"}
        </Button>
        {link && <a href={link} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">Check on map</a>}
        {error && <span className="text-red-600">{error}</span>}
      </div>
    </div>
  );
}
