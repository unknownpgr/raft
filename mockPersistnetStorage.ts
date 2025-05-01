import { PersistentStorage } from "./interfaces";
import { PersistentState } from "./types";
export class MockPersistentStorage implements PersistentStorage {
  private state: PersistentState | null = null;

  getRaftNodeState(): PersistentState | null {
    return this.state;
  }

  setRaftNodeState(state: PersistentState): void {
    this.state = {
      term: state.term,
      votedFor: state.votedFor,
      log: [...state.log],
    };
  }

  clear(): void {
    this.state = null;
  }
}
