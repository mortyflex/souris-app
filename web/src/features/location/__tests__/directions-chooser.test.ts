import { describe, expect, it } from "vitest";

import * as chooserModule from "../directions-chooser";
import type { DirectionsLinks } from "../directions";
import {
  CHOOSER_CLOSE_LABEL,
  CHOOSER_NOTE,
  CHOOSER_TITLE,
  chooserActive,
  chooserOptionLabel,
  chooserTriggerLabel,
  DIRECTIONS_LABEL,
  directionsLinkLabel,
  hasTouchScreen,
  opensChooser,
} from "../directions-chooser";

const link = (provider: "apple" | "google", providerName: string) => ({ provider, providerName, url: `https://example.test/${provider}` });
const APPLE = link("apple", "Apple Plans");
const GOOGLE = link("google", "Google Maps");
/** What the server makes of an address for each platform. */
const onIos: DirectionsLinks = { primary: APPLE, chooser: { links: [APPLE, GOOGLE], offer: "always" } };
const onMacUserAgent: DirectionsLinks = { primary: APPLE, chooser: { links: [APPLE, GOOGLE], offer: "touch-screen" } };
const onAndroid: DirectionsLinks = { primary: GOOGLE };
const onOther: DirectionsLinks = { primary: GOOGLE };
const plain = { button: 0, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, defaultPrevented: false };

describe("when « Itinéraire » asks which application to open", () => {
  it("iPhone and iPad: always — touch screen or not (an iPad with a trackpad included)", () => {
    expect(chooserActive(onIos, { touchScreen: true })).toBe(true);
    expect(chooserActive(onIos, { touchScreen: false })).toBe(true);
  });

  it("behind a Mac's user agent: only on a touch screen — an iPad asking for desktop websites; a Mac never", () => {
    expect(chooserActive(onMacUserAgent, { touchScreen: true })).toBe(true);
    expect(chooserActive(onMacUserAgent, { touchScreen: false })).toBe(false);
  });

  it("Android, Windows, Linux, anything else: never — « Itinéraire » is the direct link, touch screen or not", () => {
    for (const touchScreen of [true, false]) {
      expect(chooserActive(onAndroid, { touchScreen })).toBe(false);
      expect(chooserActive(onOther, { touchScreen })).toBe(false);
    }
  });

  it("reads the touch screen as the browser reports it: an iPad says 5 touch points, a Mac 0", () => {
    expect(hasTouchScreen({ maxTouchPoints: 5 })).toBe(true);
    expect(hasTouchScreen({ maxTouchPoints: 0 })).toBe(false);
    expect(hasTouchScreen({ maxTouchPoints: 1 })).toBe(false);
    expect(hasTouchScreen({})).toBe(false);
    expect(hasTouchScreen(undefined)).toBe(false);
  });

  it("a plain tap or click opens it; a modified or secondary click keeps the browser's own behaviour (new tab, new window…)", () => {
    expect(opensChooser(true, plain)).toBe(true);
    for (const modifier of [{ metaKey: true }, { ctrlKey: true }, { shiftKey: true }, { altKey: true }, { button: 1 }, { button: 2 }]) {
      expect(opensChooser(true, { ...plain, ...modifier })).toBe(false);
    }
  });

  it("where there is no chooser, every activation is the link's own", () => {
    expect(opensChooser(false, plain)).toBe(false);
  });

  it("an activation something else already handled is left alone", () => {
    expect(opensChooser(true, { ...plain, defaultPrevented: true })).toBe(false);
  });
});

describe("what each control says", () => {
  const spoken = "12 avenue Jean Jaurès, 69007 Lyon";

  it("a link names its destination, its application, and the new tab", () => {
    expect(directionsLinkLabel(spoken, "Google Maps")).toBe("Itinéraire vers 12 avenue Jean Jaurès, 69007 Lyon (Google Maps, nouvel onglet)");
    expect(directionsLinkLabel(spoken, "Apple Plans")).toBe("Itinéraire vers 12 avenue Jean Jaurès, 69007 Lyon (Apple Plans, nouvel onglet)");
  });

  it("the chooser's trigger says that the application is chosen next — it names none", () => {
    expect(chooserTriggerLabel(spoken)).toBe("Itinéraire vers 12 avenue Jean Jaurès, 69007 Lyon : choisir l’application");
    expect(chooserTriggerLabel(spoken)).not.toMatch(/Apple|Google/);
  });

  it("each row of the chooser names its application first", () => {
    expect(chooserOptionLabel(spoken, "Google Maps")).toBe("Google Maps : itinéraire vers 12 avenue Jean Jaurès, 69007 Lyon (nouvel onglet)");
  });

  it("promises nothing about the device: the application if installed, its website otherwise", () => {
    expect(CHOOSER_NOTE).toBe("L’application s’ouvre si elle est installée sur cet appareil, sinon son site.");
    expect(CHOOSER_NOTE).not.toMatch(/installées sur|détect|toutes vos/i);
  });

  it("no word of a third application, and no « Ouvrir dans … » link any more", () => {
    const words = [
      DIRECTIONS_LABEL,
      CHOOSER_TITLE,
      CHOOSER_CLOSE_LABEL,
      CHOOSER_NOTE,
      directionsLinkLabel(spoken, "Google Maps"),
      chooserTriggerLabel(spoken),
      chooserOptionLabel(spoken, "Apple Plans"),
    ].join(" ");
    expect(words).not.toMatch(/Waze|Ouvrir dans/);
    expect(Object.keys(chooserModule).filter((name) => /secondary|touchFirst|TOUCH_FIRST/i.test(name))).toEqual([]);
  });
});
