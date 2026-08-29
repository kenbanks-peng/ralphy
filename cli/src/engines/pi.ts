import {
	BaseAIEngine,
	detectStepFromOutput,
	execCommand,
	execCommandStreaming,
	formatCommandError,
} from "./base.ts";
import type { AIResult, EngineOptions, ProgressCallback } from "./types.ts";

interface PiOutput {
	response: string;
	inputTokens: number;
	outputTokens: number;
	error: string | null;
}

/**
 * Pi coding agent engine.
 * https://pi.dev
 */
export class PiEngine extends BaseAIEngine {
	name = "Pi";
	cliCommand = "pi";

	async execute(prompt: string, workDir: string, options?: EngineOptions): Promise<AIResult> {
		const { stdout, stderr, exitCode } = await execCommand(
			this.cliCommand,
			this.buildArgs(prompt, options),
			workDir,
		);
		return this.createResult(stdout + stderr, exitCode);
	}

	async executeStreaming(
		prompt: string,
		workDir: string,
		onProgress: ProgressCallback,
		options?: EngineOptions,
	): Promise<AIResult> {
		const outputLines: string[] = [];
		const { exitCode } = await execCommandStreaming(
			this.cliCommand,
			this.buildArgs(prompt, options),
			workDir,
			(line) => {
				outputLines.push(line);
				const step = this.detectStep(line);
				if (step) onProgress(step);
			},
		);
		return this.createResult(outputLines.join("\n"), exitCode);
	}

	private buildArgs(prompt: string, options?: EngineOptions): string[] {
		const args = ["--mode", "json", "--no-session", "--approve"];
		if (options?.modelOverride) {
			args.push("--model", options.modelOverride);
		}
		if (options?.engineArgs?.length) {
			args.push(...options.engineArgs);
		}
		return [...args, "--", prompt];
	}

	private createResult(output: string, exitCode: number): AIResult {
		const { response, inputTokens, outputTokens, error } = this.parseOutput(output);
		if (error) {
			return { success: false, response, inputTokens, outputTokens, error };
		}
		if (exitCode !== 0) {
			return {
				success: false,
				response,
				inputTokens,
				outputTokens,
				error: formatCommandError(exitCode, output),
			};
		}
		return { success: true, response, inputTokens, outputTokens };
	}

	private parseOutput(output: string): PiOutput {
		let response = "";
		let inputTokens = 0;
		let outputTokens = 0;
		let error: string | null = null;

		for (const line of output.split("\n")) {
			try {
				const event = JSON.parse(line);
				if (event.usage) {
					inputTokens = this.getTokenCount(event.usage, ["input", "inputTokens", "input_tokens"]);
					outputTokens = this.getTokenCount(event.usage, [
						"output",
						"outputTokens",
						"output_tokens",
					]);
				}
				if (event.type === "message_end" && event.message?.role === "assistant") {
					response = this.getMessageText(event.message.content) || response;
				}
				if (event.type === "error") {
					error = this.getErrorMessage(event);
				}
			} catch {
				// Ignore non-JSON output.
			}
		}

		return {
			response: response || "Task completed",
			inputTokens,
			outputTokens,
			error,
		};
	}

	private getTokenCount(usage: Record<string, unknown>, keys: string[]): number {
		for (const key of keys) {
			const value = usage[key];
			if (typeof value === "number") return value;
		}
		return 0;
	}

	private getMessageText(content: unknown): string {
		if (!Array.isArray(content)) return "";
		return content
			.filter(
				(item): item is { type?: string; text?: string } =>
					typeof item === "object" && item !== null,
			)
			.filter((item) => item.type === "text" && typeof item.text === "string")
			.map((item) => item.text)
			.join("");
	}

	private getErrorMessage(event: Record<string, unknown>): string {
		const value = event.error ?? event.message;
		if (typeof value === "string") return value;
		if (typeof value === "object" && value !== null && "message" in value) {
			const message = (value as { message?: unknown }).message;
			if (typeof message === "string") return message;
		}
		return "Pi execution failed";
	}

	private detectStep(line: string): string | null {
		try {
			const event = JSON.parse(line);
			if (event.type !== "tool_execution_start" || typeof event.toolName !== "string") {
				return null;
			}
			const args = event.args ?? {};
			return detectStepFromOutput(
				JSON.stringify({
					tool: event.toolName,
					command: args.command,
					path: args.path,
				}),
			);
		} catch {
			return null;
		}
	}
}
