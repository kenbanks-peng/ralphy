import { expect, test } from "bun:test";
import { join } from "node:path";

test("Task2 contains the numbers 1 through 10", async () => {
	const task = await Bun.file(join(import.meta.dir, "../../../Task2.md")).text();

	expect(task.trim()).toBe("1\n2\n3\n4\n5\n6\n7\n8\n9\n10");
});
