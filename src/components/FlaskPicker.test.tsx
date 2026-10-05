import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { FlaskPicker } from "./FlaskPicker";
import { FLASK_SHAPES } from "../lib/flasks/icon";
import { CATEGORY_COLORS } from "../lib/categories/palette";

describe("FlaskPicker", () => {
  it("offers shape, colour, vibrancy and shine as radiogroups", () => {
    render(<FlaskPicker icon={{ shape: "vial", color: "green" }} onChange={() => {}} />);
    expect(screen.getByRole("radiogroup", { name: "Shape" })).toBeInTheDocument();
    expect(screen.getByRole("radiogroup", { name: "Colour" })).toBeInTheDocument();
    expect(screen.getByRole("radiogroup", { name: "Vibrancy" })).toBeInTheDocument();
    expect(screen.getByRole("radiogroup", { name: "Shine" })).toBeInTheDocument();
    // radios = shapes + colours + 5 vibrancy steps + 5 shine steps.
    expect(screen.getAllByRole("radio")).toHaveLength(
      FLASK_SHAPES.length + CATEGORY_COLORS.length + 5 + 5,
    );
  });

  it("commits vibrancy and shine while keeping shape + colour", () => {
    const onChange = vi.fn();
    render(<FlaskPicker icon={{ shape: "vial", color: "green" }} onChange={onChange} />);
    fireEvent.click(screen.getByRole("radio", { name: "Vibrancy 5 of 5" }));
    expect(onChange).toHaveBeenCalledWith({ shape: "vial", color: "green", vibrancy: 1 });
    fireEvent.click(screen.getByRole("radio", { name: "Shine 1 of 5" }));
    expect(onChange).toHaveBeenCalledWith({ shape: "vial", color: "green", shine: 0 });
  });

  it("marks the current shape and colour as checked", () => {
    render(<FlaskPicker icon={{ shape: "beaker", color: "purple" }} onChange={() => {}} />);
    expect(screen.getByRole("radio", { name: "Beaker" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "purple" })).toBeChecked();
  });

  it("keeps the colour when a new shape is picked", () => {
    const onChange = vi.fn();
    render(<FlaskPicker icon={{ shape: "vial", color: "green" }} onChange={onChange} />);
    fireEvent.click(screen.getByRole("radio", { name: "Conical flask" }));
    expect(onChange).toHaveBeenCalledWith({ shape: "erlenmeyer", color: "green" });
  });

  it("keeps the shape when a new colour is picked", () => {
    const onChange = vi.fn();
    render(<FlaskPicker icon={{ shape: "vial", color: "green" }} onChange={onChange} />);
    fireEvent.click(screen.getByRole("radio", { name: "red" }));
    expect(onChange).toHaveBeenCalledWith({ shape: "vial", color: "red" });
  });

  it("falls back to the default icon when none is set", () => {
    render(<FlaskPicker onChange={() => {}} />);
    // DEFAULT_ICON = vial / gray
    expect(screen.getByRole("radio", { name: "Vial" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "gray" })).toBeChecked();
  });
});
