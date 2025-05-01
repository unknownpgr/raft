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
import { info } from "./output";

type RaftUnit = {
  node: RaftNode;
  storage: PersistentStorage;
  stateMachine: StateMachine;
  electionTimer: ElectionTimer;
  heartbeatTimer: HeartbeatTimer;
};

type RaftCluster = {
  units: RaftUnit[];
  network: MockRaftNetwork;
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

function kill(cluster: RaftCluster, nodeId: string): void {
  const unit = cluster.units.find((unit) => unit.node.getNodeId() === nodeId);
  if (unit) {
    unit.electionTimer.stop();
    unit.heartbeatTimer.stop();
    cluster.network.unbind(nodeId);
  }
}

function revive(cluster: RaftCluster, nodeId: string): void {
  const unit = cluster.units.find((unit) => unit.node.getNodeId() === nodeId);
  const nodeIds = cluster.units.map((unit) => unit.node.getNodeId());
  if (unit) {
    unit.node = new RaftNode(
      nodeId,
      nodeIds,
      unit.storage, // Keep the same storage
      new MockStateMachine(),
      cluster.network,
      new MockElectionTimer(),
      new MockHeartbeatTimer()
    );
  }
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const nodeIds = ["A", "B", "C"];
  const cluster = createRaftCluster(nodeIds);

  await sleep(10000);
  kill(cluster, "A");
  kill(cluster, "B");
  kill(cluster, "C");
  info("All nodes are dead");

  await sleep(10000);
  revive(cluster, "A");
  revive(cluster, "B");
  revive(cluster, "C");
  info("All nodes are revived");
}

main();
