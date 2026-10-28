-- Feedback a shop sends from the About page; the admin portal picks which ones are shown.
CREATE TABLE "Feedback" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "shopName" TEXT NOT NULL,
    "userName" TEXT NOT NULL,
    "rating" INTEGER,
    "message" TEXT NOT NULL,
    "shown" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Feedback_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Feedback_shown_createdAt_idx" ON "Feedback"("shown", "createdAt");

-- The donations list on the About page, kept in the admin portal. Starts with the first one.
INSERT INTO "PlatformSetting" ("key", "value", "updatedAt")
VALUES ('donations', '[{"id":"d1","name":"Shwe Li Oo Mobile","amount":450000,"method":"KPay","date":"2026-06-28"}]', CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;
