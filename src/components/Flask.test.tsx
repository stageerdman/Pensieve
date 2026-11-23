import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { Flask, FlaskFor } from "./Flask";
import { DEFAULT_ICON } from "../lib/flasks/icon";

// The body path that the liquid is clipped to identifies the shape; the liquid
// gradient's stop colour identifies the palette colour. We assert on those so a
// default drift (row vs header showing different flasks) can't recur.
const bodyPath = (c: HTMLElement) =>
  c.querySelector("clipPath path")?.getAttribute("d") ?? "";
const liquidColorToken = (c: HTMLElement) =>
  c.querySelector("linearGradient stop")?.getAttribute("stop-color") ?? "";

describe("Flask / FlaskFor defaults", () => {
  it("FlaskFor with no icon renders DEFAULT_ICON (vial, gray)", () => {
    const { container } = render(<FlaskFor />);
    expect(DEFAULT_ICON).toEqual({ shape: "vial", color: "gray" });
    // vial body path starts "M8 3"; gray liquid uses the gray palette token.
    expect(bodyPath(container)).toMatch(/^M8 3/);
    expect(liquidColorToken(container)).toContain("--cat-gray-fg");
  });

  it("a bare Flask with no props matches FlaskFor's default (no drift)", () => {
    const a = render(<Flask />);
    const b = render(<FlaskFor />);
    expect(bodyPath(a.container)).toBe(bodyPath(b.container));
    expect(liquidColorToken(a.container)).toBe(liquidColorToken(b.container));
  });

  it("renders the requested shape + colour when given", () => {
    const { container } = render(<Flask shape="beaker" color="red" />);
    expect(bodyPath(container)).toMatch(/^M5 7/); // beaker body
    expect(liquidColorToken(container)).toContain("--cat-red-fg");
  });
});

describe("FlaskFor form", () => {
  it("draws the form flask, purple when no colour is chosen", () => {
    const { container } = render(<FlaskFor form />);
    const plain = render(<FlaskFor />);
    expect(bodyPath(container)).not.toBe(bodyPath(plain.container));
    expect(liquidColorToken(container)).toContain("--cat-purple-fg");
  });

  // Regression (2026-11-23): a form ignored its stored shape, so a picked shape never showed.
  it("draws the form's chosen shape and colour", () => {
    const asForm = render(<FlaskFor form icon={{ shape: "beaker", color: "green" }} />);
    const beaker = render(<Flask shape="beaker" color="green" />);
    expect(liquidColorToken(asForm.container)).toContain("--cat-green-fg");
    expect(bodyPath(asForm.container)).toBe(bodyPath(beaker.container));
  });

  it("a memory with a stored form-flask shape draws the default memory shape", () => {
    const memory = render(<FlaskFor icon={{ shape: "form", color: "green" }} />);
    const vial = render(<Flask shape="vial" color="green" />);
    expect(bodyPath(memory.container)).toBe(bodyPath(vial.container));
  });
});
