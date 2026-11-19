import { describe, expect, it } from "vitest";
import { appleMobileDevice } from "./appleDevice";

const IPHONE_CHROME =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 27_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/150.0.0.0 Mobile/15E148 Safari/604.1";
const IPAD_OLD = "Mozilla/5.0 (iPad; CPU OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148";
const MAC_SAFARI =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/27.0 Safari/605.1.15";
const ANDROID_CHROME =
  "Mozilla/5.0 (Linux; Android 16; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Mobile Safari/537.36";

describe("appleMobileDevice", () => {
  it("knows an iPhone, whichever browser it is", () => {
    expect(appleMobileDevice(IPHONE_CHROME, 5)).toBe("iPhone");
  });

  it("knows an iPad, including iPadOS reporting itself as a Mac with a touch screen", () => {
    expect(appleMobileDevice(IPAD_OLD, 5)).toBe("iPad");
    expect(appleMobileDevice(MAC_SAFARI, 5)).toBe("iPad");
  });

  it("leaves a Mac and Android alone", () => {
    expect(appleMobileDevice(MAC_SAFARI, 0)).toBeNull();
    expect(appleMobileDevice(ANDROID_CHROME, 5)).toBeNull();
  });
});
