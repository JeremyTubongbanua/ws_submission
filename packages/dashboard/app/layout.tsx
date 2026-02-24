import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'WS Triage Dashboard',
  description: 'Queue dashboard for workflow states',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
