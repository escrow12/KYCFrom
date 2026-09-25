const crypto = require("crypto");
process.stdout.write("Admin password: ");
process.stdin.setRawMode(true);
process.stdin.resume();
let password = "";
process.stdin.on("data", (chunk) => {
  const input = chunk.toString("utf8");
  if (input === "\u0003") process.exit(130);
  if (input === "\r" || input === "\n") {
    process.stdin.setRawMode(false);
    process.stdin.pause();
    process.stdout.write("\n");
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 32, { N: 16384, r: 8, p: 1 }).toString("hex");
  console.log(`ADMIN_PASSWORD_HASH=scrypt$16384$8$1$${salt}$${hash}`);
    return;
  }
  if (input === "\u007f") {
    password = password.slice(0, -1);
    return;
  }
  password += input;
});