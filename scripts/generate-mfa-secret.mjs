import * as crypto from "crypto";

const account = process.env.QORE_MFA_ACCOUNT || "failsafe-admin";
const issuer = process.env.QORE_MFA_ISSUER || "FailSafe-Qore";
const existing = String(process.env.QORE_UI_TOTP_SECRET || "").trim();
const secret = existing || encodeBase32(crypto.randomBytes(20));
const otpauth = `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(account)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;

console.log(`QORE_UI_TOTP_SECRET=${secret}`);
console.log(`OTPAuthURL=${otpauth}`);

function encodeBase32(data) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = 0;
  let value = 0;
  let output = "";
  for (const byte of data) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += alphabet[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += alphabet[(value << (5 - bits)) & 31];
  }
  return output;
}
