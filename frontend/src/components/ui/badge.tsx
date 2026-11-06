import type { ComponentProps } from 'react';
import { cn } from '../../utils/cn.ts';
export type BadgeTone = 'neutral' | 'warning' | 'synthetic' | 'success' | 'danger';
export function Badge({ tone = 'neutral', className, ...props }: ComponentProps<'span'> & { tone?: BadgeTone }) { return <span data-slot="badge" className={cn('ui-badge', `ui-badge-${tone}`, className)} {...props} />; }
