export const metadata = {
  title: "Elev8 Deal Agent",
  description: "Elev8 Deal Agent v8",
};

export default function RootLayout({ children }) {
  return (
    <html lang="fr">
      <body style={{ margin: 0 }}>{children}</body>
    </html>
  );
}
