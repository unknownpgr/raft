import {
  ElectionTimer,
  HeartbeatTimer,
  PersistentStorage,
  RaftNetwork,
  StateMachine,
} from "./interfaces";
import { error, info } from "./logger";
import {
  PersistentState,
  VolatileState,
  LogEntry,
  RaftEvent,
  RequestVoteEvent,
  RequestVoteResponseEvent,
  AppendEntriesEvent,
  ClientQueryEvent,
  ClientRequestEvent,
  AppendEntriesResponseEvent,
} from "./types";

export class RaftNode {
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
    this.persistent = {
      term: 0,
      votedFor: null,
      log: [],
    };
    if (lastPersistentState) {
      this.persistent = lastPersistentState;
    }
    storage.setRaftNodeState(this.persistent);

    this.volatile = {
      role: "follower",
      nodeId,
      nodeIds,
      commitIndex: -1,
      lastApplied: -1,
      nextIndex: {},
      matchIndex: {},
      votes: new Set(),
    };
    this.network = network;
    this.stateMachine = stateMachine;
    this.electionTimer = electionTimer;
    this.heartbeatTimer = heartbeatTimer;

    // Setup nextIndex and matchIndex for all nodes
    for (const nodeId of this.volatile.nodeIds) {
      this.volatile.nextIndex[nodeId] = this.persistent.log.length;
      this.volatile.matchIndex[nodeId] = -1;
    }

    // Setup event handlers
    this.network.bind(this.volatile.nodeId, this.handleEvent.bind(this));
    this.electionTimer.onTimeout(() =>
      this.handleEvent({
        type: "election-timeout",
      })
    );
    this.heartbeatTimer.onTimeout(() =>
      this.handleEvent({
        type: "heartbeat-timeout",
      })
    );

