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

  // For candidates
  votes: Set<string>;

  // For leaders
  nextIndex: Record<string, number>;
  matchIndex: Record<string, number>;
};

export interface HeartbeatEvent {
  type: "heartbeat";
  from: string;
  term: number;
  leaderId: string;
}

export interface RequestVoteEvent {
  type: "request-vote";
  from: string;
  term: number;
  candidateId: string;
  lastLogIndex: number;
  lastLogTerm: number;
}

export interface RequestVoteResponseEvent {
  type: "request-vote-response";
  from: string;
  term: number;
  voteGranted: boolean;
}

export interface AppendEntriesEvent {
  type: "append-entries";
  from: string;
  term: number;
  leaderId: string;
  prevLogIndex: number;
  prevLogTerm: number;
  entries: LogEntry[];
  leaderCommit: number;
}

export interface AppendEntriesResponseEvent {
  type: "append-entries-response";
  from: string;
  term: number;
  success: boolean;
  matchIndex: number;
}

export interface HeartbeatTimeoutEvent {
  type: "heartbeat-timeout";
}

export interface ElectionTimeoutEvent {
  type: "election-timeout";
}

export interface ClientQueryEvent {
  type: "client-query";
  from: string;
}

export interface ClientQueryResponseEvent {
  type: "client-query-response";
  from: string;
  role: NodeRole;
}

export interface ClientRequestEvent {
  type: "client-request";
  from: string;
  command: Command;
}

export interface ClientRequestResponseEvent {
  type: "client-request-response";
  from: string;
  success: boolean;
  error?: string;
}

export type RaftEvent =
  | HeartbeatEvent
  | RequestVoteEvent
  | RequestVoteResponseEvent
  | AppendEntriesEvent
  | AppendEntriesResponseEvent
  | HeartbeatTimeoutEvent
  | ElectionTimeoutEvent
  | ClientQueryEvent
  | ClientQueryResponseEvent
  | ClientRequestEvent
  | ClientRequestResponseEvent;
