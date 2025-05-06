import { HeartbeatTimer } from "../core/interfaces";

export class MockHeartbeatTimer implements HeartbeatTimer {
  private callback: (() => void) | null = null;
  private timeout: NodeJS.Timeout | null = null;

  onTimeout(callback: () => void): void {
    this.callback = callback;
  }

  start(): void {
    this.timeout = setInterval(() => this.callback?.(), 1000);
  }

  reset(): void {
    this.stop();
    this.start();
  }

  stop(): void {
    if (this.timeout) {
      clearInterval(this.timeout);
      this.timeout = null;
    }
  }
}
