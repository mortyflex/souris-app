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
export const CheckIcon = icon(<path d="m5.5 12.5 4.2 4.2 8.8-9.4" />, "CheckIcon");
export const PhoneIcon = icon(<path d="M6.6 3.5h2.7l1.6 4.1-2 1.3a10.6 10.6 0 0 0 6.2 6.2l1.3-2 4.1 1.6v2.7a2 2 0 0 1-2.1 2A15.6 15.6 0 0 1 4.5 5.6a2 2 0 0 1 2.1-2.1Z" />, "PhoneIcon");
export const MailIcon = icon(<><rect x="3.5" y="5.5" width="17" height="13" rx="2.5" /><path d="m4.5 7.5 7.5 5.2 7.5-5.2" /></>, "MailIcon");
export const PinIcon = icon(<><path d="M12 21s-6.5-5.6-6.5-10.6a6.5 6.5 0 0 1 13 0C18.5 15.4 12 21 12 21Z" /><circle cx="12" cy="10.3" r="2.3" /></>, "PinIcon");
export const ClockIcon = icon(<><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></>, "ClockIcon");
export const CalendarIcon = icon(<><rect x="4" y="5.5" width="16" height="14" rx="2.5" /><path d="M4 10h16M8.5 3.5v4M15.5 3.5v4" /></>, "CalendarIcon");
export const UserIcon = icon(<><circle cx="12" cy="8.5" r="3.5" /><path d="M5 19.5c1.2-3.3 3.8-5 7-5s5.8 1.7 7 5" /></>, "UserIcon");
