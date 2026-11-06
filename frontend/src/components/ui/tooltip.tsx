import type { ReactNode } from 'react';
import * as Primitive from '@radix-ui/react-tooltip';
export const TooltipProvider = Primitive.Provider;
export function Tooltip({ children, content }: { children: ReactNode; content: string }) { return <Primitive.Root><Primitive.Trigger asChild>{children}</Primitive.Trigger><Primitive.Portal><Primitive.Content className="ui-tooltip" sideOffset={8}>{content}<Primitive.Arrow className="ui-tooltip-arrow" /></Primitive.Content></Primitive.Portal></Primitive.Root>; }
