import { RaftNetwork } from "../core/interfaces";
import { info } from "../core/logger";
import { RaftEvent } from "../core/types";

export class MockRaftNetwork implements RaftNetwork {
  private nodes: Map<string, (message: RaftEvent) => void> = new Map();

  bind(nodeId: string, callback: (message: RaftEvent) => void): void {
    info(`bind: ${nodeId}`);
    this.nodes.set(nodeId, callback);
  }

  send(to: string, message: RaftEvent): void {
    setTimeout(() => {
      const messageString = JSON.stringify(message, null, 2);
      info(
        `${(message as any).from} ==> ${to}, type: ${
          message.type
        } ${messageString}`
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
