"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

interface WordDefinitionPopoverProps {
  word: string;
  position: { x: number; y: number };
  onClose: () => void;
}

export function WordDefinitionPopover({
  word,
  position,
  onClose,
}: WordDefinitionPopoverProps) {
  const popoverRef = useRef<HTMLDivElement>(null);

  // Handle click outside to close
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(event.target as Node)
      ) {
        onClose();
      }
    };

    // Delay adding listener to prevent immediate close from the click that opened it
    const timeoutId = setTimeout(() => {
      document.addEventListener("mousedown", handleClickOutside);
    }, 0);

    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [onClose]);

  // Handle escape key to close
  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [onClose]);

  // Calculate position to keep popover within viewport
  const getAdjustedPosition = () => {
    const popoverWidth = 200;
    const popoverHeight = 100;
    const padding = 8;

    let x = position.x;
    let y = position.y;

    // Adjust horizontal position if needed
    if (x + popoverWidth / 2 > window.innerWidth - padding) {
      x = window.innerWidth - popoverWidth / 2 - padding;
    }
    if (x - popoverWidth / 2 < padding) {
      x = popoverWidth / 2 + padding;
    }

    // Adjust vertical position if needed (flip to top if no space below)
    if (y + popoverHeight > window.innerHeight - padding) {
      y = position.y - popoverHeight - 8;
    }

    return { x, y };
  };

  const adjustedPosition = getAdjustedPosition();

  const popoverContent = (
    <div
      ref={popoverRef}
      dir="rtl"
      className="fixed z-50 w-52 rounded-lg border bg-popover p-3 text-popover-foreground shadow-lg"
      style={{
        left: adjustedPosition.x,
        top: adjustedPosition.y,
        transform: "translateX(-50%)",
      }}
    >
      {/* Word */}
      <div className="font-semibold text-base mb-2 pb-2 border-b border-border">
        {word}
      </div>
      {/* Placeholder definition */}
      <div className="text-sm text-muted-foreground">
        تعريف الكلمة سيظهر هنا
      </div>
    </div>
  );

  return createPortal(popoverContent, document.body);
}
