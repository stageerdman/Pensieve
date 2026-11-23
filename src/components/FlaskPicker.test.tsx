import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { FlaskPicker } from "./FlaskPicker";
import { FlaskButton } from "./FlaskButton";
import { FLASK_SHAPES, SHAPE_LABELS } from "../lib/flasks/icon";

describe("FlaskPicker", () => {
  it("offers shape, vibrancy and shine radiogroups plus a colour spectrum", () => {
    render(<FlaskPicker icon={{ shape: "vial", color: "green" }} onChange={() => {}} />);
    expect(screen.getByRole("radiogroup", { name: "Shape" })).toBeInTheDocument();
    expect(screen.getByRole("radiogroup", { name: "Vibrancy" })).toBeInTheDocument();
    expect(screen.getByRole("radiogroup", { name: "Shine" })).toBeInTheDocument();
    // Colour is now a draggable spectrum slider, not a set of swatches.
    expect(screen.getByRole("slider", { name: "Colour" })).toBeInTheDocument();
    // radios = shapes + 5 vibrancy steps + 5 shine steps (no colour swatches now).
    expect(screen.getAllByRole("radio")).toHaveLength(FLASK_SHAPES.length + 5 + 5);
  });

  it("commits vibrancy and shine while keeping shape + colour", () => {
    const onChange = vi.fn();
    render(<FlaskPicker icon={{ shape: "vial", color: "green" }} onChange={onChange} />);
    fireEvent.click(screen.getByRole("radio", { name: "Vibrancy 5 of 5" }));
    expect(onChange).toHaveBeenCalledWith({ shape: "vial", color: "green", vibrancy: 1 });
    fireEvent.click(screen.getByRole("radio", { name: "Shine 1 of 5" }));
    expect(onChange).toHaveBeenCalledWith({ shape: "vial", color: "green", shine: 0 });
  });

  it("marks the current shape as checked", () => {
    render(<FlaskPicker icon={{ shape: "beaker", color: "purple" }} onChange={() => {}} />);
    expect(screen.getByRole("radio", { name: "Beaker" })).toBeChecked();
  });

  it("seeds the spectrum from the current colour (a legacy key maps to its hue)", () => {
    render(<FlaskPicker icon={{ shape: "vial", color: "blue" }} onChange={() => {}} />);
    // blue → ~212° (see KEY_HUE in palette).
    expect(screen.getByRole("slider", { name: "Colour" })).toHaveAttribute("aria-valuenow", "212");
  });

  it("picks a hue from the spectrum with the keyboard, keeping the shape", () => {
    const onChange = vi.fn();
    render(<FlaskPicker icon={{ shape: "vial", color: 100 }} onChange={onChange} />);
    const slider = screen.getByRole("slider", { name: "Colour" });
    fireEvent.keyDown(slider, { key: "ArrowRight" });
    expect(onChange).toHaveBeenCalledWith({ shape: "vial", color: 103 }); // +3°
  });

  it("keeps the colour when a new shape is picked", () => {
    const onChange = vi.fn();
    render(<FlaskPicker icon={{ shape: "vial", color: 100 }} onChange={onChange} />);
    fireEvent.click(screen.getByRole("radio", { name: "Conical flask" }));
    expect(onChange).toHaveBeenCalledWith({ shape: "erlenmeyer", color: 100 });
  });

  // Regression: a form's picker had no Shape row, so the owner couldn't pick a flask shape
  // for a form (2026-11-23).
  it("a form offers the form flask plus every memory shape, and saves the one picked", () => {
    const onChange = vi.fn();
    render(<FlaskPicker form onChange={onChange} />);
    const shapes = within(screen.getByRole("radiogroup", { name: "Shape" })).getAllByRole("radio");
    expect(shapes.map((r) => r.getAttribute("aria-label"))).toEqual(["Form flask", ...FLASK_SHAPES.map((s) => SHAPE_LABELS[s])]);
    expect(screen.getByRole("radio", { name: "Form flask" })).toBeChecked(); // no icon yet → the purple form flask
    expect(screen.getByRole("slider", { name: "Colour" })).toHaveAttribute("aria-valuenow", "270");
    fireEvent.click(screen.getByRole("radio", { name: "Round-bottom flask" }));
    expect(onChange).toHaveBeenCalledWith({ shape: "round-bottom", color: "purple" });
  });

  it("a form shows its chosen shape as checked; a memory never offers the form flask", () => {
    const { unmount } = render(<FlaskPicker form icon={{ shape: "teardrop", color: 137 }} onChange={() => {}} />);
    expect(screen.getByRole("radio", { name: "Teardrop vial" })).toBeChecked();
    unmount();
    render(<FlaskPicker icon={{ shape: "vial", color: 137 }} onChange={() => {}} />);
    expect(screen.queryByRole("radio", { name: "Form flask" })).toBeNull();
  });

  it("the header button names shape and colour with a comma and space", () => {
    render(<FlaskButton icon={{ shape: "vial", color: "gray" }} onChange={() => {}} />);
    expect(screen.getByRole("button", { name: /^Flask — Vial, / })).toBeInTheDocument();
  });

  it("falls back to the default icon when none is set", () => {
    render(<FlaskPicker onChange={() => {}} />);
    // DEFAULT_ICON = vial / gray
    expect(screen.getByRole("radio", { name: "Vial" })).toBeChecked();
  });
});
