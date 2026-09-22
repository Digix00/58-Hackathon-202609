import { useCallback, useRef, useState } from 'react'

export function useBottomSheet() {
  const [isOpen, setIsOpen] = useState(false)
  const triggerRef = useRef<HTMLElement | null>(null)
  const open = useCallback((trigger: HTMLElement) => {
    triggerRef.current = trigger
    setIsOpen(true)
  }, [])
  const close = useCallback(() => {
    setIsOpen(false)
    requestAnimationFrame(() => triggerRef.current?.focus())
  }, [])
  return { isOpen, open, close }
}
