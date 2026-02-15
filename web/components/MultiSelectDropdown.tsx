"use client"

import * as React from "react"
import { useState, useEffect } from "react"
import { Check, ChevronDown } from "lucide-react"
import { motion } from "framer-motion"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"

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

  const triggerClassName = "flex h-10 items-center justify-between gap-2 rounded-lg border border-input bg-background px-3 py-2 text-sm ring-offset-background transition-all duration-200 hover:border-muted-foreground/50 outline-none whitespace-nowrap"

  // Render a placeholder button during SSR to avoid hydration mismatch
  if (!mounted) {
    return (
      <button type="button" className={triggerClassName}>
        <span>{displayTitle}</span>
        <ChevronDown className="h-4 w-4 opacity-50" />
      </button>
    )
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className={triggerClassName}>
          <span>{displayTitle}</span>
          <ChevronDown className="h-4 w-4 opacity-50" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        className="min-w-[12rem] max-h-80 overflow-y-auto rounded-xl border bg-popover/95 backdrop-blur-sm text-popover-foreground shadow-lg shadow-black/5 p-1"
        align="start"
      >
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: "spring", stiffness: 300, damping: 25, mass: 0.8 }}
        >
          <DropdownMenuLabel className="py-1.5 px-2 text-sm font-semibold">{title}</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {options.map((option) => {
            const isSelected = selected.includes(option.value)
            return (
              <button
                key={option.value}
                type="button"
                disabled={option.disabled && !isSelected}
                onClick={(e) => {
                  e.preventDefault()
                  if (!option.disabled || isSelected) handleToggle(option.value)
                }}
                className={cn(
                  "relative flex w-full cursor-default select-none items-center rounded-lg py-1.5 pl-8 pr-2 text-sm outline-none transition-colors duration-150 hover:bg-accent hover:text-accent-foreground",
                  option.disabled && !isSelected && "opacity-50 cursor-not-allowed"
                )}
              >
                <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
                  {isSelected && (
                    <motion.div
                      initial={{ scale: 0, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ type: "spring", stiffness: 500, damping: 25 }}
                    >
                      <Check className="h-4 w-4" />
                    </motion.div>
                  )}
                </span>
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
              </button>
            )
          })}
        </motion.div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
