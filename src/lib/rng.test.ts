import { test } from "node:test";
import assert from "node:assert/strict";
import { listingOrderFor, intentIndexFor, isBalanceable, shuffle, makeRng } from "./rng.ts";
import { VARIANTS } from "./types.ts";

const SUBJECT = "SUBJ-1";
const CONTROLS = ["CTRL-A", "CTRL-B", "CTRL-C"];
const CAT = "instant-coffee";

const orderAt = (t: number, intents = 2) =>
  listingOrderFor(CAT, t, SUBJECT, CONTROLS, "balanced", intents);

const subjectSlot = (t: number, intents = 2) => orderAt(t, intents).indexOf(SUBJECT);

// ---------------------------------------------------------------- structure

test("every trial presents all four SKUs exactly once", () => {
  for (let t = 0; t < 32; t++) {
    const order = orderAt(t);
    assert.equal(order.length, 4);
    assert.deepEqual([...order].sort(), [SUBJECT, ...CONTROLS].sort());
  }
});

// ---------------------------------------------------------------- property 1

test("the subject does not sit in a fixed slot", () => {
  const slots = new Set(Array.from({ length: 8 }, (_, t) => subjectSlot(t)));
  assert.equal(slots.size, 4);
});

// ---------------------------------------------------------------- property 2
// The bug this suite exists for: position balanced across the cell but
// confounded with intent inside it.

test("across a cell of 8, the subject occupies each slot exactly twice", () => {
  const counts = [0, 0, 0, 0];
  for (let t = 0; t < 8; t++) counts[subjectSlot(t)]++;
  assert.deepEqual(counts, [2, 2, 2, 2]);
});

test("position is balanced WITHIN each intent, not merely across the cell", () => {
  const INTENTS = 2;
  for (let intent = 0; intent < INTENTS; intent++) {
    const slots = [];
    for (let t = 0; t < 8; t++) {
      if (intentIndexFor(t, INTENTS) === intent) slots.push(subjectSlot(t));
    }
    // Four trials share this intent, and they must cover all four slots.
    // The old scheme gave intent 0 only slots {0,2} and intent 1 only {1,3},
    // which makes any per-intent read a measure of intent *and* position.
    assert.equal(slots.length, 4);
    assert.deepEqual([...slots].sort(), [0, 1, 2, 3]);
  }
});

test("balance within intent also holds at a larger cell size", () => {
  const INTENTS = 2;
  const TRIALS = 16;
  for (let intent = 0; intent < INTENTS; intent++) {
    const counts = [0, 0, 0, 0];
    for (let t = 0; t < TRIALS; t++) {
      if (intentIndexFor(t, INTENTS) === intent) counts[subjectSlot(t, INTENTS)]++;
    }
    assert.deepEqual(counts, [2, 2, 2, 2]);
  }
});

// ---------------------------------------------------------------- property 3

test("all six variants see an identical order at the same trial index", () => {
  // The seed excludes `variant` on purpose: lift is a difference against
  // control, so an identical arrangement makes position cancel out exactly.
  for (let t = 0; t < 8; t++) {
    const orders = VARIANTS.map(() => orderAt(t));
    for (const o of orders) assert.deepEqual(o, orders[0]);
  }
});

test("order is deterministic across calls", () => {
  for (let t = 0; t < 8; t++) assert.deepEqual(orderAt(t), orderAt(t));
});

test("control ordering is seeded per category, not shared across them", () => {
  // The subject's slot is the same in both (balancing is by trial index), but
  // the 3 controls are shuffled from a category-specific seed. With only 6
  // possible permutations any single index can collide by chance, so the
  // property is that the two categories disagree *somewhere* across a cell.
  let differs = 0;
  for (let t = 0; t < 8; t++) {
    const other = listingOrderFor("green-tea", t, SUBJECT, CONTROLS, "balanced", 2);
    assert.equal(other.indexOf(SUBJECT), subjectSlot(t));
    if (JSON.stringify(other) !== JSON.stringify(orderAt(t))) differs++;
  }
  assert.ok(differs > 0, "green-tea produced an identical control order at every trial index");
});

// ---------------------------------------------------------------- guards

test("isBalanceable requires a whole number of intent x position blocks", () => {
  assert.equal(isBalanceable(8, 2), true);
  assert.equal(isBalanceable(16, 2), true);
  assert.equal(isBalanceable(32, 2), true);
  // The README suggests raising --trials; these are the values that silently
  // skewed the design before the guard existed.
  assert.equal(isBalanceable(10, 2), false);
  assert.equal(isBalanceable(4, 2), false);
  assert.equal(isBalanceable(0, 2), false);
  assert.equal(isBalanceable(12, 3), true);
});

test("pure mode still presents all four SKUs and varies the subject slot", () => {
  const slots = new Set<number>();
  for (let t = 0; t < 40; t++) {
    const order = listingOrderFor(CAT, t, SUBJECT, CONTROLS, "pure", 2);
    assert.deepEqual([...order].sort(), [SUBJECT, ...CONTROLS].sort());
    slots.add(order.indexOf(SUBJECT));
  }
  assert.equal(slots.size, 4);
});

test("shuffle is a permutation and is driven entirely by the rng", () => {
  const items = ["a", "b", "c", "d", "e"];
  const once = shuffle(items, makeRng(12345));
  const again = shuffle(items, makeRng(12345));
  assert.deepEqual(once, again);
  assert.deepEqual([...once].sort(), [...items].sort());
  assert.deepEqual(items, ["a", "b", "c", "d", "e"]); // input not mutated
});
