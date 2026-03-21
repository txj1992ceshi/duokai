import type { ReactNode } from 'react';

type Props = {
  children: ReactNode;
  columns?: 'two' | 'three' | 'four' | 'five';
};

const columnsClassMap = {
  two: 'md:grid-cols-2',
  three: 'md:grid-cols-3',
  four: 'md:grid-cols-4',
  five: 'md:grid-cols-5',
} as const;

export default function CardGrid({ children, columns = 'two' }: Props) {
  return <div className={`grid gap-4 ${columnsClassMap[columns]}`}>{children}</div>;
}
