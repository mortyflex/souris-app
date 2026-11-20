import { directionsLinks, type DirectionsLinks, type VisitorHeaders } from "./directions";
import { addressLines, type PublicLocation } from "./public-location";

/**
 * What a page shows of a published location — everything a component needs,
 * already decided, as plain data (it crosses from the server to the booking
 * flow in the browser):
 *
 *   address   the two address lines, the directions links of the visitor's
 *             platform, the map when one can be made
 *   city      the city name, and a town-level map when one can be made —
 *             never a marker, never a destination, never a link
 *
 * A page whose professional hides her location, or never chose, has NO view:
 * nothing is rendered, and nothing here can turn that into a place.
 */
export type LocationView =
  | {
      readonly kind: "address";
      readonly lines: readonly [string, string];
      /** The address in one line, for a link's accessible name. */
      readonly spoken: string;
      /** Absent when no directions link could be built: the address is then shown alone. */
      readonly directions?: DirectionsLinks;
      /** A signed Apple Maps Web Snapshot URL; absent when none can be made. */
      readonly mapUrl?: string;
    }
  | {
      readonly kind: "city";
      readonly city: string;
      readonly mapUrl?: string;
    };

export interface LocationViewContext extends VisitorHeaders {
  /** Makes the map URL of a location, or nothing (`mapSnapshotUrl` on the server). */
  readonly mapUrl?: (location: PublicLocation) => string | undefined;
}

export function buildLocationView(location: PublicLocation | undefined, context: LocationViewContext = {}): LocationView | undefined {
  if (location === undefined) return undefined;
  const mapUrl = context.mapUrl?.(location);
  if (location.visibility === "CITY_ONLY") {
    return { kind: "city", city: location.city, ...(mapUrl !== undefined ? { mapUrl } : {}) };
  }
  const lines = addressLines(location);
  const directions = directionsLinks(location.directionsDestination, context);
  return {
    kind: "address",
    lines,
    spoken: lines.join(", "),
    ...(directions !== undefined ? { directions } : {}),
    ...(mapUrl !== undefined ? { mapUrl } : {}),
  };
}
