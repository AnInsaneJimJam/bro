import type { Metadata } from 'next';
import './styles.css';
export const metadata: Metadata = {
  title: 'Bro — Creator command center',
  description: 'Ideas to published Shorts and Reels, without the busywork.',
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
