const startTime: number = Date.now();
function log(message: string): void {
  const now = Date.now();
  const time = (now - startTime) / 1000;
  console.log(`[+${time}] ${message}`);
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
