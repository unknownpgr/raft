export type NodeRole = "follower" | "candidate" | "leader";

export type Command = string;

export type LogEntry = {
  term: number;
  command: Command;
};

export type PersistentState = {
  term: number;
  votedFor: string | null;
  log: LogEntry[];
};

export type VolatileState = {
  role: NodeRole;
  nodeId: string;
  nodeIds: string[];
  commitIndex: number;
  lastApplied: number;

  // For leaders
  nextIndex: Record<string, number>;
  matchIndex: Record<string, number>;
};

export type RaftEvent =
  | {
      type: "heartbeat";
      from: string;
      term: number;
      leaderId: string;
    }
  | {
      type: "request-vote";
      from: string;
      term: number;
      candidateId: string;
      lastLogIndex: number;
      lastLogTerm: number;
    }
  | {
      type: "request-vote-response";
      from: string;
      term: number;
      voteGranted: boolean;
    }
  | {
      type: "append-entries";
      from: string;
      term: number;
      leaderId: string;
      prevLogIndex: number;
      prevLogTerm: number;
      entries: LogEntry[];
      leaderCommit: number;
    }
  | {
      type: "append-entries-response";
      from: string;
      term: number;
      success: boolean;
      matchIndex: number;
    }
  | {
      type: "heartbeat-timeout";
    }
  | {
      type: "election-timeout";
    };
