import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  fillableCount,
  growthThreshold,
  nextFrameSizeAfterDrawing,
} from "./canvas";

describe("growthThreshold", () => {
  it("is half of fillable cells (ceil)", () => {
    assert.equal(fillableCount(5), 24);
    assert.equal(growthThreshold(5), 12);
    assert.equal(fillableCount(7), 48);
    assert.equal(growthThreshold(7), 24);
    assert.equal(fillableCount(9), 80);
    assert.equal(growthThreshold(9), 40);
    assert.equal(fillableCount(11), 120);
    assert.equal(growthThreshold(11), 60);
  });
});

describe("nextFrameSizeAfterDrawing", () => {
  it("does not grow one below the 5→7 threshold", () => {
    assert.equal(nextFrameSizeAfterDrawing(5, 11), 5);
  });

  it("grows 5→7 at exactly 12", () => {
    assert.equal(nextFrameSizeAfterDrawing(5, 12), 7);
  });

  it("does not grow one below the 7→9 threshold", () => {
    assert.equal(nextFrameSizeAfterDrawing(7, 23), 7);
  });

  it("grows 7→9 at exactly 24", () => {
    assert.equal(nextFrameSizeAfterDrawing(7, 24), 9);
  });

  it("does not grow one below the 9→11 threshold", () => {
    assert.equal(nextFrameSizeAfterDrawing(9, 39), 9);
  });

  it("grows 9→11 at exactly 40", () => {
    assert.equal(nextFrameSizeAfterDrawing(9, 40), 11);
  });

  it("grows at most one step even when count far exceeds the threshold", () => {
    // Regression: the old while-loop cascaded 5→15 from a large count.
    assert.equal(nextFrameSizeAfterDrawing(5, 100), 7);
    assert.equal(nextFrameSizeAfterDrawing(7, 100), 9);
    assert.equal(nextFrameSizeAfterDrawing(9, 100), 11);
  });
});
