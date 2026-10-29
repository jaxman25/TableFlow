import { describe, expect, it } from "vitest";
import { availableTransitions } from "@/lib/orders/transitions";

describe("order transition matrix", () => {
  it("shows wait staff how to accept or reject a new order", () => {
    const transitions = availableTransitions("pending", "wait_staff");
    expect(transitions.map((transition) => transition.to).sort()).toEqual(["accepted", "cancelled"]);
    expect(transitions.find((transition) => transition.to === "cancelled")?.needsReason).toBe(true);
  });

  it("does not let the kitchen accept a new order", () => {
    expect(availableTransitions("pending", "kitchen")).toEqual([]);
  });

  it("lets the kitchen move accepted work into preparation and then ready", () => {
    expect(availableTransitions("accepted", "kitchen").map((t) => t.to)).toEqual(["preparing"]);
    expect(availableTransitions("preparing", "kitchen").map((t) => t.to)).toEqual(["ready"]);
    expect(availableTransitions("ready", "kitchen").map((t) => t.to)).toEqual([]);
  });

  it("does not let wait staff cancel an order already in preparation", () => {
    expect(availableTransitions("preparing", "wait_staff").map((t) => t.to)).toEqual(["ready"]);
  });

  it("lets managers cancel right up to ready, but not after serving", () => {
    expect(availableTransitions("accepted", "manager").map((t) => t.to)).toContain("cancelled");
    expect(availableTransitions("ready", "manager").map((t) => t.to)).toContain("cancelled");
    expect(availableTransitions("served", "manager").map((t) => t.to)).not.toContain("cancelled");
  });

  it("has no actions for closed orders or cashier accounts", () => {
    expect(availableTransitions("completed", "owner")).toEqual([]);
    expect(availableTransitions("cancelled", "owner")).toEqual([]);
    expect(availableTransitions("pending", "cashier")).toEqual([]);
  });
});
