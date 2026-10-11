import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Gallery } from "./Gallery";

describe("Gallery", () => {
  it("renders the design-system primitives used across the app", () => {
    render(<Gallery />);
    expect(screen.getByRole("heading", { name: "Gallery" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save note" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Pin to watchlist" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete" })).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Search")).toBeInTheDocument();
    expect(screen.getByText("VCB")).toBeInTheDocument();
    expect(screen.getByText("HPG")).toBeInTheDocument();
    expect(screen.getByText("as of 2026-09-08 15:00 ICT")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Two" }));
    expect(screen.getByRole("button", { name: "Two" })).toHaveStyle({ fontWeight: "600" });
  });
});
