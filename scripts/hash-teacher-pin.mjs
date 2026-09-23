import { createHash } from "node:crypto";
import { emitKeypressEvents } from "node:readline";

if (!process.stdin.isTTY)
  throw new Error("請在互動終端執行，避免 PIN 出現在指令紀錄。");
emitKeypressEvents(process.stdin);
process.stdin.setRawMode(true);
process.stdout.write("輸入 6–12 位數字教師 PIN（不顯示），按 Enter：");
let pin = "";
process.stdin.on("keypress", (character, key) => {
  if (key.ctrl && key.name === "c") {
    process.stdin.setRawMode(false);
    process.exit(1);
  }
  if (key.name === "backspace") pin = pin.slice(0, -1);
  else if (key.name === "return") {
    if (!/^\d{6,12}$/.test(pin)) {
      pin = "";
      process.stdout.write("\n格式不符，請重新輸入：");
      return;
    }
    process.stdout.write(
      `\nHQ_PIN_SHA256=${createHash("sha256").update(pin).digest("hex")}\n`
    );
    pin = "";
    process.stdin.setRawMode(false);
    process.exit(0);
  } else if (/^\d$/.test(character || "") && pin.length < 12) pin += character;
});
