import {
  ElectionTimer,
  HeartbeatTimer,
  PersistentStorage,
  RaftNetwork,
  StateMachine,
} from "./interfaces";
import { PersistentState, VolatileState, LogEntry, RaftEvent } from "./types";

export class RaftNode {
  private persistent: PersistentState;
  private volatile: VolatileState;
  private votes: Set<string>;

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
    };
    this.votes = new Set();

    this.network = network;
    this.stateMachine = stateMachine;
    this.electionTimer = electionTimer;
    this.heartbeatTimer = heartbeatTimer;

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

  private handleEvent(event: RaftEvent): void {
    switch (event.type) {
      case "heartbeat-timeout": {
        if (this.volatile.role === "leader") {
          this.sendHeartbeats();
        }
        break;
      }

      case "election-timeout": {
        if (this.volatile.role !== "leader") {
          this.startElection();
        }
        break;
      }

      case "heartbeat": {
        if (event.term < this.persistent.term) {
          return;
        }

        if (event.term > this.persistent.term) {
          this.persistent.term = event.term;
          this.persistent.votedFor = null;
          this.volatile.role = "follower";
          this.storage.setRaftNodeState(this.persistent);
        }

        this.electionTimer.reset();
        break;
      }

      case "request-vote": {
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
        break;
      }

      case "request-vote-response": {
        if (
          event.term !== this.persistent.term ||
          this.volatile.role !== "candidate"
        ) {
          return;
        }

        if (event.voteGranted) {
          this.votes.add(event.from);
          if (this.votes.size > this.volatile.nodeIds.length / 2) {
            this.becomeLeader();
          }
        }
        break;
      }

      case "append-entries": {
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
        break;
      }
    }
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

  private startElection(): void {
    this.persistent.term++;
    this.persistent.votedFor = this.volatile.nodeId;
    this.volatile.role = "candidate";
    this.storage.setRaftNodeState(this.persistent);

    this.votes = new Set([this.volatile.nodeId]);

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

  private becomeLeader(): void {
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
    while (this.volatile.lastApplied < this.volatile.commitIndex) {
      this.volatile.lastApplied++;
      const entry = this.persistent.log[this.volatile.lastApplied];
      this.stateMachine.apply(entry.command);
    }
  }
}
