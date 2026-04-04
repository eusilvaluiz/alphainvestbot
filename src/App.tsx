import { useEffect } from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { AuthProvider } from "@/hooks/useAuth";
import Index from "./pages/Index.tsx";
import NotFound from "./pages/NotFound.tsx";

const App = () => {
  useEffect(() => {
    let lastTouchEnd = 0;

    const isInsideChart = (target: EventTarget | null) =>
      target instanceof Element && Boolean(target.closest("[data-allow-pinch-zoom='true']"));

    const preventGestureOutsideChart = (event: Event) => {
      if (!isInsideChart(event.target)) {
        event.preventDefault();
      }
    };

    const preventPinchOutsideChart = (event: TouchEvent) => {
      if (event.touches.length > 1 && !isInsideChart(event.target)) {
        event.preventDefault();
      }
    };

    const preventDoubleTapOutsideChart = (event: TouchEvent) => {
      const now = Date.now();
      const isDoubleTap = now - lastTouchEnd <= 300;
      lastTouchEnd = now;

      if (isDoubleTap && !isInsideChart(event.target)) {
        event.preventDefault();
      }
    };

    document.addEventListener("gesturestart", preventGestureOutsideChart, { passive: false });
    document.addEventListener("gesturechange", preventGestureOutsideChart, { passive: false });
    document.addEventListener("touchmove", preventPinchOutsideChart, { passive: false });
    document.addEventListener("touchend", preventDoubleTapOutsideChart, { passive: false });

    return () => {
      document.removeEventListener("gesturestart", preventGestureOutsideChart);
      document.removeEventListener("gesturechange", preventGestureOutsideChart);
      document.removeEventListener("touchmove", preventPinchOutsideChart);
      document.removeEventListener("touchend", preventDoubleTapOutsideChart);
    };
  }, []);

  return (
    <AuthProvider>
      <BrowserRouter>
        <Sonner />
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
};

export default App;