    // Start election timer
    this.electionTimer.start();
  }

  public getNodeId(): string {
    return this.volatile.nodeId;
  }

  private isLogUpToDate(
    candidateLastLogIndex: number,
    candidateLastLogTerm: number
  ): boolean {
    const lastLogIndex = this.persistent.log.length - 1;
    const lastLogTerm =
      lastLogIndex >= 0 ? this.persistent.log[lastLogIndex].term : 0;

    return (
      candidateLastLogTerm > lastLogTerm ||
      (candidateLastLogTerm === lastLogTerm &&
        candidateLastLogIndex >= lastLogIndex)
    );
  }

  private sendHeartbeats(): void {
    for (const nodeId of this.volatile.nodeIds) {
      if (nodeId !== this.volatile.nodeId) {
        this.sendAppendEntries(nodeId);
      }
    }
  }

  private sendAppendEntries(to: string): void {
    const prevLogIndex = this.volatile.nextIndex[to] - 1;
    const prevLogTerm =
      prevLogIndex >= 0 ? this.persistent.log[prevLogIndex].term : 0;
    const entries = this.persistent.log.slice(this.volatile.nextIndex[to]);

    this.network.send(to, {
      type: "append-entries",
      from: this.volatile.nodeId,
      term: this.persistent.term,
      leaderId: this.volatile.nodeId,
      prevLogIndex,
      prevLogTerm,
      entries,
      leaderCommit: this.volatile.commitIndex,
    });
  }

  private appendEntries(
    prevLogIndex: number,
    prevLogTerm: number,
    entries: LogEntry[]
  ): boolean {
    if (
      prevLogIndex >= 0 &&
      (prevLogIndex >= this.persistent.log.length ||
        this.persistent.log[prevLogIndex].term !== prevLogTerm)
    ) {
      return false;
    }

    // Remove conflicting entries and append new ones
    let newLog = this.persistent.log.slice(0, prevLogIndex + 1);
    newLog = newLog.concat(entries);
    this.persistent.log = newLog;
    this.storage.setRaftNodeState(this.persistent);

    return true;
  }

  private applyCommittedEntries(): void {
    info(`Committed on ${this.volatile.nodeId}`);
    while (this.volatile.lastApplied < this.volatile.commitIndex) {
      this.volatile.lastApplied++;
      const entry = this.persistent.log[this.volatile.lastApplied];
      this.stateMachine.apply(entry.command);
    }
  }

  private handleEvent(event: RaftEvent): void {
    switch (event.type) {
      case "heartbeat-timeout": {
        this.handleHeartbeatTimeout();
        break;
      }

      case "election-timeout": {
        this.handleElectionTimeout();
        break;
      }

      case "request-vote": {
        this.handleRequestVote(event as RequestVoteEvent);
        break;
      }

      case "request-vote-response": {
        this.handleRequestVoteResponse(event as RequestVoteResponseEvent);
        break;
      }

      case "append-entries": {
        this.handleAppendEntries(event as AppendEntriesEvent);
        break;
      }

      case "append-entries-response": {
        this.handleAppendEntriesResponse(event as AppendEntriesResponseEvent);
        break;
      }

      case "client-query": {
        this.handleClientQuery(event as ClientQueryEvent);
        break;
      }

      case "client-request": {
        this.handleClientRequest(event as ClientRequestEvent);
        break;
      }

      default: {
        error(`Unknown event: ${event.type}`);
        throw new Error(`Unknown event: ${event.type}`);
        break;
      }
    }
  }

  private handleHeartbeatTimeout(): void {
    if (this.volatile.role === "leader") {
      this.sendHeartbeats();
    }
  }

  private handleElectionTimeout(): void {
    if (this.volatile.role == "leader") return;

    info(`${this.volatile.nodeId} start election`);

    // Become a candidate
    this.volatile.role = "candidate";

    // Increase term
    this.persistent.term++;

    // Vote for self
    this.persistent.votedFor = this.volatile.nodeId;
    this.volatile.votes = new Set([this.volatile.nodeId]);
    this.storage.setRaftNodeState(this.persistent);

    const lastLogIndex = this.persistent.log.length - 1;
    const lastLogTerm =
      lastLogIndex >= 0 ? this.persistent.log[lastLogIndex].term : 0;

    for (const nodeId of this.volatile.nodeIds) {
      if (nodeId !== this.volatile.nodeId) {
        this.network.send(nodeId, {
          type: "request-vote",
          from: this.volatile.nodeId,
          term: this.persistent.term,
          candidateId: this.volatile.nodeId,
          lastLogIndex,
          lastLogTerm,
        });
      }
    }

    this.electionTimer.reset();
  }

  private handleRequestVote(event: RequestVoteEvent): void {
    if (event.term < this.persistent.term) {
      this.network.send(event.from, {
        type: "request-vote-response",
        from: this.volatile.nodeId,
        term: this.persistent.term,
        voteGranted: false,
      });
      return;
    }

    if (event.term > this.persistent.term) {
      this.persistent.term = event.term;
      this.persistent.votedFor = null;
      this.volatile.role = "follower";
      this.storage.setRaftNodeState(this.persistent);
    }

    const voteGranted =
      (this.persistent.votedFor === null ||
        this.persistent.votedFor === event.candidateId) &&
      this.isLogUpToDate(event.lastLogIndex, event.lastLogTerm);

    if (voteGranted) {
      this.persistent.votedFor = event.candidateId;
      this.storage.setRaftNodeState(this.persistent);
      this.electionTimer.reset();
    }

    this.network.send(event.from, {
      type: "request-vote-response",
      from: this.volatile.nodeId,
      term: this.persistent.term,
      voteGranted,
    });
  }

  private handleRequestVoteResponse(event: RequestVoteResponseEvent): void {
    if (
      event.term !== this.persistent.term ||
      this.volatile.role !== "candidate"
    ) {
      return;
    }

    if (!event.voteGranted) return;

    this.volatile.votes.add(event.from);

    if (this.volatile.votes.size <= this.volatile.nodeIds.length / 2) return;

    info(`${this.volatile.nodeId} become leader`);

    this.volatile.role = "leader";
    this.electionTimer.stop();
    this.heartbeatTimer.start();

    for (const nodeId of this.volatile.nodeIds) {
      if (nodeId !== this.volatile.nodeId) {
        this.volatile.nextIndex[nodeId] = this.persistent.log.length;
        this.volatile.matchIndex[nodeId] = -1;
      }
    }

    this.sendHeartbeats();
  }

  private handleAppendEntries(event: AppendEntriesEvent): void {
    if (event.term < this.persistent.term) {
      this.network.send(event.from, {
        type: "append-entries-response",
        from: this.volatile.nodeId,
        term: this.persistent.term,
        success: false,
        matchIndex: this.volatile.commitIndex,
      });
      return;
    }

    if (event.term > this.persistent.term) {
      this.persistent.term = event.term;
      this.persistent.votedFor = null;
      this.volatile.role = "follower";
      this.storage.setRaftNodeState(this.persistent);
    }

    this.electionTimer.reset();

    const success = this.appendEntries(
      event.prevLogIndex,
      event.prevLogTerm,
      event.entries
    );

    if (success && event.leaderCommit > this.volatile.commitIndex) {
      this.volatile.commitIndex = Math.min(
        event.leaderCommit,
        this.persistent.log.length - 1
      );
      this.applyCommittedEntries();
    }

    this.network.send(event.from, {
      type: "append-entries-response",
      from: this.volatile.nodeId,
      term: this.persistent.term,
      success,
      matchIndex: success
        ? event.prevLogIndex + event.entries.length
        : this.volatile.commitIndex,
    });
  }

  private handleAppendEntriesResponse(event: AppendEntriesResponseEvent): void {
    // Ignore old messages
    if (event.term < this.persistent.term) {
      return;
    }

    // Immediately became follower if term is higher
    if (event.term > this.persistent.term) {
      this.persistent.term = event.term;
      this.persistent.votedFor = null;
      this.volatile.role = "follower";
      this.storage.setRaftNodeState(this.persistent);
      this.electionTimer.reset();
    }

    // If follower is not up to date, send append entries again
    if (!event.success) {
      this.volatile.nextIndex[event.from] = Math.max(
        this.volatile.nextIndex[event.from] - 1,
        0
      );
      this.sendAppendEntries(event.from);
      return;
    }

    // Update nextIndex and matchIndex
    this.volatile.nextIndex[event.from] = event.matchIndex + 1;
    this.volatile.matchIndex[event.from] = event.matchIndex;

    // Calculate majority match index
    const matchIndexes = Object.values(this.volatile.matchIndex).concat(
      this.persistent.log.length - 1
    );
    matchIndexes.sort((a, b) => b - a); // 내림차순
    const majorityMatchIndex =
      matchIndexes[Math.floor(matchIndexes.length / 2)];

    // If majority of nodes have replicated up to this index, commit
    if (
      majorityMatchIndex > this.volatile.commitIndex &&
      this.persistent.log[majorityMatchIndex].term === this.persistent.term
    ) {
      this.volatile.commitIndex = majorityMatchIndex;
      this.applyCommittedEntries();
    }
  }

  private handleClientQuery(event: ClientQueryEvent): void {
    this.network.send(event.from, {
      type: "client-query-response",
      from: this.volatile.nodeId,
      role: this.volatile.role,
    });
  }

  private handleClientRequest(event: ClientRequestEvent): void {
    if (this.volatile.role !== "leader") {
      this.network.send(event.from, {
        type: "client-request-response",
        from: this.volatile.nodeId,
        success: false,
        error: "Not leader",
      });
      return;
    }

    // Add command to log
    const entry: LogEntry = {
      term: this.persistent.term,
      command: event.command,
    };
    this.persistent.log.push(entry);
    this.storage.setRaftNodeState(this.persistent);

    // Send append entries to all followers
    this.sendHeartbeats();

    this.network.send(event.from, {
      type: "client-request-response",
      from: this.volatile.nodeId,
      success: true,
    });
  }
}
