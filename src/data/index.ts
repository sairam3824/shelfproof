import type { CategoryDefinition } from "../lib/types.ts";
import { instantCoffee } from "./categories/instant-coffee.ts";
import { greenTea } from "./categories/green-tea.ts";
import { handWash } from "./categories/hand-wash.ts";
import { biscuits } from "./categories/biscuits.ts";
import { shampoo } from "./categories/shampoo.ts";

export const CATEGORIES: CategoryDefinition[] = [
  instantCoffee,
  greenTea,
  handWash,
  biscuits,
  shampoo,
];

export { instantCoffee, greenTea, handWash, biscuits, shampoo };
