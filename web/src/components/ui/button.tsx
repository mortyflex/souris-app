import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "type-label inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full transition-colors disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        primary: "bg-accent text-white shadow-card hover:bg-accent-strong",
        secondary:
          "border border-border bg-background text-foreground hover:bg-lavender-50",
        ghost: "text-foreground hover:bg-lavender-50",
      },
      size: {
        // 44px minimum touch target on every size. The type role is `type-label`;
        // the large size only sets it one pixel larger.
        md: "min-h-11 px-5",
        lg: "min-h-12 px-7 text-[1rem]",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

type ButtonProps = ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    /** Render the child element (a link, for instance) with the button styles. */
    asChild?: boolean;
  };

function Button({ className, variant, size, asChild = false, ...props }: ButtonProps) {
  const Component = asChild ? Slot : "button";
  return <Component className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}

export { Button, buttonVariants };
