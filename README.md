# Raft Consensus Algorithm Implementation

This project is a TypeScript implementation of the Raft consensus algorithm, which is a consensus algorithm designed to be easy to understand and implement. It's equivalent to Paxos in fault-tolerance and performance.

## Project Structure

- `raft.ts` - Main implementation of the Raft consensus algorithm
- `types.ts` - Type definitions for the Raft implementation
- `interfaces.ts` - Interface definitions for the Raft components
- `test.ts` - Test suite for the Raft implementation
- `output.ts` - Output handling utilities

### Mock Components

The project includes several mock components for testing:

- `mockElectionTimer.ts` - Mock implementation of election timer
- `mockHeartbeatTimer.ts` - Mock implementation of heartbeat timer
- `mockRaftNetwork.ts` - Mock implementation of network communication
- `mockStateMachine.ts` - Mock implementation of state machine
- `mockPersistentStorage.ts` - Mock implementation of persistent storage

## Prerequisites

- Node.js (v14 or higher)
- npm (v6 or higher)

## Installation

```bash
npm install
```

## Running Tests

```bash
npm test
```

## Project Dependencies

- TypeScript
- ts-jest (for TypeScript testing support)
- ts-node (for running TypeScript directly)

## Development

This project uses TypeScript for type safety and better development experience. The codebase is structured to be modular and testable, with clear separation of concerns between different components of the Raft algorithm.

## License

This project is open source and available under the MIT License.
