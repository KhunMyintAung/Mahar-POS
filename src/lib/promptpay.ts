// A PromptPay QR is an EMV merchant-presented code. The one on the About page is "static" — it
// names the receiver but leaves the amount to the payer. For a payment we want the amount fixed,
// so the Thai banking app opens with the figure filled in and the payer cannot get it wrong.

/** CRC-16/CCITT-FALSE (poly 0x1021, init 0xFFFF) over the text, as 4 upper-case hex digits — the
 *  checksum EMV QR codes end with. */
export function crc16(text: string): string {
  let crc = 0xffff;
  for (let i = 0; i < text.length; i++) {
    crc ^= text.charCodeAt(i) << 8;
    for (let b = 0; b < 8; b++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

/** The same PromptPay code with `amountThb` baht fixed in it: marked dynamic (initiation 12), the
 *  amount added in tag 54 (before the country code, so the tags stay in order), and the checksum
 *  worked out again. Returns the code unchanged when it is not a PromptPay static code this
 *  function understands, or the amount is not a positive number. */
export function promptPayWithAmount(payload: string, amountThb: number): string {
  if (!(amountThb > 0)) return payload;
  const tail = payload.slice(-8); // "6304" + the old checksum
  if (!tail.startsWith("6304")) return payload;
  const body = payload.slice(0, -8);
  // The initiation method is 11 (static) or 12 (dynamic); an amount makes it 12 either way.
  if (!body.startsWith("000201010211") && !body.startsWith("000201010212")) return payload;
  const country = body.indexOf("5802TH");
  if (country < 0) return payload;
  const amount = amountThb.toFixed(2);
  const field = `54${String(amount.length).padStart(2, "0")}${amount}`;
  const withAmount = `000201010212${body.slice(12, country)}${field}${body.slice(country)}6304`;
  return withAmount + crc16(withAmount);
}
