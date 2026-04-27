import { useTheme } from "next-themes";
import { Toaster as Sonner, toast } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme();

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      position="bottom-center"
      className="toaster group"
      // Option 1: Adds a visible 'X' close button on hover
      closeButton 
      toastOptions={{
        // Option 2: Enables dismissing the toast by clicking anywhere on it
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-card/80 group-[.toaster]:backdrop-blur-md " + 
            "group-[.toaster]:text-foreground group-[.toaster]:border-border " +
            "group-[.toaster]:shadow-elevated group-[.toaster]:rounded-xl " +
            "text-[16px] m-[30px] cursor-pointer", // Added cursor-pointer for UX
          description: "group-[.toast]:text-muted-foreground",
          actionButton: "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground group-[.toast]:rounded-lg",
          cancelButton: "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground group-[.toast]:rounded-lg",
          error: "group-[.toaster]:bg-destructive/10 group-[.toaster]:text-destructive group-[.toaster]:border-destructive/20",
          success: "group-[.toaster]:bg-success/10 group-[.toaster]:text-success group-[.toaster]:border-success/20",
        },
      }}
      {...props}
    />
  );
};

export { Toaster, toast };
