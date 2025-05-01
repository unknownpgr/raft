const startTime: number = Date.now();
function log(message: string): void {
  const now = Date.now();
  const time = (now - startTime) / 1000;
  const timeString = time.toFixed(3);
  console.log(`[+${timeString}] ${message}`);
}

export function info(message: string): void {
  log(`[INFO] ${message}`);
}

export function error(message: string): void {
  log(`[ERROR] ${message}`);
}

export function warn(message: string): void {
  log(`[WARN] ${message}`);
}
