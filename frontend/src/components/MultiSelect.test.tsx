import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MultiSelect } from "./MultiSelect";

const options = [
  { id: "double_bottom", label: "Double bottom" },
  { id: "double_top", label: "Double top" },
];

describe("MultiSelect", () => {
  it("selects and removes options", () => {
    const onChange = vi.fn();
    const { rerender } = render(<MultiSelect label="Patterns" placeholder="Patterns" options={options} value={[]} onChange={onChange} />);

    fireEvent.click(screen.getByRole("combobox", { name: "Patterns" }));
    fireEvent.click(screen.getByRole("option", { name: "Double bottom" }));
    expect(onChange).toHaveBeenCalledWith(["double_bottom"]);

    fireEvent.keyDown(screen.getByRole("combobox", { name: "Patterns" }), { key: "Escape" });
    rerender(<MultiSelect label="Patterns" placeholder="Patterns" options={options} value={["double_bottom"]} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Remove Double bottom" }));
    expect(onChange).toHaveBeenCalledWith([]);
  });
});
