import { expect } from "chai";
import { asArray } from "./util.ts";

describe("lib/util => asArray", () => {
  it("returns an array unchanged", () => {
    const input = [1, 2, 3];
    expect(asArray(input)).to.equal(input);
  });

  it("wraps a non-array value in an array", () => {
    expect(asArray("x")).to.deep.equal(["x"]);
    expect(asArray({ id: 1 })).to.deep.equal([{ id: 1 }]);
  });
});
