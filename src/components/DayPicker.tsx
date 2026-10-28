"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";

export const todayDate = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Yangon" }).format(new Date());
const shiftDay = (d: string, by: number) => {
  const x = new Date(`${d}T00:00:00Z`);
  x.setUTCDate(x.getUTCDate() + by);
  return x.toISOString().slice(0, 10);
};

/** Day | All dates, and for a day: previous / date picker / next / back to Today. */
export function DayPicker({ day, allDates, onDay, onAllDates }: {
  day: string;
  allDates: boolean;
  onDay: (day: string) => void;
  onAllDates: (all: boolean) => void;
}) {
  const today = todayDate();
  return (
    <>
      <div className="inline-flex rounded-lg border border-gray-200 p-0.5 dark:border-gray-700">
        <button type="button" onClick={() => onAllDates(false)} className={`rounded-md px-3 py-1.5 text-sm ${!allDates ? "bg-blue-600 text-white" : "text-gray-600 dark:text-gray-300"}`}>Day</button>
        <button type="button" onClick={() => onAllDates(true)} className={`rounded-md px-3 py-1.5 text-sm ${allDates ? "bg-blue-600 text-white" : "text-gray-600 dark:text-gray-300"}`}>All dates</button>
      </div>
      {!allDates && (
        <div className="flex items-center gap-1">
          <button type="button" aria-label="Previous day" onClick={() => onDay(shiftDay(day, -1))} className="rounded-lg p-2 hover:bg-gray-100 dark:hover:bg-gray-800"><ChevronLeft size={18} /></button>
          <input type="date" value={day} max={today} onChange={(e) => e.target.value && onDay(e.target.value)}
            className="min-h-9 rounded-lg border border-gray-300 bg-white px-2 text-base dark:border-gray-700 dark:bg-gray-800 sm:text-sm" />
          <button type="button" aria-label="Next day" disabled={day >= today} onClick={() => onDay(shiftDay(day, 1))} className="rounded-lg p-2 hover:bg-gray-100 disabled:opacity-30 dark:hover:bg-gray-800"><ChevronRight size={18} /></button>
          {day !== today && <button type="button" onClick={() => onDay(today)} className="ml-1 text-sm text-blue-600">Today</button>}
        </div>
      )}
    </>
  );
}
