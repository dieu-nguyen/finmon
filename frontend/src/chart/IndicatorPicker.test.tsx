import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { IndicatorPicker } from "./IndicatorPicker";
import { INDICATORS } from "./indicators";

function renderPicker(value = "sma") {
  const onChange = vi.fn();
  render(<IndicatorPicker value={value} onChange={onChange} />);
  return onChange;
}

describe("IndicatorPicker", () => {
  it("lists every indicator when opened and filters by typed text", () => {
    renderPicker();
    const box = screen.getByRole("combobox", { name: "Indicator" });
    expect(box).toHaveValue("SMA (20)");
    expect(screen.queryByRole("button", { name: "SMA 20" })).not.toBeInTheDocument();

    fireEvent.click(box);
    expect(screen.getByRole("listbox", { name: "Indicators" })).toBeInTheDocument();
    expect(screen.getAllByRole("option").map((option) => option.textContent)).toEqual(INDICATORS.map((item) => item.label));

    fireEvent.change(box, { target: { value: "rsi" } });
    expect(screen.getAllByRole("option").map((option) => option.textContent)).toEqual(["RSI (14)"]);

    fireEvent.change(box, { target: { value: "" } });
    expect(screen.getAllByRole("option")).toHaveLength(INDICATORS.length);
  });

  it("moves with arrows, selects with Enter, and closes on Escape or an outside click", () => {
    const onChange = renderPicker();
    const box = screen.getByRole("combobox", { name: "Indicator" });

    fireEvent.keyDown(box, { key: "r" });
    fireEvent.change(box, { target: { value: "rsi" } });
    fireEvent.keyDown(box, { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith("rsi");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();

    fireEvent.click(box);
    fireEvent.keyDown(box, { key: "ArrowDown" });
    fireEvent.keyDown(box, { key: "Enter" });
    expect(onChange).toHaveBeenLastCalledWith("ema");

    fireEvent.click(box);
    fireEvent.keyDown(box, { key: "Escape" });
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(onChange).toHaveBeenCalledTimes(2);

    fireEvent.click(box);
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("offers None so the indicator can be hidden", () => {
    const onChange = renderPicker();
    fireEvent.click(screen.getByRole("combobox", { name: "Indicator" }));
    fireEvent.click(screen.getByRole("option", { name: "None" }));
    expect(onChange).toHaveBeenCalledWith("none");
  });
});
