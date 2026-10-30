// Makes the wallet the server mints Mahar Shwe Point with, and appends its key to an env file
// as MSP_MINTER_KEY. Only the address is printed: the key never leaves the server.
//   node scripts/msp-new-minter.mjs /var/www/maharpos/shared.env
import { appendFileSync, readFileSync } from "fs";
import { Wallet } from "ethers";

const file = process.argv[2];
if (!file) {
  console.error("Usage: node scripts/msp-new-minter.mjs <env file>");
  process.exit(1);
}
let current = "";
try { current = readFileSync(file, "utf8"); } catch { /* a new file */ }
if (/^MSP_MINTER_KEY=./m.test(current)) {
  console.error(`${file} already has MSP_MINTER_KEY; remove it first to make a new minter.`);
  process.exit(1);
}
const w = Wallet.createRandom();
appendFileSync(file, `${current && !current.endsWith("\n") ? "\n" : ""}MSP_MINTER_KEY=${w.privateKey}\n`, { mode: 0o600 });
console.log(`Minter address: ${w.address}`);
console.log("Send it a little BNB for gas, and enter this address as the minter when deploying MSP.");
