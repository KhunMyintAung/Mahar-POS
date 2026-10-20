import { describe, expect, it } from "vitest";
import { splitBrandModel } from "@/lib/deviceName";

describe("brand and model from one box", () => {
  it("moves the model out of the brand box", () => {
    expect(splitBrandModel("iPhone 13 Pro Max")).toEqual({ brand: "iPhone", model: "13 Pro Max" });
    expect(splitBrandModel("Redmi Note 13")).toEqual({ brand: "Redmi", model: "Note 13" });
    expect(splitBrandModel("samsung Galaxy A15")).toEqual({ brand: "Samsung", model: "Galaxy A15" });
  });

  it("splits as soon as the model starts, so typing can carry on in the model box", () => {
    expect(splitBrandModel("iPhone 1")).toEqual({ brand: "iPhone", model: "1" });
    expect(splitBrandModel("iPhone ")).toBeNull();
    expect(splitBrandModel("iPhone")).toBeNull();
  });

  it("leaves brands it does not know alone", () => {
    expect(splitBrandModel("Unknown Phone X")).toBeNull();
  });

  it("knows the shop's own brands, longest first", () => {
    expect(splitBrandModel("Google Pixel 8", ["Google Pixel"])).toEqual({ brand: "Google Pixel", model: "8" });
    expect(splitBrandModel("Mahar M1 Pro", ["Mahar"])).toEqual({ brand: "Mahar", model: "M1 Pro" });
  });
});
