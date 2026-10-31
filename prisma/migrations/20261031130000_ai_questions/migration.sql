-- Questions asked of the Telegram AI helper, and when each key holder was told they are kept.
ALTER TABLE "TelegramAiKey" ADD COLUMN "questionsNoticeAt" TIMESTAMP(3);

CREATE TABLE "AiQuestion" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "answered" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiQuestion_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AiQuestion_createdAt_idx" ON "AiQuestion"("createdAt");
CREATE INDEX "AiQuestion_userId_idx" ON "AiQuestion"("userId");
