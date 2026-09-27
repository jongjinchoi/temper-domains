import { expect, test } from "bun:test";
import { buildSuggestions, parseAffixes } from "./suggestions.ts";

test("suggestions share a stable deduplicated order across groups and casing", () => {
  const result = buildSuggestions('a', ['a', 'A'], ['a', 'z']);
  expect(result).toEqual({ base: ['a'], prefix: ['aa'], suffix: ['az'], names: ['a', 'aa', 'az'] });
  expect(buildSuggestions('acme').names).toEqual(['acme', 'getacme', 'useacme', 'tryacme', 'myacme', 'goacme', 'joinacme', 'acmeapp', 'acmelabs', 'acmehq', 'acmely', 'acmedev', 'acmehub', 'acmerun', 'acmekit']);
});
test("combined labels accept valid hyphens, numeric and IDN names", () => {
  expect(buildSuggestions('123', ['get-'], ['-app']).names).toEqual(['123', 'get-123', '123-app']);
  expect(buildSuggestions('bücher', [], ['app']).names).toEqual(['bücher', 'bücherapp']);
  expect(buildSuggestions('x'.repeat(60), ['get'], []).names).toHaveLength(2);
  expect(() => buildSuggestions('x'.repeat(61), ['get'], [])).toThrow(/Invalid suggestion/);
  expect(() => buildSuggestions('a', ['bad/'], [])).toThrow(/Invalid suggestion/);
});
test("empty CSV fields cannot create base duplicates", () => {
  expect(parseAffixes(' get , use ')).toEqual(['get', 'use']);
  for (const value of ['', ' ', ',get', 'get,', 'get,,use']) expect(() => parseAffixes(value)).toThrow(/Empty affix/);
  expect(() => buildSuggestions('a', [''], [])).toThrow(/Empty affix/);
});
