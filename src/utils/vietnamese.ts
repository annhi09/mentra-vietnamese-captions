export type VietnameseDisplayMode = "ascii" | "original";

const VIETNAMESE_CHAR_GROUPS = [
  ["àáảãạăắằẳẵặâấầẩẫậ", "a"],
  ["èéẻẽẹêềếểễệ", "e"],
  ["ìíỉĩị", "i"],
  ["òóỏõọôồốổỗộơờớởỡợ", "o"],
  ["ùúủũụưừứửữự", "u"],
  ["ỳýỷỹỵ", "y"],
  ["đ", "d"],
] as const;

const VIETNAMESE_CHAR_MAP = Object.fromEntries(
  VIETNAMESE_CHAR_GROUPS.flatMap(([chars, asciiChar]) =>
    Array.from(chars, (vietnameseChar) => [vietnameseChar, asciiChar]),
  ),
) as Record<string, string>;

const UPPERCASE_VIETNAMESE_CHAR_MAP = Object.fromEntries(
  Object.entries(VIETNAMESE_CHAR_MAP).map(([vietnameseChar, asciiChar]) => [
    vietnameseChar.toUpperCase(),
    asciiChar.toUpperCase(),
  ]),
) as Record<string, string>;

const ALL_VIETNAMESE_CHAR_MAP = {
  ...VIETNAMESE_CHAR_MAP,
  ...UPPERCASE_VIETNAMESE_CHAR_MAP,
};

const VIETNAMESE_CHARACTER_PATTERN = new RegExp(
  `[${Object.keys(ALL_VIETNAMESE_CHAR_MAP).join("")}]`,
);

export function containsVietnameseCharacters(text: string): boolean {
  return VIETNAMESE_CHARACTER_PATTERN.test(text);
}

export function stripVietnameseDiacritics(text: string): string {
  return Array.from(text, (char) => ALL_VIETNAMESE_CHAR_MAP[char] ?? char).join("");
}

export function getVietnameseDisplayText(
  text: string,
  mode: VietnameseDisplayMode = "ascii",
): string {
  if (mode === "original") {
    return text;
  }

  return containsVietnameseCharacters(text) ? stripVietnameseDiacritics(text) : text;
}

export function parseVietnameseDisplayMode(value: string | undefined): VietnameseDisplayMode {
  return value === "original" ? "original" : "ascii";
}
