import type { ComponentProps } from 'react';
import { cn } from '../../utils/cn.ts';
export function Card({ className, ...props }: ComponentProps<'section'>) { return <section data-slot="card" className={cn('ui-card', className)} {...props} />; }
export function CardHeader({ className, ...props }: ComponentProps<'div'>) { return <div data-slot="card-header" className={cn('ui-card-header', className)} {...props} />; }
export function CardTitle({ className, ...props }: ComponentProps<'h2'>) { return <h2 className={cn('ui-card-title', className)} {...props} />; }
export function CardDescription({ className, ...props }: ComponentProps<'p'>) { return <p className={cn('ui-card-description', className)} {...props} />; }
export function CardContent({ className, ...props }: ComponentProps<'div'>) { return <div className={cn('ui-card-content', className)} {...props} />; }
