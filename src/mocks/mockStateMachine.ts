import { Command } from "../core/types";
import { StateMachine } from "../core/interfaces";

export class MockStateMachine implements StateMachine {
  private commands: Command[] = [];

  apply(command: Command): void {
    this.commands.push(command);
  }

  getAppliedCommands(): Command[] {
    return [...this.commands];
  }

  clear(): void {
    this.commands = [];
  }
}
