import { Command, RaftEvent, PersistentState } from "./types";

export interface PersistentStorage {
  getRaftNodeState(): PersistentState | null;
  setRaftNodeState(state: PersistentState): void;
}

export interface ElectionTimer {
  start(): void;
  stop(): void;
  reset(): void;
  onTimeout(callback: () => void): void;
}

export interface HeartbeatTimer {
  start(): void;
  stop(): void;
  onTimeout(callback: () => void): void;
}

export interface StateMachine {
  apply(command: Command): void;
}

export interface RaftNetwork {
  bind(nodeId: string, callback: (message: RaftEvent) => void): void;
  send(to: string, message: RaftEvent): void;
}
