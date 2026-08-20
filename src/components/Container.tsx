import type { ReactNode } from 'react';

export interface ContainerProps {
  readonly children: ReactNode;
  readonly className?: string;
  /** Defaults to `5xl`; use `3xl` for long-form prose columns. */
  readonly width?: '3xl' | '5xl' | '6xl';
}

const WIDTHS: Record<NonNullable<ContainerProps['width']>, string> = {
  '3xl': 'max-w-3xl',
  '5xl': 'max-w-5xl',
  '6xl': 'max-w-6xl',
};

/** Centered page gutter. Use it inside every `Section`, header and footer. */
export function Container({ children, className = '', width = '5xl' }: ContainerProps) {
  return (
    <div className={`container-gutter mx-auto w-full ${WIDTHS[width]} ${className}`.trim()}>
      {children}
    </div>
  );
}
