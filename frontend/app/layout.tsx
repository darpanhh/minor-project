import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/src/contexts/AuthContext";
import Navbar from "@/src/components/Navbar";

export const metadata: Metadata = {
  title: "VisionProctor",
  description: "AI-Powered Proctored Exam System",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full">
      <body className="min-h-full flex flex-col font-sans antialiased">
        <AuthProvider>
          <Navbar />
          <main className="flex flex-1 flex-col">{children}</main>
        </AuthProvider>
      </body>
    </html>
  );
}
