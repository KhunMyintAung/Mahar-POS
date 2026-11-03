"use client";

import { Button, Modal } from "@/components/ui";

/** Asked before saving a record for a day other than today: that day's figures change. */
export function OtherDayConfirm({ date, busy, onCancel, onConfirm }: { date: string | null; busy?: boolean; onCancel: () => void; onConfirm: () => void }) {
  return (
    <Modal open={Boolean(date)} onClose={onCancel} title="Not today">
      {date && (
        <div className="space-y-3">
          <p className="rounded-lg bg-amber-50 p-3 text-sm font-medium text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
            {`Record this for ${date}, not today?`}
          </p>
          <p className="text-sm text-gray-600 dark:text-gray-300">{"That day's totals and reports will change. Make sure the date is right."}</p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={onCancel}>Cancel</Button>
            <Button onClick={onConfirm} disabled={busy}>Yes, record it</Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
