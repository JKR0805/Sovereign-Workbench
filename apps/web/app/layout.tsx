import type { Metadata } from 'next';
import '../styles/globals.css';
import { AppShell } from '../components/shell/AppShell';

export const metadata: Metadata = {
  title: 'VAJRA | Sovereign On-Premise Agentic AI Workbench',
  description: '100% on-premise, zero egress multi-model AI workbench. Secure, private, your infrastructure, your intelligence.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="antialiased bg-bg-base text-text-primary selection:bg-accent/25 selection:text-white">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
