import { mspChainConfig } from "./mspService";

export interface MspPrice {
  priceUsd: number;
  /** Percent change over the last 24 hours, e.g. -6.5. */
  change24h: number;
  liquidityUsd: number;
  url: string;
}

/** DexScreener is asked at most this often; every shop's Overview shares the answer. */
const CACHE_MS = 5 * 60_000;
let cached: { at: number; value: MspPrice | null } | null = null;

/** MSP's price from its most liquid PancakeSwap pool, through DexScreener's public API.
 *  Null when MSP is not set up on this server or the price cannot be read. */
export async function mspPrice(): Promise<MspPrice | null> {
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.value;
  const contract = mspChainConfig()?.contract;
  if (!contract) return null;
  let value: MspPrice | null = null;
  try {
    const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${contract}`, { signal: AbortSignal.timeout(8000), cache: "no-store" });
    const body = (await res.json()) as {
      pairs?: { url: string; priceUsd?: string; priceChange?: { h24?: number }; liquidity?: { usd?: number }; baseToken: { address: string } }[];
    };
    const pairs = (body.pairs ?? []).filter((p) => p.priceUsd && p.baseToken.address.toLowerCase() === contract.toLowerCase());
    const best = pairs.sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0))[0];
    if (best) value = { priceUsd: Number(best.priceUsd), change24h: best.priceChange?.h24 ?? 0, liquidityUsd: best.liquidity?.usd ?? 0, url: best.url };
  } catch {
    value = cached?.value ?? null; // keep the last good price through a blip
  }
  cached = { at: Date.now(), value };
  return value;
}
