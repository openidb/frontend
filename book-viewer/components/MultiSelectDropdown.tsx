"use client"

import * as React from "react"
import { Check } from "lucide-react"
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
  const handleToggle = (value: string) => {
    const newSelected = selected.includes(value)
      ? selected.filter((v) => v !== value)
      : [...selected, value]
    onChange(newSelected)
  }

  const displayTitle = selected.length > 0
    ? `${title} (${selected.length})`
    : title

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          className="border-gray-300 hover:bg-gray-50"
        >
          {displayTitle}
          <svg
            className="ml-2 h-4 w-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 9l-7 7-7-7"
            />
          </svg>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700" align="start">
        <DropdownMenuLabel>{title}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {options.map((option) => (
          <DropdownMenuCheckboxItem
            key={option.value}
            checked={selected.includes(option.value)}
            onCheckedChange={() => handleToggle(option.value)}
            onSelect={(e) => e.preventDefault()}
          >
            <div className="flex items-center justify-between w-full">
              <span>
                {option.label}
                {option.labelArabic && (
                  <span className="mr-2 text-gray-500">
                    {" / "}
                    {option.labelArabic}
                  </span>
                )}
              </span>
              <span className="text-sm text-gray-400 ml-2">
                {option.count}
              </span>
            </div>
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
