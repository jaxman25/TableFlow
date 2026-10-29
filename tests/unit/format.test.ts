import { describe, expect, it } from "vitest";
import { formatMoney } from "@/lib/format";

describe("formatMoney", () => {
  it("renders whole shillings without decimals", () => {
    expect(formatMoney(95000)).toBe("KSh 950");
    expect(formatMoney(0)).toBe("KSh 0");
  });

  it("renders cents when present", () => {
    expect(formatMoney(25550)).toBe("KSh 255.50");
  });

  it("handles missing amounts (kitchen views)", () => {
    expect(formatMoney(null)).toBe("—");
  });

  it("respects non-KES currencies", () => {
    expect(formatMoney(1000, "USD")).toBe("USD 10");
  });
});
