import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { IndicatorPicker } from "./IndicatorPicker";
import { INDICATORS, MAX_INDICATORS_REASON } from "./indicators";

function renderPicker(value = ["sma"]) {
  const onChange = vi.fn();
  render(<IndicatorPicker value={value} onChange={onChange} />);
  return onChange;
}

function StatefulPicker({ initial = ["sma"] }: { initial?: string[] }) {
  const [value, setValue] = useState(initial);
  return <IndicatorPicker value={value} onChange={setValue} />;
}

describe("IndicatorPicker", () => {
  it("lists every indicator when opened and filters by typed text", () => {
    renderPicker();
    const box = screen.getByRole("combobox", { name: "Indicator" });
    expect(screen.getByText("SMA (20)")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "SMA 20" })).not.toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "None" })).not.toBeInTheDocument();

    fireEvent.click(box);
    expect(screen.getByRole("listbox", { name: "Indicators" })).toBeInTheDocument();
    expect(screen.getAllByRole("option").map((option) => option.textContent)).toEqual(INDICATORS.map((item) => item.label));

    fireEvent.change(screen.getByRole("combobox", { name: "Indicator" }), { target: { value: "rsi" } });
    expect(screen.getAllByRole("option").map((option) => option.textContent)).toEqual(["RSI (14)"]);

    fireEvent.change(screen.getByRole("combobox", { name: "Indicator" }), { target: { value: "" } });
    expect(screen.getAllByRole("option")).toHaveLength(INDICATORS.length);
  });

  it("keeps the menu open and checks more than one indicator", () => {
    render(<StatefulPicker />);
    fireEvent.click(screen.getByRole("combobox", { name: "Indicator" }));
    fireEvent.click(screen.getByRole("option", { name: "EMA (20)" }));
    expect(screen.getByRole("listbox")).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "SMA (20)" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("option", { name: "EMA (20)" })).toHaveAttribute("aria-selected", "true");

    fireEvent.keyDown(screen.getByRole("combobox", { name: "Indicator" }), { key: "Escape" });
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(screen.getByText("SMA (20)")).toBeInTheDocument();
    expect(screen.getByText("EMA (20)")).toBeInTheDocument();
  });

  it("moves with arrows, toggles with Enter, and closes on Escape or an outside click", () => {
    const onChange = renderPicker();
    const box = screen.getByRole("combobox", { name: "Indicator" });

    fireEvent.keyDown(box, { key: "r" });
    fireEvent.change(screen.getByRole("combobox", { name: "Indicator" }), { target: { value: "rsi" } });
    fireEvent.keyDown(screen.getByRole("combobox", { name: "Indicator" }), { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith(["sma", "rsi"]);
    expect(screen.getByRole("listbox")).toBeInTheDocument();

    fireEvent.keyDown(screen.getByRole("combobox", { name: "Indicator" }), { key: "Escape" });
    fireEvent.click(screen.getByRole("combobox", { name: "Indicator" }));
    fireEvent.keyDown(screen.getByRole("combobox", { name: "Indicator" }), { key: "ArrowDown" });
    fireEvent.keyDown(screen.getByRole("combobox", { name: "Indicator" }), { key: "Enter" });
    expect(onChange).toHaveBeenLastCalledWith(["sma", "ema"]);
    expect(screen.getByRole("listbox")).toBeInTheDocument();

    fireEvent.keyDown(screen.getByRole("combobox", { name: "Indicator" }), { key: "Escape" });
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(onChange).toHaveBeenCalledTimes(2);

    fireEvent.click(screen.getByRole("combobox", { name: "Indicator" }));
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("refuses a sixth indicator and frees a slot when one is unchecked", () => {
    const five = ["sma", "ema", "bollinger", "volume_ma", "rsi"];
    const onChange = renderPicker(five);
    fireEvent.click(screen.getByRole("combobox", { name: "Indicator" }));
    expect(screen.getAllByText(MAX_INDICATORS_REASON).length).toBeGreaterThan(0);
    fireEvent.change(screen.getByRole("combobox", { name: "Indicator" }), { target: { value: "macd" } });
    const blocked = screen.getByRole("option", { name: /MACD \(12, 26, 9\)/ });
    expect(blocked).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(blocked);
    fireEvent.keyDown(screen.getByRole("combobox", { name: "Indicator" }), { key: "Enter" });
    expect(onChange).not.toHaveBeenCalled();

    fireEvent.change(screen.getByRole("combobox", { name: "Indicator" }), { target: { value: "" } });
    fireEvent.click(screen.getByRole("option", { name: "SMA (20)" }));
    expect(onChange).toHaveBeenCalledWith(["ema", "bollinger", "volume_ma", "rsi"]);
    expect(screen.getByRole("listbox")).toBeInTheDocument();
  });
});
