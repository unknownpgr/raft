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

    /**
     * Section 5.3
     * When a leader first comes to power,
     * it initializes all nextIndex values to the index just after the
     * last one in its log
     */
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

    // Start timers
    this.electionTimer.start();
    this.heartbeatTimer.start();
  }

  public getNodeId(): string {
    return this.volatile.nodeId;
  }

  private sendHeartbeats(): void {
    for (const nodeId of this.volatile.nodeIds) {
      if (nodeId !== this.volatile.nodeId) {
        this.sendAppendEntries(nodeId);
      }
    }
  }

  private sendAppendEntries(to: string): void {
    // Section 5.3

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
    /**
     * Section 5.3
     * ... If the follower does not find an entry in its log with the same index and term,
     * then it refuses the new entries.
     */

    if (
      prevLogIndex >= 0 &&
      // If log of prevLogIndex does not exists
      (prevLogIndex >= this.persistent.log.length ||
        // or log of prevLogIndex has different term
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
    /**
     * Section 5, Rules for Servers
     * If commitIndex > lastApplied: increment lastApplied, apply log[lastApplied] to state machine
     */

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

    info(`${this.volatile.nodeId} started election`);

    /**
     * Section 5.3, Rules for Servers
     * On conversion to candidate, start election:
     * - Increment currentTerm
     * - Vote for self
     * - Reset election timer
     * - Send RequestVote RPCs to all other servers
     */

    this.volatile.role = "candidate";
    this.persistent.term++;
    this.persistent.votedFor = this.volatile.nodeId;
    this.volatile.votes = new Set([this.volatile.nodeId]);
    this.electionTimer.reset();
    this.storage.setRaftNodeState(this.persistent);

    /**
     * Section 5.4
     * - lastLogIndex: index of candidate’s last log entry
     * - lastLogTerm: term of candidate’s last log entry
     *
     *  NOTE: if log compaction (snapshotting) is used, lastLogIndex may not be same as this.persistent.log.length - 1.
     */

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
  }

  private handleRequestVote(event: RequestVoteEvent): void {
    // Section 5.1
    // If term is lower, return false
    if (event.term < this.persistent.term) {
      this.network.send(event.from, {
        type: "request-vote-response",
        from: this.volatile.nodeId,
        term: this.persistent.term,
        voteGranted: false,
      });
      return;
    }

    // Section 5, Rules for Servers
    // If term is higher, update term and become follower
    if (event.term > this.persistent.term) {
      this.persistent.term = event.term;
      this.persistent.votedFor = null;
      this.volatile.role = "follower";
      this.electionTimer.reset();
      this.storage.setRaftNodeState(this.persistent);
    }

    /**
     * Section 5, RequestVote RPC
     * If votedFor is null or candidateId, and candidate’s log is at least as up-to-date as receiver’s log, grant vote (5.2, 5.4)
     *
     * ...If the logs have last entries with different terms, then
     * the log with the later term is more up-to-date. If the logs
     * end with the same term, then whichever log is longer is
     * more up-to-date.
     */

    const lastLogIndex = this.persistent.log.length - 1;
    const lastLogTerm =
      lastLogIndex >= 0 ? this.persistent.log[lastLogIndex].term : 0;
    const isLogUpToDate =
      event.lastLogTerm > lastLogTerm ||
      (event.lastLogTerm === lastLogTerm && event.lastLogIndex >= lastLogIndex);

    const voteGranted =
      (this.persistent.votedFor === null ||
        this.persistent.votedFor === event.candidateId) &&
      isLogUpToDate;

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
    if (this.volatile.role !== "candidate") return;

    // Section 5.2
    //If the term in the RPC is smaller than the candidate’s current term, then the candidate rejects the RPC and continues in candidate state.
    if (event.term < this.persistent.term) return;
    if (event.term > this.persistent.term) {
      this.persistent.term = event.term;
      this.persistent.votedFor = null;
      this.volatile.role = "follower";
      this.storage.setRaftNodeState(this.persistent);
      this.electionTimer.reset();
      return;
    }
    if (!event.voteGranted) return;

    this.volatile.votes.add(event.from);

    if (this.volatile.votes.size <= this.volatile.nodeIds.length / 2) return;

    info(`${this.volatile.nodeId} become leader`);

    this.volatile.role = "leader";

    for (const nodeId of this.volatile.nodeIds) {
      if (nodeId !== this.volatile.nodeId) {
        this.volatile.nextIndex[nodeId] = this.persistent.log.length;
        this.volatile.matchIndex[nodeId] = -1;
      }
    }

    this.sendHeartbeats();
  }

  private handleAppendEntries(event: AppendEntriesEvent): void {
    // Section 5, AppendEntries RPC
    // Reply false if term < currentTerm (5.1)
    if (event.term < this.persistent.term) {
      this.network.send(event.from, {
        type: "append-entries-response",
        from: this.volatile.nodeId,
        term: this.persistent.term,
        success: false,
        matchIndex: 0, // In case of false, matchIndex is not used.
      });
      return;
    }

    if (event.term >= this.persistent.term) {
      // NOTE: because there cannot be two different leaders with the same term,
      // event.term == this.persistent.term means that event.from is the leader.
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

    // Section 5, AppendEntries RPC
    // If leaderCommit > commitIndex, set commitIndex = min(leaderCommit, index of last new entry)
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
      matchIndex: success ? event.prevLogIndex + event.entries.length : 0,
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

    // Section 5.3
    // After a rejection, the leader decrements nextIndex and retries the AppendEntries RPC.
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

    /**
     * Section 5.3
     * A log entry is committed once the leader
     * that created the entry has replicated it on a majority of
     * the servers
     */

    // Calculate majority match index
    const matchIndexes = Object.values(this.volatile.matchIndex).concat(
      this.persistent.log.length - 1
    );
    matchIndexes.sort((a, b) => b - a); // Descending order
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

    // FIXME: This is not correct. client response should be sent after the log is committed.
    this.network.send(event.from, {
      type: "client-request-response",
      from: this.volatile.nodeId,
      success: true,
    });
  }
}
