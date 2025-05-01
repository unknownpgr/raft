import {
  HeartbeatTimer,
  ElectionTimer,
  RaftNetwork,
  StateMachine,
} from "./interfaces";
import { PersistentStorage } from "./interfaces";
import { MockStateMachine } from "./mockStateMachine";
import { MockHeartbeatTimer } from "./mockHeartbeatTimer";
import { MockPersistentStorage } from "./mockPersistentStorage";
import { RaftNode } from "./raft";
import { MockRaftNetwork } from "./mockRaftNetwork";
import { MockElectionTimer } from "./mockElectionTimer";

type RaftUnit = {
  node: RaftNode;
  storage: PersistentStorage;
  stateMachine: StateMachine;
  electionTimer: ElectionTimer;
  heartbeatTimer: HeartbeatTimer;
};

type RaftCluster = {
  units: RaftUnit[];
  network: RaftNetwork;
};

function createRaftCluster(nodeIds: string[]): RaftCluster {
  const network = new MockRaftNetwork();
  const units = nodeIds.map((nodeId) => {
    const storage = new MockPersistentStorage();
    const stateMachine = new MockStateMachine();
    const electionTimer = new MockElectionTimer();
    const heartbeatTimer = new MockHeartbeatTimer();
    const node = new RaftNode(
      nodeId,
      nodeIds,
      storage,
      stateMachine,
      network,
      electionTimer,
      heartbeatTimer
    );
    return { node, storage, stateMachine, electionTimer, heartbeatTimer };
  });
  return { units, network };
}

function main() {
  const nodeIds = ["A", "B", "C"];
  const cluster = createRaftCluster(nodeIds);
}

main();
