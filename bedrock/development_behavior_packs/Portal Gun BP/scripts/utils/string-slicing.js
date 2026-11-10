/**
 * This function abjusts text so that its Unicode length is equal to the specified value, so that it can then be used in JsonUI.
 * Why you can't just use .slice() and .padEnd() -> https://wiki.bedrock.dev/json-ui/json-ui-intro#unicode-character-width
 * @param {String} text
 * @param {Number} maxLineLength
 */
export function abjustTextLength(text, maxLineLength) {
  text = String(text ?? "");
  maxLineLength = Number(maxLineLength) || 0;

  let unicodeSize = getUnicodeSize(text);

  while (unicodeSize > maxLineLength && text.length > 0) {
    const lastChar = text.at(-1);
    if (!lastChar) break;

    unicodeSize -= getUnicodeSize(lastChar);
    text = text.slice(0, -1);
  }

  const pad = Math.max(0, maxLineLength - unicodeSize);
  return text + "\t".repeat(pad);
}

/**
  This function converts a character to its Unicode code point in hexadecimal, then splits it into an array of numbers representing each hexadecimal digit.
  * @param {String} char
  * @returns {Number[]}
 */
function toUnicode(char) {
  return char
    .slice(0, 1)
    .charCodeAt(0)
    .toString(16)
    .padStart(4, "0")
    .split("")
    .map(convertFrom16XNumber);
}

/** 
 * This function converts a hexadecimal string to a number. If the string is not a valid hexadecimal digit, it returns the corresponding value for 'a' to 'f'.
 * @param {String} str 
 * @returns {Number} 
*/
function convertFrom16XNumber(str) {
  return Number(str) || { 0: 0, a: 10, b: 11, c: 12, d: 13, e: 14, f: 15 }[str];
}


/**
 * This function calculates the Unicode size of a string, which is the total number of bytes needed to represent the string in UTF-8 encoding. It iterates through each character in the string, converts it to its Unicode code point, and determines how many bytes are needed based on the value of the code point.
 * @param {String} text
 * @returns {Number}
 */
function getUnicodeSize(text) {
  if (text == null) return 0; // evita undefined/null
  text = String(text);

  let totalSize = 0;
  for (let char of text.split("")) {
    const code = toUnicode(char);
    if (code[2] < 8 && code[0] == 0 && code[1] == 0) totalSize += 1;
    else if (code[1] < 8 && code[0] == 0) totalSize += 2;
    else totalSize += 3;
  }
  return totalSize;
}

export function formatDimensionName(dimensionId) {
  const name = String(dimensionId ?? "").split(":").pop();
  return name
    .replace(/([a-z])([A-Z0-9])/g, "$1 $2")
    .replace(/([0-9])([A-Za-z])/g, "$1 $2")
    .split(/[\s_.]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}
