import type { SVGProps } from "react";

/**
 * BeautIzzy line icons: 24 px grid, 1.75 stroke, round caps, the current text
 * colour. Hand-drawn for the site (no icon dependency); decorative by default
 * — the text or the control around them carries the meaning.
 */
type IconProps = Omit<SVGProps<SVGSVGElement>, "children"> & { size?: number };

function icon(paths: React.ReactNode, displayName: string) {
  function Icon({ size = 18, className, ...props }: IconProps) {
    return (
      <svg
        viewBox="0 0 24 24"
        width={size}
        height={size}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        focusable="false"
        className={className}
        {...props}
      >
        {paths}
      </svg>
    );
  }
  Icon.displayName = displayName;
  return Icon;
}

export const ArrowRightIcon = icon(<><path d="M5 12h14" /><path d="m13.5 6.5 5.5 5.5-5.5 5.5" /></>, "ArrowRightIcon");
export const ArrowLeftIcon = icon(<><path d="M19 12H5" /><path d="m10.5 6.5-5.5 5.5 5.5 5.5" /></>, "ArrowLeftIcon");
export const ChevronLeftIcon = icon(<path d="m14.5 6-6 6 6 6" />, "ChevronLeftIcon");
export const ChevronRightIcon = icon(<path d="m9.5 6 6 6-6 6" />, "ChevronRightIcon");
export const ChevronDownIcon = icon(<path d="m6 9.5 6 6 6-6" />, "ChevronDownIcon");
export const CheckIcon = icon(<path d="m5.5 12.5 4.2 4.2 8.8-9.4" />, "CheckIcon");
export const PhoneIcon = icon(<path d="M6.6 3.5h2.7l1.6 4.1-2 1.3a10.6 10.6 0 0 0 6.2 6.2l1.3-2 4.1 1.6v2.7a2 2 0 0 1-2.1 2A15.6 15.6 0 0 1 4.5 5.6a2 2 0 0 1 2.1-2.1Z" />, "PhoneIcon");
export const MailIcon = icon(<><rect x="3.5" y="5.5" width="17" height="13" rx="2.5" /><path d="m4.5 7.5 7.5 5.2 7.5-5.2" /></>, "MailIcon");
export const PinIcon = icon(<><path d="M12 21s-6.5-5.6-6.5-10.6a6.5 6.5 0 0 1 13 0C18.5 15.4 12 21 12 21Z" /><circle cx="12" cy="10.3" r="2.3" /></>, "PinIcon");
// « Itinéraire »: a road that turns, then points ahead.
export const DirectionsIcon = icon(<><path d="M5 19.5V13a4 4 0 0 1 4-4h10" /><path d="m15 5 4 4-4 4" /></>, "DirectionsIcon");
export const ClockIcon = icon(<><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></>, "ClockIcon");
export const CalendarIcon = icon(<><rect x="4" y="5.5" width="16" height="14" rx="2.5" /><path d="M4 10h16M8.5 3.5v4M15.5 3.5v4" /></>, "CalendarIcon");
export const UserIcon = icon(<><circle cx="12" cy="8.5" r="3.5" /><path d="M5 19.5c1.2-3.3 3.8-5 7-5s5.8 1.7 7 5" /></>, "UserIcon");
export const PlusIcon = icon(<path d="M12 5v14M5 12h14" />, "PlusIcon");
export const CloseIcon = icon(<path d="M6.5 6.5l11 11M17.5 6.5l-11 11" />, "CloseIcon");
export const ReceiptIcon = icon(<><path d="M6 3.5h12v17l-2-1.3-2 1.3-2-1.3-2 1.3-2-1.3-2 1.3Z" /><path d="M9 8h6M9 11.5h6M9 15h4" /></>, "ReceiptIcon");
export const BagIcon = icon(<><path d="M5.5 8h13l-1 12h-11Z" /><path d="M9 8V6.5a3 3 0 0 1 6 0V8" /></>, "BagIcon");
export const ChartIcon = icon(<><path d="M4.5 19.5h15" /><path d="M7 16v-4M11 16V8M15 16v-6M19 16V6" /></>, "ChartIcon");
export const ScissorsIcon = icon(<><circle cx="6.5" cy="7" r="2.5" /><circle cx="6.5" cy="17" r="2.5" /><path d="m8.6 8.4 10.9 9.1M8.6 15.6l10.9-9.1" /></>, "ScissorsIcon");
export const NailIcon = icon(<><path d="M9 21v-8a3 3 0 0 1 6 0v8" /><path d="M10 6.5a2 2 0 0 1 4 0v3h-4Z" /></>, "NailIcon");
export const FaceIcon = icon(<><circle cx="12" cy="12" r="8.5" /><path d="M9 10h.01M15 10h.01M9 14.5c1.6 1.4 4.4 1.4 6 0" /></>, "FaceIcon");
export const LeafIcon = icon(<><path d="M5 19C5 10 10 5 19 5c0 9-5 14-14 14Z" /><path d="M5 19 13 11" /></>, "LeafIcon");
// The eye pair is Lucide's « eye » and « eye-off » (ISC licence), on the same 24 px grid and stroke.
// « Enregistrer l’image » and « Partager » of the Tops & tendances ticket.
export const ImageSaveIcon = icon(<><rect x="3.5" y="3.5" width="13" height="13" rx="2.5" /><path d="m3.8 13.6 3.6-3.6 3 3 1.6-1.6 4.2 4.2" /><circle cx="8.2" cy="7.8" r="1.3" /><path d="M19.5 13.5v7M16.8 18l2.7 2.7 2.7-2.7" /></>, "ImageSaveIcon");
export const ShareIcon = icon(<><path d="M4.5 12.5v6.5a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-6.5" /><path d="M12 15V3.5" /><path d="m8 7.5 4-4 4 4" /></>, "ShareIcon");
export const EyeIcon = icon(<><path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0" /><circle cx="12" cy="12" r="3" /></>, "EyeIcon");
export const EyeOffIcon = icon(<><path d="M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49" /><path d="M14.084 14.158a3 3 0 0 1-4.242-4.242" /><path d="M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143" /><path d="m2 2 20 20" /></>, "EyeOffIcon");
