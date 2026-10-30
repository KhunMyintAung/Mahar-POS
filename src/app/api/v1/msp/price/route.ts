import { withAuth, json } from "@/lib/api";
import { mspPrice } from "@/services/mspPrice";

// MSP's market price for the Overview card; cached on the server for a few minutes.
export const GET = withAuth(null, async () => json({ price: await mspPrice() }));
