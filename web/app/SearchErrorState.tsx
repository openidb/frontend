"use client";

import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/lib/i18n";

interface SearchErrorStateProps {
  error: string;
  onRetry: () => void;
}

export function SearchErrorState({ error, onRetry }: SearchErrorStateProps) {
  const { t } = useTranslation();

  return (
    <div className="text-center py-12">
      <p className="text-red-500">{error}</p>
      <p className="text-muted-foreground mt-2">{t("search.error")}</p>
      <Button
        variant="outline"
        className="mt-4 gap-2"
        onClick={onRetry}
      >
        <RotateCcw className="h-4 w-4" />
        {t("search.tryAgain")}
      </Button>
    </div>
  );
}
