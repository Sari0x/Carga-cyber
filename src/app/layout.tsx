import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Carga Cyber",
  description: "Genera los Excel de megaofertas a partir del export de Productos E3.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
