import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Fully CRM | Emlak Satış & Lead Yönetimi",
  description: "Emlak satış ekibi için akıllı lead takip, bütçe alarmı, randevu planlayıcı ve günlük raporlama sistemi.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="tr" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var theme = localStorage.getItem('fully-theme') || 'midnight-neon';
                  document.documentElement.setAttribute('data-theme', theme);
                } catch (e) {
                  console.error('Theme initialisation failed', e);
                }
              })();
            `,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
