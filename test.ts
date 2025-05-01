import { HeartbeatTimer, ElectionTimer, StateMachine } from "./interfaces";
import { PersistentStorage } from "./interfaces";
import { MockStateMachine } from "./mockStateMachine";
import { MockHeartbeatTimer } from "./mockHeartbeatTimer";
import { MockPersistentStorage } from "./mockPersistentStorage";
import { RaftNode } from "./raft";
import { MockRaftNetwork } from "./mockRaftNetwork";
import { MockElectionTimer } from "./mockElectionTimer";
import { info } from "./output";
import {
  ClientQueryEvent,
  ClientQueryResponseEvent,
  ClientRequestResponseEvent,
  Command,
} from "./types";

type RaftUnit = {
  isAlive: boolean;
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
    return {
      isAlive: true,
      node,
      storage,
      stateMachine,
      electionTimer,
      heartbeatTimer,
    };
  });
  return { units, network };
}

function kill(cluster: RaftCluster, nodeId: string): void {
  const unit = cluster.units.find((unit) => unit.node.getNodeId() === nodeId);
  if (unit) {
    unit.isAlive = false;
    unit.electionTimer.stop();
    unit.heartbeatTimer.stop();
    cluster.network.unbind(nodeId);
  }
}

function revive(cluster: RaftCluster, nodeId: string): void {
  const unit = cluster.units.find((unit) => unit.node.getNodeId() === nodeId);
  const nodeIds = cluster.units.map((unit) => unit.node.getNodeId());
  if (unit) {
    unit.isAlive = true;
    unit.electionTimer = new MockElectionTimer();
    unit.heartbeatTimer = new MockHeartbeatTimer();
    unit.stateMachine = new MockStateMachine();
    unit.node = new RaftNode(
      nodeId,
      nodeIds,
      unit.storage, // Keep the same storage
      unit.stateMachine,
      cluster.network,
      unit.electionTimer,
      unit.heartbeatTimer
    );
  }
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomId(): string {
  const random = Math.random().toString(36).substring(2, 8).toUpperCase();
  return "CLIENT-" + random;
}

async function queryNode(
  cluster: RaftCluster,
  nodeId: string
): Promise<ClientQueryResponseEvent> {
  const senderId = randomId();
  const response = await new Promise<ClientQueryResponseEvent>((resolve) => {
    cluster.network.bind(senderId, (message) => {
      resolve(message as ClientQueryResponseEvent);
    });
    const message: ClientQueryEvent = {
      type: "client-query",
      from: senderId,
    };
    cluster.network.send(nodeId, message);
  });
  cluster.network.unbind(senderId);
  return response;
}

async function sendMessage(cluster: RaftCluster, to: string, command: Command) {
  const senderId = randomId();
  const response = await new Promise<ClientRequestResponseEvent>((resolve) => {
    cluster.network.bind(senderId, (message) => {
      resolve(message as ClientRequestResponseEvent);
    });
    cluster.network.send(to, {
      type: "client-request",
      from: senderId,
      command,
    });
  });
  cluster.network.unbind(senderId);
  return response;
}

async function findLeader(cluster: RaftCluster): Promise<string> {
  const responses = await Promise.all(
    cluster.units
      .filter((unit) => unit.isAlive)
      .map((unit) => queryNode(cluster, unit.node.getNodeId()))
  );
  const leader = responses.find(
    (response) =>
      response.type === "client-query-response" && response.role === "leader"
  );
  if (!leader) {
    throw new Error("No leader found");
  }
  return leader.from;
}

async function main() {
  const nodeIds = ["A", "B", "C"];
  const cluster = createRaftCluster(nodeIds);

  info(
    JSON.stringify(
      await Promise.all(nodeIds.map((nodeId) => queryNode(cluster, nodeId))),
      null,
      2
    )
  );

  await sleep(5000);

  // Find the leader
  const leader = await findLeader(cluster);
  info(`Leader is ${leader}`);

  await sleep(2000);

  const response = await sendMessage(cluster, leader, "Event1");
  info(JSON.stringify(response, null, 2));

  await sleep(2000);

  kill(cluster, leader);
  info(`${leader} is dead`);

  await sleep(5000);
  const newLeader = await findLeader(cluster);
  info(`New leader is ${newLeader}`);

  await sendMessage(cluster, newLeader, "Event2");
  await sleep(2000);

  await sendMessage(cluster, newLeader, "Event3");
  await sleep(2000);

  await sendMessage(cluster, newLeader, "Event4");
  await sleep(2000);

  // Print all states
  cluster.units.forEach((unit) => {
    info(JSON.stringify(unit.storage.getRaftNodeState(), null, 2));
  });

  revive(cluster, leader);
  info(`${leader} is revived`);

  await sleep(2000);

  for (const nodeId of nodeIds) {
    kill(cluster, nodeId);
  }
  info("All nodes are dead");

  // Print all states
  cluster.units.forEach((unit) => {
    info(JSON.stringify(unit.storage.getRaftNodeState(), null, 2));
  });
}

main();
