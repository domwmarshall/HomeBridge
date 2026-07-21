import {
  dateKey,
  householdForDate,
  isHandoverDate,
  nextHandoverDate,
  normalisedHandoverAnchor,
} from "./calendar";
import { CareScheduleRule } from "../types";

function expectEqual<T>(actual: T, expected: T, label: string): void {
  if (actual !== expected) {
    throw new Error(
      `${label}: expected ${String(expected)}, received ${String(actual)}`,
    );
  }
}

const rule: CareScheduleRule = {
  id: "test",
  title: "Alternating Tuesday handover",
  startsOn: "2026-07-27",
  householdLabel: "Mum's house",
  pickupParentLabel: "Mum",
  pickupLocation: "school",
  recurrenceRule: "FREQ=WEEKLY;INTERVAL=1;BYDAY=TU",
};

expectEqual(normalisedHandoverAnchor(rule), "2026-07-28", "Tuesday anchor");
expectEqual(
  isHandoverDate(new Date(2026, 6, 27, 12), [rule]),
  false,
  "Monday is not handover",
);
expectEqual(
  isHandoverDate(new Date(2026, 6, 28, 12), [rule]),
  true,
  "Tuesday is handover",
);
expectEqual(
  householdForDate(new Date(2026, 6, 27, 12), [rule], [], "Dad's house"),
  "Dad's house",
  "Household before first handover",
);
expectEqual(
  householdForDate(new Date(2026, 6, 28, 12), [rule], [], "Dad's house"),
  "Mum's house",
  "Household on first handover",
);
expectEqual(
  dateKey(nextHandoverDate(new Date(2026, 9, 26, 23, 30), [rule])!),
  "2026-10-27",
  "Next handover around BST end",
);
expectEqual(
  isHandoverDate(new Date(2026, 9, 27, 12), [rule]),
  true,
  "BST Tuesday handover",
);
expectEqual(
  isHandoverDate(new Date(2026, 10, 3, 12), [rule]),
  true,
  "GMT Tuesday handover",
);

console.log("HomeBridge UK date engine checks passed.");
