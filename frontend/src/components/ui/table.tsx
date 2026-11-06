import type { ComponentProps } from 'react';
import { cn } from '../../utils/cn.ts';
export function Table({ className, ...props }: ComponentProps<'table'>) { return <div className="ui-table-scroll"><table className={cn('ui-table', className)} {...props} /></div>; }
