import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Leadership That Works',
  description: 'Training Delivery & Impact Platform',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="id"><body>{children}</body></html>;
}
