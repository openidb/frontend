"use client"

import * as React from "react"
import { useState, useEffect } from "react"
import { ChevronDown } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Button } from "@/components/ui/button"

interface FilterOption {
  value: string
  label: string
  labelArabic?: string
  count: number
  disabled?: boolean
}

interface MultiSelectDropdownProps {
  title: string
  options: FilterOption[]
  selected: string[]
  onChange: (selected: string[]) => void
}

export function MultiSelectDropdown({
  title,
  options,
  selected,
  onChange,
}: MultiSelectDropdownProps) {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  const handleToggle = (value: string) => {
    const newSelected = selected.includes(value)
      ? selected.filter((v) => v !== value)
      : [...selected, value]
    onChange(newSelected)
  }

  const displayTitle = selected.length > 0
    ? `${title} (${selected.length})`
    : title

  // Render a placeholder button during SSR to avoid hydration mismatch
  if (!mounted) {
    return (
      <Button
        variant="outline"
        className="border-border hover:bg-accent"
      >
        {displayTitle}
        <ChevronDown className="ms-2 h-4 w-4" />
      </Button>
    )
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          className="border-border hover:bg-accent"
        >
          {displayTitle}
          <ChevronDown className="ms-2 h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56 max-h-80 overflow-y-auto bg-popover border border-border" align="start">
        <DropdownMenuLabel>{title}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {options.map((option) => (
          <DropdownMenuCheckboxItem
            key={option.value}
            checked={selected.includes(option.value)}
            onCheckedChange={() => (!option.disabled || selected.includes(option.value)) && handleToggle(option.value)}
            onSelect={(e) => e.preventDefault()}
            disabled={option.disabled}
            className={option.disabled ? "opacity-50 cursor-not-allowed" : "hover:bg-accent"}
          >
            <div className="flex items-center justify-between w-full">
              <div className="flex flex-col">
                <span>{option.label}</span>
                {option.labelArabic && (
                  <span className="text-sm text-muted-foreground">
                    {option.labelArabic}
                  </span>
                )}
              </div>
              <span className="text-sm text-muted-foreground ms-2">
                {option.count}
              </span>
            </div>
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
