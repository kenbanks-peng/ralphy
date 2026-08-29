import { expect, test } from "bun:test";
import { join } from "node:path";

test("Task1 contains the alphabet", async () => {
	const task = await Bun.file(join(import.meta.dir, "../../../Task1.md")).text();

	expect(task.trim()).toBe("abcdefghijklmnopqrstuvwxyz");
});
