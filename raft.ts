type NodeRole = "follower" | "candidate" | "leader";

type Command = string;

interface LogEntry {
  term: number;
  command: Command;
}

interface PersistentState {
  term: number;
  votedFor: string | null;
  log: LogEntry[];
}

interface VolatileState {
  role: NodeRole;
  nodeId: string;
  nodeIds: string[];
  commitIndex: number;
  lastApplied: number;

  // For leaders
  nextIndex: Record<string, number>;
  matchIndex: Record<string, number>;
}

interface PersistentStorage {
  getRaftNodeState(): PersistentState | null;
  setRaftNodeState(state: PersistentState): void;
}

interface ElectionTimer {
  start(): void;
  stop(): void;
  reset(): void;
  onTimeout(callback: () => void): void;
}

interface HeartbeatTimer {
  start(): void;
  stop(): void;
  onTimeout(callback: () => void): void;
}


type RaftEvent = {
  type: "heartbeat";
  from: string;
  term: number;
  leaderId: string;
} | {
  type: "request-vote";
  from: string;
  term: number;
  candidateId: string;
  lastLogIndex: number;
  lastLogTerm: number;
} | {
  type: "request-vote-response";
  from: string;
  term: number;
  voteGranted: boolean;
} | {
  type: "append-entries";
  from: string;
  term: number;
  leaderId: string;
  prevLogIndex: number;
  prevLogTerm: number;
  entries: LogEntry[];
  leaderCommit: number;
} | {
  type: "append-entries-response";
  from: string;
  term: number;
  success: boolean;
  matchIndex: number;
} | {
  type: "heartbeat-timeout";
} | {
  type: "election-timeout";
};

interface StateMachine {
  apply(command: Command): void;
}

interface RaftNetwork {
  send(to: string, message: RaftEvent): void;
  onMessage(callback: (message: RaftEvent) => void): void;
}

class RaftNode {
  // States 
  private persistent: PersistentState;
  private volatile: VolatileState;

  // External Components
  private storage: PersistentStorage;
  private network: RaftNetwork;
  private stateMachine: StateMachine;

  // Internal Components
  private electionTimer: ElectionTimer;
  private heartbeatTimer: HeartbeatTimer;

  constructor(
    nodeId: string,
    nodeIds: string[],
    storage: PersistentStorage,
    stateMachine: StateMachine,
    network: RaftNetwork,
    electionTimer: ElectionTimer,
    heartbeatTimer: HeartbeatTimer
  ) {
    this.storage = storage;
    const lastPersistentState = storage.getRaftNodeState();
    this.persistent = lastPersistentState || {
      term: 0,
      votedFor: null,
      log: [],
    };
    this.volatile = {
      role: "follower",
      nodeId,
      nodeIds,
      commitIndex: 0,
      lastApplied: 0,
      nextIndex: {},
      matchIndex: {},
    };
    this.network = network;
    this.stateMachine = stateMachine;
    this.electionTimer = electionTimer;
    this.heartbeatTimer = heartbeatTimer;

    // Setup event handlers
    this.network.onMessage(this.handleEvent.bind(this));
    this.electionTimer.onTimeout(() => this.handleEvent({
      type: "election-timeout",
    }));
    this.heartbeatTimer.onTimeout(() => this.handleEvent({
      type: "heartbeat-timeout",
    }));
  }

  private handleEvent(event: RaftEvent): void {
    switch (event.type) {
    }
  }
}
