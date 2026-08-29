import { describe, expect, it, spyOn } from "bun:test";
import * as baseModule from "./base.ts";
import { PiEngine } from "./pi.ts";

const workDir = "/tmp/pi-engine-test";

function messageEvent(text: string, usage = { input: 10, output: 5 }): string {
	return JSON.stringify({
		type: "message_end",
		usage,
		message: { role: "assistant", content: [{ type: "text", text }] },
	});
}

describe("PiEngine", () => {
	it("runs Pi in JSON, ephemeral, approved mode", async () => {
		const engine = new PiEngine();
		let command = "";
		let args: string[] = [];
		const spy = spyOn(baseModule, "execCommand").mockImplementation(async (cmd, commandArgs) => {
			command = cmd;
			args = commandArgs;
			return { stdout: messageEvent("Done"), stderr: "", exitCode: 0 };
		});

		const result = await engine.execute("Complete the task", workDir, {
			modelOverride: "openai/gpt-5",
			engineArgs: ["--thinking", "high"],
		});

		expect(command).toBe("pi");
		expect(args).toEqual([
			"--mode",
			"json",
			"--no-session",
			"--approve",
			"--model",
			"openai/gpt-5",
			"--thinking",
			"high",
			"--",
			"Complete the task",
		]);
		expect(result).toMatchObject({
			success: true,
			response: "Done",
			inputTokens: 10,
			outputTokens: 5,
		});
		spy.mockRestore();
	});

	it("uses the final assistant message and reported usage", async () => {
		const engine = new PiEngine();
		const spy = spyOn(baseModule, "execCommand").mockResolvedValue({
			stdout: [
				JSON.stringify({
					type: "message_update",
					usage: { input: 20, output: 8 },
				}),
				messageEvent("Task finished", { input: 24, output: 11 }),
			].join("\n"),
			stderr: "",
			exitCode: 0,
		});

		const result = await engine.execute("Complete", workDir);

		expect(result).toMatchObject({
			success: true,
			response: "Task finished",
			inputTokens: 24,
			outputTokens: 11,
		});
		spy.mockRestore();
	});

	it("returns Pi error events", async () => {
		const engine = new PiEngine();
		const spy = spyOn(baseModule, "execCommand").mockResolvedValue({
			stdout: JSON.stringify({
				type: "error",
				error: { message: "Not authenticated" },
			}),
			stderr: "",
			exitCode: 1,
		});

		const result = await engine.execute("Complete", workDir);

		expect(result).toMatchObject({
			success: false,
			error: "Not authenticated",
		});
		spy.mockRestore();
	});

	it("reports tool activity during streamed execution", async () => {
		const engine = new PiEngine();
		const spy = spyOn(baseModule, "execCommandStreaming").mockImplementation(
			async (_cmd, _args, _workDir, onLine) => {
				onLine(
					JSON.stringify({
						type: "tool_execution_start",
						toolName: "read",
						args: {},
					}),
				);
				onLine(messageEvent("Done"));
				return { exitCode: 0 };
			},
		);
		const steps: string[] = [];

		const result = await engine.executeStreaming("Complete", workDir, (step) => steps.push(step));

		expect(result.success).toBe(true);
		expect(steps).toEqual(["Reading code"]);
		spy.mockRestore();
	});
});
