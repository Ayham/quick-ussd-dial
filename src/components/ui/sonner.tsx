import { useTheme } from "next-themes";
import { Toaster as Sonner, toast } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme();

  // Dynamic safe-area offsets: Sonner positions its fixed container using the
  // --offset-* / --mobile-offset-* CSS vars it sets from these props. We feed it
  // the app's safe-area vars (injected by Capacitor on Android 15+, env() on iOS,
  // 0 on web) so toasts never render under the status bar, cutout, or nav bar.
  const safeAreaOffset: NonNullable<ToasterProps["offset"]> = {
    top: "calc(var(--sat, env(safe-area-inset-top, 0px)) + 16px)",
    right: "calc(var(--sar, env(safe-area-inset-right, 0px)) + 16px)",
    bottom: "calc(var(--sab, env(safe-area-inset-bottom, 0px)) + 16px)",
    left: "calc(var(--sal, env(safe-area-inset-left, 0px)) + 16px)",
  };

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      position="bottom-center"
      className="toaster group"
      offset={safeAreaOffset}
      mobileOffset={safeAreaOffset}
      // Option 1: Adds a visible 'X' close button on hover
      closeButton 
      toastOptions={{
        // Option 2: Enables dismissing the toast by clicking anywhere on it
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-card/80 group-[.toaster]:backdrop-blur-md " + 
            "group-[.toaster]:text-foreground group-[.toaster]:border-border " +
            "group-[.toaster]:shadow-elevated group-[.toaster]:rounded-xl " +
            "text-[16px] cursor-pointer", // Added cursor-pointer for UX
          description: "group-[.toast]:text-muted-foreground",
          actionButton: "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground group-[.toast]:rounded-lg",
          cancelButton: "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground group-[.toast]:rounded-lg",
          error: "group-[.toaster]:bg-destructive/10 group-[.toaster]:text-destructive group-[.toaster]:border-destructive/20",
          success: "group-[.toaster]:bg-success/10 group-[.toaster]:text-success group-[.toaster]:border-success/20",
          warning: "group-[.toaster]:bg-warning/10 group-[.toaster]:text-warning group-[.toaster]:border-warning/20",
        },
      }}
      {...props}
    />
  );
};

export { Toaster, toast };
