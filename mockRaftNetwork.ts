import { RaftNetwork } from "./interfaces";
import { RaftEvent } from "./types";

export class MockRaftNetwork implements RaftNetwork {
  private nodes: Map<string, (message: RaftEvent) => void> = new Map();

  bind(nodeId: string, callback: (message: RaftEvent) => void): void {
    this.nodes.set(nodeId, callback);
  }

  send(to: string, message: RaftEvent): void {
    const callback = this.nodes.get(to);
    if (callback) {
      callback(message);
    }
  }

  unbind(nodeId: string): void {
    this.nodes.delete(nodeId);
  }
}
