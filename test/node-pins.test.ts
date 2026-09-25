import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// jsdom 30.1.1 declares Node ^22.22.2 || ^24.15.0 || >=26.0.0.
const JSDOM_NODE_24_FLOOR = [24, 15, 0];

const root = join(__dirname, '..');
const read = (file: string) => readFileSync(join(root, file), 'utf8');

function parse(version: string): number[] {
  return version.split('.').map(Number);
}

function compare(a: number[], b: number[]): number {
  for (let i = 0; i < 3; i += 1) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

describe('Node version pins', () => {
  const pinned = read('.node-version').trim();
  const pkg = JSON.parse(read('package.json')) as { engines: { node: string } };
  const floor = /^>=(\d+\.\d+\.\d+)$/.exec(pkg.engines.node)?.[1];

  it('pins the Dockerfile base image to .node-version', () => {
    const tags = [...read('Dockerfile').matchAll(/^FROM node:(\S+?)-alpine\b/gm)].map((m) => m[1]);
    expect(tags.length).toBeGreaterThan(0);
    for (const tag of tags) expect(tag).toBe(pinned);
  });

  it('keeps .node-version at or above the engines floor', () => {
    expect(floor).toBeDefined();
    expect(compare(parse(pinned), parse(floor ?? ''))).toBeGreaterThanOrEqual(0);
  });

  it("keeps the engines floor at or above jsdom's Node 24 minimum", () => {
    expect(compare(parse(floor ?? ''), JSDOM_NODE_24_FLOOR)).toBeGreaterThanOrEqual(0);
  });
});
