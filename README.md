# Raft Consensus Algorithm Implementation

This project is a TypeScript implementation of the Raft consensus algorithm, which is a consensus algorithm designed to be easy to understand and implement. It's equivalent to Paxos in fault-tolerance and performance.

## Project Structure

- `core/raft.ts` - Main implementation of the Raft consensus algorithm
- `core/types.ts` - Type definitions for the Raft implementation
- `core/interfaces.ts` - Interface definitions for the Raft components
- `core/logger.ts` - Output handling utilities
- `test.ts` - Test suite for the Raft implementation

### Mock Components

The project includes several mock components for testing:

- `mocks/mockElectionTimer.ts` - Mock implementation of election timer
- `mocks/mockHeartbeatTimer.ts` - Mock implementation of heartbeat timer
- `mocks/mockRaftNetwork.ts` - Mock implementation of network communication
- `mocks/mockStateMachine.ts` - Mock implementation of state machine
- `mocks/mockPersistentStorage.ts` - Mock implementation of persistent storage

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

## Development

This project uses TypeScript for type safety and better development experience. The codebase is structured to be modular and testable, with clear separation of concerns between different components of the Raft algorithm.

## License

This project is open source and available under the MIT License.
