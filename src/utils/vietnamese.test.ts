import { describe, expect, test } from "vitest";
import {
  containsVietnameseCharacters,
  getVietnameseDisplayText,
  parseVietnameseDisplayMode,
  stripVietnameseDiacritics,
} from "./vietnamese";

describe("Vietnamese text utilities", () => {
  test("strips Vietnamese diacritics from lowercase text", () => {
    expect(stripVietnameseDiacritics("Tôi đang đi làm")).toBe("Toi dang di lam");
    expect(stripVietnameseDiacritics("đường phố")).toBe("duong pho");
  });

  test("strips Vietnamese diacritics from uppercase text", () => {
    expect(stripVietnameseDiacritics("ĐẶNG THỊ HƯƠNG")).toBe("DANG THI HUONG");
  });

  test("keeps English and normal Latin text unchanged", () => {
    expect(getVietnameseDisplayText("I am going to work")).toBe("I am going to work");
    expect(getVietnameseDisplayText("Cafe meeting at 10")).toBe("Cafe meeting at 10");
  });

  test("detects Vietnamese characters", () => {
    expect(containsVietnameseCharacters("Tôi đang đi làm")).toBe(true);
    expect(containsVietnameseCharacters("I am going to work")).toBe(false);
  });

  test("honors display mode", () => {
    expect(getVietnameseDisplayText("Tôi đang đi làm", "ascii")).toBe("Toi dang di lam");
    expect(getVietnameseDisplayText("Tôi đang đi làm", "original")).toBe("Tôi đang đi làm");
  });

  test("defaults invalid display mode values to ascii", () => {
    expect(parseVietnameseDisplayMode(undefined)).toBe("ascii");
    expect(parseVietnameseDisplayMode("ascii")).toBe("ascii");
    expect(parseVietnameseDisplayMode("anything-else")).toBe("ascii");
    expect(parseVietnameseDisplayMode("original")).toBe("original");
  });
});
