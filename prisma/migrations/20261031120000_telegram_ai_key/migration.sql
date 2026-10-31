-- A user's own OpenAI or Gemini key for asking their Telegram bot about the shop, encrypted.
CREATE TABLE "TelegramAiKey" (
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "encryptedKey" TEXT NOT NULL,
    "keyHint" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TelegramAiKey_pkey" PRIMARY KEY ("userId")
);
