import { withAuth, json } from "@/lib/api";
import { walletSummary } from "@/services/mspWalletService";

// The shop's MSP wallet: balance, its wallet ID, withdrawal wallet and history. Anyone
// signed in may read it (the Overview card shows the balance).
export const GET = withAuth(null, async ({ user }) => json(await walletSummary(user.businessId)));
