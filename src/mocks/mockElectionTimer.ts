import { ElectionTimer } from "../core/interfaces";

export class MockElectionTimer implements ElectionTimer {
  private callback: (() => void) | null = null;
  private timeout: NodeJS.Timeout | null = null;

  onTimeout(callback: () => void): void {
    this.callback = callback;
  }

  start(): void {
    const randomTimeout = Math.floor(Math.random() * (3000 - 1500 + 1)) + 1500; // Random timeout between 150-300ms
    this.timeout = setTimeout(() => this.callback?.(), randomTimeout);
  }

  reset(): void {
    if (this.timeout) {
      clearTimeout(this.timeout);
      this.start();
    }
  }

  stop(): void {
    if (this.timeout) {
      clearTimeout(this.timeout);
      this.timeout = null;
    }
  }
}
