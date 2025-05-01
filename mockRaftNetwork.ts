import { RaftNetwork } from "./interfaces";
import { info } from "./output";
import { RaftEvent } from "./types";

export class MockRaftNetwork implements RaftNetwork {
  private nodes: Map<string, (message: RaftEvent) => void> = new Map();

  bind(nodeId: string, callback: (message: RaftEvent) => void): void {
    info(`bind: ${nodeId}`);
    this.nodes.set(nodeId, callback);
  }

  send(to: string, message: RaftEvent): void {
    setTimeout(() => {
      info(
        `${(message as any).from} ==> ${to}, message: ${JSON.stringify(
          message,
          null,
          2
        )}`
      );

      const callback = this.nodes.get(to);
      if (callback) {
        callback(message);
      }
    }, 100);
  }

  unbind(nodeId: string): void {
    this.nodes.delete(nodeId);
  }
}
