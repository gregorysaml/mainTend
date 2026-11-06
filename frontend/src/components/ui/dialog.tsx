import { useRef, type ComponentProps } from 'react';
import * as Primitive from '@radix-ui/react-dialog';
import { cn } from '../../utils/cn.ts';
export const Dialog = Primitive.Root;
export const DialogTitle = Primitive.Title;
export const DialogDescription = Primitive.Description;
export function DialogContent({ className, children, onOpenAutoFocus, onCloseAutoFocus, ...props }: ComponentProps<typeof Primitive.Content>) {
  const opener = useRef<HTMLElement | null>(null);
  return <Primitive.Portal><Primitive.Overlay className="ui-dialog-overlay" /><Primitive.Content className={cn('ui-dialog-content', className)} {...props} onOpenAutoFocus={event => {
    // Controlled dialogs do not necessarily have a Radix DialogTrigger.
    // Remember the actual opener before the focus scope moves into the dialog.
    opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    onOpenAutoFocus?.(event);
  }} onCloseAutoFocus={event => {
    onCloseAutoFocus?.(event);
    if (event.defaultPrevented) return;
    event.preventDefault();
    if (opener.current?.isConnected && opener.current !== document.body) opener.current.focus();
    else document.querySelector<HTMLElement>('[aria-current="page"]')?.focus();
  }}>{children}</Primitive.Content></Primitive.Portal>;
}
