import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ChangeCell, PriceCell } from "./design-system";

describe("ChangeCell", () => {
  it("positive uses up class", () => {
    const { container } = render(<ChangeCell value={1.2} />);
    expect(container.firstChild).toHaveClass("up");
  });
  it("negative uses down class", () => {
    const { container } = render(<ChangeCell value={-1.2} />);
    expect(container.firstChild).toHaveClass("down");
  });
});

describe("PriceCell", () => {
  it("formats integer dong with separators", () => {
    const { container } = render(<PriceCell value={91000} />);
    expect(container.textContent?.replace(/\s/g, "")).toMatch(/91.?000/);
  });
});
