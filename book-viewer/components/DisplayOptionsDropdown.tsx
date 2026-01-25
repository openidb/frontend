"use client"

import { useState, useEffect } from "react"
import { Settings2 } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Button } from "@/components/ui/button"

interface DisplayOptionsDropdownProps {
  showPublicationDates: boolean
  onShowPublicationDatesChange: (value: boolean) => void
  showTransliterations: boolean
  onShowTransliterationsChange: (value: boolean) => void
}

export function DisplayOptionsDropdown({
  showPublicationDates,
  onShowPublicationDatesChange,
  showTransliterations,
  onShowTransliterationsChange,
}: DisplayOptionsDropdownProps) {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  // Render a placeholder button during SSR to avoid hydration mismatch
  if (!mounted) {
    return (
      <Button
        variant="outline"
        size="icon"
        className="border-gray-300 hover:bg-gray-50"
      >
        <Settings2 className="h-4 w-4" />
      </Button>
    )
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          className="border-gray-300 hover:bg-gray-50"
        >
          <Settings2 className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        className="w-56 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700"
        align="end"
      >
        <DropdownMenuLabel>Display Options</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuCheckboxItem
          checked={showPublicationDates}
          onCheckedChange={onShowPublicationDatesChange}
          onSelect={(e) => e.preventDefault()}
        >
          Show publication dates
        </DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem
          checked={showTransliterations}
          onCheckedChange={onShowTransliterationsChange}
          onSelect={(e) => e.preventDefault()}
        >
          Show transliterations
        </DropdownMenuCheckboxItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
