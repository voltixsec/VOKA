import type { HTMLAttributes, ReactNode } from 'react';

type ContainerProps = HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
};

export function Container({
  children,
  className = '',
  ...props
}: ContainerProps) {
  return (
    <div
      className={[
        'mx-auto w-full max-w-7xl px-6 sm:px-10 lg:px-14',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      {...props}
    >
      {children}
    </div>
  );
}

