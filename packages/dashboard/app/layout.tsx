import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'TheCopilotMarketer',
  description: 'TheCopilotMarketer workflow dashboard for queue review and agent control',
  icons: {
    icon: '/assets/favicon.png',
    shortcut: '/assets/favicon.png',
    apple: '/assets/favicon.png',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
