import { assertEquals, assertRejects } from "https://deno.land/std@0.208.0/assert/mod.ts";
import DB from "./mod.js";

var dbc = () => new DB({ host: "localhost", user: "root", pass: "mysql", db: "mock" });
const db = dbc();

// --- static screen() ---
// /* 
Deno.test("DB.screen - string escaping", () => {
	assertEquals(DB.screen("hello"), "'hello'");
	assertEquals(DB.screen("hel'lo"), "'hel\\'lo'");
	assertEquals(DB.screen("hel\\lo"), "'hel\\\\lo'");
});

Deno.test("DB.screen - null and undefined", () => {
	assertEquals(DB.screen(null), "NULL");
	assertEquals(DB.screen(undefined), "NULL");
});

Deno.test("DB.screen - number and object", () => {
	assertEquals(DB.screen(42), 42);
	assertEquals(DB.screen({ a: 1 }), "'{\"a\":1}'");
});

// --- escape() ---

Deno.test("DB.escape - basic escaping", () => {
	assertEquals(db.escape(1), "1");
	assertEquals(db.escape("hello"), "hello");
	assertEquals(db.escape("hel%lo"), "hel\\%lo");
	assertEquals(db.escape("hel\"lo"), "hel\"\"lo");
});

Deno.test("DB.escape - quote and addPerc", () => {
	assertEquals(db.escape("hello", true), "\"hello\"");
	assertEquals(db.escape("hello", false, true), "hello\\%");
	assertEquals(db.escape("hel\\", false, true), "hel\\\\\\%");
});

Deno.test("DB.escape - null and undefined", () => {
	assertEquals(db.escape(null), "NULL");
	assertEquals(db.escape(undefined), "NULL");
});

// --- end() ---

// --- query() formatting and helpers (q/row/cell/select/col) ---

Deno.test("DB.query - simple SELECT passes through args", async () => {
	const db = dbc();
	const res = await db.query("  SELECT * FROM t WHERE id = ?  ", 123);
	assertEquals(res, [
		[
			"id",
			"name",
			"age",
			"flag",
		],
		[123, 'ok', null, null],
	]);
	await db.end();
});

Deno.test("DB.query - Set and empty array values", async () => {
	const db = dbc();
	var capturedValues = await db.select("SELECT * FROM t WHERE id IN (?)", new Set([1, 2]));
	assertEquals(capturedValues, [
		{ id: 1, name: 'name1', age: null, flag: null },
		{ id: 2, name: 'name2', age: null, flag: null },
	]);
	await db.end();
});

Deno.test("DB.query - INSERT with null values returns 0", async () => {
	const db = dbc();
	// For INSERT and REPLACE when first value is null, query() returns 0 synchronously
	const res = await db.query("INSERT INTO t", null);
	assertEquals(res, 0);
	await db.end();
});

Deno.test("DB.query - INSERT object", async () => {
	const db = dbc();
	// For INSERT and REPLACE when first value is null, query() returns 0 synchronously
	const res = await db.query("INSERT INTO label", { c: 'x', value: 777, name: 'lalala' });
	assertEquals(res, 1);
	await db.end();
});

Deno.test("DB.query - UPDATE with object SET expands correctly", async () => {
	const db = dbc();
	var upd = { name: "foo", age: 30 }, id = 10;
	await db.query("UPDATE t SET ? WHERE id = ?", { name: "", age: 0 }, id);
	var q_upd = await db.query("UPDATE t SET ? WHERE id = ?", upd, id);
	var capturedValues = await db.row("SELECT name, age FROM t WHERE id = ?", id);

	assertEquals(q_upd, 1);
	assertEquals(capturedValues, upd);
	await db.end();
});

Deno.test("DB.q is an alias for query", async () => {
	const db = dbc();
	const res = await db.q("SELECT 1");
	assertEquals(res, [['1'], [1]]);
	await db.end();
});

// --- #result via select/col/cell/row ---
Deno.test("DB.col returns column values array", async () => {
	const db = dbc();
	const res = await db.col("SELECT id FROM t ORDER BY 1");
	assertEquals(res, [1, 2, 10, 123]);
	await db.end();
});

Deno.test("DB.cell returns first cell or null", async () => {
	const db = dbc();
	assertEquals(await db.cell("SELECT name FROM t WHERE id=1"), 'name1');
	assertEquals(await db.cell("SELECT name FROM t WHERE id=999"), null);
	await db.end();
});

Deno.test("DB.row maps first row to object", async () => {
	const db = dbc();
	const res = await db.row("SELECT id, name FROM t LIMIT 1");
	assertEquals(res, { id: 1, name: "name1" });
	await db.end();
});

Deno.test("DB.select with ARRAY_KEY produces nested object", async () => {
	const db = dbc();
	const res = await db.select("SELECT id AS ARRAY_KEY, name FROM t");
	assertEquals(res, {
		"1": { name: "name1" },
		"2": { name: "name2" },
		"10": { name: "foo" },
		"123": { name: "ok" },
	});
	await db.end();
});
