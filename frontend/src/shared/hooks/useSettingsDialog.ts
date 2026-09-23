import { useCallback, useEffect, useRef } from 'react'

type UseSettingsDialogOptions = {
  open: boolean
  onClose: () => void
}

/**
 * Intent: 設定シートのネイティブ dialog の開閉と初期フォーカスを局所化する。
 * Boundary: open と onClose を受け取り、dialog の ref と close 通知だけを返す。
 * State modeling: 開閉状態は親が所有し、dialog の DOM 状態は effect で同期する。
 */
export function useSettingsDialog({ open, onClose }: UseSettingsDialogOptions) {
  const dialogRef = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return

    if (open) {
      if (!dialog.open) dialog.showModal()
      dialog.querySelector<HTMLElement>('button, input')?.focus()
      return
    }

    if (dialog.open) dialog.close()
  }, [open])

  const handleClose = useCallback(() => {
    if (open) onClose()
  }, [onClose, open])

  return { dialogRef, handleClose }
}
