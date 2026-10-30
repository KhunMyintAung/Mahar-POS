import { Contract, JsonRpcProvider, Wallet } from "ethers";
import { centiToWei } from "@/lib/msp";

// Mahar Shwe Point on BNB Chain: where the contract is and the platform wallet that pays
// MSP out (env MSP_*). Used by the shops' MSP wallets and their rewards.

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

const ABI = [
  "function transfer(address to, uint256 amount) returns (bool)",
  "function balanceOf(address) view returns (uint256)",
];

/** Gas for one MSP transfer, with room to spare. */
export const TRANSFER_GAS = 80_000n;

export const errText = (e: unknown) => {
  const x = e as { shortMessage?: string; reason?: string; message?: string };
  return String(x?.reason || x?.shortMessage || x?.message || e).slice(0, 300);
};

/** The platform wallet on chain, or null when MSP is not set up on this server. */
export function mspChain() {
  const cfg = mspChainConfig();
  if (!cfg) return null;
  const provider = new JsonRpcProvider(cfg.rpc, cfg.chainId, { staticNetwork: true, batchMaxCount: 1 });
  const signer = new Wallet(cfg.key, provider);
  const msp = new Contract(cfg.contract, ABI, signer);

  /** Sends an MSP transfer under a chosen nonce, at no less than minGasPrice. */
  const sendTransfer = async (to: string, centi: bigint, nonce: number, minGasPrice = 0n) => {
    const fee = await provider.getFeeData();
    const gasPrice = [fee.gasPrice ?? 0n, minGasPrice].reduce((a, b) => (a > b ? a : b));
    const req = await msp.transfer.populateTransaction(to, centiToWei(centi));
    return signer.sendTransaction({ ...req, nonce, gasLimit: TRANSFER_GAS, gasPrice, type: 0 });
  };

  /** Why a transfer of this many hundredths cannot be paid now, or null when it can. */
  const cannotPay = async (centi: bigint) => {
    const [have, gasBnb, fee] = await Promise.all([msp.balanceOf(signer.address) as Promise<bigint>, provider.getBalance(signer.address), provider.getFeeData()]);
    if (have < centiToWei(centi)) return "The rewards wallet is out of MSP";
    if (gasBnb < TRANSFER_GAS * (fee.gasPrice ?? 0n)) return "The rewards wallet is out of BNB for fees";
    return null;
  };

  return { cfg, provider, signer, msp, sendTransfer, cannotPay };
}
