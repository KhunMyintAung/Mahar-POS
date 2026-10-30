import { Wallet } from "ethers";
import { withAuth, json } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { fmtMsp } from "@/lib/msp";
import { mspChainConfig } from "@/services/mspService";

// What the settings page shows about Mahar Shwe Point: whether this server can mint,
// the token's address, and how many points this shop has given out.
export const GET = withAuth("settings.manage", async ({ user }) => {
  const chain = mspChainConfig();
  const byStatus = await prisma.mspAward.groupBy({
    by: ["status"],
    where: { businessId: user.businessId, status: { not: "CANCELLED" } },
    _sum: { amount: true },
  });
  const sumOf = (s: string) => byStatus.find((g) => g.status === s)?._sum.amount ?? 0n;
  const openBatch = await prisma.mspBatch.findFirst({ where: { status: "OPEN" }, select: { lastError: true } });
  return json({
    configured: Boolean(chain),
    contract: chain?.contract ?? null,
    minter: chain ? new Wallet(chain.key).address : null,
    explorer: chain?.explorer ?? null,
    pending: fmtMsp(sumOf("PENDING")),
    sending: fmtMsp(sumOf("SENT")),
    minted: fmtMsp(sumOf("MINTED")),
    problem: openBatch?.lastError ?? null,
  });
});
