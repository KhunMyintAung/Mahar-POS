// Mahar Shwe Point on BNB Chain: where the contract is and the platform wallet that pays
// MSP out (env MSP_*). Used by the "MSP for using Mahar POS" rewards.

export function mspChainConfig() {
  const key = process.env.MSP_MINTER_KEY, contract = process.env.MSP_CONTRACT;
  if (!key || !contract) return null;
  return {
    key,
    contract,
    rpc: process.env.MSP_RPC || "https://bsc-rpc.publicnode.com",
    chainId: Number(process.env.MSP_CHAIN_ID || 56),
    explorer: process.env.MSP_EXPLORER ?? "https://bscscan.com",
  };
}
